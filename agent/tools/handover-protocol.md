# 🤝 CivicPress AI Agent Handover Protocol

**Last Updated**: 2024-12-19  
**Protocol Version**: 2.0 (Simplified)

## 🎯 **Simple Handover Protocol**

### **Core Principle**

When ending a development session, simply **save your memory** to ensure
continuity for the next agent.

### **Single Command**

**Run this command to save your memory:**

```bash
node agent/tools/save-memory.js
```

This will create a template in `agent/sessions/current-session.md` that you can
fill in:

```
💾 **SAVE MEMORY**

**Current Status**: [Brief description of what was accomplished]
**Next Steps**: [What should happen next]
**Key Files**: [Important files that were modified]
**Blockers**: [Any issues preventing progress]

**Memory Updated**: ✅
**Ready for handover** ✅
```

## 📋 **What to Save**

### **Essential Information**

- **What you were working on**
- **What you accomplished**
- **What should happen next**
- **Any issues or blockers**
- **Key files that were modified**

### **Memory Files to Update**

- `agent/memory/project-state.md` - Current project status
- `agent/memory/lessons.md` - New insights learned
- `agent/memory/decisions.md` - Any decisions made
- `agent/sessions/current-session.md` - Active work context

## 🔄 **For Incoming Agents**

### **Quick Context Check**

1. **Read current session**: `agent/sessions/current-session.md`
2. **Check project state**: `agent/memory/project-state.md`
3. **Review recent decisions**: `agent/memory/decisions.md`
4. **Check for blockers**: `agent/context/blockers.md`

### **Acknowledge Handover**

```
✅ **HANDOVER RECEIVED**

**Context**: [Brief summary of what I understand]
**Next Focus**: [What I'll work on]
**Ready to continue** ✅
```

## 🚨 **Emergency Handover**

If there's an urgent issue:

```
🚨 **EMERGENCY HANDOVER**

**Issue**: [Brief description]
**Impact**: [What this affects]
**Immediate Action Needed**: [What must be done]
**Files Affected**: [Relevant files]
```

---

**That's it!** Just save your memory before ending a session. Keep it simple and
focused on continuity.
