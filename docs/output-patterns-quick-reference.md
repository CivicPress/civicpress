# Output Patterns Quick Reference

Quick reference for using centralized output patterns across CivicPress modules.

## CLI Output (`cli/src/utils/cli-output.ts`)

### Basic Usage

```typescript
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliDebug,
  cliProgress,
  cliTable,
  cliList,
  cliStartOperation,
} from '../utils/cli-output.js';

// Initialize with global options
import { initializeCliOutput, getGlobalOptionsFromArgs } from '../utils/global-options.js';
const globalOptions = getGlobalOptionsFromArgs();
initializeCliOutput(globalOptions);
```

### Success Output

```typescript
// Simple success
cliSuccess(data, 'Operation completed');

// With metadata
cliSuccess(data, 'Records loaded', {
  operation: 'list records',
  totalRecords: 5,
  duration: 1250
});
```

### Error Handling

```typescript
// Basic error
cliError('Failed to load file', 'FILE_LOAD_FAILED');

// With details and context
cliError(
  'Failed to process records',
  'PROCESS_FAILED',
  { error: 'Invalid format' },
  'import records'
);
```

### Information and Progress

```typescript
// Info messages
cliInfo('Loading records...', 'list records');

// Progress updates
cliProgress('Processing file 3 of 10...', 'import records');

// Warnings
cliWarn('Some files were skipped', 'import records');

// Debug (only in verbose mode)
cliDebug('Processing file: example.md', { filePath }, 'list records');
```

### Structured Output

```typescript
// Table output
cliTable(
  [
    { name: 'Record 1', status: 'active' },
    { name: 'Record 2', status: 'draft' }
  ],
  ['name', 'status'],
  'list records'
);

// List output
cliList(
  ['record1.md', 'record2.md', 'record3.md'],
  'Available records',
  'list records'
);
```

### Operation Timing

```typescript
const endOperation = cliStartOperation('import records');

try {
  // ... perform operation
  cliSuccess(result, 'Import completed');
} catch (error) {
  cliError('Import failed', 'IMPORT_FAILED', { error });
} finally {
  endOperation();
}
```

## Core Output (`core/src/utils/core-output.ts`)

### Basic Usage

```typescript
import {
  coreSuccess,
  coreError,
  coreInfo,
  coreWarn,
  coreDebug,
  coreProgress,
  coreStartOperation,
} from '../utils/core-output.js';
```

### Success Output

```typescript
// Simple success
coreSuccess(data, 'Operation completed');

// With metadata
coreSuccess(data, 'Hook system initialized', {
  operation: 'hook initialization',
  registeredHooks: ['record:created', 'record:updated']
});
```

### Error Handling

```typescript
// Basic error
coreError('Failed to initialize', 'INIT_FAILED');

// With details and context
coreError(
  'Failed to load configuration',
  'CONFIG_LOAD_FAILED',
  { error: 'File not found' },
  { operation: 'system initialization' }
);
```

### Information and Debugging

```typescript
// Info messages
coreInfo('Processing records...', { operation: 'record processing' });

// Progress updates
coreProgress('Loading configuration...', { operation: 'system init' });

// Warnings
coreWarn('Configuration file not found, using defaults', { operation: 'config loading' });

// Debug with rich context
coreDebug(
  'Processing record file',
  { filePath, fileSize: 1024, lastModified: new Date() },
  'record processing'
);
```

### Operation Timing

```typescript
const endOperation = coreStartOperation('hook system initialization');

try {
  // ... perform operation
  coreSuccess(result, 'Initialization completed');
} catch (error) {
  coreError('Initialization failed', 'INIT_FAILED', { error });
} finally {
  endOperation();
}
```

## API Response (`modules/api/src/utils/api-response.ts`)

### Basic Usage

```typescript
import {
  sendSuccess,
  handleApiError,
  handleValidationError,
  logApiRequest,
} from '../utils/api-response.js';
```

### Success Responses

```typescript
// Simple success
sendSuccess(res, data);

// With message
sendSuccess(res, data, 'Records retrieved successfully');

// With metadata
sendSuccess(res, data, 'Operation completed', {
  totalRecords: 5,
  processingTime: 1250
});
```

### Error Handling

```typescript
// API errors
handleApiError(res, error, 'Failed to process request');

// Validation errors
handleValidationError(res, validationErrors, 'Invalid input data');

// Custom error codes
handleApiError(res, error, 'Database connection failed', 503);
```

### Request Logging

```typescript
// Log API request
logApiRequest(req, 'GET /api/records', { userId: req.user?.id });
```

## Global Options

### CLI Global Flags

```bash
# JSON output
civic list --json

# Silent mode
civic list --silent

# Verbose mode
civic list --verbose

# No color
civic list --no-color

# Quiet mode (errors only)
civic list --quiet
```

### Output Modes

| Flag         | Description           | Output                           |
| ------------ | --------------------- | -------------------------------- |
| `--json`     | Machine-readable JSON | Structured JSON with metadata    |
| `--silent`   | Suppress all output   | No output (logs still generated) |
| `--quiet`    | Errors only           | Error messages only              |
| `--verbose`  | Enhanced debugging    | Debug messages + normal output   |
| `--no-color` | Disable colors        | Plain text output                |

## Common Patterns

### 1. Command Structure

```typescript
export const myCommand = (cli: CAC) => {
  cli
    .command('my-command', 'Description')
    .option('--option <value>', 'Option description')
    .action(async (args: string, options: any) => {
      // Initialize output
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('my-command');

      try {
        // ... perform operation
        cliSuccess(result, 'Operation completed');
      } catch (error) {
        cliError('Operation failed', 'OPERATION_FAILED', { error });
      } finally {
        endOperation();
      }
    });
};
```

### 2. Error Handling Pattern

```typescript
try {
  // ... operation
  cliSuccess(data, 'Success');
} catch (error) {
  cliError(
    'Operation failed',
    'OPERATION_FAILED',
    {
      error: error instanceof Error ? error.message : String(error),
      context: 'additional context'
    },
    'operation-name'
  );
  process.exit(1);
}
```

### 3. Progress Reporting

```typescript
cliInfo('Starting operation...', 'operation-name');

for (let i = 0; i < items.length; i++) {
  cliProgress(`Processing item ${i + 1} of ${items.length}`, 'operation-name');
  // ... process item
}

cliSuccess(result, 'Operation completed');
```

### 4. Debug Information

```typescript
cliDebug('Processing file', {
  filePath,
  fileSize: stats.size,
  lastModified: stats.mtime
}, 'operation-name');
```

## Testing Output

### Test JSON Output

```typescript
const result = await runCommand(['list', '--json']);
const output = JSON.parse(result.stdout);

expect(output).toMatchObject({
  success: true,
  data: expect.any(Object),
  message: expect.any(String)
});
```

### Test Silent Mode

```typescript
const result = await runCommand(['list', '--silent']);
expect(result.stdout).toBe('');
```

### Test Error Output

```typescript
const result = await runCommand(['invalid-command']);
expect(result.stderr).toContain('❌');
expect(result.exitCode).toBe(1);
```

## Migration Checklist

- [ ] Replace `console.log` with appropriate output function
- [ ] Replace `console.error` with error handling function
- [ ] Add operation context to all output calls
- [ ] Use descriptive error codes
- [ ] Add operation timing where appropriate
- [ ] Test both human-readable and JSON output modes
- [ ] Test silent mode behavior
- [ ] Update tests to verify output format

## Common Mistakes

### ❌ Don't

```typescript
// Direct console usage
console.log('Success!');
console.error('Error:', error);

// Manual JSON handling
if (options.json) {
  console.log(JSON.stringify(data));
} else {
  console.log('Success!');
}

// Missing context
cliSuccess(data, 'Done');
```

### ✅ Do

```typescript
// Use centralized functions
cliSuccess(data, 'Success!', { operation: 'my-command' });
cliError('Error occurred', 'ERROR_CODE', { error }, 'my-command');

// Let system handle JSON mode
cliSuccess(data, 'Success!', { operation: 'my-command' });

// Include rich context
cliSuccess(data, 'Done', {
  operation: 'my-command',
  totalItems: data.length,
  processingTime: duration
});
```
