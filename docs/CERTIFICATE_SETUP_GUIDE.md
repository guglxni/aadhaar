# 🔐 **Certificate Setup Guide for Hopae Evaluators**

## 🚨 **SECURITY NOTICE**

**Certificates are NOT included in this GitHub repository for security reasons.** This is industry best practice - never commit private keys or certificates to version control.

---

## 📋 **Required Certificates**

The application requires the following certificates to function:

### **1. UIDAI Stage Root Certificate**
- **File**: `uidai_auth_stage.cer`
- **Purpose**: UIDAI CA root certificate for staging environment
- **Source**: Available from UIDAI developer portal

### **2. AUA P12 Certificate**
- **File**: `New_Public_AUA_for_Staging_Services_RootSigned_2428.p12`
- **Purpose**: Public AUA certificate for staging services
- **Password**: `public`
- **Source**: Provided by UIDAI for public testing

### **3. Extracted Certificate Files (Auto-generated)**
- **Files**: `aua_staging.crt`, `aua_staging.key`
- **Purpose**: Extracted from P12 for separate PEM file access
- **Generation**: Automatic via application startup

---

## 🔧 **Setup Instructions**

### **Step 1: Create Certificate Directory**
```bash
mkdir -p certs/
```

### **Step 2: Obtain UIDAI Certificates**

#### **Option A: Request from UIDAI**
1. Visit: https://developer.uidai.gov.in
2. Register for staging access
3. Download required certificates
4. Request AUA P12 certificate from authsupport@uidai.net.in

#### **Option B: Use Public Staging Certificates**
The application is configured to work with UIDAI's public staging certificates:
- **AUA Code**: `public`
- **License Key**: `MG_g7jJVYUIW7cLYXY5yaqKD6D1TuhjTJTDPHcb0SudOhVpvpnsEw_A`
- **ASA License Key**: `MFoSig475ZNf8Fex6pRZJvFgXoOJhiC67s8cbKCTkkI43QB2a0vKlY8`

### **Step 3: Place Certificates**
```bash
# Place certificates in the certs/ directory:
certs/
├── uidai_auth_stage.cer                                    # UIDAI root CA
├── New_Public_AUA_for_Staging_Services_RootSigned_2428.p12 # AUA P12 certificate
└── [auto-generated files will appear here]
```

### **Step 4: Configure Environment**
```bash
# Copy and configure environment variables
cp config/.env.example .env

# Edit .env with certificate paths:
AUA_P12_PATH=./certs/New_Public_AUA_for_Staging_Services_RootSigned_2428.p12
AUA_P12_PASSWORD=public
UIDAI_CERT_PATH=./certs/uidai_auth_stage.cer
```

### **Step 5: Verify Setup**
```bash
# Start the application
npm run start:dev

# Test certificate loading
curl http://localhost:3003/auth/test/certificates
```

**Expected Output:**
```json
{
  "valid": true,
  "certificates": {
    "uidai_stage_root": { "exists": true, "valid": true },
    "aua_private_key": { "exists": true, "valid": true },
    "aua_leaf_cert": { "exists": true, "valid": true }
  }
}
```

---

## 🎯 **For Hopae Evaluators**

### **Certificate Sharing Options**

1. **Secure File Sharing** (Recommended)
   - Use Google Drive with restricted access
   - Share link via encrypted email
   - Include setup instructions

2. **Direct Provision**
   - Certificates will be provided separately via secure channel
   - Follow setup instructions above
   - Contact for certificate access if needed

3. **UIDAI Direct Download**
   - Obtain certificates directly from UIDAI
   - Use public staging credentials provided
   - Follow UIDAI developer portal instructions

### **Verification Steps**

1. **Certificate Validation**: `/auth/test/certificates` endpoint
2. **Health Check**: `/health` endpoint  
3. **Live Integration**: `/auth/qr?uid=999941057058` (test UID)
4. **Error Handling**: Verify Error 998/A202 classification

### **Expected Test Results**

- ✅ **Certificate Loading**: All certificates valid
- ✅ **QR Generation**: Success with official test UIDs
- ✅ **UIDAI Communication**: Proper API communication
- ✅ **Error Classification**: Correct A201 vs A202 distinction

---

## 🔒 **Security Compliance**

### **Why Certificates Are Not in GitHub**

1. **Industry Best Practice**: Never commit private keys to version control
2. **Security Standards**: Certificates contain sensitive cryptographic material
3. **Compliance Requirements**: UIDAI security guidelines
4. **Risk Mitigation**: Prevents unauthorized access to staging certificates

### **Security Measures Implemented**

- ✅ **Git Ignore**: All certificate files excluded from version control
- ✅ **File Permissions**: Private keys secured with 600 permissions
- ✅ **Environment Variables**: Certificate paths configurable via environment
- ✅ **Secure Loading**: Certificates loaded securely at runtime
- ✅ **Audit Logging**: Certificate access logged for security monitoring

---

## 📞 **Support**

For certificate setup assistance or access:
- **Repository**: https://github.com/guglxni/aadhaar
- **Documentation**: [docs/RUNBOOK.md](./RUNBOOK.md)
- **Security**: [docs/security/SECURITY.md](./security/SECURITY.md)

---

**🔐 Security-First UIDAI Integration with Professional Certificate Management** 