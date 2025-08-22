# 🔐 **Certificate Setup Guide**

## 📋 **Required Certificate Files**

Place these 2 files in the `certs/` directory:

| File | Purpose |
|------|---------|
| `uidai_auth_stage.cer` | UIDAI CA root certificate |
| `New_Public_AUA_for_Staging_Services_RootSigned_2428.p12` | AUA certificate (password: `public`) |

## 🔧 **Quick Setup**

```bash
# 1. Create certificate directory
mkdir -p certs/

# 2. Add certificate files to certs/ directory
# (Files should be provided separately for security)

# 3. Verify files are in place
ls -la certs/
# Should show:
# uidai_auth_stage.cer
# New_Public_AUA_for_Staging_Services_RootSigned_2428.p12

# 4. Test certificate loading
npm run start:dev
curl http://localhost:3002/auth/test/certificates
```

## ✅ **Expected Result**
```json
{
  "valid": true,
  "details": {
    "uidai_stage_root": { "exists": true, "valid": true },
    "aua_private_key": { "exists": true, "valid": true },
    "aua_leaf_cert": { "exists": true, "valid": true }
  }
}
```

## 🚨 **Security Notice**

Certificates are **NOT** included in the repository for security compliance. They must be provided separately and placed in the `certs/` directory.

## 📞 **Support**

For certificate access or setup issues:
- **Complete Setup Guide**: [MILESTONE_B_SETUP_GUIDE.md](../MILESTONE_B_SETUP_GUIDE.md)
- **Repository**: https://github.com/guglxni/aadhaar 