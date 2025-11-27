# CivicPress Indexing Schedules

This guide covers different indexing strategies based on your use case, data
volume, and performance requirements.

## **Indexing Strategy Matrix**

| Use Case        | Data Volume        | Update Frequency | Recommended Strategy |
| --------------- | ------------------ | ---------------- | -------------------- |
| **Development** | < 100 records      | Low              | Manual indexing      |
| **Small Town**  | 100-1000 records   | Daily            | Git hooks            |
| **Medium City** | 1000-10000 records | Hourly           | Scheduled cron       |
| **Large City**  | > 10000 records    | Real-time        | Event-driven         |

## **Strategy 1: Manual Indexing**

**Best for:** Development, testing, small datasets

```bash
# Manual commands
civic index                    # Generate all indexes
civic index --rebuild          # Force complete rebuild
civic index --type bylaw       # Partial rebuild
civic index --validate         # Validate existing indexes
```

**Pros:**

- ✅ Full control over timing
- ✅ No background processes
- ✅ Simple to understand
- ✅ Good for development

**Cons:**

- ❌ Requires manual intervention
- ❌ Can become outdated
- ❌ Not suitable for production

## **Strategy 2: Git Hook Indexing**

**Best for:** Small to medium towns, team collaboration

### Setup Git Hook

```bash
# Create post-commit hook
cat > .git/hooks/post-commit << 'EOF'
#!/bin/bash
cd "$(git rev-parse --show-toplevel)"
civic index --silent
git add data/records/index.yml
git commit -m "Auto-update indexes" --no-verify
EOF

chmod +x .git/hooks/post-commit
```

### Configuration

```yaml
# .civic/indexing.yml
auto_index_on_commit: true
silent_mode: true
include_module_indexes: true
```

**Pros:**

- ✅ Automatic after commits
- ✅ Version controlled indexes
- ✅ Team-friendly
- ✅ No external dependencies

**Cons:**

- ❌ Only updates on commits
- ❌ Can slow down commit process
- ❌ Requires Git workflow

## Strategy 3: Scheduled Indexing**

**Best for:** Medium to large cities, production systems

### Cron Job Setup

```bash
# Add to crontab (every 15 minutes)
*/15 * * * * cd /path/to/civicpress && civic index --silent

# Or hourly for larger datasets
0 * * * * cd /path/to/civicpress && civic index --silent

# Or daily for small updates
0 2 * * * cd /path/to/civicpress && civic index --rebuild --silent
```

### Systemd Service (Linux)

```ini
# /etc/systemd/system/civicpress-indexing.service
[Unit]
Description=CivicPress Indexing Service
After=network.target

[Service]
Type=oneshot
User=civicpress
WorkingDirectory=/path/to/civicpress
ExecStart=/usr/bin/node cli/dist/index.js index --silent
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/civicpress-indexing.timer
[Unit]
Description=Run CivicPress indexing every 15 minutes
Requires=civicpress-indexing.service

[Timer]
OnCalendar=*:0/15
Persistent=true

[Install]
WantedBy=timers.target
```

**Pros:**

- ✅ Predictable timing
- ✅ Production-ready
- ✅ Configurable frequency
- ✅ System service integration

**Cons:**

- ❌ Requires system access
- ❌ Fixed schedule
- ❌ May run unnecessarily

## **Strategy 4: Event-Driven Indexing**

**Best for:** Large cities, real-time requirements

### File System Watcher

```bash
# Install file watcher
npm install -g chokidar-cli

# Watch for changes and trigger indexing
chokidar "data/records/**/*.md" -c "civic index --silent"
```

### API-Triggered Indexing

The CivicPress API includes indexing endpoints that can be used for event-driven
indexing:

```typescript
// Use the existing API endpoint
// POST /api/v1/indexing/generate
const response = await fetch('/api/v1/indexing/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    rebuild: true,
    syncDatabase: true
  })
});
```

See [Indexing System](indexing-system.md#api-endpoints) for complete API
documentation.

**Pros:**

- ✅ Real-time updates
- ✅ Efficient resource usage
- ✅ Immediate search results
- ✅ Scalable

**Cons:**

- ❌ More complex setup
- ❌ Requires monitoring
- ❌ Potential performance impact

## **Performance Monitoring**

### Index Generation Metrics

```bash
# Monitor indexing performance
time civic index --rebuild

# Check index file sizes
ls -lh data/records/index.yml

# Validate index integrity
civic index --validate
```

### Logging and Monitoring

```yaml
# .civic/indexing.yml
logging:
  level: info
  file: logs/indexing.log
  max_size: 10MB
  max_files: 5

performance:
  max_concurrent_files: 100
  timeout_seconds: 300
  memory_limit_mb: 512
```

## **Implementation Examples**

### Small Town Setup (Git Hooks)

```bash
#!/bin/bash
# .git/hooks/post-commit

# Only index if records changed
if git diff --name-only HEAD~1 | grep -q "data/records/"; then
  echo "Records changed, updating indexes..."
  civic index --silent
  git add data/records/index.yml
  git commit -m "Auto-update indexes" --no-verify
fi
```

### Medium City Setup (Cron)

```bash
#!/bin/bash
# /usr/local/bin/civicpress-index.sh

cd /opt/civicpress
export NODE_ENV=production

# Check if indexing is needed
if [ -f "data/records/.last-index" ]; then
  last_index=$(cat data/records/.last-index)
  last_commit=$(git log -1 --format=%H)

  if [ "$last_index" = "$last_commit" ]; then
    echo "No changes detected, skipping indexing"
    exit 0
  fi
fi

# Run indexing
civic index --silent

# Update last indexed commit
echo "$(git log -1 --format=%H)" > data/records/.last-index
```

### Large City Setup (Event-Driven)

```typescript
// services/indexing-service.ts
import { IndexingService } from '@civicpress/core';
import { EventEmitter } from 'events';

export class SmartIndexingService extends IndexingService {
  private eventEmitter = new EventEmitter();
  private indexingQueue: string[] = [];
  private isIndexing = false;

  constructor(civicPress: CivicPress) {
    super(civicPress);

    // Debounce indexing requests
    this.eventEmitter.on('index-requested', this.debouncedIndex.bind(this));
  }

  private debouncedIndex(filePath: string) {
    this.indexingQueue.push(filePath);

    if (!this.isIndexing) {
      setTimeout(() => this.processQueue(), 5000); // 5 second debounce
    }
  }

  private async processQueue() {
    if (this.isIndexing) return;

    this.isIndexing = true;

    try {
      await this.generateIndexes({ rebuild: false });
      // Use centralized output system instead of console.log
      // logger.info(`Indexed ${this.indexingQueue.length} changes`);
    } catch (error) {
      // Use centralized output system instead of console.error
      // logger.error('Indexing failed:', error);
    } finally {
      this.isIndexing = false;
      this.indexingQueue = [];
    }
  }

  requestIndex(filePath: string) {
    this.eventEmitter.emit('index-requested', filePath);
  }
}
```

## **Recommendations by Use Case**

### **Development Environment**

```bash
# Manual indexing only
civic index --rebuild  # When needed
```

### **Small Town (< 1000 records)**

```bash
# Git hooks
git hooks/post-commit  # Auto-index on commit
```

### **Medium City (1000-10000 records)**

```bash
# Scheduled indexing
*/15 * * * * civic index --silent  # Every 15 minutes
```

### **Large City (> 10000 records)**

```bash
# Event-driven + scheduled backup
# Real-time updates + daily rebuild
0 2 * * * civic index --rebuild --silent  # Daily rebuild
```

## **Monitoring and Alerts**

```bash
# Health check script
#!/bin/bash
# /usr/local/bin/civicpress-index-health.sh

INDEX_FILE="data/records/index.yml"
MAX_AGE_HOURS=24

if [ ! -f "$INDEX_FILE" ]; then
  echo "ERROR: Index file missing"
  exit 1
fi

INDEX_AGE=$(($(date +%s) - $(stat -c %Y "$INDEX_FILE")))
MAX_AGE_SECONDS=$((MAX_AGE_HOURS * 3600))

if [ $INDEX_AGE -gt $MAX_AGE_SECONDS ]; then
  echo "WARNING: Index file is older than $MAX_AGE_HOURS hours"
  civic index --rebuild --silent
fi
```

This comprehensive guide should help you choose the right indexing strategy for
your specific use case!
