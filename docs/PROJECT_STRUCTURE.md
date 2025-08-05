# 📁 **Project Structure Documentation**

This document outlines the professional repository structure and organization of the Aadhaar eID Integration Service.

---

## 🏗️ **Repository Architecture**

```
aadhaar/
├── 📂 src/                     # Application Source Code
│   ├── modules/                # Feature modules (NestJS architecture)
│   │   ├── auth/              # Authentication module
│   │   ├── health/            # Health check module
│   │   └── common/            # Shared module
│   ├── common/                # Shared utilities and services
│   │   ├── config/            # Configuration management
│   │   ├── decorators/        # Custom decorators
│   │   ├── filters/           # Exception filters
│   │   ├── guards/            # Authentication guards
│   │   ├── interceptors/      # Request/response interceptors
│   │   └── logging/           # Audit logging service
│   └── main.ts                # Application entry point
│
├── 📂 tests/                   # Test Suites
│   ├── uidai-e2e-comprehensive.spec.ts    # End-to-end integration tests
│   ├── uidai-error-handling.spec.ts       # Error handling system tests
│   ├── retry-logic.spec.ts               # Retry mechanism tests
│   └── xmlsec1.spec.ts                   # XML signing tests
│
├── 📂 docs/                    # Documentation
│   ├── api/                   # API documentation
│   │   └── UIDAI_ERROR_HANDLING_IMPLEMENTATION.md
│   ├── compliance/            # Milestone B evidence
│   │   ├── compliance-evidence/           # Evidence package
│   │   ├── aadhaar-2025-compliant-README.md
│   │   └── UIDAI_INTEGRATION_FINAL_REPORT.md
│   ├── security/              # Security reports
│   │   └── SECURITY.md        # Security compliance report
│   ├── deployment/            # Deployment guides
│   ├── milestone-b/           # Milestone B specific docs
│   ├── RUNBOOK.md             # Operations guide
│   └── uidai-sandbox-cert-howto.md       # Certificate setup guide
│
├── 📂 config/                  # Configuration Files
│   ├── docker-compose.sandbox.yml        # Docker composition for sandbox
│   ├── Dockerfile.sandbox               # Docker image definition
│   └── .env.example                     # Environment template
│
├── 📂 tools/                   # Utility Scripts
│   ├── status-generator.js              # Status monitoring
│   ├── monitor-uidai-ca.sh             # Certificate monitoring
│   ├── archive-certificates.sh         # Certificate archival
│   ├── ci-status-check.sh              # CI status validation
│   └── test-xmlsec1.js                 # XML signing utilities
│
├── 📂 certs/                   # Certificate Storage
│   ├── New_Public_AUA_for_Staging_Services_RootSigned_2428.p12
│   ├── uidai_auth_stage.cer
│   └── README.md              # Certificate documentation
│
├── 📂 public/                  # Static Web Assets
│   ├── auth/                  # Authentication UI
│   ├── css/                   # Stylesheets
│   ├── js/                    # Client-side JavaScript
│   └── images/                # Static images
│
├── 📂 build-artifacts/         # Build Outputs
│   └── dist/                  # Compiled application
│
├── 📂 .github/                 # GitHub Configuration
│   └── workflows/             # CI/CD pipelines
│
├── 📂 .husky/                  # Git Hooks
│   └── pre-commit             # Pre-commit security checks
│
├── 📄 README.md                # Project overview and quick start
├── 📄 STATUS.md                # Current integration status
├── 📄 package.json             # Node.js dependencies and scripts
├── 📄 tsconfig.json            # TypeScript configuration
├── 📄 .env                     # Environment variables (gitignored)
├── 📄 .gitignore               # Git ignore patterns
└── 📄 nest-cli.json            # NestJS CLI configuration
```

---

## 📋 **Directory Purposes**

### **🔧 Core Application**

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `src/` | Main application source code | `main.ts`, modules, services |
| `src/modules/auth/` | UIDAI authentication logic | providers, controllers, DTOs |
| `src/common/` | Shared utilities and services | logging, config, interceptors |

### **🧪 Testing & Quality**

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `tests/` | All test suites | E2E, unit, integration tests |
| `.husky/` | Git hooks for quality gates | pre-commit security checks |

### **📚 Documentation**

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `docs/` | All project documentation | API docs, compliance, security |
| `docs/api/` | API reference and error codes | Error handling implementation |
| `docs/compliance/` | Milestone B evidence package | Complete compliance documentation |
| `docs/security/` | Security reports and protocols | Security compliance report |

### **⚙️ Configuration & Deployment**

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `config/` | Configuration files | Docker, environment templates |
| `tools/` | Utility scripts and automation | Monitoring, certificate management |
| `certs/` | Certificate storage | P12 certificates, CA certificates |

### **🌐 Frontend & Assets**

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `public/` | Static web assets | HTML, CSS, JavaScript, images |
| `build-artifacts/` | Compiled outputs | Production build artifacts |

---

## 🚀 **Development Workflow**

### **1. Code Organization**
- **Modular Architecture**: Feature-based modules under `src/modules/`
- **Shared Components**: Common utilities in `src/common/`
- **Clear Separation**: Business logic, configuration, and utilities separated

### **2. Testing Strategy**
- **Comprehensive Coverage**: Unit, integration, and E2E tests in `tests/`
- **Live Integration**: Real UIDAI sandbox testing
- **Error Validation**: Complete error code testing

### **3. Documentation Standards**
- **API Documentation**: Complete in `docs/api/`
- **Compliance Evidence**: Organized in `docs/compliance/`
- **Operations Guide**: Detailed runbook in `docs/RUNBOOK.md`

### **4. Configuration Management**
- **Environment Templates**: `.env.example` in `config/`
- **Docker Support**: Complete containerization in `config/`
- **Security**: Secrets managed via environment variables

---

## 📊 **File Organization Principles**

### **✅ Followed Standards**
- **Logical Grouping**: Related files grouped by functionality
- **Clear Naming**: Descriptive directory and file names
- **Separation of Concerns**: Code, tests, docs, config separated
- **Professional Structure**: Industry-standard organization

### **🗑️ Removed Redundancies**
- **Legacy Code**: Old Java SDK and backup files removed
- **Development Artifacts**: Temporary files and logs cleaned
- **Duplicate Documentation**: Consolidated into organized structure
- **Build Outputs**: Moved to dedicated `build-artifacts/`

### **🔐 Security Considerations**
- **Certificate Security**: Proper certificate storage in `certs/`
- **Environment Isolation**: Secrets in environment variables
- **Git Hygiene**: Comprehensive `.gitignore` patterns
- **Pre-commit Hooks**: Security scanning before commits

---

## 🛠️ **Maintenance Guidelines**

### **Adding New Features**
1. Create feature module in `src/modules/`
2. Add corresponding tests in `tests/`
3. Update documentation in `docs/`
4. Add configuration if needed in `config/`

### **Documentation Updates**
1. API changes → Update `docs/api/`
2. Security changes → Update `docs/security/`
3. Deployment changes → Update `docs/RUNBOOK.md`
4. Compliance changes → Update `docs/compliance/`

### **Configuration Changes**
1. Environment variables → Update `config/.env.example`
2. Docker setup → Update `config/docker-compose.sandbox.yml`
3. Build process → Update `package.json` scripts

---

## 🎯 **Benefits of This Structure**

### **🏢 Professional Grade**
- **Industry Standards**: Follows enterprise development practices
- **Scalability**: Easy to extend and maintain
- **Team Collaboration**: Clear organization for multiple developers
- **Documentation**: Comprehensive and organized

### **🚀 Production Ready**
- **Deployment**: Streamlined with Docker and CI/CD
- **Monitoring**: Built-in health checks and status monitoring
- **Security**: Enterprise-grade security practices
- **Compliance**: Complete audit trail and documentation

### **🔧 Developer Experience**
- **Quick Start**: Clear setup instructions in README
- **Testing**: Comprehensive test suites with clear organization
- **Tools**: Utility scripts for common operations
- **Documentation**: Easy-to-find information for all scenarios

---

**This structure ensures the Aadhaar eID Integration Service is maintainable, scalable, and production-ready while following industry best practices.** 