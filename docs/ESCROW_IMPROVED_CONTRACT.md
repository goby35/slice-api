# Smart Contract cải tiến cho Deadline Logic

## Vấn đề với contract hiện tại
Contract TaskEscrowPool.sol hiện tại chỉ có `release()` function cho admin gọi thủ công, không có:
1. Cancel function (trước deadline)
2. Deadline automation logic
3. Check application status từ off-chain

## Giải pháp: Thêm functions vào contract

### 1. Thêm Cancel Function (Employer hoặc Admin)

```solidity
// Thêm event
event Cancelled(uint256 indexed taskId, address employer, uint256 amount, string reason);

// Thêm function
function cancel(uint256 taskId, string calldata reason) external nonReentrant {
    Escrow storage e = escrows[taskId];
    require(taskId > 0 && taskId <= taskCount, "invalid task");
    require(!e.settled, "settled");
    require(msg.sender == e.employer || hasRole(ADMIN_ROLE, msg.sender), "not authorized");
    require(block.timestamp < e.deadline, "deadline passed"); // Chỉ cancel trước deadline

    e.settled = true;
    token.safeTransfer(e.employer, e.amount); // Hoàn tiền employer

    emit Cancelled(taskId, e.employer, e.amount, reason);
}
```

**Use case**: Khi task.status = 'cancelled' off-chain, backend gọi `cancel(taskId, reason)`

---

### 2. Thêm Release với Deadline Check

```solidity
// Modify release function để accept deadline override
function release(
    uint256 taskId,
    address to,
    string calldata reason
) external onlyRole(ADMIN_ROLE) nonReentrant {
    Escrow storage e = escrows[taskId];
    require(taskId > 0 && taskId <= taskCount, "invalid task");
    require(!e.settled, "settled");
    require(to == e.employer || to == e.freelancer, "invalid recipient");

    e.settled = true;
    token.safeTransfer(to, e.amount);

    emit Released(taskId, to, e.amount, reason);
}

// Thêm function mới: releaseAfterDeadline (anyone can call)
function releaseAfterDeadline(
    uint256 taskId,
    address to,
    string calldata reason
) external nonReentrant {
    Escrow storage e = escrows[taskId];
    require(taskId > 0 && taskId <= taskCount, "invalid task");
    require(!e.settled, "settled");
    require(block.timestamp > e.deadline, "deadline not reached");
    require(to == e.employer || to == e.freelancer, "invalid recipient");

    e.settled = true;
    token.safeTransfer(to, e.amount);

    emit Released(taskId, to, e.amount, reason);
}
```

**Use case**: Sau deadline, bất kỳ ai cũng có thể trigger release (automation script, keeper network, hoặc user)

---

### 3. Contract hoàn chỉnh với tất cả functions

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TaskEscrowPool is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    IERC20 public immutable token;

    uint256 public taskCount;

    struct Escrow {
        uint256 amount;
        address employer;
        address freelancer;
        uint256 deadline;
        string externalTaskId;
        bool settled;
    }

    mapping(uint256 => Escrow) public escrows;
    mapping(string => uint256) public externalToInternal;

    event Deposited(uint256 indexed taskId, string indexed externalId, address employer, uint256 amount);
    event Released(uint256 indexed taskId, address to, uint256 amount, string reason);
    event Cancelled(uint256 indexed taskId, address employer, uint256 amount, string reason);

    constructor(address _token, address _admin) {
        token = IERC20(_token);
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
    }

    function deposit(
        uint256 amount,
        address freelancer,
        uint256 deadline,
        string calldata externalTaskId
    ) external nonReentrant returns (uint256 taskId) {
        require(bytes(externalTaskId).length > 0, "empty id");
        require(externalToInternal[externalTaskId] == 0, "id exists");
        require(deadline > block.timestamp, "invalid deadline");

        token.safeTransferFrom(msg.sender, address(this), amount);

        taskCount++;
        taskId = taskCount;

        escrows[taskId] = Escrow({
            amount: amount,
            employer: msg.sender,
            freelancer: freelancer,
            deadline: deadline,
            externalTaskId: externalTaskId,
            settled: false
        });

        externalToInternal[externalTaskId] = taskId;

        emit Deposited(taskId, externalTaskId, msg.sender, amount);
        return taskId;
    }

    // Admin release anytime (before or after deadline)
    function release(
        uint256 taskId,
        address to,
        string calldata reason
    ) external onlyRole(ADMIN_ROLE) nonReentrant {
        Escrow storage e = escrows[taskId];
        require(taskId > 0 && taskId <= taskCount, "invalid task");
        require(!e.settled, "settled");
        require(to == e.employer || to == e.freelancer, "invalid recipient");

        e.settled = true;
        token.safeTransfer(to, e.amount);

        emit Released(taskId, to, e.amount, reason);
    }

    // Cancel before deadline (Employer or Admin)
    function cancel(uint256 taskId, string calldata reason) external nonReentrant {
        Escrow storage e = escrows[taskId];
        require(taskId > 0 && taskId <= taskCount, "invalid task");
        require(!e.settled, "settled");
        require(msg.sender == e.employer || hasRole(ADMIN_ROLE, msg.sender), "not authorized");
        require(block.timestamp < e.deadline, "deadline passed");

        e.settled = true;
        token.safeTransfer(e.employer, e.amount); // Refund to employer

        emit Cancelled(taskId, e.employer, e.amount, reason);
    }

    // Anyone can release after deadline
    function releaseAfterDeadline(
        uint256 taskId,
        address to,
        string calldata reason
    ) external nonReentrant {
        Escrow storage e = escrows[taskId];
        require(taskId > 0 && taskId <= taskCount, "invalid task");
        require(!e.settled, "settled");
        require(block.timestamp > e.deadline, "deadline not reached");
        require(to == e.employer || to == e.freelancer, "invalid recipient");

        e.settled = true;
        token.safeTransfer(to, e.amount);

        emit Released(taskId, to, e.amount, reason);
    }

    // Emergency withdraw (only DEFAULT_ADMIN_ROLE)
    function emergencyWithdraw(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        token.safeTransfer(to, amount);
    }
}
```

---

## Flow với Contract cải tiến

### Case 1: Complete trước deadline
```
1. Task complete (application.status = 'completed')
2. Backend call: contract.release(taskId, freelancerAddress, "Task completed")
3. Token → Freelancer
```

### Case 2: Cancel trước deadline
```
1. Task cancelled (task.status = 'cancelled')
2. Backend call: contract.cancel(taskId, "Task cancelled by employer")
3. Token → Employer (refund)
```

### Case 3: Sau deadline + Freelancer đã submit (in-review)
```
1. Cron job check: deadline passed && application.status = 'in_review'
2. Backend call: contract.releaseAfterDeadline(taskId, freelancerAddress, "Auto-release: deadline passed, work submitted")
3. Token → Freelancer
```

### Case 4: Sau deadline + Freelancer chưa submit
```
1. Cron job check: deadline passed && (application.status = 'in_progress' OR 'needs_revision')
2. Backend call: contract.releaseAfterDeadline(taskId, employerAddress, "Auto-refund: deadline passed, no submission")
3. Token → Employer (refund)
```

---

## So sánh Contract cũ vs mới

| Feature | Contract cũ | Contract mới |
|---------|-------------|--------------|
| Release manual | ✅ Admin only | ✅ Admin only |
| Cancel function | ❌ | ✅ Employer/Admin (trước deadline) |
| Auto-release sau deadline | ❌ | ✅ Anyone can trigger |
| Check deadline | ❌ (chỉ store) | ✅ Enforce in cancel & releaseAfterDeadline |
| Events | Deposited, Released | + Cancelled |

---

## Migration Plan

### Nếu deploy contract mới
1. Deploy contract mới với code trên
2. Migrate dữ liệu cũ (nếu cần)
3. Update backend services để gọi đúng functions

### Nếu giữ contract cũ
Dùng Option 2 bên dưới (Backend automation)
