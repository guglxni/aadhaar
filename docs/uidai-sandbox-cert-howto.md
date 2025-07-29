# 🔐 UIDAI Sandbox – Certificate Chain Fix (clears Error 523)

## 1️⃣ Download the current sandbox CA certificate

```bash
# in repo root
curl -L -o certs/uidai_auth_stage.cer \
     https://uidai.gov.in/images/uidai_auth_stage.cer

# If download fails, use local copy
cp certs/uidai_auth_stage_new.cer certs/uidai_auth_stage.cer

# Keep the hash for audit logs
shasum -a 256 certs/uidai_auth_stage.cer
```

The UIDAI site keeps the file name constant; each new release is pushed under the same URL.

---

## 2️⃣ Verify that your P-12 leaf is signed by that CA

```bash
# extract the leaf that lives under alias 'publicauaforstagingservices'
openssl pkcs12 -in certs/New_Public_AUA_for_Staging_Services_RootSigned_2428.p12 \
               -legacy -clcerts -nokeys \
               -passin pass:public \
               -out /tmp/aua_leaf.pem

# must print:  /tmp/aua_leaf.pem: OK
openssl verify -CAfile certs/uidai_auth_stage.cer /tmp/aua_leaf.pem
```

| Result | Meaning | Next move |
|--------|---------|-----------|
| `OK` | Chain is good – continue | go to step 3 |
| `unable to get issuer certificate` | Leaf is not signed by UIDAI CA | ask UIDAI tech-support to re-issue the P-12 against uidai_auth_stage.cer |

**⚠️ Current Status**: Your certificate **FAILS** verification - it's self-signed, not UIDAI-issued!

---

## 3️⃣ Configure the app to use this CA and only this CA

**sandbox.env**

```bash
UIDAI_CA_CERT_PATH=certs/uidai_auth_stage.cer
AUA_P12_PATH=certs/New_Public_AUA_for_Staging_Services_RootSigned_2428.p12
AUA_P12_PASSWORD=public
AUA_P12_ALIAS=publicauaforstagingservices
```

**xmlsec1 call (e.g. in crypto-utils.ts)**

```bash
xmlsec1 --sign \
  --trusted-pem  "$UIDAI_CA_CERT_PATH"   \
  --privkey-p12  "$AUA_P12_PATH,$AUA_P12_ALIAS,$AUA_P12_PASSWORD" \
  --output "$SIGNED_XML"  "$UNSIGNED_XML"
```

---

## 4️⃣ Embed only the leaf certificate in `<KeyInfo>`

```xml
<KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
  <X509Data>
    <X509Certificate><!-- PEM-to-DER-base64 of /tmp/aua_leaf.pem --></X509Certificate>
  </X509Data>
</KeyInfo>
```

(Do NOT embed the CA cert; UIDAI already trusts it.)

---

## 5️⃣ Restart & test

```bash
pkill -f "nest start"          # stop any previous instance
export $(grep -v '^#' sandbox.env | xargs)
npm run start:dev &

sleep 5
curl -s "http://localhost:3002/auth/qr?uid=999999990019&redirectUri=http://localhost:3002/callback" | jq .
```

**Expected outcomes:**

| Chain check | Signature math | UIDAI response |
|-------------|----------------|----------------|
| bad | n/a | 523 |
| OK | math wrong | 569 |
| OK | math OK | ret="y" 🎉 |

If you still see 523, re-run step 2 and ensure the leaf you embed is exactly the one that verifies with uidai_auth_stage.cer.

Once 523 is gone, any remaining 569 is purely a digest / canonicalisation issue—fixing that will give the final green-light ret="y".

---

## 🚨 Current Issue Resolution

**Problem**: Your current P12 certificate is **self-signed** and not issued by UIDAI's staging CA.

**Evidence**:
```
Certificate Details:
- Subject: CN=Public AUA for Staging Services  
- Issuer: CN=Root Public AUA for Staging Services (SELF-SIGNED)
- Serial: 04579D9D56C2DC
- Expected Issuer: CN=AuthStaging25082025
```

**Solution**: 
1. Contact UIDAI support via the original email sender: `info@star-industries.com`
2. Request: P12 certificate re-issued against `AuthStaging25082025` CA
3. Subject: "Need P12 Re-issued Against AuthStaging25082025 CA - Error 523"

**Email Template**:
```
Subject: Need AUA signing certificate re-issued against AuthStaging25082025

Dear UIDAI Technical Support,

We are experiencing Error 523 "Certificate chain validation failure" in the UIDAI sandbox environment.

PROBLEM ANALYSIS:
- Current P12: Self-signed certificate with issuer "CN=Root Public AUA for Staging Services"
- UIDAI Expects: Certificate issued by your current staging CA "CN=AuthStaging25082025"
- Error: Chain validation fails because self-signed certificates are not trusted

REQUEST:
Please provide a new P12 certificate signed by your current staging CA "AuthStaging25082025" 
instead of the self-signed certificate.

CURRENT FILES:
- P12 File: New_Public_AUA_for_Staging_Services_RootSigned_2428.p12 (self-signed)
- Expected: P12 issued by AuthStaging25082025 CA
- Alias: publicauaforstagingservices  
- Password: public

This will resolve Error 523 and allow proper XML signature validation in your sandbox.

Thank you for your assistance.
```

---

## 📋 Audit Trail

**Certificate Hash**: `edcda59e932a534d7e74d4423d2adfc0f9e6197ad582b3ebf4b2ede6757c678f`  
**Date**: July 19, 2025  
**Status**: ❌ Verification Failed - Certificate chain invalid  
**Next Action**: Contact UIDAI for re-issuance

---

Drop this file into the repo (`docs/uidai-sandbox-cert-howto.md`) so the whole team has the canonical procedure. 