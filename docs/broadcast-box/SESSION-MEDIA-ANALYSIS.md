# Session Media Field Structure - Analysis & Recommendation

**Date**: 2025-01-30  
**Question**: How should broadcast-box recordings be linked to session records?

---

## Current Structure Analysis

### 1. Session Schema (`media` field)

The session record schema defines a `media` object with string properties:

```json
{
  "media": {
    "livestream": "https://youtube.com/...",  // External URL
    "recording": "/path/to/recording.mp4",     // Path or URL (legacy)
    "minutes": "/path/to/minutes.pdf",        // Path or URL
    "transcript": "/path/to/transcript.vtt",  // Path or URL
    "agenda": "/path/to/agenda.pdf"           // Path or URL
  }
}
```

**Characteristics**:

- Properties are **strings** (paths or URLs)
- Designed for **external links** or **legacy file paths**
- Simple, direct access: `session.media.recording`
- No metadata (size, type, description)

### 2. File Attachment System (`attached_files` array)

The modern file attachment system uses UUID-based references:

```json
{
  "attached_files": [
    {
      "id": "d4a71bf5-db44-4a50-9adf-de226e2c000e",  // UUID from storage_files
      "path": "sessions/recording.d4a71bf5.mp4",      // Relative path
      "original_name": "council-meeting-2025-01-30.mp4",
      "description": "Full recording of council meeting",
      "category": {
        "label": "Recording",
        "value": "recording",
        "description": "Session recording"
      }
    }
  ]
}
```

**Characteristics**:

- Uses **UUIDs** from `storage_files` table
- Rich **metadata** (description, category, original name)
- **UI integration** (FileBrowser, download, preview)
- **API endpoints** for file operations (`/api/v1/storage/files/:id`)
- **Categorization** support

### 3. Storage System (UUID-based)

Files are stored with UUIDs in `storage_files` table:

- UUID: `123e4567-e89b-12d3-a456-426614174000`
- Accessible via: `/api/v1/storage/files/:id`
- Metadata tracked in database

---

## Options Analysis

### Option A: UUID in `media.recording` Only

**Structure**:

```json
{
  "media": {
    "recording": "123e4567-e89b-12d3-a456-426614174000"  // UUID
  }
}
```

**Pros**:

- ✅ Simple, direct access
- ✅ Backward compatible with schema
- ✅ Quick lookup: `session.media.recording`

**Cons**:

- ❌ No metadata (size, description, type)
- ❌ No UI integration (can't use FileBrowser)
- ❌ No categorization
- ❌ Inconsistent with modern attachment system
- ❌ Can't leverage attachment management features

---

### Option B: Only in `attached_files` Array

**Structure**:

```json
{
  "attached_files": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "path": "sessions/recording.123e4567.mp4",
      "original_name": "council-meeting-2025-01-30.mp4",
      "description": "Full recording of council meeting",
      "category": { "value": "recording", "label": "Recording" }
    }
  ]
}
```

**Pros**:

- ✅ Uses modern attachment system
- ✅ Full metadata support
- ✅ UI integration (FileBrowser, preview, download)
- ✅ Categorization support
- ✅ Consistent with other file attachments
- ✅ API endpoints available

**Cons**:

- ❌ No direct access via `media.recording`
- ❌ Requires filtering `attached_files` by category
- ❌ Less intuitive for session-specific media

---

### Option C: Both - UUID in `media.recording` AND `attached_files` Entry

**Structure**:

```json
{
  "media": {
    "recording": "123e4567-e89b-12d3-a456-426614174000"  // UUID for quick access
  },
  "attached_files": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",     // Same UUID
      "path": "sessions/recording.123e4567.mp4",
      "original_name": "council-meeting-2025-01-30.mp4",
      "description": "Full recording of council meeting",
      "category": { "value": "recording", "label": "Recording" }
    }
  ]
}
```

**Pros**:

- ✅ Direct access via `media.recording` (quick lookup)
- ✅ Full metadata via `attached_files` (rich information)
- ✅ UI integration (FileBrowser, preview, download)
- ✅ Backward compatible with schema
- ✅ Best of both worlds
- ✅ Can add multiple recordings (if needed) via `attached_files`

**Cons**:

- ⚠️ Data duplication (UUID stored twice)
- ⚠️ Need to keep in sync (same UUID in both places)
- ⚠️ Slightly more complex

---

## Recommendation: **Option C (Hybrid Approach)**

### Rationale

1. **Backward Compatibility**: `media.recording` exists in schema and is
   expected by UI/API
2. **Quick Access**: Direct access via `session.media.recording` for common use
   cases
3. **Rich Metadata**: Full attachment system features via `attached_files`
4. **UI Integration**: Can use FileBrowser and other attachment UI components
5. **Future Flexibility**: Can add multiple recordings, thumbnails, transcripts
   via `attached_files`
6. **Consistency**: Aligns with modern UUID-based storage system

### Implementation Pattern

```typescript
// When recording upload completes:
async function linkRecordingToSession(
  sessionId: string,
  recordingFileId: string,  // UUID from storage system
  recordingMetadata: {
    originalName: string;
    description?: string;
  }
): Promise<void> {
  // 1. Get session record
  const session = await recordManager.getRecord(sessionId);

  // 2. Update media.recording with UUID
  const updatedMetadata = {
    ...session.metadata,
    media: {
      ...session.metadata?.media,
      recording: recordingFileId  // UUID
    }
  };

  // 3. Add to attached_files with category
  const existingAttachments = session.attachedFiles || [];
  const recordingAttachment = {
    id: recordingFileId,  // Same UUID
    path: await getStoragePath(recordingFileId),
    original_name: recordingMetadata.originalName,
    description: recordingMetadata.description || 'Session recording',
    category: {
      value: 'recording',
      label: 'Recording',
      description: 'Session recording'
    }
  };

  // Check if already exists (avoid duplicates)
  const hasRecording = existingAttachments.some(
    f => f.id === recordingFileId ||
         f.category?.value === 'recording'
  );

  const updatedAttachments = hasRecording
    ? existingAttachments.map(f =>
        f.category?.value === 'recording' ? recordingAttachment : f
      )
    : [...existingAttachments, recordingAttachment];

  // 4. Update record
  await recordManager.updateRecord(sessionId, {
    metadata: updatedMetadata,
    attachedFiles: updatedAttachments
  });
}
```

### Access Patterns

**Quick Access** (for common use cases):

```typescript
const recordingId = session.metadata?.media?.recording;
if (recordingId) {
  const fileUrl = `/api/v1/storage/files/${recordingId}`;
  // Use file URL
}
```

**Rich Metadata Access** (for UI, details):

```typescript
const recording = session.attachedFiles?.find(
  f => f.category?.value === 'recording'
);
if (recording) {
  // Access: recording.description, recording.original_name, etc.
  const fileUrl = `/api/v1/storage/files/${recording.id}`;
}
```

**Both in Sync**:

```typescript
// Ensure consistency
const mediaRecordingId = session.metadata?.media?.recording;
const attachedRecording = session.attachedFiles?.find(
  f => f.category?.value === 'recording'
);

if (mediaRecordingId && attachedRecording) {
  // Both should have same UUID
  assert(mediaRecordingId === attachedRecording.id);
}
```

---

## Additional Considerations

### Multiple Recordings

If a session has multiple recordings (e.g., different camera angles), use
`attached_files`:

```json
{
  "media": {
    "recording": "primary-recording-uuid"  // Primary/main recording
  },
  "attached_files": [
    {
      "id": "primary-recording-uuid",
      "category": { "value": "recording", "label": "Recording" }
    },
    {
      "id": "secondary-recording-uuid",
      "category": { "value": "recording", "label": "Recording (Secondary)" }
    }
  ]
}
```

### Transcripts and Other Media

Apply same pattern to other media types:

```json
{
  "media": {
    "recording": "recording-uuid",
    "transcript": "transcript-uuid"
  },
  "attached_files": [
    { "id": "recording-uuid", "category": { "value": "recording" } },
    { "id": "transcript-uuid", "category": { "value": "transcript" } }
  ]
}
```

### Legacy Support

For backward compatibility with existing sessions that use paths:

```typescript
// Check if media.recording is UUID or path
const recording = session.metadata?.media?.recording;
if (recording) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recording);

  if (isUuid) {
    // Modern UUID-based access
    const fileUrl = `/api/v1/storage/files/${recording}`;
  } else {
    // Legacy path-based access
    const fileUrl = recording;  // Assume it's a URL or path
  }
}
```

---

## Summary

**Recommended Approach**: **Option C - Hybrid (Both)**

- Store UUID in `media.recording` for quick, direct access
- Add entry to `attached_files` with category "recording" for rich metadata and
  UI integration
- Keep both in sync (same UUID)
- Provides backward compatibility, modern features, and flexibility

**Benefits**:

- ✅ Quick access via `media.recording`
- ✅ Full attachment system features
- ✅ UI integration
- ✅ Future flexibility (multiple recordings)
- ✅ Backward compatible

**Trade-offs**:

- ⚠️ Data duplication (acceptable for benefits)
- ⚠️ Need to keep in sync (handled in implementation)

---

**Status**: Ready for implementation  
**Next Step**: Update spec with this recommendation
