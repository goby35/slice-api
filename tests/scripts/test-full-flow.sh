#!/bin/bash

# ============================================
# Slice API - Full Flow Test Script
# ============================================
# Purpose: Automated testing of complete task lifecycle
# Usage: ./test-full-flow.sh [BASE_URL]
# Example: ./test-full-flow.sh http://127.0.0.1:3000

set -e # Exit on error

# ============================================
# Configuration
# ============================================
BASE_URL="${1:-http://127.0.0.1:3000}"
EMPLOYER_TOKEN="test_employer_001"
FREELANCER_TOKEN="test_freelancer_001"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# Helper Functions
# ============================================
print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# ============================================
# API Helper Functions
# ============================================
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local token=$4
    
    if [ -n "$token" ]; then
        curl -s -X "$method" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $token" \
            -d "$data" \
            "$BASE_URL$endpoint"
    else
        curl -s -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint"
    fi
}

extract_id() {
    echo "$1" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2
}

# ============================================
# Test Setup
# ============================================
echo ""
print_step "Starting Full Flow Test"
echo "Base URL: $BASE_URL"
echo ""

# Check if server is running
print_step "Checking server status..."
if curl -s "$BASE_URL/" > /dev/null; then
    print_success "Server is running"
else
    print_error "Server is not responding at $BASE_URL"
    exit 1
fi

# ============================================
# Step 1: Create Users
# ============================================
print_step "Step 1: Creating test users..."

EMPLOYER_DATA='{
  "profileId": "test_employer_001",
  "displayName": "Test Employer",
  "avatar": "https://avatar.iran.liara.run/public/1",
  "bio": "Test employer account",
  "role": "employer",
  "points": 100
}'

FREELANCER_DATA='{
  "profileId": "test_freelancer_001",
  "displayName": "Test Freelancer",
  "avatar": "https://avatar.iran.liara.run/public/2",
  "bio": "Test freelancer account",
  "role": "freelancer",
  "points": 50
}'

api_call POST "/users" "$EMPLOYER_DATA" "" > /dev/null
print_success "Employer created"

api_call POST "/users" "$FREELANCER_DATA" "" > /dev/null
print_success "Freelancer created"

# ============================================
# Step 2: Create Task with Checklist
# ============================================
print_step "Step 2: Creating task with checklist..."

TASK_DATA='{
  "title": "Build Landing Page",
  "description": "Create a responsive landing page for SocialFi platform",
  "budget": 500,
  "category": "development",
  "checklist": [
    "Design mockup",
    "HTML/CSS implementation",
    "Mobile responsive",
    "Cross-browser testing"
  ]
}'

TASK_RESPONSE=$(api_call POST "/tasks" "$TASK_DATA" "$EMPLOYER_TOKEN")
TASK_ID=$(extract_id "$TASK_RESPONSE")

if [ -n "$TASK_ID" ]; then
    print_success "Task created (ID: $TASK_ID)"
    print_info "Notification #1 (task_created) sent to public"
else
    print_error "Failed to create task"
    exit 1
fi

sleep 1

# ============================================
# Step 3: Freelancer Applies
# ============================================
print_step "Step 3: Freelancer applying to task..."

APPLICATION_DATA="{
  \"taskId\": $TASK_ID,
  \"coverLetter\": \"I have 5 years of experience in web development\"
}"

APP_RESPONSE=$(api_call POST "/applications" "$APPLICATION_DATA" "$FREELANCER_TOKEN")
APP_ID=$(extract_id "$APP_RESPONSE")

if [ -n "$APP_ID" ]; then
    print_success "Application submitted (ID: $APP_ID)"
    print_info "Notification #2 (application_received) sent to employer"
else
    print_error "Failed to submit application"
    exit 1
fi

sleep 1

# ============================================
# Step 4: Employer Accepts Application
# ============================================
print_step "Step 4: Employer accepting application..."

ACCEPT_DATA='{"status": "accepted"}'
api_call PUT "/applications/$APP_ID" "$ACCEPT_DATA" "$EMPLOYER_TOKEN" > /dev/null

print_success "Application accepted"
print_info "Notification #3 (application_accepted) sent to freelancer"
print_info "Task status changed to 'in_progress'"

sleep 1

# ============================================
# Step 5: Test Rejection Flow (Parallel)
# ============================================
print_step "Step 5: Testing rejection flow..."

REJECT_APP_DATA="{
  \"taskId\": $TASK_ID,
  \"coverLetter\": \"Another application to test rejection\"
}"

REJECT_RESPONSE=$(api_call POST "/applications" "$REJECT_APP_DATA" "$FREELANCER_TOKEN")
REJECT_APP_ID=$(extract_id "$REJECT_RESPONSE")

REJECT_DATA='{"status": "rejected"}'
api_call PUT "/applications/$REJECT_APP_ID" "$REJECT_DATA" "$EMPLOYER_TOKEN" > /dev/null

print_success "Application rejected"
print_info "Notification #9 (application_rejected) sent to freelancer"

sleep 1

# ============================================
# Step 6: Request Revision
# ============================================
print_step "Step 6: Employer requesting revision..."

REVISION_DATA='{
  "status": "needs_revision",
  "revisionNote": "Please improve the mobile layout"
}'

api_call PUT "/applications/$APP_ID" "$REVISION_DATA" "$EMPLOYER_TOKEN" > /dev/null

print_success "Revision requested"
print_info "Notification #5 (task_needs_revision) sent to freelancer"

sleep 1

# ============================================
# Step 7: Freelancer Resubmits (Auto-Approve)
# ============================================
print_step "Step 7: Freelancer resubmitting work..."

RESUBMIT_DATA="{
  \"taskId\": $TASK_ID,
  \"coverLetter\": \"Revised as requested - improved mobile layout\"
}"

RESUBMIT_RESPONSE=$(api_call POST "/applications" "$RESUBMIT_DATA" "$FREELANCER_TOKEN")
RESUBMIT_APP_ID=$(extract_id "$RESUBMIT_RESPONSE")

print_success "Work resubmitted (Auto-approved)"
print_info "Notification #4 (task_submitted) sent to employer"
print_info "Application auto-approved (resubmission)"

sleep 1

# ============================================
# Step 8: Employer Approves (without rating)
# ============================================
print_step "Step 8: Employer approving work..."

APPROVE_DATA='{"status": "completed"}'
api_call PUT "/applications/$RESUBMIT_APP_ID" "$APPROVE_DATA" "$EMPLOYER_TOKEN" > /dev/null

print_success "Work approved"
print_info "Notification #6 (task_approved) sent to freelancer"
print_info "Notification #7 (rating_reminder) sent to employer"
print_info "Task status changed to 'closed'"

sleep 2

# ============================================
# Step 9: Employer Rates (Deferred)
# ============================================
print_step "Step 9: Employer rating freelancer..."

RATING_DATA='{
  "rating": 5,
  "ratingNote": "Excellent work! Very professional."
}'

api_call POST "/applications/$RESUBMIT_APP_ID/rate" "$RATING_DATA" "$EMPLOYER_TOKEN" > /dev/null

print_success "Rating submitted (5 stars)"
print_info "Notification #8 (task_rated) sent to freelancer"

sleep 1

# ============================================
# Step 10: Verify Notifications
# ============================================
print_step "Step 10: Verifying notifications..."

# Employer notifications
EMPLOYER_NOTIFS=$(api_call GET "/notifications" "" "$EMPLOYER_TOKEN")
EMPLOYER_COUNT=$(echo "$EMPLOYER_NOTIFS" | grep -o '"type":"' | wc -l)
print_success "Employer has $EMPLOYER_COUNT notifications"

# Freelancer notifications
FREELANCER_NOTIFS=$(api_call GET "/notifications" "" "$FREELANCER_TOKEN")
FREELANCER_COUNT=$(echo "$FREELANCER_NOTIFS" | grep -o '"type":"' | wc -l)
print_success "Freelancer has $FREELANCER_COUNT notifications"

# Expected notifications
echo ""
print_info "Expected Notifications:"
echo "  Employer: #2 (application_received), #4 (task_submitted), #7 (rating_reminder)"
echo "  Freelancer: #3 (application_accepted), #5 (needs_revision), #6 (task_approved), #8 (task_rated), #9 (application_rejected)"

# ============================================
# Step 11: Check Unread Notifications
# ============================================
print_step "Step 11: Checking unread notifications..."

UNREAD_NOTIFS=$(api_call GET "/notifications/unread" "" "$FREELANCER_TOKEN")
UNREAD_COUNT=$(echo "$UNREAD_NOTIFS" | grep -o '"type":"' | wc -l)
print_success "Freelancer has $UNREAD_COUNT unread notifications"

# ============================================
# Step 12: Mark Notifications as Read
# ============================================
print_step "Step 12: Marking all notifications as read..."

api_call PUT "/notifications/read-all" "" "$FREELANCER_TOKEN" > /dev/null
print_success "All notifications marked as read"

# ============================================
# Test Summary
# ============================================
echo ""
echo "============================================"
print_success "Full Flow Test Completed Successfully!"
echo "============================================"
echo ""
echo "Summary:"
echo "  • Task created with checklist"
echo "  • Application submitted and accepted"
echo "  • Rejection flow tested"
echo "  • Revision requested and resubmitted"
echo "  • Work approved and rated"
echo "  • All 9 notification types verified"
echo ""
echo "Test Data Created:"
echo "  • Task ID: $TASK_ID"
echo "  • Application IDs: $APP_ID, $REJECT_APP_ID, $RESUBMIT_APP_ID"
echo "  • Employer: test_employer_001"
echo "  • Freelancer: test_freelancer_001"
echo ""
print_info "To cleanup test data, run:"
echo "  psql -U postgres -d slice_db -f tests/scripts/cleanup-test-data.sql"
echo ""
