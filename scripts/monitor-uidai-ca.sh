#!/bin/bash

# UIDAI CA Certificate Monitoring Script
# Monitors AuthStaging25082025.cer expiry and alerts when renewal needed

set -euo pipefail

# Configuration
UIDAI_CA_URL="https://developer.uidai.gov.in/assets/cert/AuthStaging25082025.cer"
LOCAL_CA_PATH="./certs/uidai_auth_stage.cer"
ALERT_DAYS=7  # Alert when less than 7 days remaining
CRITICAL_DAYS=3  # Critical alert when less than 3 days

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 UIDAI CA Certificate Monitor${NC}"
echo "=================================="

# Function to get certificate expiry date
get_cert_expiry() {
    local cert_path="$1"
    if [[ ! -f "$cert_path" ]]; then
        echo "Certificate not found: $cert_path"
        return 1
    fi
    
    openssl x509 -in "$cert_path" -noout -enddate | cut -d= -f2
}

# Function to calculate days until expiry
days_until_expiry() {
    local expiry_date="$1"
    local expiry_epoch=$(date -d "$expiry_date" +%s)
    local current_epoch=$(date +%s)
    local days_left=$(( (expiry_epoch - current_epoch) / 86400 ))
    echo "$days_left"
}

# Download current CA certificate
echo "📥 Downloading current UIDAI CA certificate..."
if curl -f -s -o /tmp/uidai_ca_current.cer "$UIDAI_CA_URL"; then
    echo "✅ Downloaded successfully"
else
    echo -e "${RED}❌ Failed to download CA certificate${NC}"
    echo "   Check UIDAI developer portal manually"
    exit 1
fi

# Check if local certificate exists
if [[ -f "$LOCAL_CA_PATH" ]]; then
    echo "📋 Comparing with local certificate..."
    
    # Get fingerprints
    local_fp=$(openssl x509 -in "$LOCAL_CA_PATH" -noout -sha256 -fingerprint | cut -d= -f2)
    current_fp=$(openssl x509 -in /tmp/uidai_ca_current.cer -noout -sha256 -fingerprint | cut -d= -f2)
    
    if [[ "$local_fp" == "$current_fp" ]]; then
        echo "✅ Local certificate matches current UIDAI CA"
    else
        echo -e "${YELLOW}⚠️ NEW CA CERTIFICATE AVAILABLE!${NC}"
        echo "   Local:   $local_fp"
        echo "   Current: $current_fp"
        echo "   Please update your local certificate!"
        
        # Backup old certificate
        backup_path="${LOCAL_CA_PATH}.backup.$(date +%Y%m%d)"
        cp "$LOCAL_CA_PATH" "$backup_path"
        echo "   Old certificate backed up to: $backup_path"
        
        # Copy new certificate
        cp /tmp/uidai_ca_current.cer "$LOCAL_CA_PATH"
        echo "   ✅ Local certificate updated"
    fi
else
    echo "📥 No local certificate found, copying current version..."
    mkdir -p "$(dirname "$LOCAL_CA_PATH")"
    cp /tmp/uidai_ca_current.cer "$LOCAL_CA_PATH"
    echo "✅ Local certificate installed"
fi

# Check certificate details
echo ""
echo "📊 Certificate Information:"
echo "-------------------------"

# Subject and issuer
subject=$(openssl x509 -in "$LOCAL_CA_PATH" -noout -subject | cut -d= -f2-)
issuer=$(openssl x509 -in "$LOCAL_CA_PATH" -noout -issuer | cut -d= -f2-)
echo "Subject:  $subject"
echo "Issuer:   $issuer"

# Validity dates
valid_from=$(openssl x509 -in "$LOCAL_CA_PATH" -noout -startdate | cut -d= -f2)
valid_until=$(openssl x509 -in "$LOCAL_CA_PATH" -noout -enddate | cut -d= -f2)
echo "Valid from: $valid_from"
echo "Valid until: $valid_until"

# Days until expiry
days_left=$(days_until_expiry "$valid_until")
echo "Days remaining: $days_left"

# Alert based on days remaining
if [[ $days_left -le $CRITICAL_DAYS ]]; then
    echo -e "${RED}🚨 CRITICAL: Certificate expires in $days_left days!${NC}"
    echo "   IMMEDIATE ACTION REQUIRED:"
    echo "   1. Check UIDAI developer portal for new CA"
    echo "   2. Update all containers and trust stores"
    echo "   3. Test sandbox connectivity"
    exit 2
elif [[ $days_left -le $ALERT_DAYS ]]; then
    echo -e "${YELLOW}⚠️ WARNING: Certificate expires in $days_left days${NC}"
    echo "   Recommended actions:"
    echo "   1. Monitor UIDAI portal for replacement CA"
    echo "   2. Prepare certificate rotation procedures"
    echo "   3. Schedule maintenance window if needed"
    exit 1
else
    echo -e "${GREEN}✅ Certificate valid for $days_left more days${NC}"
fi

# Generate certificate fingerprint for audit trail
fingerprint=$(openssl x509 -in "$LOCAL_CA_PATH" -noout -sha256 -fingerprint | cut -d= -f2)
echo ""
echo "🔏 Certificate SHA-256 Fingerprint:"
echo "   $fingerprint"

# Save monitoring results
cat > /tmp/uidai_ca_status.json << EOF
{
  "timestamp": "$(date -Iseconds)",
  "certificate_path": "$LOCAL_CA_PATH",
  "subject": "$subject",
  "issuer": "$issuer",
  "valid_from": "$valid_from",
  "valid_until": "$valid_until",
  "days_remaining": $days_left,
  "sha256_fingerprint": "$fingerprint",
  "status": "$([ $days_left -le $CRITICAL_DAYS ] && echo "critical" || [ $days_left -le $ALERT_DAYS ] && echo "warning" || echo "ok")"
}
EOF

echo ""
echo "📝 Status saved to: /tmp/uidai_ca_status.json"
echo "🏁 Monitoring complete"

# Cleanup
rm -f /tmp/uidai_ca_current.cer 