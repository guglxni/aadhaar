# 🛠️ **Aadhaar eID Integration - Operations Runbook**

> **Production Operations Guide for UIDAI Aadhaar eID Authentication Service**

---

## 📋 **Quick Reference**

| Component | Status Check | Action |
|-----------|--------------|---------|
| **Application Health** | `curl http://localhost:3003/health` | `npm run start:dev` |
| **UIDAI Integration** | `curl http://localhost:3003/auth/health/uidai` | Check `STATUS.md` |
| **Certificate Status** | `npm run tools:monitor` | Update certificates |
| **Service Logs** | `docker logs aadhaar-eid` | Check audit logs |

---

## 🚀 **Deployment Procedures**

### **Development Environment**

```bash
# 1. Clone and setup
git clone <repository-url>
cd aadhaar

# 2. Install dependencies
npm install

# 3. Configure environment
cp config/.env.example .env
# Edit .env with your UIDAI credentials

# 4. Start development server
npm run start:dev

# 5. Verify health
curl http://localhost:3003/health
```

### **Production Deployment**

```bash
# 1. Pre-deployment checks
npm run security:scan
npm run test:all-systems

# 2. Build application
npm run deploy:production

# 3. Docker deployment
npm run docker:build
npm run docker:run

# 4. Verify deployment
curl http://localhost:3003/health
curl http://localhost:3003/auth/health/uidai
```

### **Staging Environment**

```bash
# Deploy to staging
npm run deploy:staging

# Run comprehensive tests
npm run test:e2e:comprehensive
npm run test:error-handling
```

---

## ⚙️ **Configuration Management**

### **Environment Variables**

Located in `config/.env.example` and your local `.env`:

```bash
# UIDAI Configuration
UIDAI_BASE_URL=https://developer.uidai.gov.in
AUA_CODE=public
ASA_LICENSE_KEY=MFoSig475ZNf8Fex6pRZJvFgXoOJhiC67s8cbKCTkkI43QB2a0vKlY8
AUA_LICENSE_KEY=MG_g7jJVYUIW7cLYXY5yaqKD6D1TuhjTJTDPHcb0SudOhVpvpnsEw_A

# Certificate Management
AUA_P12_PATH=./certs/New_Public_AUA_for_Staging_Services_RootSigned_2428.p12
AUA_P12_PASSWORD=public
UIDAI_CERT_PATH=./certs/uidai_auth_stage.cer

# Application Settings
NODE_ENV=production
PORT=3003
SERVER_BASE_URL=https://your-domain.com
```

### **Docker Configuration**

Main configuration in `config/docker-compose.sandbox.yml`:

```yaml
services:
  uidai-auth:
    build:
      context: .
      dockerfile: config/Dockerfile.sandbox
    environment:
      - NODE_ENV=production
      - UIDAI_BASE_URL=https://developer.uidai.gov.in
    volumes:
      - ./certs:/app/certs:ro
    ports:
      - "3003:3003"
```

---

## 🔍 **Monitoring & Health Checks**

### **Application Health**

```bash
# Basic health check
curl http://localhost:3003/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2025-08-05T12:32:26.054Z",
  "uptime": 120.5,
  "environment": "production"
}
```

### **UIDAI Integration Health**

```bash
# UIDAI connectivity check
curl http://localhost:3003/auth/health/uidai

# Expected response:
{
  "status": "ok",
  "uidai": {
    "connectivity": "available",
    "lastError": null,
    "certificateStatus": "valid"
  }
}
```

### **Certificate Monitoring**

```bash
# Monitor certificate expiry
npm run tools:monitor

# Archive certificate evidence
npm run tools:archive
```

### **Status Monitoring**

```bash
# Generate current status
npm run tools:status

# View current status
cat STATUS.md
```

---

## 🧪 **Testing Procedures**

### **Development Testing**

```bash
# Unit tests
npm test

# End-to-end tests
npm run test:e2e:comprehensive

# Error handling tests
npm run test:error-handling

# Full test suite
npm run test:all-systems
```

### **Live Integration Testing**

```bash
# Live UIDAI sandbox testing
npm run test:live

# Dual run for consistency
npm run test:live:dual

# Comprehensive E2E with dual runs
npm run test:e2e:dual
```

### **Performance Testing**

```bash
# Load testing endpoints
curl -w "@curl-format.txt" -s -o /dev/null http://localhost:3003/auth/qr?uid=999999990019

# Monitor response times
tail -f logs/performance.log
```

---

## 🚨 **Incident Response**

### **Common Issues**

#### **1. UIDAI Service Outage (Error 998/A202)**

**Symptoms:**
- Error 998 with action code A202 in responses
- "UIDAI OTP service temporarily unavailable" messages

**Resolution:**
```bash
# 1. Verify it's a service outage, not client issue
curl -X GET "http://localhost:3003/auth/health/uidai"

# 2. Check STATUS.md for current error state
cat STATUS.md

# 3. Monitor for service recovery (automatic retry enabled)
tail -f logs/audit.log | grep "A202"

# 4. No action required - system will retry automatically
```

#### **2. Certificate Issues (Error 569/570)**

**Symptoms:**
- Error 569: "Digital signature verification failed"
- Error 570: "Invalid key-info in digital signature"

**Resolution:**
```bash
# 1. Check certificate validity
npm run tools:monitor

# 2. Verify P12 certificate loading
curl http://localhost:3003/auth/test/certificates

# 3. If expired, update certificates
# Follow certificate renewal process in docs/uidai-sandbox-cert-howto.md
```

#### **3. Configuration Issues (Error 940)**

**Symptoms:**
- Error 940: "Unauthorized ASA channel"
- Authentication failures

**Resolution:**
```bash
# 1. Verify environment variables
npm run auth/debug/config

# 2. Check license keys
grep -E "(AUA_LICENSE_KEY|ASA_LICENSE_KEY)" .env

# 3. Validate configuration
npm run auth/config/validate
```

#### **4. Application Startup Failures**

**Symptoms:**
- "Configuration key does not exist" errors
- "Failed to load cryptographic keys" errors

**Resolution:**
```bash
# 1. Check environment file
ls -la .env
cat config/.env.example

# 2. Verify certificate paths
ls -la certs/

# 3. Check application logs
npm run start:dev 2>&1 | tee startup.log
```

### **Emergency Procedures**

#### **Service Restart**

```bash
# Docker environment
npm run docker:stop
npm run docker:run

# Development environment
pkill -f "nest start"
npm run start:dev
```

#### **Rollback Procedure**

```bash
# 1. Stop current service
npm run docker:stop

# 2. Checkout previous version
git checkout <previous-commit>

# 3. Rebuild and deploy
npm run docker:build
npm run docker:run

# 4. Verify rollback
curl http://localhost:3003/health
```

---

## 📊 **Log Management**

### **Log Locations**

```bash
# Application logs (structured JSON)
logs/application.log
logs/audit.log
logs/error.log

# Docker logs
docker logs aadhaar-eid

# System logs
/var/log/aadhaar/
```

### **Log Analysis**

```bash
# Filter by correlation ID
grep "correlationId.*abc123" logs/audit.log

# Monitor UIDAI errors
tail -f logs/audit.log | grep -E "(err|actn)"

# Performance monitoring
grep "PERFORMANCE_METRIC" logs/audit.log | tail -20
```

### **Log Rotation**

```bash
# Manual log rotation
logrotate -f /etc/logrotate.d/aadhaar

# Archive old logs
tar -czf logs/archive/$(date +%Y%m%d).tar.gz logs/*.log
```

---

## 🔐 **Security Procedures**

### **Certificate Management**

```bash
# Check certificate expiry
openssl x509 -in certs/uidai_auth_stage.cer -text -noout | grep "Not After"

# Verify P12 integrity
openssl pkcs12 -info -in certs/New_Public_AUA_for_Staging_Services_RootSigned_2428.p12 -noout

# Update CA certificates
npm run tools:monitor
```

### **Secret Rotation**

```bash
# 1. Generate new certificates (follow UIDAI process)
# 2. Update environment variables
vim .env

# 3. Restart application
npm run docker:stop
npm run docker:run

# 4. Verify new certificates
curl http://localhost:3003/auth/test/certificates
```

### **Security Scanning**

```bash
# Run security audit
npm run security:scan

# Check for vulnerabilities
npm audit --audit-level high

# Lint for security issues
npm run lint
```

---

## 📈 **Performance Optimization**

### **Monitoring Metrics**

```bash
# Response time monitoring
curl -w "@curl-format.txt" -s -o /dev/null http://localhost:3003/auth/qr

# Memory usage
docker stats aadhaar-eid

# CPU utilization
top -p $(pgrep -f "node.*nest")
```

### **Optimization Steps**

```bash
# 1. Enable production optimizations
export NODE_ENV=production

# 2. Configure memory limits
docker run --memory=512m aadhaar-eid

# 3. Enable compression
# (Already configured in NestJS application)

# 4. Monitor and tune
npm run start:prod
```

---

## 📞 **Support Contacts**

### **Internal Team**
- **Development Team**: dev-team@company.com
- **Operations Team**: ops-team@company.com
- **Security Team**: security@company.com

### **External Support**
- **UIDAI Technical Support**: techsupport@uidai.net.in
- **UIDAI Help Desk**: help@uidai.gov.in
- **Certificate Authority**: support@ca-provider.com

### **Emergency Escalation**
1. **Level 1**: Development Team (Response: 30 minutes)
2. **Level 2**: Operations Team (Response: 1 hour)
3. **Level 3**: External UIDAI Support (Response: 4 hours)

---

## 📚 **Related Documentation**

- **[API Documentation](./api/)** - Complete API reference and error codes
- **[Security Report](./security/)** - Security compliance and audit results
- **[Compliance Evidence](./compliance/)** - Milestone B documentation
- **[Project Structure](./PROJECT_STRUCTURE.md)** - Repository organization guide
- **[Certificate Setup](./uidai-sandbox-cert-howto.md)** - UIDAI certificate configuration

---

**For immediate assistance, check `STATUS.md` for current system status and recent error codes.** 