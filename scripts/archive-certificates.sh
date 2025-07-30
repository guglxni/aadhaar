#!/bin/bash

# Certificate Archive Script for UIDAI Milestone B Audit
# Archives certificate fingerprints, verification proofs, and metadata

set -euo pipefail

# Configuration
ARCHIVE_DIR="./sandbox-artifacts/certificates"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
P12_PATH="./certs/New_Public_AUA_for_Staging_Services_RootSigned_2428.p12"
CA_PATH="./certs/uidai_auth_stage.cer"
P12_PASSWORD="public"

echo "🔐 UIDAI Certificate Archive Generator"
echo "====================================="

# Create archive directory
mkdir -p "$ARCHIVE_DIR"

# Function to extract certificate info
extract_cert_info() {
    local cert_path="$1"
    local cert_name="$2"
    
    if [[ ! -f "$cert_path" ]]; then
        echo "❌ Certificate not found: $cert_path"
        return 1
    fi
    
    echo "📋 Processing $cert_name..."
    
    # Extract certificate details
    local subject=$(openssl x509 -in "$cert_path" -noout -subject | sed 's/subject=//')
    local issuer=$(openssl x509 -in "$cert_path" -noout -issuer | sed 's/issuer=//')
    local serial=$(openssl x509 -in "$cert_path" -noout -serial | sed 's/serial=//')
    local fingerprint_sha1=$(openssl x509 -in "$cert_path" -noout -sha1 -fingerprint | cut -d= -f2)
    local fingerprint_sha256=$(openssl x509 -in "$cert_path" -noout -sha256 -fingerprint | cut -d= -f2)
    local valid_from=$(openssl x509 -in "$cert_path" -noout -startdate | cut -d= -f2)
    local valid_until=$(openssl x509 -in "$cert_path" -noout -enddate | cut -d= -f2)
    
    # Calculate days until expiry
    local expiry_epoch=$(date -d "$valid_until" +%s)
    local current_epoch=$(date +%s)
    local days_left=$(( (expiry_epoch - current_epoch) / 86400 ))
    
    # Create certificate info JSON
    cat > "$ARCHIVE_DIR/${cert_name}_${TIMESTAMP}.json" << EOF
{
  "certificate_info": {
    "name": "$cert_name",
    "path": "$cert_path",
    "subject": "$subject",
    "issuer": "$issuer",
    "serial_number": "$serial",
    "fingerprints": {
      "sha1": "$fingerprint_sha1",
      "sha256": "$fingerprint_sha256"
    },
    "validity": {
      "not_before": "$valid_from",
      "not_after": "$valid_until",
      "days_remaining": $days_left
    },
    "archived_at": "$(date -Iseconds)",
    "archived_by": "$(whoami)@$(hostname)"
  }
}
EOF
    
    echo "✅ $cert_name archived to ${cert_name}_${TIMESTAMP}.json"
}

# Archive UIDAI CA Certificate
if [[ -f "$CA_PATH" ]]; then
    extract_cert_info "$CA_PATH" "uidai_staging_ca"
else
    echo "⚠️ UIDAI CA certificate not found at $CA_PATH"
fi

# Archive AUA Certificate from P12
if [[ -f "$P12_PATH" ]]; then
    echo "📋 Processing AUA P12 certificate..."
    
    # Extract AUA certificate from P12
    temp_cert="/tmp/aua_temp_cert.crt"
    openssl pkcs12 -in "$P12_PATH" -out "$temp_cert" -clcerts -nokeys -passin pass:"$P12_PASSWORD" 2>/dev/null
    
    if [[ -f "$temp_cert" ]]; then
        extract_cert_info "$temp_cert" "aua_client_cert"
        rm -f "$temp_cert"
    else
        echo "❌ Failed to extract certificate from P12"
    fi
else
    echo "⚠️ AUA P12 certificate not found at $P12_PATH"
fi

# Perform certificate chain verification
echo ""
echo "🔍 Certificate Chain Verification"
echo "--------------------------------"

if [[ -f "$CA_PATH" && -f "$P12_PATH" ]]; then
    # Extract AUA cert for verification
    temp_aua_cert="/tmp/aua_verify_cert.crt"
    openssl pkcs12 -in "$P12_PATH" -out "$temp_aua_cert" -clcerts -nokeys -passin pass:"$P12_PASSWORD" 2>/dev/null
    
    # Perform verification
    verification_output="/tmp/cert_verification_${TIMESTAMP}.txt"
    
    {
        echo "UIDAI Certificate Chain Verification Report"
        echo "Timestamp: $(date -Iseconds)"
        echo "=========================================="
        echo ""
        echo "CA Certificate Details:"
        openssl x509 -in "$CA_PATH" -noout -text | head -20
        echo ""
        echo "AUA Certificate Details:"
        openssl x509 -in "$temp_aua_cert" -noout -text | head -20
        echo ""
        echo "Chain Verification Result:"
        if openssl verify -CAfile "$CA_PATH" "$temp_aua_cert"; then
            echo "✅ VERIFICATION SUCCESSFUL"
            verification_status="SUCCESS"
        else
            echo "❌ VERIFICATION FAILED"
            verification_status="FAILED"
        fi
        echo ""
        echo "Certificate Chain Summary:"
        echo "AUA Subject: $(openssl x509 -in "$temp_aua_cert" -noout -subject | sed 's/subject=//')"
        echo "AUA Issuer:  $(openssl x509 -in "$temp_aua_cert" -noout -issuer | sed 's/issuer=//')"
        echo "CA Subject:  $(openssl x509 -in "$CA_PATH" -noout -subject | sed 's/subject=//')"
        echo "CA Issuer:   $(openssl x509 -in "$CA_PATH" -noout -issuer | sed 's/issuer=//')"
    } > "$verification_output"
    
    # Copy verification to archive
    cp "$verification_output" "$ARCHIVE_DIR/chain_verification_${TIMESTAMP}.txt"
    
    # Create verification summary JSON
    cat > "$ARCHIVE_DIR/verification_summary_${TIMESTAMP}.json" << EOF
{
  "verification_summary": {
    "timestamp": "$(date -Iseconds)",
    "status": "$verification_status",
    "ca_certificate": {
      "path": "$CA_PATH",
      "fingerprint": "$(openssl x509 -in "$CA_PATH" -noout -sha256 -fingerprint | cut -d= -f2)"
    },
    "aua_certificate": {
      "path": "$P12_PATH",
      "fingerprint": "$(openssl x509 -in "$temp_aua_cert" -noout -sha256 -fingerprint | cut -d= -f2)"
    },
    "chain_valid": $([ "$verification_status" = "SUCCESS" ] && echo "true" || echo "false"),
    "verification_command": "openssl verify -CAfile $CA_PATH $temp_aua_cert",
    "audit_trail": "sandbox-artifacts/certificates/chain_verification_${TIMESTAMP}.txt"
  }
}
EOF
    
    echo "✅ Certificate chain verification: $verification_status"
    echo "📄 Verification report: chain_verification_${TIMESTAMP}.txt"
    
    # Cleanup
    rm -f "$temp_aua_cert" "$verification_output"
else
    echo "⚠️ Cannot perform chain verification - missing certificates"
fi

# Generate archive summary
echo ""
echo "📊 Archive Summary"
echo "=================="

archive_files=$(ls -la "$ARCHIVE_DIR"/*_${TIMESTAMP}.* 2>/dev/null | wc -l)
echo "Files archived: $archive_files"
echo "Archive location: $ARCHIVE_DIR"
echo ""

# List archived files
echo "📁 Archived Files:"
ls -la "$ARCHIVE_DIR"/*_${TIMESTAMP}.* 2>/dev/null || echo "No files found"

echo ""
echo "🏁 Certificate archiving complete"
echo "📋 Submit these files to UIDAI with your Milestone B application:"
echo "   1. Certificate fingerprint JSON files"
echo "   2. Chain verification report"
echo "   3. Verification summary JSON" 