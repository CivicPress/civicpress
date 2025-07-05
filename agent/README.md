# 🤖 CivicPress Agent Memory System

This folder serves as a **common base memory** for any AI agent (Cursor,
Copilot, etc.) working on the CivicPress project. It provides persistent
context, shared understanding, and structured memory that survives across
different AI sessions and tools.

## 🧠 **Purpose: Common AI Memory**

This system ensures that any AI agent working on CivicPress has access to:

- **Consistent Context**: Same understanding of project state, goals, and
  architecture
- **Shared Knowledge**: Common patterns, decisions, and lessons learned
- **Structured Memory**: Organized information that persists across sessions
- **Development Continuity**: Seamless handoffs between different AI tools

## 📁 **Memory Structure**

```
agent/
├── memory/                    # Core memory system
│   ├── project-state.md      # Current implementation status
│   ├── architecture.md       # System architecture and patterns
│   ├── decisions.md          # Key decisions and rationale
│   └── lessons.md           # Lessons learned and insights
├── context/                  # Contextual information
│   ├── goals.md             # Current development goals
│   ├── priorities.md        # Development priorities
│   └── blockers.md          # Current blockers and issues
├── knowledge/               # Domain knowledge base
│   ├── patterns.md          # Development patterns and conventions
│   ├── references.md        # External references and resources
│   └── examples.md          # Code examples and templates
├── sessions/                # Session-specific context
│   ├── current-session.md   # Active session context
│   └── session-history/     # Historical session logs
└── tools/                   # AI agent tools and guides
    ├── agent-guide.md       # How to use this memory system
    └── handover-protocol.md # How to handoff between agents
```

## 🎯 **How to Use This Memory System**

### For AI Agents (Cursor, Copilot, etc.)

1. **Read the Memory**: Start by reading `memory/project-state.md` and
   `context/goals.md`
2. **Check Current Session**: Review `sessions/current-session.md` for active
   context
3. **Update as You Work**: Document decisions, progress, and insights
4. **Follow Handover Protocol**: Use `tools/handover-protocol.md` when switching
   agents

### For Developers

1. **Initialize**: Set up the memory structure for your project
2. **Maintain**: Keep the memory updated as the project evolves
3. **Share**: Ensure all AI tools have access to this memory
4. **Review**: Periodically review and clean up outdated information

## 🔄 **Memory Update Protocol**

When working with AI agents:

1. **Before Starting**: Read relevant memory files
2. **During Work**: Update memory with new decisions/insights
3. **After Completion**: Document outcomes and lessons learned
4. **On Handoff**: Use the handover protocol to transfer context

## 📋 Current State

CivicPress is currently in the **specification phase** with comprehensive design
but minimal implementation:

- ✅ **50+ Specifications**: Complete design system covering all aspects
- ⏳ **Core Implementation**: Specifications exist but code needs to be written
- ⏳ **Module Development**: Basic structures exist, need full implementation
- ⏳ **Development Tools**: CLI and validation tools need implementation

## 🎯 Development Priorities

### Phase 1: Core Foundation

- Implement civic-core.ts loader
- Build hook system (emitHook)
- Create workflow engine
- Add Git integration with role-aware commits

### Phase 2: Development Experience

- Implement specification validation tools
- Build testing framework
- Create development documentation
- Add example implementations

### Phase 3: Civic Modules

- Complete legal-register module
- Add record validation and lifecycle management
- Implement legal document workflows
- Add approval and publishing processes

## 📁 File Contents

- **`manifesto-slim.md`**: Core principles and ethos for AI guidance
- **`goals.md`**: Current development goals and progress tracking
- **`context.md`**: Technical context and implementation priorities
- **`README.md`**: This file - overview and purpose

## ✅ Why It Exists

AI coding partners are more useful when they can reference consistent, evolving
context. This folder acts as the shared brain between you and your AI
development environment.

The files help maintain continuity across development sessions and ensure AI
assistance aligns with the project's comprehensive specification system.

Feel free to ignore it if working solo — or expand it if using AI tools.

---

**NOTE:** This memory system is inspired by the
[Agentic Project Management (APM)](https://github.com/sdi2200262/agentic-project-management)
framework, adapted for CivicPress's specific needs.
