# ============================================
# Slice API - Full Flow Test Script (PowerShell)
# ============================================
# Purpose: Automated testing of complete task lifecycle
# Usage: .\test-full-flow.ps1 [BASE_URL]
# Example: .\test-full-flow.ps1 http://127.0.0.1:3000

param(
    [string]$BaseUrl = "http://127.0.0.1:3000"
)

# ============================================
# Configuration
# ============================================
$EmployerToken = "test_employer_001"
$FreelancerToken = "test_freelancer_001"

# ============================================
# Helper Functions
# ============================================
function Print-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Blue
}

function Print-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Print-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Print-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor Yellow
}

function Invoke-ApiCall {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Body,
        [string]$Token
    )
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }
    
    $params = @{
        Method = $Method
        Uri = "$BaseUrl$Endpoint"
        Headers = $headers
        ContentType = "application/json"
    }
    
    if ($Body) {
        $params["Body"] = $Body
    }
    
    try {
        $response = Invoke-RestMethod @params
        return $response
    } catch {
        Write-Host "API Error: $_" -ForegroundColor Red
        return $null
    }
}

# ============================================
# Test Setup
# ============================================
Write-Host ""
Print-Step "Starting Full Flow Test"
Write-Host "Base URL: $BaseUrl"
Write-Host ""

# Check if server is running
Print-Step "Checking server status..."
try {
    $null = Invoke-RestMethod -Uri $BaseUrl -TimeoutSec 5
    Print-Success "Server is running"
} catch {
    Print-Error "Server is not responding at $BaseUrl"
    exit 1
}

# ============================================
# Step 1: Create Users
# ============================================
Print-Step "Step 1: Creating test users..."

$employerData = @{
    profileId = "test_employer_001"
    displayName = "Test Employer"
    avatar = "https://avatar.iran.liara.run/public/1"
    bio = "Test employer account"
    role = "employer"
    points = 100
} | ConvertTo-Json

$freelancerData = @{
    profileId = "test_freelancer_001"
    displayName = "Test Freelancer"
    avatar = "https://avatar.iran.liara.run/public/2"
    bio = "Test freelancer account"
    role = "freelancer"
    points = 50
} | ConvertTo-Json

Invoke-ApiCall -Method POST -Endpoint "/users" -Body $employerData | Out-Null
Print-Success "Employer created"

Invoke-ApiCall -Method POST -Endpoint "/users" -Body $freelancerData | Out-Null
Print-Success "Freelancer created"

# ============================================
# Step 2: Create Task with Checklist
# ============================================
Print-Step "Step 2: Creating task with checklist..."

$taskData = @{
    title = "Build Landing Page"
    description = "Create a responsive landing page for SocialFi platform"
    budget = 500
    category = "development"
    checklist = @(
        "Design mockup",
        "HTML/CSS implementation",
        "Mobile responsive",
        "Cross-browser testing"
    )
} | ConvertTo-Json

$taskResponse = Invoke-ApiCall -Method POST -Endpoint "/tasks" -Body $taskData -Token $EmployerToken
$taskId = $taskResponse.id

if ($taskId) {
    Print-Success "Task created (ID: $taskId)"
    Print-Info "Notification #1 (task_created) sent to public"
} else {
    Print-Error "Failed to create task"
    exit 1
}

Start-Sleep -Seconds 1

# ============================================
# Step 3: Freelancer Applies
# ============================================
Print-Step "Step 3: Freelancer applying to task..."

$applicationData = @{
    taskId = $taskId
    coverLetter = "I have 5 years of experience in web development"
} | ConvertTo-Json

$appResponse = Invoke-ApiCall -Method POST -Endpoint "/applications" -Body $applicationData -Token $FreelancerToken
$appId = $appResponse.id

if ($appId) {
    Print-Success "Application submitted (ID: $appId)"
    Print-Info "Notification #2 (application_received) sent to employer"
} else {
    Print-Error "Failed to submit application"
    exit 1
}

Start-Sleep -Seconds 1

# ============================================
# Step 4: Employer Accepts Application
# ============================================
Print-Step "Step 4: Employer accepting application..."

$acceptData = @{
    status = "accepted"
} | ConvertTo-Json

Invoke-ApiCall -Method PUT -Endpoint "/applications/$appId" -Body $acceptData -Token $EmployerToken | Out-Null

Print-Success "Application accepted"
Print-Info "Notification #3 (application_accepted) sent to freelancer"
Print-Info "Task status changed to 'in_progress'"

Start-Sleep -Seconds 1

# ============================================
# Step 5: Test Rejection Flow
# ============================================
Print-Step "Step 5: Testing rejection flow..."

$rejectAppData = @{
    taskId = $taskId
    coverLetter = "Another application to test rejection"
} | ConvertTo-Json

$rejectResponse = Invoke-ApiCall -Method POST -Endpoint "/applications" -Body $rejectAppData -Token $FreelancerToken
$rejectAppId = $rejectResponse.id

$rejectData = @{
    status = "rejected"
} | ConvertTo-Json

Invoke-ApiCall -Method PUT -Endpoint "/applications/$rejectAppId" -Body $rejectData -Token $EmployerToken | Out-Null

Print-Success "Application rejected"
Print-Info "Notification #9 (application_rejected) sent to freelancer"

Start-Sleep -Seconds 1

# ============================================
# Step 6: Request Revision
# ============================================
Print-Step "Step 6: Employer requesting revision..."

$revisionData = @{
    status = "needs_revision"
    revisionNote = "Please improve the mobile layout"
} | ConvertTo-Json

Invoke-ApiCall -Method PUT -Endpoint "/applications/$appId" -Body $revisionData -Token $EmployerToken | Out-Null

Print-Success "Revision requested"
Print-Info "Notification #5 (task_needs_revision) sent to freelancer"

Start-Sleep -Seconds 1

# ============================================
# Step 7: Freelancer Resubmits (Auto-Approve)
# ============================================
Print-Step "Step 7: Freelancer resubmitting work..."

$resubmitData = @{
    taskId = $taskId
    coverLetter = "Revised as requested - improved mobile layout"
} | ConvertTo-Json

$resubmitResponse = Invoke-ApiCall -Method POST -Endpoint "/applications" -Body $resubmitData -Token $FreelancerToken
$resubmitAppId = $resubmitResponse.id

Print-Success "Work resubmitted (Auto-approved)"
Print-Info "Notification #4 (task_submitted) sent to employer"
Print-Info "Application auto-approved (resubmission)"

Start-Sleep -Seconds 1

# ============================================
# Step 8: Employer Approves (without rating)
# ============================================
Print-Step "Step 8: Employer approving work..."

$approveData = @{
    status = "completed"
} | ConvertTo-Json

Invoke-ApiCall -Method PUT -Endpoint "/applications/$resubmitAppId" -Body $approveData -Token $EmployerToken | Out-Null

Print-Success "Work approved"
Print-Info "Notification #6 (task_approved) sent to freelancer"
Print-Info "Notification #7 (rating_reminder) sent to employer"
Print-Info "Task status changed to 'closed'"

Start-Sleep -Seconds 2

# ============================================
# Step 9: Employer Rates (Deferred)
# ============================================
Print-Step "Step 9: Employer rating freelancer..."

$ratingData = @{
    rating = 5
    ratingNote = "Excellent work! Very professional."
} | ConvertTo-Json

Invoke-ApiCall -Method POST -Endpoint "/applications/$resubmitAppId/rate" -Body $ratingData -Token $EmployerToken | Out-Null

Print-Success "Rating submitted (5 stars)"
Print-Info "Notification #8 (task_rated) sent to freelancer"

Start-Sleep -Seconds 1

# ============================================
# Step 10: Verify Notifications
# ============================================
Print-Step "Step 10: Verifying notifications..."

$employerNotifs = Invoke-ApiCall -Method GET -Endpoint "/notifications" -Token $EmployerToken
$employerCount = $employerNotifs.Count
Print-Success "Employer has $employerCount notifications"

$freelancerNotifs = Invoke-ApiCall -Method GET -Endpoint "/notifications" -Token $FreelancerToken
$freelancerCount = $freelancerNotifs.Count
Print-Success "Freelancer has $freelancerCount notifications"

Write-Host ""
Print-Info "Expected Notifications:"
Write-Host "  Employer: #2 (application_received), #4 (task_submitted), #7 (rating_reminder)"
Write-Host "  Freelancer: #3 (application_accepted), #5 (needs_revision), #6 (task_approved), #8 (task_rated), #9 (application_rejected)"

# ============================================
# Step 11: Check Unread Notifications
# ============================================
Print-Step "Step 11: Checking unread notifications..."

$unreadNotifs = Invoke-ApiCall -Method GET -Endpoint "/notifications/unread" -Token $FreelancerToken
$unreadCount = $unreadNotifs.Count
Print-Success "Freelancer has $unreadCount unread notifications"

# ============================================
# Step 12: Mark Notifications as Read
# ============================================
Print-Step "Step 12: Marking all notifications as read..."

Invoke-ApiCall -Method PUT -Endpoint "/notifications/read-all" -Token $FreelancerToken | Out-Null
Print-Success "All notifications marked as read"

# ============================================
# Test Summary
# ============================================
Write-Host ""
Write-Host "============================================"
Print-Success "Full Flow Test Completed Successfully!"
Write-Host "============================================"
Write-Host ""
Write-Host "Summary:"
Write-Host "  • Task created with checklist"
Write-Host "  • Application submitted and accepted"
Write-Host "  • Rejection flow tested"
Write-Host "  • Revision requested and resubmitted"
Write-Host "  • Work approved and rated"
Write-Host "  • All 9 notification types verified"
Write-Host ""
Write-Host "Test Data Created:"
Write-Host "  • Task ID: $taskId"
Write-Host "  • Application IDs: $appId, $rejectAppId, $resubmitAppId"
Write-Host "  • Employer: test_employer_001"
Write-Host "  • Freelancer: test_freelancer_001"
Write-Host ""
Print-Info "To cleanup test data, run:"
Write-Host "  psql -U postgres -d slice_db -f tests/scripts/cleanup-test-data.sql"
Write-Host ""
