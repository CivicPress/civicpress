# CivicPress Spec: `diagnostic-tools.md`

---

version: 1.0.0 status: draft created: '2025-01-27' updated: '2025-01-27'
deprecated: false

---

## Name

Diagnostic Tools & System Health Checks

## Purpose

Provide comprehensive diagnostic tools for identifying, diagnosing, and
resolving system issues in CivicPress installations. These tools help
administrators, developers, and support staff quickly identify problems and
verify system health.

## Scope & Responsibilities

Responsibilities:

- **Database Diagnostics**: Integrity checks, corruption detection, schema
  validation
- **Search Index Diagnostics**: FTS5 index health, synchronization status, query
  performance
- **Configuration Diagnostics**: Validation, completeness checks, migration
  status
- **File System Diagnostics**: Record file integrity, Git repository health,
  storage validation
- **System Resource Diagnostics**: Memory usage, disk space, performance metrics
- **Network Diagnostics**: API connectivity, external service availability
- **Log Analysis**: Error pattern detection, performance bottleneck
  identification
- **Automated Repair**: Safe auto-fix capabilities for common issues

Out of Scope:

- Real-time monitoring (handled by observability spec)
- Performance profiling (handled by metrics spec)
- Security auditing (handled by security spec)

## Inputs & Outputs

| Input                               | Description                            |
| ----------------------------------- | -------------------------------------- |
| `civic diagnose`                    | Run all diagnostic checks              |
| `civic diagnose --component <name>` | Run diagnostics for specific component |
| `civic diagnose --fix`              | Run diagnostics and attempt auto-fixes |
| `civic diagnose --json`             | Output results as JSON                 |
| `GET /api/v1/diagnose`              | API endpoint for diagnostics           |

| Output            | Description                        |
| ----------------- | ---------------------------------- |
| Diagnostic Report | Comprehensive system health report |
| Issue List        | Categorized list of problems found |
| Recommendations   | Suggested fixes and improvements   |
| Auto-fix Results  | Results of attempted repairs       |

## CLI Command Structure

### Main Command

```bash
civic diagnose [options]
```

**Options:**

- `--component <name>` - Run diagnostics for specific component (database,
  search, config, filesystem, git, system)
- `--fix` - Attempt to auto-fix issues where safe
- `--json` - Output results as JSON
- `--verbose` - Show detailed diagnostic information
- `--quiet` - Suppress non-critical output
- `--format <format>` - Output format (human, json, yaml)

**Examples:**

```bash
# Run all diagnostics
civic diagnose

# Check only database
civic diagnose --component database

# Check and auto-fix issues
civic diagnose --fix

# JSON output for automation
civic diagnose --json
```

### Component-Specific Commands

```bash
# Database diagnostics
civic diagnose:database [--fix] [--integrity-check] [--schema-check]

# Search index diagnostics
civic diagnose:search [--rebuild] [--validate] [--performance]

# Configuration diagnostics
civic diagnose:config [--validate] [--migration-status]

# File system diagnostics
civic diagnose:filesystem [--integrity] [--git-health]

# System resource diagnostics
civic diagnose:system [--resources] [--performance]
```

## Diagnostic Components

### 1. Database Diagnostics

**Checks:**

- Database file existence and accessibility
- SQLite integrity check (`PRAGMA integrity_check`)
- Schema validation (all required tables exist)
- Column existence and types
- Index integrity
- Foreign key constraints
- FTS5 virtual table health
- Database file size and growth trends
- Vacuum status and fragmentation

**Issues Detected:**

- Database corruption (`SQLITE_CORRUPT`)
- Missing tables or columns
- Schema mismatches
- Index corruption
- FTS5 table definition mismatches
- Excessive fragmentation

**Auto-fixes:**

- Recreate missing indexes
- Rebuild FTS5 tables if corrupted
- Run `VACUUM` if fragmentation detected
- Fix schema mismatches (with backup)

**Output:**

```json
{
  "component": "database",
  "status": "healthy" | "warning" | "error",
  "checks": {
    "integrity": { "status": "pass", "message": "Database integrity verified" },
    "schema": { "status": "pass", "tables": 12, "columns": 45 },
    "indexes": { "status": "pass", "count": 8 },
    "fts5": { "status": "pass", "tables": ["search_index_fts5"] },
    "fragmentation": { "status": "warning", "fragmentation": "15%", "recommendation": "Run VACUUM" }
  },
  "issues": [],
  "recommendations": ["Run VACUUM to reduce fragmentation"]
}
```

### 2. Search Index Diagnostics

**Checks:**

- FTS5 table existence and structure
- FTS5 trigger integrity
- Search index synchronization status
- Record count mismatch (records vs search_index)
- Index performance (query response times)
- Cache health (hit rates, size)
- Title normalization status

**Issues Detected:**

- Missing FTS5 tables
- Broken FTS5 triggers
- Desynchronized index (records missing from search_index)
- Corrupted FTS5 data
- Performance degradation
- Missing `title_normalized` values

**Auto-fixes:**

- Rebuild FTS5 tables and triggers
- Re-sync missing records
- Update `title_normalized` for NULL values
- Clear and rebuild cache

**Output:**

```json
{
  "component": "search",
  "status": "warning",
  "checks": {
    "fts5_table": { "status": "pass", "exists": true },
    "triggers": { "status": "pass", "count": 3 },
    "synchronization": {
      "status": "warning",
      "records_in_db": 1250,
      "records_in_index": 1245,
      "missing": 5,
      "message": "5 records missing from search index"
    },
    "performance": { "status": "pass", "avg_query_time": "12ms" },
    "title_normalized": {
      "status": "warning",
      "null_count": 3,
      "message": "3 records have NULL title_normalized"
    }
  },
  "issues": [
    {
      "severity": "warning",
      "message": "5 records missing from search index",
      "fix": "Run 'civic index --sync-db' to synchronize"
    }
  ],
  "recommendations": ["Synchronize search index", "Update title_normalized values"]
}
```

### 3. Configuration Diagnostics

**Checks:**

- Configuration directory existence (`data/.civic/`)
- Required configuration files present
- Configuration file syntax (YAML validation)
- Configuration schema validation
- Metadata format compliance
- Migration status (old vs new format)
- Default template availability
- Hook configuration validity

**Issues Detected:**

- Missing configuration files
- Invalid YAML syntax
- Schema violations
- Missing required fields
- Outdated configuration format
- Missing templates

**Auto-fixes:**

- Create missing default configs
- Fix YAML syntax errors (where possible)
- Migrate old format to new format
- Add missing required fields with defaults

**Output:**

```json
{
  "component": "config",
  "status": "healthy",
  "checks": {
    "directory": { "status": "pass", "path": "data/.civic/" },
    "required_files": {
      "status": "pass",
      "present": ["roles.yml", "workflows.yml", "hooks.yml"],
      "missing": []
    },
    "syntax": { "status": "pass", "files_validated": 3 },
    "schema": { "status": "pass", "violations": 0 },
    "migration_status": { "status": "pass", "format": "new" }
  },
  "issues": [],
  "recommendations": []
}
```

### 4. File System Diagnostics

**Checks:**

- Records directory structure
- Record file integrity (valid Markdown, valid frontmatter)
- Orphaned files (files not in database/index)
- Missing files (referenced but not found)
- Git repository health
- Git configuration (user.name, user.email)
- File permissions
- Disk space availability
- Storage directory accessibility

**Issues Detected:**

- Invalid record files
- Orphaned files
- Missing referenced files
- Git repository corruption
- Missing Git configuration
- Permission issues
- Low disk space
- Storage directory inaccessible

**Auto-fixes:**

- Fix Git configuration (set user.name/user.email)
- Remove orphaned files (with confirmation)
- Fix file permissions (where possible)
- Validate and repair record files

**Output:**

```json
{
  "component": "filesystem",
  "status": "warning",
  "checks": {
    "records_directory": { "status": "pass", "path": "data/records/" },
    "file_integrity": {
      "status": "warning",
      "valid": 1245,
      "invalid": 2,
      "invalid_files": ["records/bylaw/corrupted.md"]
    },
    "orphaned_files": {
      "status": "warning",
      "count": 3,
      "files": ["records/old/file1.md", "records/old/file2.md"]
    },
    "git_health": {
      "status": "warning",
      "repository": "ok",
      "config": {
        "user.name": "missing",
        "user.email": "missing"
      }
    },
    "disk_space": { "status": "pass", "available": "45GB", "usage": "12%" }
  },
  "issues": [
    {
      "severity": "warning",
      "message": "Git user identity not configured",
      "fix": "Run 'git config user.name' and 'git config user.email'"
    }
  ],
  "recommendations": ["Configure Git user identity", "Review orphaned files"]
}
```

### 5. System Resource Diagnostics

**Checks:**

- Memory usage (RSS, heap)
- CPU usage trends
- Disk I/O performance
- Node.js version compatibility
- Available disk space
- Process limits (file descriptors, memory)
- Database connection pool health
- API response times

**Issues Detected:**

- High memory usage
- CPU bottlenecks
- Disk I/O issues
- Low disk space
- Node.js version incompatibility
- Connection pool exhaustion
- Slow API responses

**Auto-fixes:**

- None (resource issues require manual intervention)

**Output:**

```json
{
  "component": "system",
  "status": "healthy",
  "checks": {
    "memory": {
      "status": "pass",
      "rss": "125MB",
      "heap_used": "45MB",
      "heap_total": "60MB"
    },
    "cpu": { "status": "pass", "usage": "5%" },
    "disk": {
      "status": "pass",
      "available": "45GB",
      "usage": "12%"
    },
    "node_version": { "status": "pass", "version": "v20.10.0" },
    "api_performance": {
      "status": "pass",
      "avg_response_time": "45ms",
      "p95": "120ms"
    }
  },
  "issues": [],
  "recommendations": []
}
```

### 6. Network & Connectivity Diagnostics

**Checks:**

- API endpoint availability
- Database connection
- External service connectivity (if configured)
- OAuth provider availability
- Storage provider connectivity (S3, Azure, etc.)

**Issues Detected:**

- API not responding
- Database connection failures
- External service timeouts
- OAuth provider issues
- Storage provider connectivity problems

**Auto-fixes:**

- None (connectivity issues require manual intervention)

## API Endpoints

### GET /api/v1/diagnose

Run all diagnostic checks.

**Query Parameters:**

- `component` - Run diagnostics for specific component
- `fix` - Attempt auto-fixes (boolean)
- `format` - Output format (json, yaml)

**Response:**

```json
{
  "success": true,
  "data": {
    "timestamp": "2025-01-27T10:00:00Z",
    "overall_status": "healthy" | "warning" | "error",
    "components": {
      "database": { /* database diagnostics */ },
      "search": { /* search diagnostics */ },
      "config": { /* config diagnostics */ },
      "filesystem": { /* filesystem diagnostics */ },
      "system": { /* system diagnostics */ }
    },
    "summary": {
      "total_checks": 25,
      "passed": 23,
      "warnings": 2,
      "errors": 0
    },
    "issues": [ /* list of all issues */ ],
    "recommendations": [ /* list of recommendations */ ]
  }
}
```

### GET /api/v1/diagnose/:component

Run diagnostics for specific component.

**Components:** `database`, `search`, `config`, `filesystem`, `system`

**Response:** Same structure as above, but only for the specified component.

## Implementation Details

### Core Service

**Location:** `core/src/diagnostics/diagnostic-service.ts`

**Responsibilities:**

- Orchestrate all diagnostic checks
- Aggregate results
- Generate reports
- Execute auto-fixes (where safe)

**Interface:**

```typescript
export class DiagnosticService {
  async runAll(options?: DiagnosticOptions): Promise<DiagnosticReport>;
  async runComponent(component: string, options?: DiagnosticOptions): Promise<ComponentReport>;
  async autoFix(issues: DiagnosticIssue[]): Promise<FixResult[]>;
}
```

### Component Checkers

Each component has its own checker class:

- `DatabaseDiagnosticChecker` - `core/src/diagnostics/database-checker.ts`
- `SearchDiagnosticChecker` - `core/src/diagnostics/search-checker.ts`
- `ConfigDiagnosticChecker` - `core/src/diagnostics/config-checker.ts`
- `FilesystemDiagnosticChecker` - `core/src/diagnostics/filesystem-checker.ts`
- `SystemDiagnosticChecker` - `core/src/diagnostics/system-checker.ts`

### CLI Command

**Location:** `cli/src/commands/diagnose.ts`

**Features:**

- Color-coded output (green/yellow/red)
- Progress indicators
- Detailed error messages
- JSON output support
- Auto-fix confirmation prompts

### API Routes

**Location:** `modules/api/src/routes/diagnose.ts`

**Features:**

- Authentication required (admin only)
- Rate limiting
- Async execution for long-running checks
- Webhook support for completion notifications

## Error Handling

- **Non-critical checks** continue even if one fails
- **Critical checks** stop execution if they fail
- **Auto-fixes** are logged and can be rolled back
- **Confirmation prompts** for destructive operations
- **Backup creation** before auto-fixes

## Security Considerations

- Diagnostic endpoints require admin authentication
- Sensitive information (passwords, tokens) is redacted
- File system access is restricted to data directory
- Database queries are read-only (except for fixes)
- Auto-fixes require explicit confirmation

## Testing Requirements

- Unit tests for each diagnostic checker
- Integration tests for full diagnostic runs
- Tests for auto-fix functionality
- Tests for error handling
- Tests for API endpoints
- Tests for CLI command

## Related Specs

- [Health Monitoring](health.md) - Basic health checks
- [Status API](modules/api/docs/status-api.md) - System status endpoints
- [Data Integrity](data-integrity.md) - Record integrity validation
- [Observability](observability.md) - System monitoring
- [Backup](backup.md) - Backup and restore functionality

## Future Enhancements

- **Predictive Diagnostics**: Identify issues before they become problems
- **Historical Trends**: Track diagnostic results over time
- **Remote Diagnostics**: Run diagnostics on remote installations
- **Automated Reporting**: Schedule diagnostic reports
- **Integration with Monitoring**: Connect to external monitoring systems
- **Performance Profiling**: Deep performance analysis
- **Security Auditing**: Security-focused diagnostic checks
