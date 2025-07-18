#!/usr/bin/env node

/**
 * 💾 Save Memory Tool
 * 
 * Simple tool for AI agents to save their memory before handover.
 * Usage: node agent/tools/save-memory.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get current timestamp
const timestamp = new Date().toISOString();

// Template for memory update
const memoryTemplate = `# 💾 Memory Update - ${timestamp}

## 📊 **Current Status**
[Brief description of what was accomplished]

## 🎯 **Next Steps**
[What should happen next]

## 📁 **Key Files Modified**
[Important files that were modified]

## 🚧 **Blockers**
[Any issues preventing progress]

## ✅ **Memory Updated**
- Project state: agent/memory/project-state.md
- Lessons learned: agent/memory/lessons.md  
- Decisions made: agent/memory/decisions.md
- Current session: agent/sessions/current-session.md

**Ready for handover** ✅
`;

// Create the memory update
const memoryUpdate = memoryTemplate.replace(/\[.*?\]/g, '[TO BE FILLED BY AGENT]');

// Write to current session file
const sessionFile = path.join(__dirname, '../sessions/current-session.md');
fs.writeFileSync(sessionFile, memoryUpdate);

console.log('💾 **MEMORY SAVED**');
console.log('');
console.log('📝 Template saved to: agent/sessions/current-session.md');
console.log('');
console.log('🤖 **NEXT STEPS FOR AGENT:**');
console.log('1. Edit the template with actual information');
console.log('2. Update memory files as needed');
console.log('3. Commit changes if appropriate');
console.log('');
console.log('✅ **Ready for handover**'); 