# 🤝 CivicPress AI Agent Handover Protocol

**Last Updated**: 2025-01-27  
**Protocol Version**: 1.0

## 🎯 **Handover Overview**

### **Purpose**

This protocol ensures seamless transitions between AI agents (Cursor, Copilot,
ChatGPT, etc.) working on CivicPress, maintaining development continuity and
shared context.

### **When to Use**

- **Tool Switching**: When switching between different AI tools
- **Session Changes**: When starting new development sessions
- **Context Transfer**: When sharing work between team members
- **Continuity**: When resuming work after breaks

## 📋 **Pre-Handover Checklist**

### **1. Update Memory System**

- [ ] **Project State**: Update `agent/memory/project-state.md` with current
      progress
- [ ] **Current Session**: Update `agent/sessions/current-session.md` with
      active work
- [ ] **Blockers**: Update `agent/context/blockers.md` with any current issues
- [ ] **Decisions**: Add any new decisions to `agent/memory/decisions.md`
- [ ] **Lessons**: Record any new insights in `agent/memory/lessons.md`

### **2. Commit Current Work**

- [ ] **Git Status**: Check for uncommitted changes
- [ ] **Conventional Commits**: Use proper commit format with role
- [ ] **Commit Message**: Include context about what was accomplished
- [ ] **Push Changes**: Ensure changes are pushed to repository

### **3. Document Context**

- [ ] **Current Focus**: Note what was being worked on
- [ ] **Next Steps**: Document what should happen next
- [ ] **Open Questions**: Note any unresolved questions
- **Dependencies**: List any blocking dependencies
- [ ] **Resources**: Reference any relevant files or documentation

## 🔄 **Handover Process**

### **Step 1: Context Transfer**

#### **For Outgoing Agent**

1. **Update Current Session**:

   ```markdown
   ## Current Work (2025-01-27)
   - **Focus**: Completing memory system implementation
   - **Status**: All 7 remaining files created successfully
   - **Next Steps**: Test memory system with AI agents
   - **Blockers**: None currently
   ```

2. **Update Project State**:

   ```markdown
   ## Recent Progress
   - ✅ Completed APM-inspired memory system
   - ✅ Created all 7 remaining knowledge files
   - ✅ Established comprehensive agent folder structure
   - 🎯 Ready for memory system testing
   ```

3. **Document Decisions**:
   ```markdown
   ### **2025-01-27: Memory System Completion**
   - **Decision**: Create comprehensive knowledge files
   - **Context**: Need to complete memory system for AI agents
   - **Impact**: Provides complete reference system for AI agents
   ```

### **Step 2: Handover Message**

#### **Standard Handover Template**

```
🤝 **CivicPress Handover - [Date]**

**Current Status**: [Brief description of current state]
**Last Focus**: [What was being worked on]
**Progress Made**: [Key accomplishments]
**Next Priority**: [What should happen next]

**Key Files Updated**:
- agent/memory/[files]
- agent/knowledge/[files]
- agent/context/[files]

**Current Blockers**: [Any issues]
**Dependencies**: [What's needed]

**Memory System Status**: [Updated/Needs update]
**Git Status**: [Clean/Uncommitted changes]

**Ready for handover** ✅
```

### **Step 3: Incoming Agent Protocol**

#### **For Incoming Agent**

1. **Read Memory System**:
   - Start with `agent/README.md` for overview
   - Check `agent/memory/project-state.md` for current status
   - Review `agent/sessions/current-session.md` for active work
   - Read `agent/context/blockers.md` for any issues

2. **Understand Context**:
   - Review recent decisions in `agent/memory/decisions.md`
   - Check lessons learned in `agent/memory/lessons.md`
   - Understand priorities in `agent/context/priorities.md`

3. **Verify Environment**:
   - Check Git status for uncommitted changes
   - Verify all dependencies are installed
   - Test that project builds/runs correctly

4. **Acknowledge Handover**:

   ```
   ✅ **Handover Received - [Date]**

   **Context Understood**: [Brief summary]
   **Current Focus**: [What I'll work on]
   **Next Steps**: [My immediate plan]

   **Questions**: [Any clarifying questions]
   **Ready to continue** ✅
   ```

## 📊 **Handover Categories**

### **Development Handover**

- **When**: Switching between development sessions
- **Focus**: Code changes, implementation progress
- **Key Files**: Core implementation files, tests
- **Protocol**: Standard handover + code review

### **Architecture Handover**

- **When**: Working on system design or architecture
- **Focus**: Design decisions, system structure
- **Key Files**: Architecture docs, design specs
- **Protocol**: Design review + decision documentation

### **Documentation Handover**

- **When**: Working on documentation or specs
- **Focus**: Documentation updates, specification changes
- **Key Files**: Documentation files, specification files
- **Protocol**: Content review + link verification

### **Testing Handover**

- **When**: Working on testing or quality assurance
- **Focus**: Test implementation, bug fixes
- **Key Files**: Test files, bug reports
- **Protocol**: Test review + status verification

## 🔧 **Handover Tools**

### **Memory System Commands**

```bash
# Check memory system status
ls -la agent/

# Update current session
echo "## Current Work $(date)" >> agent/sessions/current-session.md

# Check Git status
git status
git log --oneline -5

# Validate specifications
pnpm run spec:validate
```

### **Context Verification**

```bash
# Verify project builds
pnpm install
pnpm run build

# Check for linting issues
pnpm run lint

# Run tests
pnpm run test

# Validate specs
pnpm run spec:all
```

## 📝 **Handover Quality Guidelines**

### **Essential Information**

- **Current Status**: What's the current state of work?
- **Progress Made**: What was accomplished?
- **Next Steps**: What should happen next?
- **Blockers**: Any issues preventing progress?
- **Dependencies**: What's needed to continue?

### **Context Depth**

- **Technical Context**: What technical decisions were made?
- **Business Context**: What business requirements are relevant?
- **User Context**: What user needs are being addressed?
- **Timeline Context**: What deadlines or milestones are relevant?

### **Communication Quality**

- **Clarity**: Is the handover message clear and complete?
- **Completeness**: Does it include all necessary information?
- **Accuracy**: Is the information current and accurate?
- **Actionability**: Can the incoming agent act on this information?

## 🚨 **Emergency Handover Protocol**

### **When to Use**

- **Urgent Issues**: When immediate attention is needed
- **Critical Blockers**: When work cannot continue
- **Security Issues**: When security concerns arise
- **System Failures**: When systems are not working

### **Emergency Handover Template**

```
🚨 **EMERGENCY HANDOVER - [Date]**

**Issue**: [Brief description of emergency]
**Impact**: [What this affects]
**Current Status**: [What's happening now]
**Immediate Actions Needed**: [What must be done]
**Contact**: [Who to contact if needed]

**Files Affected**: [List of relevant files]
**Error Messages**: [Any error details]
**System State**: [Current system status]

**Priority**: [High/Critical]
**Timeline**: [When this needs resolution]
```

## 📈 **Handover Metrics**

### **Quality Metrics**

- **Completeness**: % of required information included
- **Clarity**: Handover message understandability
- **Timeliness**: Time between handover and acknowledgment
- **Effectiveness**: Time to resume productive work

### **Process Metrics**

- **Handover Frequency**: How often handovers occur
- **Handover Duration**: Time spent on handover process
- **Context Loss**: Incidents of lost context
- **Continuity**: How well work continues after handover

## 🔄 **Continuous Improvement**

### **Handover Review Process**

1. **Weekly Review**: Assess handover effectiveness
2. **Feedback Collection**: Gather feedback from agents
3. **Process Refinement**: Update protocol based on feedback
4. **Documentation Updates**: Keep protocol current

### **Improvement Areas**

- **Automation**: Automate routine handover tasks
- **Templates**: Improve handover templates
- **Training**: Train agents on handover protocol
- **Tools**: Develop better handover tools

## 🔗 **Related Resources**

- **Memory System**: `agent/README.md`
- **Project State**: `agent/memory/project-state.md`
- **Current Session**: `agent/sessions/current-session.md`
- **Blockers**: `agent/context/blockers.md`
- **Agent Guide**: `agent/tools/agent-guide.md`
- **Decisions**: `agent/memory/decisions.md`
- **Lessons**: `agent/memory/lessons.md`
