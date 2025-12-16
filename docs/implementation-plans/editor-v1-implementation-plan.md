# Editor v1 Implementation Plan

**Status:** Ready for Implementation  
**Created:** 2025-12-04  
**Target:** editor-spec-v1.md

## Overview

Implement the v1 Markdown editor with autosave, draft/publish workflow, and
locking system. This is a complete redesign of the record editing experience,
preparing the foundation for v2 (WYSIWYM) and v3 (collaborative editing).

## Key Decisions Made

### Database Schema

**New Tables:**

1. **`record_drafts` table** (Option A - separate table)

   ```sql
   CREATE TABLE IF NOT EXISTS record_drafts (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     type TEXT NOT NULL,
     status TEXT DEFAULT 'draft',
     markdown_body TEXT,
     metadata TEXT,
     geography TEXT,
     attached_files TEXT,
     linked_records TEXT,
     linked_geography_files TEXT,
     author TEXT,
     created_by TEXT,
     last_draft_saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
   )
   ```

2. **`record_locks` table** (simple, will be removed in v3)

   ```sql
   CREATE TABLE IF NOT EXISTS record_locks (
     record_id TEXT PRIMARY KEY,
     locked_by TEXT NOT NULL,
     locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     expires_at DATETIME,
     FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
   )
   ```

**Workflow:**

- Create mode: Save to `record_drafts` only (no file, no `records` entry)
- Edit mode (draft): Update `record_drafts` only
- Publish: Copy from `record_drafts` → `records` + create file in `data/`, then
  optionally delete draft
- Lock cleanup: On-demand when acquiring lock (no background jobs)

### API Endpoints

**New Endpoints:**

1. `PUT /api/v1/records/:id/draft` - Save draft (saves to `record_drafts` only)
2. `POST /api/v1/records/:id/publish` - Publish record (copies to `records` +
   creates file)
3. `POST /api/v1/records/:id/lock` - Acquire lock
4. `DELETE /api/v1/records/:id/lock` - Release lock
5. `GET /api/v1/records/:id/lock` - Check lock status

**Modified Endpoints:**

1. `POST /api/v1/records` - Create new record (saves to `record_drafts` only, no
   file)
2. `GET /api/v1/records/:id` - Get record (checks `record_drafts` first if user
   can edit, then `records`. Users without edit permission never see drafts)

**Removed Endpoints:**

1. `PUT /api/v1/records/:id` - Remove if no longer in use

### Editor Technology

- **v1:** CodeMirror 6 (as per spec)
- **v2:** ProseMirror/Milkdown (future)
- **v3:** ProseMirror/Milkdown + yjs (future)

### UI Layout

**Header Bar (sticky):**

- Editable title
- Status badge
- Primary actions: "Save Draft" button, "Publish" split button
- Secondary actions: "More" menu (Delete only for now)
- Autosave indicator (always visible, shows different states)

**Editor Area:**

- CodeMirror 6 Markdown editor
- Custom Vue toolbar above editor
- YAML frontmatter hidden (no review panel for v1)
- Raw editor deferred to post-v3

**Preview Panel (optional):**

- Vertical split (editor left, preview right)
- Toggle button to show/hide
- Resizable split
- Hidden by default, remember state in localStorage
- Updates on every change (debounced)
- Scroll sync: **Deferred to end of implementation**

**Right Sidebar (accordions):**

- **Details** (read-only): Title, Record type, Status, Language
- **Metadata** (read-only): All frontmatter fields for review
- **Attachments** (editable): Upload, drag-drop, list, insert into editor
- **Relations** (editable): Linked records, geographies
- **Activity** (edit mode only, basic): Created by, last updated, last published

### Component Structure

```
components/
  editor/
    ├── EditorHeader.vue (title, status, actions, autosave indicator)
    ├── MarkdownEditor.vue (CodeMirror 6 editor)
    ├── EditorToolbar.vue (custom Vue toolbar)
    ├── PreviewPanel.vue (wrapper around RecordPreview or useMarkdown)
    ├── RecordSidebar.vue (container with accordions)
    ├── EditorAttachments.vue (editing version)
    ├── EditorRelations.vue (editing version)
    └── EditorActivity.vue (basic activity display)
  record/
    ├── LinkedRecordList.vue (existing, read-only)
    └── (other read-only components for view page)
```

**RecordForm.vue:**

- Complete redesign
- Orchestrates: EditorHeader, MarkdownEditor, RecordSidebar
- Handles create/edit mode logic
- Manages autosave, locking, draft/publish workflow

### Autosave Behavior

**Edit Mode:**

- Triggered after 2-3 seconds idle OR every 15-20 seconds while changes exist
- Writes to `record_drafts` table only
- Does not change lifecycle status
- Retry with exponential backoff (up to 3 attempts)
- Show states: "Saved just now", "Saving...", "Last saved X minutes ago"

**Create Mode:**

- Autosave disabled (record doesn't exist yet)
- User must explicitly save to create record
- Changes stored in browser state until save

### Publish Workflow

**Main "Publish" Button:**

- Uses current record status
- Shows confirmation modal: "Record will become publicly accessible"
- On success: Stay on edit page, show toast with link to view page (opens in new
  window)

**Publish Dropdown:**

- Shows only valid workflow transitions from current status
- Options based on user permissions (fetched from API)
- API validates transitions
- Each option shows same confirmation modal

**Publish Process:**

1. Validate record strictly
2. Construct Markdown (YAML frontmatter + body)
3. Copy from `record_drafts` → `records` table
4. Write file to `data/` folder
5. Git commit with message: `Publish record {title} ({id})`
6. Update database: `publishedGitSha`, `lastPublishedAt`, status
7. Optionally delete draft

### Locking System

**Lock Acquisition:**

- On page load (edit mode)
- Automatic
- Lock expires after timeout (e.g., 30 minutes)
- Poll every 30 seconds to refresh lock

**Lock Release:**

- On page unload
- On explicit unlock (if needed)
- On publish (optional)

**Lock UI:**

- Show "Locked by [User Name]" if locked by another user
- Show "You are editing this record" indicator for current editor
- Disable edit button with message for other users

**Lock Endpoints:**

- `POST /api/v1/records/:id/lock` - Acquire lock
- `DELETE /api/v1/records/:id/lock` - Release lock
- `GET /api/v1/records/:id/lock` - Check lock status
- Cleanup expired locks on-demand when acquiring

### Template System

- Template selection: Create mode only (or edit mode with warning)
- Location: Sidebar or header (TBD during implementation)
- Templates overwrite current content (with confirmation)

### Preview Rendering

- Reuse existing `useMarkdown()` composable
- Reuse `RecordPreview.vue` component or call `renderMarkdown()` directly
- Debounce: 500ms (as per spec)
- Scroll sync: **Deferred to end**

### Error Handling

**Network Failures:**

- Autosave: Retry with exponential backoff, show warning, queue for retry
- Publish: Show error toast, allow retry

**Validation Errors:**

- Inline errors in sidebar
- Error summary at top of form
- Prevent publish until resolved

**Permission Errors:**

- Clear message: "You don't have permission to edit this record"
- Disable edit controls

**Lock Errors:**

- Show "Locked by [User]" message
- Disable editing

## Implementation Phases

### Phase 1: Database & API Foundation

- [ ] Create `record_drafts` table migration
- [ ] Create `record_locks` table migration
- [ ] Implement `PUT /api/v1/records/:id/draft` endpoint
- [ ] Implement `POST /api/v1/records/:id/publish` endpoint
- [ ] Implement lock endpoints (`POST`, `DELETE`, `GET`)
- [ ] Update `POST /api/v1/records` to save to drafts only
- [ ] Update `GET /api/v1/records/:id` to check drafts first (if user can edit)
- [ ] Remove `PUT /api/v1/records/:id` if unused
- [ ] Add draft service methods to `RecordsService`
- [ ] Add lock service methods

### Phase 2: Core Editor Components

- [ ] Install CodeMirror 6 dependencies
- [ ] Create `MarkdownEditor.vue` component
- [ ] Create `EditorToolbar.vue` component (basic features first)
- [ ] Create `EditorHeader.vue` component
- [ ] Create `PreviewPanel.vue` component
- [ ] Implement preview toggle and resizable split
- [ ] Implement localStorage for preview state

### Phase 3: Sidebar Components

- [ ] Create `RecordSidebar.vue` container
- [ ] Create `EditorAttachments.vue` (improved from current)
- [ ] Create `EditorRelations.vue` (improved from current)
- [ ] Create `EditorActivity.vue` (basic)
- [ ] Implement accordion structure
- [ ] Move attachments/relations logic from current form

### Phase 4: Integration & RecordForm Redesign

- [ ] Redesign `RecordForm.vue` to use new components
- [ ] Implement create/edit mode logic
- [ ] Implement autosave composable (`useAutosave`)
- [ ] Implement lock acquisition/release on page load/unload
- [ ] Implement lock polling (every 30 seconds)
- [ ] Update `new.vue` page to use new RecordForm
- [ ] Update `edit.vue` page to use new RecordForm
- [ ] Implement publish workflow with confirmation modal
- [ ] Implement status dropdown in publish button
- [ ] Implement toast notifications with view page links

### Phase 5: Polish & Testing

- [ ] Error handling (network, validation, permissions, locks)
- [ ] Form validation
- [ ] Loading states
- [ ] Unit tests for components
- [ ] Integration tests for API endpoints
- [ ] E2E tests for create/edit workflows

### Phase 6: Advanced Features (End)

- [ ] Preview scroll synchronization
- [ ] Advanced toolbar features
- [ ] Performance optimizations

## Files to Create

### Database

- Migration file for `record_drafts` table
- Migration file for `record_locks` table

### API

- `modules/api/src/services/draft-service.ts` (or extend RecordsService)
- `modules/api/src/services/lock-service.ts`
- Update `modules/api/src/routes/records.ts` with new endpoints

### UI Components

- `modules/ui/app/components/editor/EditorHeader.vue`
- `modules/ui/app/components/editor/MarkdownEditor.vue`
- `modules/ui/app/components/editor/EditorToolbar.vue`
- `modules/ui/app/components/editor/PreviewPanel.vue`
- `modules/ui/app/components/editor/RecordSidebar.vue`
- `modules/ui/app/components/editor/EditorAttachments.vue`
- `modules/ui/app/components/editor/EditorRelations.vue`
- `modules/ui/app/components/editor/EditorActivity.vue`

### Composables

- `modules/ui/app/composables/useAutosave.ts`
- `modules/ui/app/composables/useRecordLock.ts`

### Tests

- `tests/ui/editor/markdown-editor.test.ts`
- `tests/ui/editor/editor-integration.test.ts`
- `tests/ui/editor/record-form.test.ts`
- `tests/api/draft-endpoints.test.ts`
- `tests/api/publish-endpoints.test.ts`
- `tests/api/lock-endpoints.test.ts`

## Files to Modify

- `core/src/database/database-adapter.ts` (add new tables)
- `core/src/database/database-service.ts` (add draft/lock methods)
- `modules/api/src/routes/records.ts` (new endpoints, modify existing)
- `modules/api/src/services/records-service.ts` (add draft/publish logic)
- `modules/ui/app/components/RecordForm.vue` (complete redesign)
- `modules/ui/app/pages/records/new.vue` (update to use new RecordForm)
- `modules/ui/app/pages/records/[type]/[id]/edit.vue` (update to use new
  RecordForm)

## Dependencies to Add

- CodeMirror 6 packages:
  - `@codemirror/lang-markdown`
  - `@codemirror/view`
  - `@codemirror/state`
  - `@codemirror/commands`
  - (and potentially others)

## Notes

- YAML frontmatter is completely hidden in v1 (no review panel)
- Raw editor is deferred to post-v3 (different page)
- Preview scroll sync is deferred to end of implementation
- Advanced toolbar features are deferred to end
- Locking system will be removed when v3 (collaboration) is implemented
- All editor components go in `components/editor/` for future reuse
- Sidebar components are editor-specific (editing versions)
- Read-only versions remain in `components/record/` for view pages

## Success Criteria

- [ ] Users can create new records (saved as drafts in DB only)
- [ ] Users can edit existing records (saved as drafts in DB only)
- [ ] Autosave works in edit mode (debounced, with retry)
- [ ] Users can publish drafts (creates file, commits to Git)
- [ ] Locking prevents concurrent edits
- [ ] Preview panel works with toggle and resize
- [ ] All sidebar sections functional (attachments, relations, activity)
- [ ] Error handling covers all scenarios
- [ ] Tests pass

## Open Questions (Resolved)

✅ Database schema: Separate `record_drafts` table  
✅ Editor technology: CodeMirror 6 for v1  
✅ Component structure: Separate editor components in `components/editor/`  
✅ Locking vs Collaboration: Implement locking now, collaboration in v3  
✅ Preview scroll sync: Deferred to end  
✅ Advanced toolbar: Deferred to end

---

**Ready for Implementation:** Yes  
**Estimated Complexity:** High (complete editor redesign)  
**Dependencies:** CodeMirror 6, existing markdown renderer, template system
