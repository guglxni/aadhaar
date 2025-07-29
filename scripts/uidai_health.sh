#!/bin/bash

# UIDAI Sandbox Health Check Script
# Tests all sandbox endpoints and provides diagnostic output

TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
ENDPOINTS=(
    "https://developer.uidai.gov.in"
    "https://developer.uidai.gov.in/authserver/2.5/public/public/public"
    "https://developer.uidai.gov.in/uidotp/2.5/public/public/public"
    "https://developer.uidai.gov.in/uidkyc/kyc/2.5/public/public/public"
)

echo "========================================="
echo "UIDAI Sandbox Health Check - $TIMESTAMP"
echo "========================================="

OVERALL_STATUS="HEALTHY"

for endpoint in "${ENDPOINTS[@]}"; do
    echo -n "Testing: $endpoint ... "
    
    # Get HTTP status code and response time
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" --max-time 10 "$endpoint")
    HTTP_CODE=$(echo "$RESPONSE" | cut -d'|' -f1)
    TIME_TOTAL=$(echo "$RESPONSE" | cut -d'|' -f2)
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "405" ]; then
        echo "✅ $HTTP_CODE (${TIME_TOTAL}s)"
    elif [ "$HTTP_CODE" = "404" ]; then
        echo "❌ $HTTP_CODE (${TIME_TOTAL}s) - ENDPOINT DOWN"
        OVERALL_STATUS="DEGRADED"
    elif [ "$HTTP_CODE" = "000" ]; then
        echo "❌ TIMEOUT/NO_RESPONSE - NETWORK ISSUE"
        OVERALL_STATUS="DOWN"
    else
        echo "⚠️  $HTTP_CODE (${TIME_TOTAL}s) - UNEXPECTED"
        OVERALL_STATUS="DEGRADED"
    fi
done

echo "========================================="
echo "Overall Status: $OVERALL_STATUS"
echo "========================================="

# Exit with error code if not healthy
if [ "$OVERALL_STATUS" != "HEALTHY" ]; then
    exit 1
fi 