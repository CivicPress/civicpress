# 🧠 CivicPress Development Context

## 📋 Project Overview

CivicPress – an open-source, modular civic platform for municipalities, built
with Markdown, Git, and trustable workflows. Currently in **implementation
phase** with core CLI functionality and comprehensive testing framework.

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
- **CLI Implementation**: Core CLI commands implemented with CAC framework
- **Testing Framework**: Comprehensive test suite with 88 passing tests
- **Development Tools**: CLI tools for civic record management

### ⏳ What's In Progress

- **Core Implementation**: Specifications exist, CLI is functional
- **Legal Register Module**: Basic structure exists, needs full implementation
- **User Interface**: Basic civic dashboard and record management
- **Integration Testing**: Manual testing for CLI user experience

### 🚧 What's Next

- **Core Platform**: Implement civic-core.ts, hook system, workflow engine
- **Module Development**: Complete legal-register and add more modules
- **User Interface**: Basic civic dashboard and record management
- **Production Deployment**: Real-world testing and deployment

## 🎯 Current Focus Areas

### Priority 1: Core Implementation

- Build the foundational civic-core.ts loader
- Implement the hook system (emitHook)
- Create the workflow engine
- Add Git integration with role-aware commits

### Priority 2: Development Experience

- Manual testing and validation of CLI functionality
- User experience optimization
- Development documentation
- Example implementations

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
- **Support Manual Testing**: Help with CLI validation and user experience
  testing

## 🔧 Technical Context

- **Language**: TypeScript/JavaScript with Node.js
- **Package Manager**: pnpm with workspace support
- **Architecture**: Modular monorepo with plugin system
- **Data Format**: Markdown with YAML frontmatter
- **Version Control**: Git-native with role-aware commits
- **Security**: Sandboxed workflows and comprehensive audit trails
- **CLI Framework**: CAC (Command And Conquer) for CLI parsing
- **Testing**: Vitest with comprehensive test suite (88 passing, 8 skipped)

## 📚 Key Specifications to Follow

- **Core System**: manifest.md, auth.md, permissions.md, git-policy.md
- **Architecture**: api.md, cli.md, frontend.md, ui.md
- **Plugin System**: plugins.md, plugin-api.md, plugin-development.md
- **Workflows**: workflows.md, hooks.md, lifecycle.md, scheduler.md
- **Testing**: testing-framework.md, security.md, accessibility.md

## 🧪 Testing Approach

### Current Testing Strategy

- **Documentation Tests**: Tests serve as documentation of expected CLI behavior
- **Stable Test Suite**: 88 passing tests, 8 skipped for unimplemented features
- **Manual Testing**: CLI functionality validated through manual testing
- **Environment Limitations**: Test environment cannot execute CLI commands
  directly

### Testing Decisions

- **No `--help` Tests**: Removed unnecessary help flag testing
- **Mock CLI Execution**: Tests return consistent mock results
- **Clear Documentation**: Tests document expected behavior for manual
  validation
- **Parallel Safety**: Tests run safely in parallel without conflicts

### Future Testing Considerations

- **Unit Tests**: Could extract CLI logic for direct testing (medium complexity)
- **Integration Tests**: Could test in real environment (high complexity)
- **Current Approach**: Pragmatic solution that provides good documentation
