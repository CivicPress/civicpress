# CivicPress Workflows Specification

version: 2.0.0  
status: stable  
created: 2025-07-03  
updated: 2025-12-15  
deprecated: false  
sunset_date: null  
breaking_changes: []  
additions:

- Session recorder integration workflow triggers
- YAML-based workflow configuration
- Manual workflow actions (UI triggers)
- Enhanced security considerations fixes: []  
  migration_guide: null  
  compatibility: min_civicpress: 1.0.0 max_civicpress: null dependencies:
- 'auth.md: >=1.0.0'
- 'permissions.md: >=1.0.0'
- 'hooks.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

`workflows` — CivicPress Workflows Engine

## Purpose

To allow towns to define local civic logic (notifications, tagging, approvals,
session management) using both YAML configuration files and event-based
JavaScript files stored in `data/.civic/`.

Workflows let CivicPress respond dynamically to civic events — without modifying
core logic. They support both declarative status transitions (via YAML) and
programmatic event handlers (via JavaScript).

---

## Scope & Responsibilities

Responsibilities:

- Load `.js` files from the workflows folder for event-based automation
- Enforce YAML-based workflow configuration (statuses, transitions, roles)
- Execute on matching hook events
- Provide safe civic context (record, user, timestamp)
- Enforce policy (signatures, dry-run, role checks)
- Support manual workflow actions from the UI
- Log executions for audit trail

Out of scope:

- Unrestricted file system or network access
- Background job scheduling (separate system)
- Full frontend workflow interface (UI is separate)
- Live streaming platform (external)

---

## Inputs & Outputs

Triggered by: Hook events from core or modules  
Input: Civic object payload and context  
Output: Actions taken, logs recorded

---

## File/Folder Location

```
data/.civic/
├── workflows.yml          # Workflow configuration (statuses, transitions, roles, actions)
├── workflow.policy.yml    # Workflow security policy
└── workflows/             # Workflow JavaScript files
    ├── onRecordSubmit.js
    ├── onFeedback.js
    ├── onApproval.js
    ├── onBylawPublish.js
    ├── onUserRegistration.js
    ├── onAgendaPublished.js
    ├── onSessionCreated.js
    ├── onSessionCommand.js
    ├── onArtifactUploaded.js
    ├── onTranscriptionComplete.js
    └── onSessionArchived.js

core/
├── workflow-engine.ts     # Main workflow execution engine
├── workflow-sandbox.ts    # Secure sandbox environment
├── workflow-policy.ts     # Policy enforcement logic
├── workflow-logger.ts     # Workflow logging system
└── workflow-cache.ts      # Workflow caching system
```

---

## Workflow Configuration (YAML)

CivicPress supports configurable governance workflows through YAML configuration
files. This allows cities and organizations to define their own approval
processes, role-based permissions, and status transitions.

The basic workflow configuration is located at `data/.civic/workflows.yml`. This
file defines:

- **Statuses**: The different states a record can be in
- **Transitions**: Which status changes are allowed
- **Roles**: Who can perform which actions
- **Actions**: Manual workflow triggers exposed in the UI

### Basic Configuration

Here's a simple configuration that works for most cities:

```yaml
statuses:
  - draft
  - approved
  - archived

transitions:
  draft: [approved]
  approved: [archived]
  archived: []

roles:
  clerk:
    can_transition:
      draft: [approved]
      any: [archived]
  public:
    can_view: [bylaw, policy, resolution]
```

This creates a simple workflow:

1. Records start as `draft`
2. Clerks can approve drafts
3. Anyone can archive approved records
4. Public can view all record types

### Advanced Examples

#### Multi-Step Approval Process

For cities that need more control:

```yaml
statuses:
  - draft
  - proposed
  - reviewed
  - approved
  - archived

transitions:
  draft: [proposed]
  proposed: [reviewed, archived]
  reviewed: [approved, archived]
  approved: [archived]
  archived: []

roles:
  clerk:
    can_transition:
      draft: [proposed]
      proposed: [reviewed]
  council:
    can_transition:
      reviewed: [approved]
      any: [archived]
  public:
    can_view: [bylaw, policy, resolution]
```

#### Department-Specific Workflows

Different rules for different record types:

```yaml
recordTypes:
  bylaw:
    statuses: [draft, proposed, reviewed, approved, archived]
    transitions:
      draft: [proposed]
      proposed: [reviewed, archived]
      reviewed: [approved, archived]
      approved: [archived]
      archived: []
  policy:
    statuses: [draft, approved, archived]
    transitions:
      draft: [approved]
      approved: [archived]
      archived: []

roles:
  legal_dept:
    can_transition:
      draft: [proposed]
      proposed: [reviewed]
  council:
    can_transition:
      reviewed: [approved]
      any: [archived]
  public:
    can_view: [bylaw, policy, resolution]
```

### Configuration Options

#### Statuses

Define the possible states for records:

```yaml
statuses:
  - draft
  - proposed
  - reviewed
  - approved
  - archived
```

#### Transitions

Define which status changes are allowed:

```yaml
transitions:
  draft: [proposed]                        # draft can become proposed
  proposed: [reviewed, archived]          # proposed can become reviewed or archived
  reviewed: [approved, archived]          # reviewed can become approved or archived
  approved: [archived]                     # approved can become archived
  archived: []                             # archived is final state
```

#### Roles

Define who can do what:

```yaml
roles:
  clerk:
    can_transition:
      draft: [proposed]                    # clerk can move draft → proposed
      proposed: [reviewed]                 # clerk can move proposed → reviewed
    can_create: [bylaw, policy, resolution]
    can_edit: [bylaw, policy, resolution]
  council:
    can_transition:
      reviewed: [approved]                 # council can move reviewed → approved
      any: [archived]                      # council can archive from any status
    can_create: [bylaw, policy, resolution]
    can_edit: [bylaw, policy, resolution]
  public:
    can_view: [bylaw, policy, resolution]  # public can only view
```

#### Actions (Manual UI Triggers)

In addition to automatic, event-based workflows, CivicPress can optionally
expose **manual workflow actions** as buttons in the Web UI.

These actions do **not** change the existing workflow behavior. They are an
_additional invocation method_ that still relies on the same role checks,
workflow validation, and audit logging.

Use cases:

- "Create session from agenda"
- "Generate minutes draft"
- "Request review"
- "Export / package artifacts"
- "Start recording session"
- "Stop recording session"

Example configuration:

```yaml
actions:
  - id: agenda.create_session
    label: Create session from agenda
    description: Creates a session record linked to this agenda (and optionally a minutes draft).
    record_types: [agenda]
    roles_allowed: [clerk, admin]
    # Optional: only show when record is in one of these statuses
    statuses: [draft, published]
    # Optional: ask user for parameters before running
    params_schema:
      type: object
      properties:
        session_type:
          type: string
          enum: [council, committee, hearing]
      required: []
    # Implementation hook (how the workflow engine resolves this action)
    run: workflows/agenda.create_session.js
    requires_confirmation: true
    supports_dry_run: true
  - id: session.start_recording
    label: Start recording
    description: Starts recording the session on the recorder box.
    record_types: [session]
    roles_allowed: [clerk, admin]
    statuses: [scheduled, live]
    run: workflows/session.start_recording.js
    requires_confirmation: false
  - id: session.stop_recording
    label: Stop recording
    description: Stops recording the session.
    record_types: [session]
    roles_allowed: [clerk, admin]
    statuses: [live]
    run: workflows/session.stop_recording.js
    requires_confirmation: false
```

Notes:

- `actions` is optional. If omitted, nothing changes.
- `run` points to a workflow script (or handler) using the existing workflow
  engine.
- The workflow engine SHOULD be idempotent or protect against duplicates where
  relevant.

### Role Permissions

Each role can have these permissions:

- `can_transition`: What status changes they can make
- `can_create`: What record types they can create
- `can_edit`: What record types they can edit
- `can_delete`: What record types they can delete
- `can_view`: What record types they can view

### Special Keywords

- `any`: Used in transitions to mean "from any status"
- `*`: Used in permissions to mean "all record types"

### Default Configuration

If no `workflows.yml` file exists, CivicPress uses these defaults:

- **Statuses**: draft, proposed, reviewed, approved, archived
- **Transitions**: Simple linear progression
- **Roles**: clerk, council, public with basic permissions

---

## JavaScript Workflow Files

For programmatic, event-based automation, CivicPress supports JavaScript
workflow files stored in `data/.civic/workflows/`.

### Example Workflow: onRecordSubmit.js

```js
module.exports = async ({ record, context }) => {
  if (record.path.includes('bylaws/')) {
    await civic.appendTag(record, 'awaiting-legal');
  }
};
```

### Session Recorder Workflow Triggers

The session recorder integration introduces new workflow triggers:

- **onAgendaPublished**: Triggered when an agenda is published
- **onSessionCreated**: Triggered when a session record is created
- **onSessionCommand**: Triggered when recording commands are issued
  (start|stop)
- **onArtifactUploaded**: Triggered when media artifacts are uploaded
- **onTranscriptionComplete**: Triggered when transcription is complete
- **onSessionArchived**: Triggered when a session is archived

Example: onSessionCreated.js

```js
module.exports = async ({ session, context }) => {
  // Auto-create draft minutes when session is created
  if (session.agenda_id) {
    await civic.createRecord({
      type: 'minutes',
      title: `Minutes for ${session.title}`,
      status: 'draft',
      linked_records: [{ id: session.id, type: 'session' }]
    });
  }
};
```

Example: onArtifactUploaded.js

```js
module.exports = async ({ artifact, session, context }) => {
  // Trigger transcription for video artifacts
  if (artifact.type === 'video' && artifact.format === 'mp4') {
    await civic.triggerTranscription({
      artifact_id: artifact.id,
      session_id: session.id
    });
  }
};
```

### Available Workflow Triggers

Standard triggers:

- `onRecordSubmit`
- `onRecordPublish`
- `onRecordArchive`
- `onFeedback`
- `onApproval`
- `onBylawPublish`
- `onUserRegistration`

Session recorder triggers:

- `onAgendaPublished`
- `onSessionCreated`
- `onSessionCommand(start|stop)`
- `onArtifactUploaded`
- `onTranscriptionComplete`
- `onSessionArchived`

---

## Security & Trust Considerations

### Workflow Security

- All workflow files must be cryptographically signed or approved based on
  `workflow.policy.yml`
- Workflows must run in a secure sandbox environment (e.g., `vm2`)
- File system and network access must be explicitly permitted in policy
- Only authorized roles defined in policy can execute workflows
- All workflow executions must be logged for audit purposes

### Sandbox Security

- Workflow execution must be isolated from core system
- Memory and CPU limits must be enforced during execution
- Timeout limits must prevent infinite loops or hanging workflows
- Resource usage must be monitored and logged
- Sandbox permissions must be validated before execution

### Data Protection

- Workflow input data must be sanitized and validated
- Sensitive data must not be exposed to untrusted workflows
- Workflow output must be validated before applying changes
- Audit logs must capture all data access and modifications
- Data retention policies must be enforced for workflow logs

### Policy Enforcement

- Workflow policies must be validated before execution
- Role-based access control must be strictly enforced
- Policy changes must be reviewed and approved
- Policy violations must be logged and reported
- Default security policies must be applied to all workflows

### Compliance & Audit

- All workflow executions must be traceable and auditable
- Workflow logs must be immutable and tamper-evident
- Compliance with local regulations must be verified
- Regular security audits of workflow policies must be performed
- Workflow performance and security metrics must be monitored

### Example Policy File: workflow.policy.yml

```yaml
trustedAuthors:
  - clerk-richmond
  - civic-devs
permissions:
  allowNetwork: false
  allowFilesystem: false
defaultMode: dry-run
```

---

## Invocation Methods

### CLI

```bash
civic run-workflow onRecordSubmit record.yaml
civic status my-bylaw approved --role clerk
civic create bylaw "New Bylaw" --role clerk
civic view my-bylaw --role public
```

### API

```http
POST /api/v1/hook/onRecordSubmit
POST /api/v1/records/:id/status
POST /api/v1/workflows/actions/:actionId/execute
```

### Git Hook

Triggered on `commit`, `push`, or `merge`

### UI Actions

Manual workflow actions can be triggered from the web interface as buttons or
menu items.

---

## Web UI Integration

### Status Transition Controls

When viewing a record in the web UI, users see a **Status Transitions** section
that:

- **Shows Only Valid Transitions**: Displays only status changes allowed for the
  current user's role and record status
- **Prevents Invalid Changes**: Users cannot attempt transitions that violate
  workflow rules
- **Provides Clear Feedback**: Shows helpful error messages when transitions
  fail

### Example UI Flow

1. **Draft Record**: Clerk sees options to move to "Proposed" or "Archived"
2. **Proposed Record**: Clerk sees options to move to "Reviewed" or "Archived"
3. **Reviewed Record**: Council sees options to move to "Approved" or "Archived"
4. **Approved Record**: Admin sees option to move to "Archived"
5. **Archived Record**: No transitions available (final status)

### Manual Workflow Actions

Beyond status transitions, the UI can expose **Actions** (buttons or a dropdown)
that allow a user to manually run a workflow against the current record.

This is designed for clerks and staff who work in steps (agenda → session →
minutes), and it complements event-driven automation.

Behavior:

- The UI requests available actions for a record (based on record type, status,
  and the current user's role)
- Only permitted actions are shown
- Actions may optionally prompt for parameters (using `params_schema`)
- When executed, the action is logged (who ran what, on which record, and with
  which inputs)
- The UI shows a clear result (for example: "Session created" with a link)

This feature is additive:

- Existing **Status Transition Controls** remain unchanged
- Existing automatic triggers remain unchanged

### Session Recorder UI Integration

For session records, the UI provides additional controls:

- **Start/Stop Recording**: Manual controls to start/stop recording on the
  recorder box
- **Session Status**: Visual indicator of session state (scheduled, live, ended,
  uploading, archived)
- **Media Artifacts**: Display and link to uploaded video, audio, and
  transcripts
- **Recording Status**: Real-time status from the recorder box (online/offline,
  recording state, disk usage)

---

## Validation

CivicPress validates all actions against the workflow configuration:

1. **Status Transitions**: Only allowed transitions are permitted
2. **Role Permissions**: Only authorized roles can perform actions
3. **Record Types**: Only allowed record types can be created/edited

### Error Messages

If validation fails, you'll see clear, helpful error messages:

- **Workflow Violations**: "Transition from 'draft' to 'approved' is not
  allowed. Allowed transitions: proposed, archived."
- **Typo Detection**: "Did you mean 'reviewed'?" when users type "review"
  instead of "reviewed"
- **Status Context**: "Allowed transitions: none (final status)" for archived
  records
- **Role Restrictions**: "Role 'clerk' cannot transition from 'reviewed' to
  'approved'"

These messages help users understand what went wrong and how to fix it.

---

## Testing & Validation

- Support `--dry-run` mode
- Simulate events via CLI (`civic run-workflow`)
- Ensure enforcement of policy restrictions
- Audit sandbox permissions with test suites

Use the `--dry-run` flag to test changes without making them:

```bash
civic status my-bylaw approved --role clerk --dry-run
```

This will show you what would happen without actually changing the record.

---

## Session Recorder Workflow Integration

The session recorder integration leverages workflows for automation throughout
the session lifecycle:

### Workflow Triggers

Key workflow triggers for session recorder integration:

- **onAgendaPublished**: Triggered when an agenda is published
  - Use case: Auto-create session record and draft minutes
- **onSessionCreated**: Triggered when a session record is created
  - Use case: Initialize session on recorder box, create draft minutes
- **onSessionCommand**: Triggered when recording commands are issued
  (start|stop)
  - Use case: Update session status, log recording events
- **onArtifactUploaded**: Triggered when media artifacts are uploaded
  - Use case: Trigger transcription, update session metadata, link artifacts
- **onTranscriptionComplete**: Triggered when transcription is complete
  - Use case: Link transcript to session, update minutes, notify stakeholders
- **onSessionArchived**: Triggered when a session is archived
  - Use case: Finalize records, trigger retention policies, cleanup

### Session State Model

Sessions follow this state model (enforced by workflow configuration):

```
scheduled → live → ended → uploading → archived
```

Each transition is auditable and can trigger workflows.

### Example Session Workflows

#### Auto-create Session from Agenda

```js
// workflows/onAgendaPublished.js
module.exports = async ({ agenda, context }) => {
  // Create session record
  const session = await civic.createRecord({
    type: 'session',
    title: `Session: ${agenda.title}`,
    status: 'scheduled',
    linked_records: [{ id: agenda.id, type: 'agenda' }],
    metadata: {
      session_type: agenda.metadata.session_type || 'council',
      date: agenda.metadata.date,
      location: agenda.metadata.location
    }
  });

  // Create draft minutes
  await civic.createRecord({
    type: 'minutes',
    title: `Minutes: ${agenda.title}`,
    status: 'draft',
    linked_records: [
      { id: agenda.id, type: 'agenda' },
      { id: session.id, type: 'session' }
    ]
  });

  return { session_id: session.id };
};
```

#### Handle Recording Start

```js
// workflows/onSessionCommand.js
module.exports = async ({ session, command, context }) => {
  if (command === 'start') {
    // Update session status
    await civic.updateRecord(session.id, {
      status: 'live',
      metadata: {
        ...session.metadata,
        recording_started_at: new Date().toISOString()
      }
    });

    // Log recording start
    await civic.logEvent({
      type: 'recording_started',
      session_id: session.id,
      user_id: context.user.id,
      timestamp: new Date().toISOString()
    });
  }
};
```

#### Process Uploaded Artifacts

```js
// workflows/onArtifactUploaded.js
module.exports = async ({ artifact, session, context }) => {
  // Link artifact to session
  await civic.linkArtifact(session.id, artifact.id);

  // Trigger transcription for video artifacts
  if (artifact.type === 'video' && artifact.format === 'mp4') {
    await civic.triggerTranscription({
      artifact_id: artifact.id,
      session_id: session.id,
      format: 'vtt' // VTT format for web playback
    });
  }

  // Update session status if all expected artifacts are uploaded
  const expectedArtifacts = session.metadata.expected_artifacts || [];
  const uploadedArtifacts = await civic.getSessionArtifacts(session.id);

  if (uploadedArtifacts.length >= expectedArtifacts.length) {
    await civic.updateRecord(session.id, {
      status: 'uploading'
    });
  }
};
```

---

## Best Practices

1. **Start Simple**: Use the basic configuration for most cities
2. **Document Your Process**: Make sure your workflow matches your actual
   approval process
3. **Test Changes**: Always test workflow changes before deploying
4. **Role Clarity**: Define clear roles that match your organization structure
5. **Audit Trail**: All status changes are logged with role information
6. **Idempotency**: Design workflows to be idempotent where possible
7. **Error Handling**: Always handle errors gracefully in workflow scripts
8. **Security First**: Follow the security policy guidelines strictly

---

## Troubleshooting

### Common Issues

1. **"Invalid transition"**: Check that the transition is defined in your config
2. **"Role not found"**: Make sure the role exists in your configuration
3. **"Cannot perform action"**: Check role permissions for the specific action
4. **"Workflow execution failed"**: Check workflow logs for detailed error
   messages
5. **"Sandbox violation"**: Verify workflow policy allows required permissions

### Debugging

Use the `--dry-run` flag to test changes without making them:

```bash
civic status my-bylaw approved --role clerk --dry-run
civic run-workflow onRecordSubmit record.yaml --dry-run
```

This will show you what would happen without actually changing the record or
executing the workflow.

---

## Future Enhancements

- Visual editor in admin UI for workflow configuration
- Scheduled (cron-like) triggers
- Cross-module event chaining
- Workflow registry or marketplace
- WASM support for sandboxing
- Workflow templates for common patterns
- Workflow versioning and rollback

---

## History

- Drafted: 2025-07-02
- Merged revision: 2025-07-03
- Updated: 2025-12-15 (Added session recorder integration, YAML configuration,
  manual actions)
