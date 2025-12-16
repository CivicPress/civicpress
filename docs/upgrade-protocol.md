# CivicPress Upgrade Protocol

> **Safe upgrade procedures for demo and production deployments**

This document outlines the recommended protocol for upgrading CivicPress
installations, ensuring data safety and minimal downtime.

## Overview

CivicPress uses **automatic database migrations** that run on startup, making
upgrades generally safe. However, following this protocol ensures:

- ✅ Data safety through backups
- ✅ Quick rollback if issues occur
- ✅ Verification of successful upgrade
- ✅ Minimal downtime

---

## Pre-Upgrade Checklist

Before starting any upgrade:

- [ ] Review release notes for breaking changes
- [ ] Check database migration requirements
- [ ] Verify backup system is working
- [ ] Schedule upgrade during low-traffic period (if applicable)
- [ ] Notify users of maintenance window (if needed)

---

## Upgrade Protocol

### Step 1: Create Backup

**Always backup before upgrading!**

```bash
# Create a full backup (data + system data)
civic backup create --output exports/backups

# Verify backup was created successfully
ls -lh exports/backups/
```

**What gets backed up:**

- `data/` directory (all civic records, configs, templates)
- `.system-data/civic.db` (database)
- Storage files metadata
- Git history bundle

**Backup location:** `exports/backups/YYYY-MM-DDTHH-MM-SSZ/`

---

### Step 2: Stop Services

Stop all running CivicPress services:

```bash
# Stop API server (if running as service)
# systemctl stop civicpress-api  # or your service manager

# Stop UI server (if running as service)
# systemctl stop civicpress-ui   # or your service manager

# Or if running manually, stop with Ctrl+C
```

**Verify services are stopped:**

```bash
# Check if ports are still in use
lsof -i :3000  # UI port
lsof -i :3030  # API port
```

---

### Step 3: Update Code

#### Option A: Git Pull (Recommended for Git-managed deployments)

```bash
# Navigate to CivicPress directory
cd /path/to/civicpress

# Stash any local changes (if any)
git stash

# Pull latest changes
git pull origin main  # or your branch name

# Verify you're on the correct version
git log --oneline -1
```

#### Option B: Replace Code (For non-Git deployments)

```bash
# Backup current installation
cp -r /path/to/civicpress /path/to/civicpress.backup.$(date +%Y%m%d)

# Replace with new code
# (extract new release archive, or copy from development)
```

---

### Step 4: Install Dependencies & Build

```bash
# Install/update dependencies
pnpm install

# Build all modules
pnpm run build

# Verify build succeeded
echo $?  # Should be 0
```

---

### Step 5: Database Migration (Automatic)

**CivicPress automatically runs migrations on startup**, but you can verify:

```bash
# Check database schema (optional verification)
sqlite3 .system-data/civic.db ".schema" | grep -E "CREATE TABLE|ALTER TABLE"

# Or validate the database
civic validate --system-data
```

**What happens automatically:**

- New columns are added if missing
- Indexes are created for performance
- FTS5 search tables are updated
- No data loss - migrations are additive only

---

### Step 6: Rebuild Search Index (If Needed)

If the upgrade includes search/indexing changes:

```bash
# Rebuild search index
civic index --sync-db

# Verify indexing completed
civic index --status
```

**Note:** For this upgrade (word extraction feature), the index should rebuild
automatically, but running `civic index --sync-db` ensures everything is up to
date.

---

### Step 7: Start Services

```bash
# Start API server
pnpm run start:api
# Or: systemctl start civicpress-api

# Start UI server (in separate terminal or as service)
pnpm run start:ui
# Or: systemctl start civicpress-ui
```

**Verify services started:**

```bash
# Check API health
curl http://localhost:3030/api/v1/health

# Check UI is accessible
curl http://localhost:3000
```

---

### Step 8: Post-Upgrade Verification

#### 8.1 Functional Tests

```bash
# 1. Verify API is responding
curl http://localhost:3030/api/v1/health

# 2. Test search suggestions (new feature)
curl 'http://localhost:3030/api/v1/search/suggestions?q=test&limit=5'

# 3. Verify records are accessible
curl http://localhost:3030/api/v1/records?limit=1
```

#### 8.2 UI Verification

1. **Open the UI** in browser: `http://localhost:3000` (or your domain)
2. **Test search suggestions:**
   - Type a few characters in the search box
   - Verify word suggestions appear as badges
   - Verify title suggestions appear as list items
3. **Test record listing:**
   - Navigate to records page
   - Verify records load correctly
   - Test sorting options
4. **Test record creation/editing:**
   - Create a test record
   - Verify it saves correctly
   - Verify it appears in search

#### 8.3 Database Verification

```bash
# Validate database integrity
civic validate --system-data

# Check for any errors in logs
tail -50 .system-data/logs/*.log
```

---

## Rollback Procedure

If something goes wrong, rollback immediately:

### Quick Rollback

```bash
# 1. Stop services
systemctl stop civicpress-api civicpress-ui
# Or: kill processes manually

# 2. Restore code from backup
cd /path/to/civicpress
git checkout <previous-commit-hash>
# Or: restore from backup directory

# 3. Restore database (if needed)
civic backup restore exports/backups/YYYY-MM-DDTHH-MM-SSZ/ --overwrite

# 4. Rebuild and restart
pnpm install
pnpm run build
systemctl start civicpress-api civicpress-ui
```

### Full Rollback (If Database Changed)

```bash
# 1. Stop services
systemctl stop civicpress-api civicpress-ui

# 2. Restore from backup
civic backup restore exports/backups/YYYY-MM-DDTHH-MM-SSZ/ \
  --overwrite \
  --restore-storage

# 3. Restore code
git checkout <previous-version-tag>

# 4. Rebuild and restart
pnpm install
pnpm run build
systemctl start civicpress-api civicpress-ui
```

---

## Demo Installation Specific

For the demo installation at `demo.civicpress.io`:

### Recommended Approach

```bash
# 1. SSH into demo server
ssh user@demo-server

# 2. Navigate to installation directory
cd /path/to/civicpress-demo

# 3. Follow standard upgrade protocol (Steps 1-8 above)

# 4. If using PM2 or similar process manager:
pm2 restart civicpress-api
pm2 restart civicpress-ui

# 5. Monitor logs
pm2 logs civicpress-api
pm2 logs civicpress-ui
```

### Zero-Downtime Upgrade (Advanced)

For production deployments, consider:

1. **Blue-Green Deployment:**
   - Run new version on different ports
   - Switch reverse proxy when ready
   - Keep old version running until verified

2. **Canary Deployment:**
   - Deploy to subset of users first
   - Monitor for issues
   - Roll out to all users gradually

---

## What Changed in This Upgrade

### Database Changes

- ✅ **No breaking schema changes**
- ✅ **New indexes added automatically** (for sort performance)
- ✅ **FTS5 search tables updated** (if needed)

### Code Changes

- ✅ **Word extraction in search suggestions**
- ✅ **Enhanced query parser** (matches exact + prefix)
- ✅ **Search cache improvements** (clears on record removal)

### Migration Safety

All migrations are **additive only**:

- New columns added with `ALTER TABLE ... ADD COLUMN`
- Existing data preserved
- No data deletion or modification
- Idempotent (safe to run multiple times)

---

## Troubleshooting

### Issue: Services won't start

```bash
# Check logs
tail -100 .system-data/logs/*.log

# Verify database is accessible
sqlite3 .system-data/civic.db "SELECT 1;"

# Check Node.js version
node --version  # Should be 20.11.1+
```

### Issue: Search not working

```bash
# Rebuild search index
civic index --sync-db

# Check FTS5 table exists
sqlite3 .system-data/civic.db ".tables" | grep fts5
```

### Issue: TypeScript/build errors

```bash
# Clean and rebuild
rm -rf node_modules
rm -rf */dist
pnpm install
pnpm run build
```

### Issue: Database migration errors

```bash
# Check database integrity
sqlite3 .system-data/civic.db "PRAGMA integrity_check;"

# If corrupted, restore from backup
civic backup restore exports/backups/LATEST/ --overwrite
```

---

## Post-Upgrade Maintenance

After successful upgrade:

1. **Monitor logs** for 24-48 hours
2. **Check error rates** in monitoring tools
3. **Verify search performance** (should be same or better)
4. **Test new features** (word suggestions in this case)
5. **Update documentation** if needed

---

## Version-Specific Notes

### v0.1.4 (Current Upgrade)

**New Features:**

- Word extraction in search suggestions
- Enhanced search query parsing
- Improved search cache management

**Migration Requirements:**

- ✅ Automatic (no manual steps)
- ✅ Database indexes created automatically
- ✅ Search index rebuild recommended: `civic index --sync-db`

**Breaking Changes:**

- ❌ None

**Deprecations:**

- ❌ None

---

## Related Documentation

- [Backup Strategy](./backup-strategy.md) - Backup and restore procedures
- [Deployment Guide](./specs/deployment.md) - Deployment architecture
- [Bootstrap Guide](./bootstrap-guide.md) - Initial setup
- [CLI Usage](./cli.md) - Command-line tools

---

## Quick Reference

```bash
# Full upgrade in one go (after backup)
git pull && pnpm install && pnpm run build && \
civic index --sync-db && \
systemctl restart civicpress-api civicpress-ui

# Verify upgrade
curl http://localhost:3030/api/v1/health && \
curl 'http://localhost:3030/api/v1/search/suggestions?q=test&limit=5'
```

---

**Remember:** Always backup first, test in staging if possible, and have a
rollback plan ready!
