# 📋 Public-Sessions Implementation Plan

## 🎯 **Overview**

Implement sessions as a new record type within the existing CivicPress record
system, not as a separate module.

## 🏗️ **Architecture: Record Type Extension**

### **What It Is:**

- **New record type**: `session` (like `bylaw`, `policy`, `resolution`)
- **Uses existing**: Record manager, API, UI, workflows
- **Extends**: Current record system, not replaces it

### **What It Is NOT:**

- ❌ Separate module with its own API
- ❌ New database tables
- ❌ New permission system
- ❌ New workflow engine

---

## 🔧 **Implementation Steps**

### **Step 1: Extend Record System**

```typescript
// core/src/records/record-types.ts - Add session type
export const RECORD_TYPES = {
  // ... existing types
  session: {
    label: 'Session',
    icon: 'i-lucide-calendar',
    color: 'blue',
    defaultStatus: 'draft'
  }
}
```

### **Step 2: Add Session Record Schema**

```yaml
---
title: 'Regular Council Meeting - July 3, 2025'
type: session
status: approved
session_type: regular          # regular, emergency, special
date: '2025-07-03T19:00:00Z'
duration: 120                  # minutes
location: 'Town Hall Council Chamber'
attendees:
  - name: 'Luc Lapointe'
    role: 'Mayor'
    present: true
  - name: 'Ada Lovelace'
    role: 'Town Clerk'
    present: true
topics:
  - title: 'Budget Review 2025'
    decisions: ['Approved with amendments']
  - title: 'Noise Ordinance Amendment'
    decisions: ['Referred to committee']
media:
  livestream: 'https://youtube.com/watch?v=abc123'
  recording: '/storage/sessions/2025-07-03.mp4'
  minutes: '/storage/sessions/2025-07-03-minutes.md'
tags: ['budget', 'ordinance', 'council-meeting']
---
```

### **Step 3: Create Session Display Component**

```vue
<!-- modules/ui/app/components/SessionDisplay.vue -->
<template>
  <div class="session-record">
    <!-- Session-specific display logic -->
    <div class="session-meta">
      <p><strong>Date:</strong> {{ formatDate(record.date) }}</p>
      <p><strong>Location:</strong> {{ record.location }}</p>
      <p><strong>Duration:</strong> {{ record.duration }} minutes</p>
    </div>

    <!-- Attendees list -->
    <div class="attendees">
      <h4>Attendees</h4>
      <ul>
        <li v-for="attendee in record.attendees" :key="attendee.name">
          {{ attendee.name }} ({{ attendee.role }})
        </li>
      </ul>
    </div>

    <!-- Media links -->
    <div v-if="record.media" class="session-media">
      <h4>Meeting Materials</h4>
      <UButton v-if="record.media.livestream" :to="record.media.livestream">
        Watch Livestream
      </UButton>
      <UButton v-if="record.media.recording" :to="record.media.recording">
        View Recording
      </UButton>
    </div>
  </div>
</template>
```

---

## 🎨 **UI Integration**

### **Reuse Existing:**

- ✅ **Record Manager**: CRUD operations
- ✅ **API Endpoints**: `/api/v1/records` (already handles all types)
- ✅ **UI List**: Records list with type filtering
- ✅ **Search**: Full-text search across all records
- ✅ **Workflows**: Status transitions and approvals
- ✅ **Permissions**: Role-based access control

### **Add Session-Specific:**

- **Session display component**: Enhanced view for session records
- **Media integration**: Video/audio playback for recordings
- **Calendar view**: Optional `/sessions/calendar` page

---

## 📊 **Data Structure**

```
records/
├── sessions/                    # Just another record type
│   ├── regular-meeting-2025-07-03.md
│   ├── emergency-meeting-2025-07-15.md
│   └── workshop-2025-07-20.md

storage/                         # Media files (already exists)
├── sessions/
│   ├── 2025-07-03.mp4
│   ├── 2025-07-03-minutes.md
│   └── 2025-07-03-agenda.pdf
```

---

## 🚀 **Implementation Priority**

### **Phase 1: Core (1-2 days)**

- Add `session` record type
- Create session record schema
- Add session display component

### **Phase 2: Enhancement (1-2 days)**

- Media file integration
- Calendar view
- Session-specific forms

---

## 🎯 **Key Benefits of This Approach**

1. **Leverages existing infrastructure** - No reinvention
2. **Consistent user experience** - Same patterns across record types
3. **Faster implementation** - Reuse existing components and logic
4. **Easier maintenance** - One system to maintain
5. **Better integration** - Sessions work with all existing features

---

## 📝 **Notes**

- Sessions are just records with a different schema
- Use existing record permissions and workflows
- Extend UI components, don't replace them
- Keep implementation simple and focused

---

_Created: 2025-01-27_ _Status: Planned_ _Priority: High_
