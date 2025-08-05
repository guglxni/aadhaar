#!/bin/bash
set -e

echo "🚀 UIDAI Integration CI Status Check"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Run integration test and update status
echo "📊 Running status generator..."
node scripts/status-generator.js

# Check if status file was updated
if [ ! -f "STATUS.md" ]; then
    echo -e "${RED}❌ STATUS.md not generated${NC}"
    exit 1
fi

# Extract current status for logging
ERR=$(node -e "
const { getLatestTestResult } = require('./scripts/status-generator.js');
const result = getLatestTestResult();
console.log(result.err);
")

ACTN=$(node -e "
const { getLatestTestResult } = require('./scripts/status-generator.js');
const result = getLatestTestResult();
console.log(result.actn || '');
")

echo "📋 Current Status: err=$ERR actn=$ACTN"

# Determine pipeline status
CLASSIFICATION=$(node -e "
const { getLatestTestResult, getErrorClassification } = require('./scripts/status-generator.js');
const result = getLatestTestResult();
const classification = getErrorClassification(result.err, result.actn);
console.log(classification.severity);
")

echo "🎯 Classification: $CLASSIFICATION"

# Check for changes and commit if needed (with safety guards)
if git diff --quiet STATUS.md status-badge/; then
    echo "📝 No changes to status files"
else
    echo "📝 Status files updated, committing changes..."
    
    # Safety: Only push if this is the main repository (prevent fork loops)
    REPO_OWNER=$(git remote get-url origin | sed -n 's#.*/\([^/]*\)/.*#\1#p')
    EXPECTED_OWNER="aaryanguglani"  # Replace with your actual username
    
    if [ "$REPO_OWNER" != "$EXPECTED_OWNER" ]; then
        echo "⚠️ Not main repository ($REPO_OWNER != $EXPECTED_OWNER) - skipping git push"
        echo "📊 Status files generated but not committed to prevent fork loops"
        exit 0
    fi
    
    # Stage the files
    git add STATUS.md status-badge/
    
    # Create commit message
    COMMIT_MSG="chore(status): update to $ERR"
    if [ -n "$ACTN" ]; then
        COMMIT_MSG="$COMMIT_MSG/$ACTN"
    fi
    COMMIT_MSG="$COMMIT_MSG [skip ci]"
    
    # Commit with skip CI to avoid loops
    git commit -m "$COMMIT_MSG" || echo "No changes to commit"
    
    # Push only if we're in CI environment and on main branch
    if [ "${CI:-false}" = "true" ] && [ "${GITHUB_REF:-}" = "refs/heads/main" ]; then
        echo "🚀 Pushing status update to main branch..."
        git push origin HEAD
    else
        echo "💻 Local run or not main branch - skipping git push"
    fi
fi

# Generate alerts and set GitHub Actions outputs
case $CLASSIFICATION in
    "success")
        echo -e "${GREEN}✅ PIPELINE PASSING - Ready for production${NC}"
        
        # Set GitHub Actions output for step conditioning
        [ "${GITHUB_ACTIONS:-false}" = "true" ] && echo "severity=success" >> $GITHUB_OUTPUT
        
        # Send success webhook if URL provided
        if [ -n "${WEBHOOK_SUCCESS_URL:-}" ]; then
            curl -X POST "$WEBHOOK_SUCCESS_URL" \
                -H "Content-Type: application/json" \
                -d "{\"text\":\"🎯 UIDAI Integration: PRODUCTION READY ✅\",\"error\":\"$ERR\",\"status\":\"success\"}" \
                --silent --fail || echo "⚠️ Webhook failed"
        fi
        
        exit 0
        ;;
    "warning")
        echo -e "${YELLOW}⚠️ PIPELINE WARNING - UIDAI service outage${NC}"
        echo "Expected resolution: 2-5 minutes"
        echo "Note: Using exit 0 for GitHub Actions compatibility"
        
        # Set GitHub Actions output and warning annotation
        if [ "${GITHUB_ACTIONS:-false}" = "true" ]; then
            echo "severity=warning" >> $GITHUB_OUTPUT
            echo "::warning file=STATUS.md::UIDAI service unavailable (A202) - expected recovery in 2-5 minutes"
        fi
        
        # Send warning webhook if URL provided
        if [ -n "${WEBHOOK_WARNING_URL:-}" ]; then
            curl -X POST "$WEBHOOK_WARNING_URL" \
                -H "Content-Type: application/json" \
                -d "{\"text\":\"⚠️ UIDAI Integration: Service Outage (A202)\",\"error\":\"$ERR/$ACTN\",\"status\":\"warning\"}" \
                --silent --fail || echo "⚠️ Webhook failed"
        fi
        
        exit 0  # Changed: GitHub Actions treats exit 2 as failure
        ;;
    "error")
        echo -e "${RED}❌ PIPELINE FAILING - Client issue detected${NC}"
        echo "Manual intervention required"
        
        # Set GitHub Actions output
        [ "${GITHUB_ACTIONS:-false}" = "true" ] && echo "severity=error" >> $GITHUB_OUTPUT
        
        # Send error webhook if URL provided
        if [ -n "${WEBHOOK_ERROR_URL:-}" ]; then
            curl -X POST "$WEBHOOK_ERROR_URL" \
                -H "Content-Type: application/json" \
                -d "{\"text\":\"🚨 UIDAI Integration: CLIENT ERROR\",\"error\":\"$ERR\",\"status\":\"error\",\"action_required\":true}" \
                --silent --fail || echo "⚠️ Webhook failed"
        fi
        
        exit 1
        ;;
    *)
        echo -e "${RED}❓ UNKNOWN STATUS - Check logs${NC}"
        exit 1
        ;;
esac 