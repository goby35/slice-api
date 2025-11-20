-- Migration 003: Add blockchain escrow support
-- Run this migration: psql "<DATABASE_URL>" -f migrations/003_add_escrow_blockchain.sql

-- 1. Add externalTaskId to tasks table
ALTER TABLE slice_db.tasks 
ADD COLUMN IF NOT EXISTS external_task_id VARCHAR(255) UNIQUE;

-- 2. Create escrow_tasks table
CREATE TABLE IF NOT EXISTS slice_db.escrow_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(100) NOT NULL UNIQUE, -- On-chain taskId (1, 2, 3...)
  external_task_id VARCHAR(255) NOT NULL UNIQUE, -- UUID từ tasks table
  employer VARCHAR(255) NOT NULL, -- Ethereum address
  freelancer VARCHAR(255) NOT NULL, -- Ethereum address
  amount VARCHAR(100) NOT NULL, -- BigNumber as string
  deadline INTEGER NOT NULL, -- Unix timestamp
  settled INTEGER NOT NULL DEFAULT 0, -- 0 = false, 1 = true
  deposited_tx VARCHAR(255) NOT NULL,
  deposited_at TIMESTAMP NOT NULL DEFAULT NOW(),
  released_tx VARCHAR(255),
  released_at TIMESTAMP,
  release_to VARCHAR(255), -- Address received funds
  release_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_escrow_external_task_id ON slice_db.escrow_tasks(external_task_id);
CREATE INDEX IF NOT EXISTS idx_escrow_employer ON slice_db.escrow_tasks(employer);
CREATE INDEX IF NOT EXISTS idx_escrow_freelancer ON slice_db.escrow_tasks(freelancer);
CREATE INDEX IF NOT EXISTS idx_escrow_settled ON slice_db.escrow_tasks(settled);
CREATE INDEX IF NOT EXISTS idx_tasks_external_task_id ON slice_db.tasks(external_task_id);

-- 4. Verify
SELECT 'Migration 003 completed successfully' AS status;
