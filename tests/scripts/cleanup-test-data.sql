-- ============================================
-- Cleanup Test Data Script
-- ============================================
-- Purpose: Remove test data from database after testing
-- Warning: This will permanently delete test records
-- Usage: psql -U postgres -d slice_db -f cleanup-test-data.sql

-- ============================================
-- 1. Count records before cleanup
-- ============================================
SELECT 'Before cleanup:' AS status;
SELECT 'Notifications: ' || COUNT(*) FROM notifications;
SELECT 'Applications: ' || COUNT(*) FROM task_applications;
SELECT 'Tasks: ' || COUNT(*) FROM tasks;
SELECT 'Users: ' || COUNT(*) FROM users;

-- ============================================
-- 2. Delete test notifications
-- ============================================
DELETE FROM notifications 
WHERE user_profile_id LIKE '%test%' 
   OR user_profile_id LIKE 'test_%';

DELETE FROM notifications 
WHERE task_id IN (
    SELECT id FROM tasks WHERE employer_profile_id LIKE '%test%'
);

-- ============================================
-- 3. Delete test applications
-- ============================================
DELETE FROM task_applications 
WHERE applicant_profile_id LIKE '%test%' 
   OR applicant_profile_id LIKE 'test_%';

DELETE FROM task_applications 
WHERE task_id IN (
    SELECT id FROM tasks WHERE employer_profile_id LIKE '%test%'
);

-- ============================================
-- 4. Delete test task checklists
-- ============================================
DELETE FROM task_checklists 
WHERE task_id IN (
    SELECT id FROM tasks WHERE employer_profile_id LIKE '%test%'
);

-- ============================================
-- 5. Delete test tasks
-- ============================================
DELETE FROM tasks 
WHERE employer_profile_id LIKE '%test%' 
   OR employer_profile_id LIKE 'test_%';

DELETE FROM tasks 
WHERE title LIKE 'TS%' -- Test scenarios
   OR title LIKE 'Test%'
   OR title LIKE '%[TEST]%';

-- ============================================
-- 6. Delete test users
-- ============================================
DELETE FROM users 
WHERE profile_id LIKE '%test%' 
   OR profile_id LIKE 'test_%'
   OR display_name LIKE 'Test%';

-- ============================================
-- 7. Count records after cleanup
-- ============================================
SELECT 'After cleanup:' AS status;
SELECT 'Notifications: ' || COUNT(*) FROM notifications;
SELECT 'Applications: ' || COUNT(*) FROM task_applications;
SELECT 'Tasks: ' || COUNT(*) FROM tasks;
SELECT 'Users: ' || COUNT(*) FROM users;

-- ============================================
-- 8. Reset sequences (optional)
-- ============================================
-- Uncomment if you want to reset auto-increment IDs
-- SELECT setval('tasks_id_seq', COALESCE(MAX(id), 1)) FROM tasks;
-- SELECT setval('task_applications_id_seq', COALESCE(MAX(id), 1)) FROM task_applications;
-- SELECT setval('notifications_id_seq', COALESCE(MAX(id), 1)) FROM notifications;

-- ============================================
-- Cleanup complete!
-- ============================================
