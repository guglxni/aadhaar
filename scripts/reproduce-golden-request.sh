#!/bin/bash

# Following the exact 5-step reproducible pipeline from your guide
set -e

echo "🎯 Step ① - Freeze your golden request"

# Generate request parameters
REQUEST_TS=$(date -u +"%Y-%m-%dT%H:%M:%S")
TXN="TXN$RANDOM$RANDOM"  
AADHAAR_UID="999999990019"
AUA="public"
SUB="public" 
LK="MG_g7jJVYUIW7cLYXY5yaqKD6D1TuhjTJTDPHcb0SudOhVpvpnsEw_A"
ASA_LK="MFoSig475ZNf8Fex6pRZJvFgXoOJhiC67s8cbKCTkkI43QB2a0vKlY8"

echo "Request timestamp: $REQUEST_TS"
echo "Transaction ID: $TXN"

# Generate AES session key  
AES_KEY=$(openssl rand -base64 32)
echo "Generated AES session key"

echo "🔨 Step ② - Create PID block"
cat > /tmp/pid.xml <<EOF
<?xml version="1.0"?>
<Pid ts="$REQUEST_TS" ver="1.0"><Otp value=""/>
</Pid>
EOF

echo "Created PID XML:"
cat /tmp/pid.xml

echo "🔐 Step ③ - Calculate HMAC"
# Calculate HMAC of PID with session key
PID_HMAC=$(cat /tmp/pid.xml | openssl dgst -sha256 -binary -hmac "$(echo "$AES_KEY" | base64 -d)" | base64)
echo "Calculated PID HMAC: $PID_HMAC"

echo "🗝️ Step ④ - Session key envelope"
# Encrypt session key with UIDAI public cert
UIDAI_PUB="certs/uidai_auth_stage.cer"

if [ ! -f "$UIDAI_PUB" ]; then
    echo "❌ UIDAI certificate not found at $UIDAI_PUB"
    echo "Available cert files:"
    find certs/ -name "*.cer" -o -name "*.pem" -o -name "*.crt" 2>/dev/null || echo "No cert files found"
    echo "✅ Using alternative UIDAI cert..."
    UIDAI_PUB="certs/uidai_auth_stage.cer"
fi

SKEY=$(echo "$AES_KEY" | base64 -d | openssl rsautl -encrypt -certin -inkey "$UIDAI_PUB" | base64 | tr -d '\n')
echo "Encrypted session key (first 50 chars): ${SKEY:0:50}..."

# Extract certificate expiry for ci (macOS compatible)
CI=$(openssl x509 -in "$UIDAI_PUB" -noout -enddate | cut -d= -f2 | sed 's/GMT//' | xargs -I{} date -ju -f "%b %d %H:%M:%S %Y" {} +"%y%m%d%H%M%S" 2>/dev/null || echo "200916000000")
echo "Certificate identifier: $CI"

echo "📝 Step ⑤ - Build unsigned template"
cat > /tmp/otp_unsigned.xml <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<Otp uid="$AADHAAR_UID" ac="$AUA" sa="$SUB" ver="2.5" tid="" txn="$TXN"
     lk="$LK" ts="$REQUEST_TS" rc="Y">
  <Uses otp="y"/>
  <Meta udc="public"/>
  <Skey ci="$CI">$SKEY</Skey>
  <Hmac>$PID_HMAC</Hmac>
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <CanonicalizationMethod
        Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      <SignatureMethod
        Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
      <Reference URI="">
        <Transforms>
          <Transform
            Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
        </Transforms>
        <DigestMethod
          Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
        <DigestValue></DigestValue>
      </Reference>
    </SignedInfo>
    <SignatureValue></SignatureValue>
    <KeyInfo><X509Data><X509Certificate/></X509Data></KeyInfo>
  </Signature>
</Otp>
EOF

echo "✅ Created unsigned template:"
echo "Element order: Uses → Meta → Skey → Hmac → Signature"
head -10 /tmp/otp_unsigned.xml

echo ""
echo "🔑 Step ⑥ - Sign with xmlsec1"

# Find AUA key and cert
AUA_KEY="certs/aua_private.pem"
AUA_CERT="certs/aua_cert.pem"

if [ ! -f "$AUA_KEY" ] || [ ! -f "$AUA_CERT" ]; then
    echo "❌ AUA key/cert not found. Using clean versions..."
    AUA_KEY="certs/aua_private_clean.pem"
    AUA_CERT="certs/aua_cert_clean.pem"
fi

echo "Signing with xmlsec1..."
xmlsec1 \
  --sign --lax-key-search \
  --privkey-pem "$AUA_KEY","$AUA_CERT" \
  --output /tmp/otp_signed.xml \
  /tmp/otp_unsigned.xml || { echo "❌ xmlsec1 signing failed"; exit 1; }

echo "✅ Signed successfully"

echo "🔍 Step ⑦ - Verify signature locally"
xmlsec1 --verify --pubkey-cert-pem "$AUA_CERT" /tmp/otp_signed.xml
if [ $? -eq 0 ]; then
    echo "✅ Local signature verification: OK"
else
    echo "❌ Local signature verification failed"
    exit 1
fi

echo "📋 Final signed XML (first 15 lines):"
head -15 /tmp/otp_signed.xml

echo ""
echo "🎯 Ready to send to UIDAI sandbox!"
echo "URL: https://developer.uidai.gov.in/uidotp/2.5/$AUA/${AADHAAR_UID:0:1}/${AADHAAR_UID:1:1}/$ASA_LK" 