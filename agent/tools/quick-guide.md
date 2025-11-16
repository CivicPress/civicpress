# ⚡ CivicPress Memory System - Quick Guide

**Last Updated**: 2025-01-27  
**For**: Developers and AI agents

## 🎯 **Quick Start**

### **First Time Setup**

```bash
# Read the overview
cat agent/README.md

# Check current status
cat agent/memory/project-state.md

# See what you're working on
cat agent/sessions/current-session.md
```

## 📝 **Daily Commands**

### **Start Your Session**

```bash
# Update current session
echo "## $(date): [What you're working on]" >> agent/sessions/current-session.md

# Check project status for current issues
cat agent/memory/project-state.md
```

### **End Your Session**

```bash
# Update progress
echo "- ✅ [What you completed]" >> agent/memory/project-state.md

# Update current session
echo "- **Next**: [What to do next]" >> agent/sessions/current-session.md
```

## 🔧 **Quick Updates**

### **Add a Decision**

```bash
echo "## $(date): [Decision Title]" >> agent/memory/decisions.md
echo "- **Decision**: [What you decided]" >> agent/memory/decisions.md
echo "- **Context**: [Why you decided this]" >> agent/memory/decisions.md
echo "- **Impact**: [What this affects]" >> agent/memory/decisions.md
```

### **Record a Lesson**

```bash
echo "## $(date): [Lesson Title]" >> agent/memory/lessons.md
echo "- **What Happened**: [The situation]" >> agent/memory/lessons.md
echo "- **What Was Learned**: [The insight]" >> agent/memory/lessons.md
echo "- **Application**: [How to use this lesson]" >> agent/memory/lessons.md
```

### **Add a Blocker or Issue**

```bash
# Add to project state instead
echo "## $(date): [Issue Title]" >> agent/memory/project-state.md
echo "- **Issue**: [What's blocking you]" >> agent/memory/project-state.md
echo "- **Impact**: [What this affects]" >> agent/memory/project-state.md
echo "- **Status**: [Active/Resolved]" >> agent/memory/project-state.md
```

### **Update Priorities**

```bash
echo "## $(date): [Priority Update]" >> agent/context/priorities.md
echo "- **New Priority**: [What to focus on]" >> agent/context/priorities.md
echo "- **Reason**: [Why this matters]" >> agent/context/priorities.md
```

## 🤝 **Handover Commands**

### **Before Handover**

```bash
# Update current session
echo "## Handover $(date)" >> agent/sessions/current-session.md
echo "- **Status**: [Current state]" >> agent/sessions/current-session.md
echo "- **Next**: [What to do next]" >> agent/sessions/current-session.md

# Check Git status
git status
git add .
git commit -m "feat: update memory system before handover"
```

### **After Handover**

```bash
# Read current context
cat agent/sessions/current-session.md
cat agent/context/blockers.md
cat agent/memory/project-state.md
```

## 📊 **Status Check Commands**

### **Quick Status**

```bash
# See all memory files
ls -la agent/

# Check current session
cat agent/sessions/current-session.md

# See recent decisions
tail -20 agent/memory/decisions.md

# Check blockers
cat agent/context/blockers.md
```

### **Project Overview**

```bash
# See project state
cat agent/memory/project-state.md

# Check priorities
cat agent/context/priorities.md

# See recent lessons
tail -10 agent/memory/lessons.md
```

## 🔍 **Find Information**

### **Search Memory Files**

```bash
# Search for specific topic
grep -r "TypeScript" agent/

# Search for decisions about something
grep -r "database" agent/memory/decisions.md

# Search for lessons about something
grep -r "testing" agent/memory/lessons.md
```

### **View File Structure**

```bash
# See all files
find agent/ -name "*.md" -type f

# See file sizes
du -h agent/*/*.md
```

## 🚨 **Emergency Commands**

### **Quick Fix**

```bash
# If you need to quickly note something
echo "## $(date): [Quick Note]" >> agent/sessions/current-session.md
echo "- [Your note here]" >> agent/sessions/current-session.md
```

### **Reset Current Session**

```bash
# Clear current session and start fresh
echo "# Current Session" > agent/sessions/current-session.md
echo "## $(date): [New focus]" >> agent/sessions/current-session.md
```

## 📋 **Common Patterns**

### **When Starting New Feature**

```bash
# 1. Update current session
echo "## $(date): Starting [Feature Name]" >> agent/sessions/current-session.md

# 2. Check if there are relevant decisions
grep -r "[Feature Name]" agent/memory/decisions.md

# 3. Check for related lessons
grep -r "[Feature Name]" agent/memory/lessons.md
```

### **When Making a Decision**

```bash
# 1. Add decision
echo "## $(date): [Decision Title]" >> agent/memory/decisions.md
echo "- **Decision**: [What you decided]" >> agent/memory/decisions.md
echo "- **Options**: [What you considered]" >> agent/memory/decisions.md
echo "- **Chosen**: [What you picked]" >> agent/memory/decisions.md
echo "- **Why**: [Your reasoning]" >> agent/memory/decisions.md

# 2. Update project state if needed
echo "- ✅ [Decision] implemented" >> agent/memory/project-state.md
```

### **When Learning Something**

```bash
# 1. Add lesson
echo "## $(date): [Lesson Title]" >> agent/memory/lessons.md
echo "- **Context**: [What led to this]" >> agent/memory/lessons.md
echo "- **Learned**: [The insight]" >> agent/memory/lessons.md
echo "- **Apply**: [How to use this]" >> agent/memory/lessons.md

# 2. Update patterns if it's a development pattern
echo "## [Pattern Name]" >> agent/knowledge/patterns.md
echo "- **When**: [When to use]" >> agent/knowledge/patterns.md
echo "- **How**: [How to apply]" >> agent/knowledge/patterns.md
```

## 🎯 **Pro Tips**

### **Keep It Light**

- Only record what's actually important
- Don't try to capture everything
- Focus on decisions, lessons, and blockers

### **Use Git**

- Commit memory updates with your code changes
- Use conventional commits: `feat(memory): add decision about TypeScript`
- Include memory updates in your commit messages

### **Regular Updates**

- Update at the end of each session
- Review weekly for cleanup
- Archive old sessions periodically

## 🔗 **Related Files**

- **Full Guide**: `agent/tools/agent-guide.md`
- **Handover Protocol**: `agent/tools/handover-protocol.md`
- **Memory System**: `agent/README.md`
- **Project State**: `agent/memory/project-state.md`
