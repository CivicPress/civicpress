# Workflow Configuration

CivicPress supports configurable governance workflows through YAML configuration
files. This allows cities and organizations to define their own approval
processes, role-based permissions, and status transitions.

## Quick Start

The basic workflow configuration is located at `data/.civic/workflows.yml`. This
file defines:

- **Statuses**: The different states a record can be in
- **Transitions**: Which status changes are allowed
- **Roles**: Who can perform which actions

## Basic Configuration

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

## Advanced Examples

### Multi-Step Approval Process

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

### Department-Specific Workflows

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

## Configuration Options

### Statuses

Define the possible states for records:

```yaml
statuses:
 - draft
 - proposed
 - reviewed
 - approved
 - archived
```

### Transitions

Define which status changes are allowed:

```yaml
transitions:
 draft: [proposed] # draft can become proposed
 proposed: [reviewed, archived] # proposed can become reviewed or archived
 reviewed: [approved, archived] # reviewed can become approved or archived
 approved: [archived] # approved can become archived
 archived: [] # archived is final state
```

### Roles

Define who can do what:

```yaml
roles:
 clerk:
 can_transition:
 draft: [proposed] # clerk can move draft → proposed
 proposed: [reviewed] # clerk can move proposed → reviewed
 can_create: [bylaw, policy, resolution] # clerk can create these types
 can_edit: [bylaw, policy, resolution] # clerk can edit these types
 council:
 can_transition:
 reviewed: [approved] # council can move reviewed → approved
 any: [archived] # council can archive from any status
 can_create: [bylaw, policy, resolution]
 can_edit: [bylaw, policy, resolution]
 public:
 can_view: [bylaw, policy, resolution] # public can only view
```

## Role Permissions

Each role can have these permissions:

- `can_transition`: What status changes they can make
- `can_create`: What record types they can create
- `can_edit`: What record types they can edit
- `can_delete`: What record types they can delete
- `can_view`: What record types they can view

## Special Keywords

- `any`: Used in transitions to mean "from any status"
- `*`: Used in permissions to mean "all record types"

## CLI Integration

The workflow configuration is automatically used by CLI commands:

```bash
# Change status (validates against workflow config)
civic status my-bylaw approved --role clerk

# Create record (validates permissions)
civic create bylaw "New Bylaw" --role clerk

# View record (validates permissions)
civic view my-bylaw --role public
```

## Web UI Integration

The workflow configuration is also enforced in the web interface through
**Status Transition Controls**:

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

### Error Handling

The UI provides clear, helpful error messages:

- **Invalid Transitions**: "Transition from 'draft' to 'approved' is not
 allowed. Allowed transitions: proposed, archived."
- **Typo Suggestions**: "Did you mean 'reviewed'?" when users type "review"
- **Final Status**: "Allowed transitions: none (final status)" for archived
 records

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

## Default Configuration

If no `workflows.yml` file exists, CivicPress uses these defaults:

- **Statuses**: draft, proposed, reviewed, approved, archived
- **Transitions**: Simple linear progression
- **Roles**: clerk, council, public with basic permissions

## Best Practices

1. **Start Simple**: Use the basic configuration for most cities
2. **Document Your Process**: Make sure your workflow matches your actual
 approval process
3. **Test Changes**: Always test workflow changes before deploying
4. **Role Clarity**: Define clear roles that match your organization structure
5. **Audit Trail**: All status changes are logged with role information

## Troubleshooting

### Common Issues

1. **"Invalid transition"**: Check that the transition is defined in your config
2. **"Role not found"**: Make sure the role exists in your configuration
3. **"Cannot perform action"**: Check role permissions for the specific action

### Debugging

Use the `--dry-run` flag to test changes without making them:

```bash
civic status my-bylaw approved --role clerk --dry-run
```

This will show you what would happen without actually changing the record.
