# Module Development Enforcement - Summary

**Date**: 2025-01-30  
**Status**: ✅ Complete

---

## Overview

Updated rules, rails, and agent folder to enforce that all future development
requiring new modules follows established CivicPress patterns.

---

## Files Updated

### 1. ✅ `agent/coding-assistant/conventions.md`

**Added**: Complete "Module Development" section with:

- Module development process (8 steps)
- Service registration pattern (Pattern 2)
- Configuration management pattern
- Error handling requirements
- Initialization & lifecycle requirements
- Core service dependencies documentation
- Hook system integration
- Logging patterns
- Module development checklist (before/during/after implementation)
- Reference implementations

**Location**: After "Storage System Patterns" section

---

### 2. ✅ `agent/coding-assistant/project.yml`

**Added**: 7 new non-negotiable rules:

- All new modules MUST create complete specification before implementation
- All new modules MUST register services in DI container using Pattern 2
- All new modules MUST implement configuration management
- All new modules MUST define error hierarchy extending CivicPressError
- All new modules MUST implement initialization and shutdown lifecycle
- All new modules MUST document core service dependencies
- All new modules MUST use Logger from core (not console.log)

**Location**: In `non_negotiables` section

---

### 3. ✅ `agent/knowledge/patterns.md`

**Enhanced**: "Module Development Pattern" section with:

- Complete module development process pattern
- Step-by-step implementation guide
- Code examples for all steps:
  - Service registration
  - Configuration management
  - Error handling
  - Main service with lifecycle
- Module development checklist

**Location**: Replaced existing "Module Development Pattern" section

---

### 4. ✅ `agent/knowledge/references.md`

**Added**: New "Module Development References" section with:

- Module Integration Guide reference
- Module Specification Template reference
- Realtime Module Specification reference
- Storage Module Implementation reference

**Location**: Before "Related Resources" section

---

## Enforcement Mechanisms

### 1. Non-Negotiable Rules (`project.yml`)

7 new rules added to `non_negotiables` that the AI assistant must enforce:

- Specification creation required
- Service registration required
- Configuration management required
- Error handling required
- Lifecycle management required
- Dependency documentation required
- Logging patterns required

### 2. Conventions Documentation (`conventions.md`)

Complete module development section with:

- 8-step development process
- Code examples (do/don't)
- Complete checklist
- Reference implementations

### 3. Patterns Documentation (`patterns.md`)

Complete pattern with:

- When to use
- How to apply
- Benefits
- Examples
- Code templates

### 4. References Documentation (`references.md`)

All module development references documented:

- Integration guide
- Specification template
- Example specifications
- Example implementations

---

## Required Process for New Modules

### Step 1: Create Specification

1. Copy `docs/specs/module-spec-template.md`
2. Fill in all sections marked with `[TODO]`
3. Ensure all integration sections are complete
4. Review against checklist
5. Get approval before implementation

### Step 2: Service Registration

- Register services in DI container using Pattern 2
- Follow `registerStorageServices()` pattern
- Document service keys and dependencies

### Step 3: Configuration Management

- Implement `[ModuleName]ConfigManager`
- Configuration file in `.system-data/[module-name].yml`
- Follow `StorageConfigManager` pattern

### Step 4: Error Handling

- Define error hierarchy extending `CivicPressError`
- Create domain-specific error classes
- Document error codes

### Step 5: Initialization & Lifecycle

- Implement `initialize()` method
- Implement `shutdown()` method
- Document lifecycle sequence

### Step 6: Core Service Dependencies

- Document all core services used
- Document service resolution pattern
- Include dependency table

### Step 7: Hook System Integration

- Document hook events emitted (if applicable)
- Document hook event structure
- Document workflow integration

### Step 8: Logging Patterns

- Use `Logger` from core
- Never use `console.log`
- Include operation context

---

## Checklist for AI Assistant

When asked to create a new module, the AI assistant must:

### Before Implementation

- [ ] Check if specification exists
- [ ] If not, create specification using template
- [ ] Ensure all integration sections are complete
- [ ] Review against checklist
- [ ] Get user approval

### During Implementation

- [ ] Register services in DI container
- [ ] Implement configuration manager
- [ ] Define error hierarchy
- [ ] Implement initialization/shutdown
- [ ] Document core dependencies
- [ ] Use Logger from core
- [ ] Write tests
- [ ] Update documentation

### After Implementation

- [ ] Verify service registration
- [ ] Verify configuration loading
- [ ] Verify error handling
- [ ] Verify lifecycle management
- [ ] Verify hook integration (if applicable)
- [ ] Verify logging patterns
- [ ] Complete documentation

---

## Reference Documents

### Primary References

1. **`docs/module-integration-guide.md`** - Complete integration guide
2. **`docs/specs/module-spec-template.md`** - Specification template
3. **`docs/specs/realtime-architecture.md`** - Complete specification example
4. **`modules/storage/`** - Complete implementation example

### Supporting Documents

1. **`docs/specs/realtime-module-integration-checklist.md`** - Completion
   checklist
2. **`docs/specs/realtime-architecture-GAPS.md`** - Common gaps to avoid
3. **`docs/dependency-injection-guide.md`** - DI container usage
4. **`docs/error-handling.md`** - Error handling patterns

---

## Enforcement Status

✅ **Complete** - All enforcement mechanisms in place:

1. ✅ Non-negotiable rules added to `project.yml`
2. ✅ Complete module development section in `conventions.md`
3. ✅ Enhanced module development pattern in `patterns.md`
4. ✅ Module development references in `references.md`
5. ✅ AI assistant will enforce all requirements

---

## Next Steps

### For Developers

1. Review updated documentation
2. Use template for new modules
3. Follow 8-step process
4. Reference examples (Storage, Realtime spec)

### For AI Assistant

1. Enforce non-negotiable rules
2. Require specification before implementation
3. Follow complete checklist
4. Reference established patterns

---

**Status**: ✅ Complete  
**Enforcement**: Active  
**Last Updated**: 2025-01-30
