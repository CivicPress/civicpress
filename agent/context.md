# 🧠 CivicPress Development Context

## 📋 Project Overview

CivicPress – an open-source, modular civic platform for municipalities, built
with Markdown, Git, and trustable workflows. Currently in **specification
phase** with comprehensive design but minimal implementation.

## 🎯 Vision

To replace opaque government tech with transparent, inspectable systems that
empower clerks, citizens, and coders alike.

## 📊 Current State

### ✅ What's Complete

- **Comprehensive Specification System**: 50+ detailed specs covering all
  aspects
- **Plugin Architecture**: Complete API design and development framework
- **Security Framework**: Comprehensive security and testing specifications
- **Documentation Standards**: Well-defined processes and guidelines
- **Project Structure**: Monorepo setup with clear organization

### ⏳ What's In Progress

- **Core Implementation**: Specifications exist but code needs to be written
- **Legal Register Module**: Basic structure exists, needs full implementation
- **Development Tools**: CLI and validation tools need implementation
- **Testing Framework**: Specified but not implemented

### 🚧 What's Next

- **Core Platform**: Implement civic-core.ts, hook system, workflow engine
- **CLI Tools**: Build civic init, lint, and validation commands
- **Module Development**: Complete legal-register and add more modules
- **User Interface**: Basic civic dashboard and record management

## 🎯 Current Focus Areas

### Priority 1: Core Implementation

- Build the foundational civic-core.ts loader
- Implement the hook system (emitHook)
- Create the workflow engine
- Add Git integration with role-aware commits

### Priority 2: Development Experience

- Implement specification validation tools
- Build testing framework
- Create development documentation
- Add example implementations

### Priority 3: Civic Modules

- Complete legal-register module
- Add record validation and lifecycle management
- Implement legal document workflows
- Add approval and publishing processes

## 🧠 AI Development Role

Used as a co-planner, system architect, code generator, and civic thinking
companion. The AI should:

- **Follow Specifications**: All implementations should align with the
  comprehensive spec system
- **Prioritize Core**: Focus on foundational components before advanced features
- **Maintain Quality**: Ensure code quality, security, and accessibility
- **Document Decisions**: Help track implementation decisions and tradeoffs
- **Test Thoroughly**: Ensure comprehensive testing as specified in
  testing-framework.md

## 🔧 Technical Context

- **Language**: TypeScript/JavaScript with Node.js
- **Package Manager**: pnpm with workspace support
- **Architecture**: Modular monorepo with plugin system
- **Data Format**: Markdown with YAML frontmatter
- **Version Control**: Git-native with role-aware commits
- **Security**: Sandboxed workflows and comprehensive audit trails

## 📚 Key Specifications to Follow

- **Core System**: manifest.md, auth.md, permissions.md, git-policy.md
- **Architecture**: api.md, cli.md, frontend.md, ui.md
- **Plugin System**: plugins.md, plugin-api.md, plugin-development.md
- **Workflows**: workflows.md, hooks.md, lifecycle.md, scheduler.md
- **Testing**: testing-framework.md, security.md, accessibility.md
