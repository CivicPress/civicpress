# Search UX Issue Analysis

## Problem Description

When a user types in the search box on the records list page:

1. ✅ Search suggestions appear correctly (working as expected)
2. ❌ **The records list refreshes immediately** (even with 1-2 characters),
   before the user submits the search

This creates a jarring UX where the list flickers/refreshes while the user is
still typing.

---

## Root Cause Analysis

### Flow of Events

1. **User types in search box** (`RecordSearch.vue`)
2. **`searchQuery` watch triggers** (line 163-176 in `RecordSearch.vue`):
   - Emits `@search` event immediately (line 167)
   - Emits `@filterChange` event immediately (line 168)
   - Fetches suggestions if query >= 2 chars (line 171-172) ✅

3. **Parent component (`records/index.vue`) receives events**:
   - `@search` → calls `handleSearch()` (line 323)
   - `@filterChange` → calls `handleFilterChange()` (line 324)

4. **`handleSearch()` function** (lines 87-119):
   - Updates URL immediately (line 90)
   - If query.length >= 3: triggers debounced `searchRecords()` ✅
   - If query.length === 0: calls `loadInitialRecords()` ✅
   - If query.length 1-2: does nothing (correct) ✅

5. **`handleFilterChange()` function** (lines 122-150):
   - Updates filters and URL (lines 127-129)
   - **PROBLEM**: Always checks query length and calls either:
     - `searchRecords()` if query.length >= 3 ✅
     - `loadInitialRecords()` if query.length < 3 ❌ **This causes the
       refresh!**

### The Issue

**`handleFilterChange()` is called on every keystroke** (via `@filterChange`
event), and when the query is 1-2 characters, it calls `loadInitialRecords()`,
which refreshes the entire records list unnecessarily.

---

## Expected Behavior

**Typing behavior** (1-2 characters):

- ✅ Show search suggestions
- ✅ Don't refresh the records list (keep showing current records)
- ✅ Update the search input value

**Search behavior** (3+ characters):

- ✅ Show search suggestions
- ✅ Trigger debounced search after user stops typing
- ✅ Update records list with search results

**User action** (Enter key or suggestion click):

- ✅ Immediately execute search
- ✅ Update records list with results

---

## Proposed Solutions

### Solution 1: Don't Emit `@filterChange` for Search Query Changes (Recommended)

**Approach**: Separate search query changes from filter changes. Only emit
`@filterChange` when type/status filters change, not when search query changes.

**Pros**:

- Clean separation of concerns
- Search query has its own event handler
- Filters only trigger when actual filter values change
- Minimal code changes

**Cons**:

- Requires ensuring filters object stays in sync for URL state management

**Implementation**:

- In `RecordSearch.vue`: Remove `emitFilterChange()` from `searchQuery` watch
- Only call `emitFilterChange()` when type/status filters change
- Keep `emit('search', newQuery)` for search-specific handling
- Update `records/index.vue` to handle search query separately from filters

---

### Solution 2: Make `handleFilterChange()` Smarter

**Approach**: In `handleFilterChange()`, detect if only the search query changed
and defer to `handleSearch()` instead of reloading records.

**Pros**:

- Less disruptive to current architecture
- Preserves existing event flow

**Cons**:

- More complex logic in `handleFilterChange()`
- Both handlers get called (redundant work)
- Still causes unnecessary URL updates

---

### Solution 3: Debounce `@filterChange` for Search Query

**Approach**: Add debouncing specifically for `@filterChange` when it's
triggered by search query changes.

**Pros**:

- Prevents rapid-fire updates
- Still maintains event-driven architecture

**Cons**:

- Adds complexity with multiple debounce timers
- Doesn't solve the root issue (filterChange shouldn't fire for search)
- Can cause timing issues between events

---

### Solution 4: Separate Search Query from Filters State

**Approach**: Treat search query as a separate state from filters. Only combine
them when actually executing a search.

**Pros**:

- Cleanest architectural separation
- Search query and filters are truly independent
- Clearer code intent

**Cons**:

- Requires refactoring state management
- More significant code changes
- Need to ensure URL state management handles both separately

---

## Recommended Solution: Solution 1

**Why**: Cleanest, minimal changes, addresses root cause directly.

### Implementation Details

1. **In `RecordSearch.vue`**:
   - Modify the `searchQuery` watch (line 163) to only emit `@search` event
   - Remove `emitFilterChange()` call from searchQuery watch
   - Keep `emitFilterChange()` only in type/status filter watches

2. **In `records/index.vue`**:
   - `handleSearch()` already handles search query properly
   - `handleFilterChange()` will only be called for actual filter changes
     (types/statuses)
   - Ensure URL state includes search query (handled by `handleSearch()`)

3. **URL State Management**:
   - `handleSearch()` already updates URL (line 90)
   - `handleFilterChange()` updates URL (line 129)
   - Both should work independently without conflict

### Benefits

- ✅ Search suggestions still work (separate composable)
- ✅ Records list doesn't refresh while typing 1-2 characters
- ✅ Search triggers properly at 3+ characters (debounced)
- ✅ Filter changes (type/status) still trigger immediate refresh (correct
  behavior)
- ✅ Clear separation: search query ≠ filter

---

## Alternative: Add Minimum Character Threshold to `handleFilterChange()`

If we want a simpler change that doesn't refactor events:

**In `handleFilterChange()`**: Only reload records if:

- Query is empty (clear search), OR
- Query has 3+ characters (execute search), OR
- Filters (types/statuses) actually changed

Don't reload if only search query changed with 1-2 characters.

This is a quick fix but Solution 1 is cleaner long-term.
