# 🚀 UIDAI Integration Production Runbook

## 📋 Pre-Production Checklist

### Certificate Requirements
- [ ] Production P12 certificate obtained from UIDAI
- [ ] Certificate signed by valid CA (not self-signed for production)
- [ ] Certificate validity period checked (minimum 6 months remaining)
- [ ] Private key securely stored and backed up

### Environment Setup
- [ ] Production environment variables configured
- [ ] Database connection tested and optimized
- [ ] Load balancer health checks configured
- [ ] SSL/TLS certificates installed and verified
- [ ] Monitoring and alerting systems deployed

### Validation Tests
- [ ] KYC flow tested with real UIDs (limited scope)
- [ ] Mobile OTP verification working
- [ ] Error handling verified for all error codes
- [ ] Performance testing completed (target: <2s response time)
- [ ] Security scanning passed

## 🔄 Deployment Process

### 1. Pre-Deployment
```bash
# Run full integration tests
npm run test:integration

# Generate latest status
node scripts/status-generator.js

# Verify production readiness
if [ "$(grep 'PRODUCTION READY' STATUS.md)" ]; then
    echo "✅ Ready for deployment"
else
    echo "❌ Not ready - check STATUS.md"
    exit 1
fi
```

### 2. Production Deployment
```bash
# Deploy with zero downtime
npm run build
npm run deploy:production

# Verify deployment
curl -f https://your-domain.com/health
```

### 3. Post-Deployment
```bash
# Run smoke tests
npm run test:smoke

# Monitor for 15 minutes
npm run monitor:post-deploy
```

## 🖥️ Monitoring & Alerting

### Key Metrics
| Metric | Threshold | Action |
|--------|-----------|---------|
| Error Rate | >5% | Investigate immediately |
| Response Time | >3s | Scale resources |
| UIDAI 998/A202 | >10 min | Contact UIDAI support |
| Certificate Expiry | <30 days | Renew certificate |

### Alerting Rules
```yaml
# Example alerting configuration
alerts:
  - name: uidai_error_rate_high
    condition: error_rate > 0.05
    severity: critical
    
  - name: uidai_service_outage
    condition: error_998_a202_duration > 600s
    severity: warning
    
  - name: certificate_expiring
    condition: cert_expiry_days < 30
    severity: warning
```

## 🚨 Incident Response

### Error 523 - Invalid Timestamp
**Symptoms:** OTP requests failing with timestamp errors

**Diagnosis:**
```bash
# Check server time
date
timedatectl status

# Check timestamp format in logs
grep "Generated timestamp" /var/log/uidai.log
```

**Resolution:**
1. Sync server time with NTP
2. Restart application
3. Verify timestamp format (YYYY-MM-DDThh:mm:ss IST)

### Error 998/A202 - Service Outage
**Symptoms:** All OTP requests failing with A202

**Diagnosis:**
```bash
# Check UIDAI service status
curl -I https://developer.uidai.gov.in/uidotp/2.5

# Review recent error patterns
grep "A202" /var/log/uidai.log | tail -20
```

**Resolution:**
1. Verify it's not client-side (check other error codes)
2. Monitor for auto-recovery (typically 2-5 minutes)
3. If >10 minutes, contact UIDAI support
4. Implement circuit breaker if needed

### Error 940 - Authentication Failure
**Symptoms:** Certificate or credential errors

**Diagnosis:**
```bash
# Verify certificate validity
openssl x509 -in cert.pem -noout -dates

# Check certificate chain
openssl verify -CAfile ca.pem cert.pem
```

**Resolution:**
1. Verify certificate hasn't expired
2. Check certificate matches environment (staging vs production)
3. Validate AUA credentials
4. Contact UIDAI if certificate issues persist

## 📞 Contact Information

### UIDAI Support
- **Technical Support:** techsupport@uidai.net.in
- **Phone:** +91-120-4773555
- **Portal:** https://uidai.gov.in/contact-support

### Internal Escalation
- **L1 Support:** DevOps team
- **L2 Support:** Backend team lead
- **L3 Support:** Architecture team

## 🔄 Rollback Procedures

### Emergency Rollback
```bash
# Immediate rollback to previous version
kubectl rollout undo deployment/uidai-service

# Or with Docker
docker service update --rollback uidai-service
```

### Graceful Rollback
```bash
# Scale down new version
kubectl scale deployment uidai-service-new --replicas=0

# Scale up previous version
kubectl scale deployment uidai-service-old --replicas=3

# Update load balancer
kubectl patch service uidai-service -p '{"spec":{"selector":{"version":"old"}}}'
```

## 📊 Performance Optimization

### Database Tuning
- Session cleanup: Every 30 minutes
- Connection pooling: 20 connections max
- Query timeout: 10 seconds

### Caching Strategy
- Certificate cache: 1 hour TTL
- UIDAI responses: No caching (security requirement)
- Static assets: 24 hour TTL

### Auto-scaling
```yaml
# Kubernetes HPA configuration
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: uidai-service
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: uidai-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## 🔐 Security Checklist

### Production Security
- [ ] P12 certificates stored in secure vault
- [ ] Environment variables encrypted
- [ ] Network access restricted to required IPs
- [ ] SSL/TLS 1.3 minimum
- [ ] Security headers configured
- [ ] Regular security scans scheduled

### Compliance
- [ ] Data retention policies implemented
- [ ] Audit logging enabled and secured
- [ ] Access controls documented
- [ ] Privacy policy updated
- [ ] GDPR compliance verified (if applicable)

## 📈 Capacity Planning

### Current Limits
- **UIDAI Rate Limits:** 1000 requests/minute per AUA
- **Our Infrastructure:** 500 concurrent users
- **Database:** 10,000 sessions max

### Scaling Triggers
- CPU > 70% for 5 minutes
- Memory > 80% for 3 minutes
- Error rate > 2% for 2 minutes
- Queue depth > 100 requests

---

**Last Updated:** Auto-generated from production deployment pipeline  
**Next Review:** Monthly or after major incidents  
**Owner:** DevOps & Backend Teams 