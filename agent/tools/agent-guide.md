# 🤖 AI Agent Guide: Using CivicPress Memory System

**For**: Cursor, Copilot, ChatGPT, and other AI agents  
**Purpose**: How to effectively use the CivicPress memory system

## 🎯 **Quick Start for AI Agents**

### 1. **Initial Context Loading**

When starting work on CivicPress, always read these files first:

```bash
# Essential context files
agent/memory/project-state.md      # Current implementation status
agent/context/goals.md             # Development goals and priorities
agent/memory/architecture.md       # System architecture and patterns
agent/context/blockers.md          # Current blockers and issues

# Critical specifications (read as needed for specific work)
docs/specs/README.md               # Specifications overview and index
docs/specs/manifest.md             # Platform configuration and core principles
docs/specs/api.md                  # REST API design and endpoints
docs/specs/cli.md                  # Command-line interface design
docs/specs/auth.md                 # Authentication and authorization
docs/specs/permissions.md          # Role-based access control
docs/specs/security.md             # Security architecture and requirements
docs/specs/testing-framework.md    # Testing standards and patterns
docs/specs/accessibility.md        # Accessibility requirements
docs/specs/ui.md                   # User interface design patterns
```

### 2. **Session Context**

Check the current session context:

```bash
agent/sessions/current-session.md  # Active session information
```

### 3. **Knowledge Base**

Reference domain knowledge as needed:

```bash
agent/knowledge/patterns.md        # Development patterns
agent/knowledge/references.md      # External resources
agent/knowledge/examples.md        # Code examples
```

## 📋 **Memory Update Protocol**

### **Before Starting Work**

1. **Read Project State**: Understand current implementation status
2. **Check Goals**: Review current development priorities
3. **Review Architecture**: Understand system design patterns
4. **Check Blockers**: Be aware of current issues
5. **Reference Specifications**: Read relevant specs for the work area

### **During Work**

1. **Document Decisions**: Update `agent/memory/decisions.md`
2. **Track Progress**: Update `agent/memory/project-state.md`
3. **Record Insights**: Update `agent/memory/lessons.md`
4. **Update Session**: Keep `agent/sessions/current-session.md` current

### **After Completing Work**

1. **Update Project State**: Reflect completed work
2. **Document Lessons**: Record insights and learnings
3. **Update Goals**: Adjust priorities if needed
4. **Prepare Handover**: Use handover protocol if switching agents

## 🧠 **Memory Categories**

### **Core Memory** (`agent/memory/`)

- **project-state.md**: Current implementation status and progress
- **architecture.md**: System design and architectural patterns
- **decisions.md**: Key decisions and rationale
- **lessons.md**: Lessons learned and insights

### **Context** (`agent/context/`)

- **goals.md**: Current development goals and priorities
- **priorities.md**: Development priorities and focus areas
- **blockers.md**: Current blockers and issues

### **Knowledge** (`agent/knowledge/`)

- **patterns.md**: Development patterns and conventions
- **references.md**: External references and resources
- **examples.md**: Code examples and templates

### **Sessions** (`agent/sessions/`)

- **current-session.md**: Active session context
- **session-history/**: Historical session logs

## 🔄 **Handover Protocol**

When switching between AI agents:

### **Outgoing Agent**

1. **Update Session**: Document current work state
2. **Document Decisions**: Record any new decisions made
3. **Update Progress**: Reflect completed work
4. **Prepare Summary**: Create handover summary

### **Incoming Agent**

1. **Read Handover**: Review handover summary
2. **Load Context**: Read relevant memory files
3. **Verify State**: Confirm current project state
4. **Continue Work**: Resume from where left off

## 📝 **Memory Update Guidelines**

### **Project State Updates**

- Update implementation percentages
- Mark completed tasks
- Add new blockers or issues
- Update timeline estimates

### **Decision Documentation**

- **Date**: When decision was made
- **Context**: What led to the decision
- **Options**: What alternatives were considered
- **Rationale**: Why this option was chosen
- **Impact**: What this decision affects

### **Lesson Recording**

- **Date**: When lesson was learned
- **Context**: What led to the insight
- **Lesson**: What was learned
- **Application**: How to apply this lesson
- **Category**: Type of lesson (technical, process, etc.)

## 🎯 **CivicPress-Specific Guidelines**

### **Specification-Driven Development**

- **Always reference relevant specs before implementation** - The 50+ specs in
  `docs/specs/` are the authoritative source for all design decisions
- **Read specs for your work area** - Check `docs/specs/README.md` for the
  complete index of available specifications
- **Follow specification patterns and conventions** - All implementations should
  align with the comprehensive spec system
- **Update specs if implementation reveals gaps** - Keep specifications current
  with implementation learnings
- **Ensure security and accessibility compliance** - Reference
  `docs/specs/security.md` and `docs/specs/accessibility.md` for all work

### **Git-Native Workflow**

- All changes should be Git-committable
- Use role-aware commit messages
- Maintain audit trail for all changes
- Follow Git workflow patterns

### **Security-First Approach**

- Implement sandboxed execution
- Validate all inputs
- Log all actions for audit
- Follow security specifications

### **Civic-Focused Design**

- Prioritize public transparency
- Ensure accessibility compliance
- Design for diverse users
- Maintain civic trust

## 🛠️ **Common Tasks and Memory Usage**

### **Implementing New Features**

1. **Read**: `agent/memory/architecture.md` for patterns
2. **Check**: `agent/context/goals.md` for priorities
3. **Reference**: Relevant specifications from `docs/specs/`
4. **Update**: `agent/memory/project-state.md` with progress
5. **Document**: Decisions in `agent/memory/decisions.md`

### **Debugging Issues**

1. **Check**: `agent/context/blockers.md` for known issues
2. **Review**: `agent/memory/lessons.md` for similar problems
3. **Reference**: `agent/knowledge/patterns.md` for solutions
4. **Update**: Blockers list with new issues
5. **Document**: Solutions in lessons learned

### **Code Reviews**

1. **Reference**: `agent/memory/architecture.md` for patterns
2. **Check**: Security specifications
3. **Verify**: Accessibility compliance
4. **Document**: Review insights in lessons learned

### **Planning Work**

1. **Read**: `agent/context/goals.md` for priorities
2. **Check**: `agent/memory/project-state.md` for current status
3. **Reference**: `agent/memory/architecture.md` for constraints
4. **Update**: Session context with plan
5. **Document**: Plan in current session

## 📊 **Memory Quality Guidelines**

### **Keep Memory Current**

- Update files immediately when information changes
- Remove outdated information
- Consolidate related information
- Maintain consistent formatting

### **Be Specific**

- Use concrete examples
- Include relevant context
- Reference specific files or code
- Provide actionable insights

### **Maintain Structure**

- Follow established file formats
- Use consistent headings and sections
- Include dates and timestamps
- Cross-reference related information

### **Focus on Value**

- Document decisions that affect future work
- Record insights that can be reused
- Track patterns that emerge
- Note exceptions and edge cases

## 🚨 **Emergency Procedures**

### **Memory Corruption**

If memory files become inconsistent:

1. **Backup**: Save current state
2. **Reconstruct**: Rebuild from specifications
3. **Validate**: Check against project state
4. **Update**: Fix inconsistencies

### **Context Loss**

If context is lost during handover:

1. **Read**: All memory files
2. **Reconstruct**: Current state from files
3. **Verify**: With project specifications
4. **Continue**: From reconstructed state

### **Priority Conflicts**

If priorities seem conflicting:

1. **Check**: `agent/context/goals.md`
2. **Reference**: `agent/memory/project-state.md`
3. **Clarify**: With project specifications
4. **Update**: Goals if needed

## 📚 **Additional Resources**

- **Specifications**: `docs/specs/` - 50+ detailed technical specifications
  (authoritative source)
- **Documentation**: `README.md` - Project overview
- **Contributing**: `CONTRIBUTING.md` - Development guidelines
- **Manifesto**: `agent/manifesto-slim.md` - Core principles

---

**Remember**: This memory system exists to ensure continuity and shared
understanding across all AI agents working on CivicPress. Keep it updated,
accurate, and valuable for future work.
