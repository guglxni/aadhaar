# 🛠️ **Operations Guide**

## 📋 **Quick Reference**

| Component | Status Check | Action |
|-----------|--------------|---------|
| **Application Health** | `curl http://localhost:3002/health` | `npm run start:dev` |
| **Certificate Status** | `curl http://localhost:3002/auth/test/certificates` | Check certificate files |
| **Authentication Test** | Visit `http://localhost:3002` | Test QR/Link flows |

## 🚀 **Setup & Start**

```bash
# 1. Setup
npm install
mkdir -p certs/
# [Add certificate files to certs/]

# 2. Start server
npm run start:dev

# 3. Test
curl http://localhost:3002/health
open http://localhost:3002
```

## 🐛 **Common Issues**

### Server won't start
- Check `.env` file has all required variables
- Verify certificate files exist in `certs/` directory
- Ensure port 3002 is not in use

### Certificates not loading
- Verify files: `ls -la certs/`
- Check paths in `.env` file
- Test: `curl http://localhost:3002/auth/test/certificates`

### Authentication flows not working
- Test QR generation: visit `http://localhost:3002`
- Test link generation: click "Generate Authentication Link"
- Test OTP flow: scan QR or click link → enter any 6-digit OTP

## 📞 **Support**

For setup issues, see: [MILESTONE_B_SETUP_GUIDE.md](../MILESTONE_B_SETUP_GUIDE.md)