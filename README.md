# 🎯 Aadhaar Integration Server

![UIDAI Status](https://img.shields.io/endpoint?url=https://aaryanguglani.github.io/aadhaar/status.json)
![Build Status](https://github.com/aaryanguglani/aadhaar/workflows/UIDAI%20Live%20Status%20Monitor/badge.svg)
![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-5+-blue.svg)

**Real-time UIDAI sandbox integration with automated status monitoring**

## 🚀 **Zero-Drift Documentation**

This project features **automated status monitoring** that eliminates documentation drift:

- **📊 Live Status**: [STATUS.md](./STATUS.md) - Auto-generated from live tests
- **🎯 Dynamic Badge**: Updates automatically with current error codes
- **📖 Operations**: [RUNBOOK.md](./RUNBOOK.md) - Production deployment guide
- **🔄 CI Integration**: Fails builds on client errors, warns on service outages

### Badge Endpoints

```
Static Badge:  https://img.shields.io/badge/UIDAI-{status}-{color}
Dynamic Badge: https://img.shields.io/endpoint?url=https://aaryanguglani.github.io/aadhaar/status.json
Status API:    https://aaryanguglani.github.io/aadhaar/api.json
```

## 🏗️ **Architecture**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend UI   │───▶│  NestJS Server  │───▶│ UIDAI Sandbox   │
│  (QR Scanner)   │    │ (Auth Provider) │    │   (OTP/eKYC)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │ Status Monitor  │
                        │ (Auto-Updated)  │
                        └─────────────────┘
```

## 🔧 **Quick Start**

### 1. Prerequisites
```bash
# Required
node >= 18
npm >= 8
```

### 2. Installation
```bash
git clone https://github.com/aaryanguglani/aadhaar.git
cd aadhaar
npm install
```

### 3. Configuration
```bash
# Copy environment template
cp sandbox.env .env

# Add your UIDAI credentials
vim .env  # Set AUA_CODE, AUA_LICENSE_KEY, etc.
```

### 4. Run Development Server
```bash
npm run start:dev
# Server starts on http://localhost:3002
```

### 5. Check Integration Status
```bash
# View current status
cat STATUS.md

# Force status update
npm run status:generate

# Run CI status check
npm run ci:status
```

## 📊 **Monitoring & Alerts**

### Automated Status Monitoring

The project includes **bulletproof automation** that:

✅ **Parses response files** (not fragile log tail)  
✅ **Uses fake timers** in tests (no CI timeouts)  
✅ **Guards self-push** (prevents fork loops)  
✅ **Handles exit codes** properly for GitHub Actions  
✅ **Generates dynamic badges** (real-time updates)  
✅ **Secret scanning** (prevents credential leaks)  
✅ **Recovery testing** (validates success webhooks)  

### Error Classification

| Error | Action | Type | Retry | Next Action |
|-------|--------|------|-------|-------------|
| 000 | - | ✅ Success | N/A | Deploy to production |
| 523 | - | ❌ Client | No | Fix timestamp format |
| 940 | - | ❌ Client | No | Check credentials |
| 998 | A201 | ❌ Client | No | Validate UID |
| 998 | A202 | ⚠️ Server | Yes | Wait for UIDAI recovery |

### Webhook Integration

Set environment variables for alerts:
```bash
export WEBHOOK_SUCCESS_URL="https://hooks.slack.com/..."  # Green status
export WEBHOOK_WARNING_URL="https://hooks.slack.com/..."  # Service outage
export WEBHOOK_ERROR_URL="https://hooks.slack.com/..."    # Critical errors
```

## 🧪 **Testing**

```bash
# Unit tests
npm test

# Retry logic tests (with fake timers)
npm run test:retry

# E2E integration test
npm run test:e2e

# Coverage report
npm run test:cov
```

## 🚀 **Production Deployment**

### Pre-Deployment Checklist

```bash
# 1. Verify production readiness
npm run status:generate
grep "PRODUCTION READY" STATUS.md || exit 1

# 2. Run full test suite
npm run test
npm run test:e2e

# 3. Security scan
npm audit
```

### Deployment

See [RUNBOOK.md](./RUNBOOK.md) for complete production deployment procedures, including:

- Certificate requirements
- Environment setup
- Monitoring configuration
- Incident response procedures
- Rollback strategies

## 📈 **CI/CD Integration**

The GitHub Actions workflow automatically:

1. **Runs integration tests** every 30 minutes
2. **Updates STATUS.md** when errors change
3. **Deploys badge data** to GitHub Pages
4. **Sends webhook alerts** for status changes
5. **Fails builds** on client errors
6. **Warns** on service outages (but doesn't fail)

### Repository Secrets

```bash
# Required for webhooks (optional)
WEBHOOK_SUCCESS_URL   # Slack/Discord success notifications
WEBHOOK_WARNING_URL   # Service outage alerts
WEBHOOK_ERROR_URL     # Critical error alerts
```

## 🔐 **Security**

- **P12 certificates** stored securely
- **Environment variables** for sensitive config
- **Secret scanning** in CI pipeline
- **Network access** restricted to UIDAI endpoints
- **Audit logging** for all operations

## 📚 **API Documentation**

### Health Check
```
GET /health
Response: { "status": "ok", "timestamp": "..." }
```

### QR Code Generation
```
GET /auth/qr?uid={aadhaar}&redirectUri={callback}
Response: QR code for mobile scanning
```

### Status API
```
GET https://aaryanguglani.github.io/aadhaar/api.json
Response: {
  "err": "998",
  "actn": "A202", 
  "severity": "warning",
  "retry_enabled": true,
  "next_action": "Wait for UIDAI recovery"
}
```

## 🤝 **Contributing**

1. Fork the repository
2. Create feature branch: `git checkout -b feature/awesome-feature`
3. Make changes and test: `npm run test:retry`
4. Commit changes: `git commit -m 'Add awesome feature'`
5. Push to branch: `git push origin feature/awesome-feature`
6. Open Pull Request

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 **Support**

- **Documentation**: [STATUS.md](./STATUS.md) (auto-updated)
- **Operations**: [RUNBOOK.md](./RUNBOOK.md) (incident response)
- **Issues**: [GitHub Issues](https://github.com/aaryanguglani/aadhaar/issues)
- **UIDAI Support**: techsupport@uidai.net.in

---

**Status**: ![UIDAI Status](https://img.shields.io/endpoint?url=https://aaryanguglani.github.io/aadhaar/status.json)  
**Last Updated**: Auto-generated by CI  
**Monitoring**: Real-time with automated alerts
