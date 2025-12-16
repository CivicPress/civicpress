# 🚀 START HERE - Agent Session Guide

> Read this before starting any work on CivicPress

**🌐 Website:** [civicpress.io](https://civicpress.io) | **📧 Contact:**
[hello@civicpress.io](mailto:hello@civicpress.io)

## 📋 **Quick Project Overview**

CivicPress is a comprehensive civic technology platform with:

- ✅ **All tests passing** - System is stable and healthy
- ✅ **Complete CLI & API** - Full functionality implemented
- ✅ **Comprehensive specs** - 50+ detailed platform specifications
- ✅ **Simplified handover** - Just run `node agent/tools/save-memory.js`

## 🎯 **Current Status (Latest)**

### **✅ What's Working**

- **CLI**: Full command-line interface with authentication and record management
- **API**: REST API with 20+ endpoints and role-based access control
- **Core**: Git integration, indexing, validation, and user management
- **Tests**: All 391 tests passing (CLI, API, Core)
- **Documentation**: Comprehensive guides and specifications

### **🚀 What's Next**

- **API Enhancement Phase** - Diff API, analytics, bulk operations
- **Plugin System** - Extensible architecture for custom modules
- **Federation** - Multi-node synchronization and data sharing

## 🔧 **Essential Commands**

### **Project Setup**

```bash
# Build everything
pnpm run build

# Run all tests
pnpm run test

# Start development
pnpm run dev
```

### **Agent Memory**

```bash
# Save your memory before ending session
node agent/tools/save-memory.js

# Check current session
cat agent/sessions/current-session.md
```

## 📚 **Key Files to Know**

### **Project State**

- `docs/project-status.md` - Current project health and roadmap
- `README.md` - Platform overview and getting started
- `docs/todo.md` - Current priorities and next steps

### Agent Memory Files

- `agent/memory/project-state.md` - Detailed project status
- `agent/memory/lessons.md` - Technical insights and patterns
- `agent/memory/decisions.md` - Architecture and design decisions

### **Specifications**

- `docs/specs-index.md` - Complete platform specifications (50+ specs)
- `docs/specs/` - Detailed specifications for all components

## 🚨 **Important Notes**

### **Authentication**

- **GitHub tokens** OR **username/password** authentication supported
- See `docs/auth-system.md` for setup instructions
- Simulated auth available for testing

### **Testing**

- **All tests passing** - Don't break the test suite!
- Use `pnpm run test` to verify before committing
- Tests cover CLI, API, and core functionality

### **Documentation**

- **Keep docs updated** - Update relevant files when making changes
- **Follow patterns** - Check `agent/memory/lessons.md` for established patterns
- **Specification-driven** - Reference specs in `docs/specs/` for guidance

## 🔄 **Workflow**

1. **Read this guide** ✅ (you're doing this now)
2. **Check current session** - `cat agent/sessions/current-session.md`
3. **Review project state** - `cat PROJECT_STATUS.md`
4. **Start working** - Follow established patterns
5. **Save memory** - `node agent/tools/save-memory.js` before ending

## 🆘 **Need Help?**

- **Project Status**: Check `docs/project-status.md`
- **Technical Decisions**: Review `agent/memory/decisions.md`
- **Lessons Learned**: See `agent/memory/lessons.md`
- **Specifications**: Browse `docs/specs-index.md`

---

Ready to work on CivicPress! 🚀

_Remember: Save your memory before ending the session!_
