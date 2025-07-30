# UIDAI Milestone B Integration Specification

**Project**: Aadhaar Authentication Server  
**Version**: 1.0  
**Date**: July 31, 2025  
**Environment**: UIDAI Sandbox  

---

## 📋 **EXECUTIVE SUMMARY**

This document demonstrates our complete UIDAI Aadhaar Authentication implementation for Milestone B certification. Our system implements the full OTP → Auth flow with proper PID encryption, XML digital signatures, and comprehensive error handling as required by UIDAI specifications.

---

## 🎯 **MILESTONE B COMPLIANCE CHECKLIST**

| **Requirement** | **Implementation** | **Status** | **Evidence** |
|-----------------|-------------------|------------|--------------|
| **OTP Generation** | `POST /uidotp/2.5/{ac}/{uid0}/{uid1}/{lk}` | ✅ Complete | `src/modules/auth/providers/aadhaar.provider.ts:397` |
| **Auth Verification** | `POST /uidAuth/2.5/{ac}/{uid0}/{uid1}/{lk}` | ✅ Complete | `src/modules/auth/providers/aadhaar.provider.ts:504` |
| **PID Encryption** | AES-256-CBC with random IV | ✅ Complete | `src/modules/auth/utils/crypto-utils.ts:101` |
| **Session Key Encryption** | RSA-OAEP-SHA256 | ✅ Complete | `src/modules/auth/utils/crypto-utils.ts:141` |
| **HMAC Generation** | SHA-256 HMAC | ✅ Complete | `src/modules/auth/utils/crypto-utils.ts:115` |
| **XML Digital Signature** | RSA-SHA256 with xmlsec1 | ✅ Complete | `src/modules/auth/utils/xmlsec1-signer.ts` |
| **Error Handling** | All UIDAI error codes mapped | ✅ Complete | `src/modules/auth/providers/aadhaar.provider.ts:437` |
| **Transaction Logging** | Complete request/response pairs | ✅ Complete | `sandbox-artifacts/` directory |
| **Network Isolation** | Docker with static IP | ✅ Complete | `docker-compose.sandbox.yml` |

---

## 🏗️ **SYSTEM ARCHITECTURE**

### **Technology Stack**
- **Framework**: NestJS 10.x (Node.js/TypeScript)
- **Cryptography**: xmlsec1, OpenSSL, Node.js crypto
- **Container**: Docker with Alpine Linux
- **Network**: Isolated Docker networks with static IP

### **Security Measures**
- Non-root container execution (UID 1000)
- Read-only filesystem where possible
- Certificate loading from encrypted secrets
- No secrets in environment variables or logs
- Comprehensive audit logging with PII masking

---

## 🔐 **CRYPTOGRAPHIC IMPLEMENTATION**

### **1. PID Block Encryption (AES-256-CBC)**
```typescript
// File: src/modules/auth/utils/crypto-utils.ts:101
export function encryptPid(pidXml: string, sessionKey: Buffer): string {
  const iv = crypto.randomBytes(16); // Random IV per UIDAI 2024+ spec
  const cipher = crypto.createCipheriv('aes-256-cbc', sessionKey, iv);
  const encrypted = Buffer.concat([cipher.update(pidXml, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}
```

### **2. Session Key Encryption (RSA-OAEP)**
```typescript
// File: src/modules/auth/utils/crypto-utils.ts:141
export function encryptSessionKey(sessionKey: Buffer, uidaiPublicKeyPem: string): string {
  const encryptedSessionKey = crypto.publicEncrypt({
    key: uidaiPublicKeyPem,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  }, sessionKey);
  return encryptedSessionKey.toString('base64');
}
```

### **3. HMAC Calculation & Encryption**
```typescript
// File: src/modules/auth/utils/crypto-utils.ts:115
export function calculateHmac(pidXml: string, sessionKey: Buffer): Buffer {
  return crypto.createHmac('sha256', sessionKey).update(pidXml, 'utf8').digest();
}
```

---

## 📡 **API ENDPOINT MAPPING**

### **OTP Request Flow**
| **Field** | **UIDAI Spec** | **Implementation** | **Location** |
|-----------|----------------|-------------------|--------------|
| `uid` | Aadhaar UID | `${uid}` | Request parameter |
| `tid` | Terminal ID | `public` | `aadhaar.provider.ts:218` |
| `ac` | AUA Code | `${this.auaCode}` | Environment config |
| `sa` | Sub-AUA Code | `${this.subAuaCode \|\| this.auaCode}` | Environment config |
| `ver` | API Version | `2.5` | `aadhaar.provider.ts:218` |
| `txn` | Transaction ID | UUID v4 | `aadhaar.provider.ts:399` |
| `lk` | License Key | `${this.auaLicenseKey}` | Environment config |
| `ts` | Timestamp | IST format (YYYY-MM-DDThh:mm:ss) | `aadhaar.provider.ts:139` |

### **Auth Request Flow**
| **Field** | **UIDAI Spec** | **Implementation** | **Location** |
|-----------|----------------|-------------------|--------------|
| `Uses` | Verification modes | `otp="Y" pi="n" pa="n"` | `aadhaar.provider.ts:219` |
| `Skey` | Encrypted session key | RSA-OAEP encrypted | `aadhaar.provider.ts:220` |
| `Data` | Encrypted PID | AES-256-CBC encrypted | `aadhaar.provider.ts:221` |
| `Hmac` | HMAC of PID | SHA-256 HMAC | `aadhaar.provider.ts:222` |
| `Signature` | XML Digital Signature | RSA-SHA256 | xmlsec1 CLI |

---

## ⚠️ **ERROR CODE HANDLING**

| **UIDAI Error** | **Meaning** | **Implementation** | **HTTP Status** |
|-----------------|-------------|-------------------|-----------------|
| `523` | Invalid timestamp | Timestamp validation & retry | `400 Bad Request` |
| `569` | Digital signature failed | Certificate validation | `401 Unauthorized` |
| `570` | Invalid key info | Certificate chain check | `401 Unauthorized` |
| `940` | Unauthorized ASA channel | License key validation | `403 Forbidden` |
| `997` | Invalid UID format | UID format validation | `400 Bad Request` |
| `998/A201` | Invalid UID/No data | UID not found | `400 Bad Request` |
| `998/A202` | Service temporarily unavailable | Exponential backoff retry | `503 Service Unavailable` |

### **Exponential Backoff Implementation**
```typescript
// File: src/modules/auth/auth.controller.ts:80
const maxRetries = 3;
const baseDelay = 30000; // 30 seconds

for (let attempt = 0; attempt <= maxRetries; attempt++) {
  try {
    const result = await this.aadhaarProvider.initiateAuth(...);
    return result;
  } catch (error) {
    if (error.getStatus() === HttpStatus.SERVICE_UNAVAILABLE && 
        error.message.includes('998/A202') && attempt < maxRetries) {
      const retryDelay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      continue;
    }
    throw error;
  }
}
```

---

## 📊 **AUTOMATED TEST SUITE**

### **Test Coverage (Milestone B Requirements)**
- ✅ OTP generation with valid test UID (`999999990019`)
- ✅ Complete Auth flow (OTP → Auth → ret="y")
- ✅ Invalid UID handling (expect err="997/998")
- ✅ Network isolation verification
- ✅ Transaction artifact collection
- ✅ Service outage simulation (998/A202)

### **Test Execution**
```bash
# Enable UIDAI sandbox testing
export CI_UIDAI_SANDBOX=1

# Run Milestone B compliance tests
npm run test:milestone-b

# Collect artifacts for UIDAI submission
ls -la sandbox-artifacts/
```

---

## 🔒 **SECURITY COMPLIANCE**

### **Certificate Management**
- P12 certificates loaded from encrypted environment variables
- No certificates committed to git repository
- Certificates extracted at runtime in isolated containers
- Private keys stored in memory only (not written to disk)

### **Network Security**
- Docker network isolation (172.20.0.0/16 subnet)
- Static IP configuration for UIDAI whitelisting
- Egress filtering (only developer.uidai.gov.in allowed)
- Non-root container execution

### **Data Protection**
- PII masking in all log outputs
- Correlation IDs for audit trails
- Transaction data encrypted at rest in artifacts
- Automatic data retention policies

---

## 📁 **DELIVERABLE ARTIFACTS**

### **1. Source Code Package**
- **Repository**: Clean, security-audited codebase
- **Size**: 1.4MB (secrets purged)
- **Format**: Git repository with signed commits

### **2. Integration Documentation**
- **This Document**: Complete API field mapping
- **Security.md**: Incident report and compliance measures
- **README.md**: Setup and deployment instructions

### **3. Transaction Logs**
- **Location**: `sandbox-artifacts/` directory
- **Format**: JSON with XML request/response pairs
- **Retention**: 30 days with automatic cleanup

### **4. Test Results**
- **Coverage**: All Milestone B scenarios
- **Format**: Jest test reports with artifacts
- **Evidence**: Request/response XMLs for each test case

---

## 🚀 **DEPLOYMENT INSTRUCTIONS**

### **Prerequisites**
1. UIDAI AUA credentials (AUA code, license keys)
2. UIDAI-signed P12 certificate
3. Static IP address whitelisted with UIDAI
4. Docker and Docker Compose installed

### **Environment Setup**
```bash
# 1. Load UIDAI credentials (never commit these)
export UIDAI_PFX_B64=$(base64 -i path/to/your.p12)
export UIDAI_PFX_PASS="your_p12_password"
export UIDAI_LICENSE_KEY="your_license_key"
export UIDAI_ASA_LICENSE_KEY="your_asa_license_key"
export UIDAI_AUA_CODE="your_aua_code"

# 2. Deploy isolated sandbox environment
docker-compose -f docker-compose.sandbox.yml up -d

# 3. Verify health and connectivity
curl http://localhost:3002/health
```

### **Production Checklist**
- [ ] Static IP configured and whitelisted with UIDAI
- [ ] P12 certificate validated with UIDAI public key
- [ ] All environment variables loaded from secure vault
- [ ] Network isolation tested and verified
- [ ] Transaction logging enabled and monitored
- [ ] Backup and disaster recovery procedures tested

---

## 📞 **SUPPORT & CONTACTS**

**Technical Lead**: Development Team  
**Security Officer**: Security Team  
**UIDAI Liaison**: Business Team  

**Emergency Contacts**:
- UIDAI Sandbox NOC: +91-80-2309-XXXX
- UIDAI Support Email: authsupport@uidai.net.in

---

**Document Version**: 1.0  
**Last Updated**: July 31, 2025  
**Next Review**: Before production deployment  
**Classification**: Confidential - UIDAI Sandbox 