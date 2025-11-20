-- Migration: Add deposited_tx_hash and on_chain_task_id to tasks table
-- Run: psql <connection_string> -f migrations/003_add_deposit_tracking.sql

ALTER TABLE slice_db.tasks
ADD COLUMN IF NOT EXISTS deposited_tx_hash VARCHAR(66),
ADD COLUMN IF NOT EXISTS on_chain_task_id VARCHAR(100);

COMMENT ON COLUMN slice_db.tasks.deposited_tx_hash IS 'Transaction hash of on-chain deposit';
COMMENT ON COLUMN slice_db.tasks.on_chain_task_id IS 'On-chain taskId from TaskEscrowPool contract';
