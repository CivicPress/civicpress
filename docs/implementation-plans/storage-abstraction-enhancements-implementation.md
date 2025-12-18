# Storage Abstraction Layer Enhancements - Implementation Plan

**Version:** 1.0.0  
**Status:** Ready for Implementation  
**Target:** v0.2.0  
**Estimated Effort:** 2-3 weeks  
**Priority:** Medium

---

## Overview

This implementation plan breaks down the storage abstraction enhancements into
actionable phases, tasks, and acceptance criteria. Each phase is designed to be
production-ready before moving to the next.

**Reference:** See
`docs/implementation-plans/storage-abstraction-enhancements.md` for detailed
specifications.

---

## Phase 1: Performance Optimizations (Week 1)

**Goal:** Improve storage operation performance by 5-10x for common operations.

**Duration:** 5-7 days  
**Dependencies:** None  
**Deliverables:** Caching, batch operations, streaming, connection pooling,
concurrency limits

---

### Task 1.1: Metadata Caching Layer

**Priority:** High  
**Effort:** 2-3 days  
**Owner:** Backend Engineer

#### Subtasks

1. **Install cache library**

   ```bash
   pnpm add node-cache
   pnpm add -D @types/node-cache
   ```

2. **Create `StorageMetadataCache` class**
   - Location: `modules/storage/src/cache/storage-metadata-cache.ts`
   - Implement LRU cache with TTL
   - Methods: `getCachedFiles()`, `setCachedFiles()`, `invalidateFolder()`,
     `invalidateFile()`, `getCacheStats()`
   - Default TTL: 5 minutes (configurable)
   - Memory limit: 100MB (configurable)

3. **Integrate with `CloudUuidStorageService`**
   - Add cache instance to service
   - Cache `listFiles()` results
   - Invalidate cache on `uploadFile()` and `deleteFile()`
   - Add cache warming for frequently accessed folders

4. **Add configuration**
   - Add `cache_enabled`, `cache_ttl`, `cache_max_size` to `storage.yml`
   - Update `StorageConfig` interface

5. **Add metrics**
   - Track cache hits/misses
   - Expose cache stats via metrics

6. **Write tests**
   - Unit tests for cache operations
   - Integration tests for cache invalidation
   - Performance tests for cache hit rates

#### Acceptance Criteria

- [ ] Cache reduces `listFiles()` latency by 10-100x for cached folders
- [ ] Cache automatically invalidates on file upload/delete
- [ ] Cache stats available via metrics endpoint
- [ ] Cache configuration via `storage.yml`
- [ ] 100% test coverage for cache logic
- [ ] Memory usage stays within configured limits

#### Testing Checklist

- [ ] Cache hit returns cached data
- [ ] Cache miss queries database and caches result
- [ ] Cache invalidates on upload
- [ ] Cache invalidates on delete
- [ ] Cache TTL expires correctly
- [ ] Cache respects memory limits
- [ ] Cache stats are accurate

---

### Task 1.2: Batch Operations

**Priority:** High  
**Effort:** 3-4 days  
**Owner:** Backend Engineer  
**Dependencies:** Task 1.1 (can be parallelized)

#### Subtasks

1. **Create batch operation interfaces**
   - Location: `modules/storage/src/types/storage.types.ts`
   - Add `BatchUploadRequest`, `BatchUploadResponse`, `BatchDeleteRequest`,
     `BatchDeleteResponse`

2. **Implement `batchUpload()` method**
   - Location: `modules/storage/src/cloud-uuid-storage-service.ts`
   - Process files in parallel (configurable concurrency: 5-10)
   - Use database transaction for atomic batch insert
   - Return partial results (successful + failed)
   - Invalidate cache for affected folders

3. **Implement `batchDelete()` method**
   - Process deletions in parallel
   - Use database transaction
   - Return partial results
   - Invalidate cache

4. **Add progress callback support**
   - Optional progress callback for UI feedback
   - Report progress: `{ completed: number; total: number; current: string }`

5. **Add API endpoints**
   - `POST /api/v1/storage/files/batch` - Batch upload
   - `DELETE /api/v1/storage/files/batch` - Batch delete
   - Location: `modules/api/src/routes/uuid-storage.ts`

6. **Add configuration**
   - `max_concurrent_uploads`, `max_concurrent_deletes` to `storage.yml`

7. **Write tests**
   - Unit tests for batch operations
   - Integration tests with multiple files
   - Error handling tests (partial failures)
   - Performance tests (throughput)

#### Acceptance Criteria

- [ ] Batch upload processes 10 files 5-10x faster than sequential
- [ ] Batch delete processes 10 files 5-10x faster than sequential
- [ ] Partial failures handled gracefully (some succeed, some fail)
- [ ] Database transactions ensure atomicity
- [ ] Progress callbacks work correctly
- [ ] API endpoints return proper responses
- [ ] 100% test coverage for batch operations

#### Testing Checklist

- [ ] Batch upload with 10 files succeeds
- [ ] Batch upload with 1 failure returns partial success
- [ ] Batch delete with 10 files succeeds
- [ ] Batch delete with 1 failure returns partial success
- [ ] Database transaction rolls back on critical failure
- [ ] Progress callbacks fire correctly
- [ ] Concurrent operations respect limits
- [ ] Cache invalidates after batch operations

---

### Task 1.3: Streaming for Large Files

**Priority:** Medium  
**Effort:** 4-5 days  
**Owner:** Backend Engineer  
**Dependencies:** None

#### Subtasks

1. **Create streaming interfaces**
   - Location: `modules/storage/src/types/storage.types.ts`
   - Add `StreamUploadOptions`, `StreamDownloadOptions`

2. **Implement `uploadFileStream()` method**
   - Location: `modules/storage/src/cloud-uuid-storage-service.ts`
   - Use Node.js streams for upload
   - Multipart upload for S3 (AWS SDK supports this)
   - Chunked upload for Azure Blob Storage
   - Fallback to buffer mode for files < threshold (10MB)

3. **Implement `downloadFileStream()` method**
   - Stream download for large files
   - Support range requests (partial content)
   - Proper error handling for stream errors

4. **Add configuration**
   - `stream_threshold` to `storage.yml` (default: 10MB)
   - `chunk_size` for streaming (default: 5MB)

5. **Update API endpoints**
   - Support streaming uploads via `multipart/form-data` with streams
   - Support streaming downloads with proper headers
   - Location: `modules/api/src/routes/uuid-storage.ts`

6. **Write tests**
   - Unit tests for streaming operations
   - Integration tests with large files (100MB+)
   - Memory usage tests (verify no memory leaks)
   - Performance tests (streaming vs buffer)

#### Acceptance Criteria

- [ ] Files > 10MB use streaming (configurable threshold)
- [ ] Files < 10MB use buffer mode (no performance regression)
- [ ] Memory usage stays constant for large files
- [ ] Streaming works for S3 and Azure
- [ ] Range requests supported for downloads
- [ ] 100% test coverage for streaming logic

#### Testing Checklist

- [ ] 100MB file upload uses streaming
- [ ] 5MB file upload uses buffer (no regression)
- [ ] Memory usage constant during large file upload
- [ ] Streaming download works correctly
- [ ] Range requests work for partial downloads
- [ ] Error handling works for stream errors
- [ ] S3 multipart upload works
- [ ] Azure chunked upload works

---

### Task 1.4: Connection Pooling & Reuse

**Priority:** Medium  
**Effort:** 1-2 days  
**Owner:** Backend Engineer  
**Dependencies:** None

#### Subtasks

1. **Create `StorageConnectionPool` class**
   - Location: `modules/storage/src/pool/storage-connection-pool.ts`
   - Manage S3 client instances per provider
   - Manage Azure client instances per provider
   - Lazy initialization
   - Proper cleanup on shutdown

2. **Integrate with `CloudUuidStorageService`**
   - Use connection pool instead of creating new clients
   - Reuse clients for all operations
   - Handle client errors (recreate on failure)

3. **Add connection configuration**
   - `connection_timeout` to `storage.yml`
   - `max_connections_per_provider` (default: 10)

4. **Write tests**
   - Unit tests for connection pooling
   - Integration tests for client reuse
   - Error handling tests (client recreation)

#### Acceptance Criteria

- [ ] Clients are reused across operations
- [ ] No client creation overhead for subsequent operations
- [ ] Clients are properly cleaned up on shutdown
- [ ] Failed clients are recreated automatically
- [ ] 100% test coverage for connection pooling

#### Testing Checklist

- [ ] Same client instance reused for multiple operations
- [ ] Client creation only happens once per provider
- [ ] Shutdown cleans up all clients
- [ ] Failed client is recreated on next operation
- [ ] Connection timeout works correctly

---

### Task 1.5: Concurrent Operation Limits

**Priority:** Medium  
**Effort:** 1-2 days  
**Owner:** Backend Engineer  
**Dependencies:** None

#### Subtasks

1. **Install semaphore library**

   ```bash
   pnpm add p-limit
   ```

2. **Create `ConcurrencyLimiter` class**
   - Location: `modules/storage/src/limiter/concurrency-limiter.ts`
   - Use `p-limit` for semaphore pattern
   - Separate limits for upload, download, delete
   - Queue excess operations

3. **Integrate with `CloudUuidStorageService`**
   - Wrap operations with concurrency limiter
   - Respect limits per operation type
   - Log when operations are queued

4. **Add configuration**
   - `max_concurrent_uploads` (default: 5)
   - `max_concurrent_downloads` (default: 10)
   - `max_concurrent_deletes` (default: 10)
   - Add to `storage.yml`

5. **Write tests**
   - Unit tests for concurrency limits
   - Integration tests with concurrent operations
   - Load tests (verify limits are enforced)

#### Acceptance Criteria

- [ ] Concurrent uploads respect limit (5 by default)
- [ ] Concurrent downloads respect limit (10 by default)
- [ ] Concurrent deletes respect limit (10 by default)
- [ ] Excess operations are queued (not rejected)
- [ ] 100% test coverage for concurrency limiting

#### Testing Checklist

- [ ] 10 concurrent uploads: 5 execute, 5 queue
- [ ] 20 concurrent downloads: 10 execute, 10 queue
- [ ] Limits are per operation type (independent)
- [ ] Queued operations execute when slot available
- [ ] No race conditions in limit enforcement

---

## Phase 2: Reliability Improvements (Week 2)

**Goal:** Improve storage operation reliability to > 99.9% success rate.

**Duration:** 5-7 days  
**Dependencies:** Phase 1 (can start in parallel after Phase 1.1)  
**Deliverables:** Retry logic, failover, circuit breaker, health checks,
timeouts

---

### Task 2.1: Retry with Exponential Backoff

**Priority:** High  
**Effort:** 2-3 days  
**Owner:** Backend Engineer

#### Subtasks

1. **Create `RetryManager` class**
   - Location: `modules/storage/src/retry/retry-manager.ts`
   - Implement exponential backoff: 1s, 2s, 4s, 8s, 10s (capped)
   - Retry only on transient errors (network, 5xx, timeouts)
   - Don't retry on 4xx (client errors)
   - Log retry attempts

2. **Create retry utility function**
   - `withRetry<T>(operation, config): Promise<T>`
   - Generic retry wrapper
   - Configurable: `maxAttempts`, `initialDelay`, `maxDelay`,
     `backoffMultiplier`

3. **Integrate with storage operations**
   - Wrap S3 operations with retry
   - Wrap Azure operations with retry
   - Identify retryable errors (network, 5xx, timeouts)

4. **Add configuration**
   - `retry_attempts` (default: 3)
   - `retry_initial_delay` (default: 1000ms)
   - `retry_max_delay` (default: 10000ms)
   - `retry_backoff_multiplier` (default: 2)
   - Add to `storage.yml`

5. **Write tests**
   - Unit tests for retry logic
   - Integration tests with simulated failures
   - Verify exponential backoff timing
   - Verify non-retryable errors are not retried

#### Acceptance Criteria

- [ ] Retries transient errors (network, 5xx, timeouts)
- [ ] Does not retry client errors (4xx)
- [ ] Exponential backoff: 1s, 2s, 4s, 8s, 10s (capped)
- [ ] Retry attempts are logged
- [ ] Configurable retry parameters
- [ ] 100% test coverage for retry logic

#### Testing Checklist

- [ ] Network error is retried 3 times
- [ ] 5xx error is retried 3 times
- [ ] 4xx error is not retried
- [ ] Backoff timing: 1s, 2s, 4s, 8s, 10s
- [ ] Retry attempts are logged
- [ ] Configurable parameters work

---

### Task 2.2: Automatic Failover

**Priority:** High  
**Effort:** 3-4 days  
**Owner:** Backend Engineer  
**Dependencies:** Task 2.1 (retry), Task 2.4 (health checks)

#### Subtasks

1. **Create `StorageFailoverManager` class**
   - Location: `modules/storage/src/failover/storage-failover-manager.ts`
   - Track active provider and failover providers
   - Track provider health
   - Implement failover logic

2. **Implement `executeWithFailover()` method**
   - Try active provider first
   - On failure, try failover providers in order
   - Track provider health (circuit breaker integration)
   - Auto-recovery after health check passes
   - Log failover events

3. **Integrate with `CloudUuidStorageService`**
   - Wrap all operations with failover manager
   - Use failover on persistent failures
   - Update active provider on successful failover

4. **Add configuration**
   - `failover_providers` (array of provider names)
   - `failover_enabled` (default: true)
   - Add to `storage.yml`

5. **Write tests**
   - Unit tests for failover logic
   - Integration tests with multiple providers
   - Failover scenarios (primary fails, failover succeeds)
   - Auto-recovery scenarios

#### Acceptance Criteria

- [ ] Failover to backup provider on primary failure
  - [ ] Tries failover providers in order
  - [ ] Tracks provider health
  - [ ] Auto-recovery when primary recovers
  - [ ] Failover events are logged
  - [ ] Configurable failover providers
  - [ ] 100% test coverage for failover logic

#### Testing Checklist

- [ ] Primary provider failure triggers failover
- [ ] Failover providers tried in order
- [ ] Successful operation on failover provider
- [ ] Primary provider recovery detected
- [ ] Auto-switch back to primary when healthy
- [ ] Failover events are logged
- [ ] All providers fail: returns error

---

### Task 2.3: Circuit Breaker Pattern

**Priority:** Medium  
**Effort:** 2-3 days  
**Owner:** Backend Engineer  
**Dependencies:** Task 2.1 (retry)

#### Subtasks

1. **Create `CircuitBreaker` class**
   - Location: `modules/storage/src/circuit-breaker/circuit-breaker.ts`
   - States: `closed`, `open`, `half-open`
   - Track failures and last failure time
   - Open circuit after N consecutive failures
   - Half-open after timeout
   - Close if next operation succeeds

2. **Integrate with storage operations**
   - One circuit breaker per provider
   - Open circuit on persistent failures
   - Prevent retries when circuit is open
   - Allow single attempt when half-open

3. **Add configuration**
   - `circuit_breaker_enabled` (default: true)
   - `circuit_breaker_failure_threshold` (default: 5)
   - `circuit_breaker_timeout` (default: 60000ms)
   - Add to `storage.yml`

4. **Write tests**
   - Unit tests for circuit breaker states
   - Integration tests with simulated failures
   - State transition tests (closed → open → half-open → closed)
   - Recovery tests

#### Acceptance Criteria

- [ ] Circuit opens after 5 consecutive failures
- [ ] Circuit goes half-open after timeout (60s)
- [ ] Circuit closes if next operation succeeds
- [ ] Circuit prevents retries when open
- [ ] Circuit breaker per provider
- [ ] 100% test coverage for circuit breaker

#### Testing Checklist

- [ ] 5 failures open circuit
- [ ] Circuit open prevents retries
- [ ] Timeout transitions to half-open
- [ ] Success in half-open closes circuit
- [ ] Failure in half-open reopens circuit
- [ ] Circuit breaker per provider (independent)

---

### Task 2.4: Health Checks

**Priority:** Medium  
**Effort:** 2-3 days  
**Owner:** Backend Engineer  
**Dependencies:** None

#### Subtasks

1. **Create `StorageHealthChecker` class**
   - Location: `modules/storage/src/health/storage-health-checker.ts`
   - Test provider health with small file upload/download
   - Track latency and success rate
   - Cache health status (TTL: 5 minutes)

2. **Implement periodic health checks**
   - Run health checks every 5 minutes (configurable)
   - Update provider health status
   - Log health check results

3. **Add health check API endpoint**
   - `GET /api/v1/storage/health` - Check all providers
   - `GET /api/v1/storage/health/:provider` - Check specific provider
   - Location: `modules/api/src/routes/uuid-storage.ts`
   - Return:
     `{ provider: string; healthy: boolean; latency: number; lastCheck: Date }`

4. **Integrate with failover manager**
   - Use health status for failover decisions
   - Mark providers unhealthy on persistent failures
   - Mark providers healthy after successful health check

5. **Add configuration**
   - `health_checks` (default: true)
   - `health_check_interval` (default: 5 minutes)
   - Add to `storage.yml`

6. **Write tests**
   - Unit tests for health checks
   - Integration tests with real providers
   - Health check caching tests
   - Failover integration tests

#### Acceptance Criteria

- [ ] Health checks run periodically (5 minutes)
- [ ] Health check tests with small file operation
- [ ] Health status cached (TTL: 5 minutes)
- [ ] API endpoint returns health status
- [ ] Health status used for failover decisions
- [ ] 100% test coverage for health checks

#### Testing Checklist

- [ ] Health check runs every 5 minutes
- [ ] Health check tests upload/download
- [ ] Health status cached correctly
- [ ] API endpoint returns correct status
- [ ] Unhealthy provider triggers failover
- [ ] Healthy provider allows operations
- [ ] Health check latency tracked

---

### Task 2.5: Timeout Handling

**Priority:** Medium  
**Effort:** 1-2 days  
**Owner:** Backend Engineer  
**Dependencies:** None

#### Subtasks

1. **Create `withTimeout()` utility function**
   - Location: `modules/storage/src/utils/timeout.ts`
   - Use `Promise.race()` with timeout promise
   - Throw `TimeoutError` on timeout
   - Configurable timeout per operation type

2. **Integrate with storage operations**
   - Wrap upload with timeout (default: 5 minutes)
   - Wrap download with timeout (default: 10 minutes)
   - Wrap delete with timeout (default: 30 seconds)
   - Wrap list with timeout (default: 30 seconds)

3. **Add configuration**
   - `upload_timeout` (default: 300000ms)
   - `download_timeout` (default: 600000ms)
   - `delete_timeout` (default: 30000ms)
   - `list_timeout` (default: 30000ms)
   - Add to `storage.yml`

4. **Write tests**
   - Unit tests for timeout handling
   - Integration tests with slow operations
   - Verify timeout errors are thrown
   - Verify operations are cancelled on timeout

#### Acceptance Criteria

- [ ] Upload operations timeout after 5 minutes
- [ ] Download operations timeout after 10 minutes
- [ ] Delete operations timeout after 30 seconds
- [ ] List operations timeout after 30 seconds
- [ ] Timeout errors are thrown correctly
- [ ] Configurable timeout per operation
- [ ] 100% test coverage for timeout handling

#### Testing Checklist

- [ ] Upload timeout after 5 minutes
- [ ] Download timeout after 10 minutes
- [ ] Delete timeout after 30 seconds
- [ ] List timeout after 30 seconds
- [ ] Timeout error thrown correctly
- [ ] Configurable timeouts work
- [ ] Operations cancelled on timeout

---

## Phase 3: Observability & Management (Week 3)

**Goal:** Provide full visibility into storage operations and enable resource
management.

**Duration:** 5-7 days  
**Dependencies:** Phase 1, Phase 2  
**Deliverables:** Metrics, usage reporting, quota enforcement, cleanup,
lifecycle

---

### Task 3.1: Metrics Collection

**Priority:** High  
**Effort:** 3-4 days  
**Owner:** Backend Engineer

#### Subtasks

1. **Create `StorageMetricsCollector` class**
   - Location: `modules/storage/src/metrics/storage-metrics-collector.ts`
   - Track operation counts (total, successful, failed)
   - Track latency (p50, p95, p99)
   - Track storage usage (total files, total size, by folder)
   - Track provider health
   - Track cache performance

2. **Integrate with storage operations**
   - Record operation start/end with timestamps
   - Calculate latency
   - Track success/failure
   - Aggregate by provider, folder, operation type

3. **Add metrics API endpoint**
   - `GET /api/v1/storage/metrics` - Get all metrics
   - Location: `modules/api/src/routes/uuid-storage.ts`
   - Return: `StorageMetrics` interface
   - Optional: Prometheus format export

4. **Add metrics reset endpoint**
   - `POST /api/v1/storage/metrics/reset` - Reset metrics
   - Admin only

5. **Write tests**
   - Unit tests for metrics collection
   - Integration tests with real operations
   - Verify metrics accuracy
   - Verify percentile calculations

#### Acceptance Criteria

- [ ] All operations tracked (upload, download, delete, list)
- [ ] Latency percentiles calculated (p50, p95, p99)
- [ ] Storage usage tracked (files, size, by folder)
- [ ] Provider health tracked
- [ ] Cache performance tracked
- [ ] API endpoint returns metrics
- [ ] 100% test coverage for metrics

#### Testing Checklist

- [ ] Upload operation tracked
- [ ] Download operation tracked
- [ ] Delete operation tracked
- [ ] List operation tracked
- [ ] Latency percentiles calculated correctly
- [ ] Storage usage aggregated correctly
- [ ] Provider health tracked
- [ ] Cache stats tracked
- [ ] API endpoint returns correct data
- [ ] Metrics reset works

---

### Task 3.2: Storage Usage Reporting

**Priority:** Medium  
**Effort:** 2-3 days  
**Owner:** Backend Engineer  
**Dependencies:** Task 3.1 (metrics)

#### Subtasks

1. **Create `StorageUsageReporter` class**
   - Location: `modules/storage/src/reporting/storage-usage-reporter.ts`
   - Aggregate from database (efficient queries)
   - Calculate: total files, total size, by folder, by provider
   - Cache results (TTL: 5 minutes)

2. **Add usage API endpoint**
   - `GET /api/v1/storage/usage` - Get overall usage
   - `GET /api/v1/storage/usage/:folder` - Get folder usage
   - Location: `modules/api/src/routes/uuid-storage.ts`
   - Return: `StorageUsageReport` interface

3. **Add CLI command**
   - `civic storage:usage` - Show storage usage
   - `civic storage:usage --folder <folder>` - Show folder usage
   - Location: `cli/src/commands/storage.ts`

4. **Write tests**
   - Unit tests for usage calculation
   - Integration tests with real data
   - Verify caching works
   - Verify aggregation accuracy

#### Acceptance Criteria

- [ ] Usage report includes total files and size
- [ ] Usage report includes breakdown by folder
- [ ] Usage report includes breakdown by provider
- [ ] Usage report cached (TTL: 5 minutes)
- [ ] API endpoint returns usage
- [ ] CLI command shows usage
- [ ] 100% test coverage for usage reporting

#### Testing Checklist

- [ ] Total files calculated correctly
- [ ] Total size calculated correctly
- [ ] Folder breakdown accurate
- [ ] Provider breakdown accurate
- [ ] Usage cached correctly
- [ ] API endpoint returns correct data
- [ ] CLI command works
- [ ] Cache refresh works

---

### Task 3.3: Quota Enforcement

**Priority:** Medium  
**Effort:** 2-3 days  
**Owner:** Backend Engineer  
**Dependencies:** Task 3.2 (usage reporting)

#### Subtasks

1. **Create `QuotaManager` class**
   - Location: `modules/storage/src/quota/quota-manager.ts`
   - Check quota before upload
   - Track usage per folder
   - Enforce global quota (optional)
   - Return clear error messages

2. **Integrate with upload operations**
   - Check quota before upload
   - Throw `QuotaExceededError` if exceeded
   - Update usage after successful upload

3. **Add quota configuration**
   - Per-folder quotas in `storage.yml`
   - Global quota (optional, 0 = unlimited)
   - `quota_enforcement` (default: true)

4. **Add quota API endpoint**
   - `GET /api/v1/storage/quota/:folder` - Get folder quota
   - Location: `modules/api/src/routes/uuid-storage.ts`

5. **Write tests**
   - Unit tests for quota checking
   - Integration tests with quota limits
   - Verify quota errors are thrown
   - Verify usage tracking

#### Acceptance Criteria

- [ ] Quota checked before upload
- [ ] Quota exceeded throws clear error
- [ ] Per-folder quotas enforced
- [ ] Global quota enforced (if configured)
- [ ] Usage tracked correctly
- [ ] API endpoint returns quota info
- [ ] 100% test coverage for quota

#### Testing Checklist

- [ ] Quota check before upload
- [ ] Quota exceeded throws error
- [ ] Per-folder quota enforced
- [ ] Global quota enforced
- [ ] Usage tracked after upload
- [ ] Quota API returns correct data
- [ ] Quota disabled works (enforcement off)

---

### Task 3.4: Orphaned File Cleanup

**Priority:** Low  
**Effort:** 2-3 days  
**Owner:** Backend Engineer  
**Dependencies:** None

#### Subtasks

1. **Create `OrphanedFileCleaner` class**
   - Location: `modules/storage/src/cleanup/orphaned-file-cleaner.ts`
   - Compare storage files with database records
   - Identify orphaned files (in storage, not in DB)
   - Identify orphaned records (in DB, not in storage)
   - Generate cleanup report

2. **Implement cleanup operations**
   - Delete orphaned files from storage
   - Delete orphaned records from database
   - Dry-run mode (report only, no deletion)
   - Safe deletion with confirmation

3. **Add CLI command**
   - `civic storage:cleanup --dry-run` - Find orphaned files
   - `civic storage:cleanup --apply` - Clean up orphaned files
   - Location: `cli/src/commands/storage.ts`

4. **Add cleanup API endpoint**
   - `GET /api/v1/storage/cleanup` - Get orphaned file report
   - `POST /api/v1/storage/cleanup` - Clean up orphaned files
   - Location: `modules/api/src/routes/uuid-storage.ts`
   - Admin only

5. **Write tests**
   - Unit tests for orphan detection
   - Integration tests with orphaned files
   - Verify dry-run works
   - Verify cleanup works

#### Acceptance Criteria

- [ ] Orphaned files detected (in storage, not in DB)
- [ ] Orphaned records detected (in DB, not in storage)
- [ ] Cleanup report generated
- [ ] Dry-run mode works (no deletion)
- [ ] Cleanup deletes orphaned files
- [ ] CLI command works
- [ ] API endpoint works
- [ ] 100% test coverage for cleanup

#### Testing Checklist

- [ ] Orphaned files detected
- [ ] Orphaned records detected
- [ ] Cleanup report accurate
- [ ] Dry-run doesn't delete
- [ ] Cleanup deletes orphaned files
- [ ] CLI command works
- [ ] API endpoint works
- [ ] Admin-only access enforced

---

### Task 3.5: Lifecycle Management

**Priority:** Low  
**Effort:** 3-4 days  
**Owner:** Backend Engineer  
**Dependencies:** Task 3.2 (usage reporting)

#### Subtasks

1. **Create `LifecycleManager` class**
   - Location: `modules/storage/src/lifecycle/lifecycle-manager.ts`
   - Apply lifecycle policies per folder
   - Actions: delete, archive, warn
   - Scheduled daily check

2. **Implement lifecycle policies**
   - Per-folder policies (from config)
   - Max age in days
   - Action: delete, archive, warn
   - Enabled/disabled per folder

3. **Implement archive functionality**
   - Archive to separate folder (optional)
   - Preserve metadata
   - Update database records

4. **Add lifecycle configuration**
   - Per-folder policies in `storage.yml`
   - `lifecycle_enabled` (default: true)
   - `lifecycle_check_interval` (default: 24 hours)

5. **Add CLI command**
   - `civic storage:lifecycle --check` - Check lifecycle policies
   - `civic storage:lifecycle --apply` - Apply lifecycle policies
   - Location: `cli/src/commands/storage.ts`

6. **Schedule lifecycle checks**
   - Run daily (configurable interval)
   - Log lifecycle actions
   - Send warnings before deletion (if configured)

7. **Write tests**
   - Unit tests for lifecycle policies
   - Integration tests with old files
   - Verify deletion works
   - Verify archiving works
   - Verify warnings work

#### Acceptance Criteria

- [ ] Lifecycle policies applied per folder
- [ ] Old files deleted (if policy says delete)
- [ ] Old files archived (if policy says archive)
- [ ] Warnings sent before deletion (if configured)
- [ ] Daily scheduled checks work
- [ ] CLI command works
- [ ] 100% test coverage for lifecycle

#### Testing Checklist

- [ ] Lifecycle policy applied
- [ ] Old files deleted
- [ ] Old files archived
- [ ] Warnings sent
- [ ] Daily check runs
- [ ] CLI command works
- [ ] Lifecycle disabled works

---

## Phase 4: Error Handling Improvements (Throughout)

**Goal:** Improve error handling for better debugging and user experience.

**Duration:** 2-3 days (parallel with other phases)  
**Dependencies:** None  
**Deliverables:** Structured error types, partial failure handling

---

### Task 4.1: Structured Error Types

**Priority:** Medium  
**Effort:** 1-2 days  
**Owner:** Backend Engineer  
**Dependencies:** None

#### Subtasks

1. **Create error classes**
   - Location: `modules/storage/src/errors/storage-errors.ts`
   - `StorageError` (base class)
   - `QuotaExceededError`
   - `ProviderUnavailableError`
   - `TimeoutError`
   - `ValidationError`
   - `OrphanedFileError`

2. **Update error handling**
   - Replace generic errors with specific types
   - Include context (provider, operation, quota, etc.)
   - Mark retryable vs non-retryable

3. **Update API error responses**
   - Return structured error format
   - Include error code and context
   - Location: `modules/api/src/routes/uuid-storage.ts`

4. **Write tests**
   - Unit tests for error types
   - Integration tests with error scenarios
   - Verify error context is included

#### Acceptance Criteria

- [ ] Specific error classes for each failure type
- [ ] Error context included (provider, operation, etc.)
- [ ] Retryable vs non-retryable marked
- [ ] API returns structured errors
- [ ] 100% test coverage for errors

#### Testing Checklist

- [ ] Quota error thrown correctly
- [ ] Provider error thrown correctly
- [ ] Timeout error thrown correctly
- [ ] Error context included
- [ ] Retryable marked correctly
- [ ] API returns structured errors

---

### Task 4.2: Partial Failure Handling

**Priority:** Medium  
**Effort:** 1 day  
**Owner:** Backend Engineer  
**Dependencies:** Task 1.2 (batch operations)

#### Subtasks

1. **Enhance batch operations**
   - Already implemented in Task 1.2
   - Ensure robust error handling
   - Collect all errors
   - Return partial results

2. **Add error aggregation**
   - Group errors by type
   - Provide summary statistics
   - Include detailed error list

3. **Write tests**
   - Verify partial failures handled correctly
   - Verify error aggregation works

#### Acceptance Criteria

- [ ] Batch operations continue on individual failures
- [ ] All errors collected
- [ ] Partial results returned
- [ ] Error aggregation works
- [ ] 100% test coverage

#### Testing Checklist

- [ ] Batch upload with 1 failure returns partial success
- [ ] Batch delete with 1 failure returns partial success
- [ ] All errors collected
- [ ] Error aggregation accurate

---

## Testing Strategy

### Unit Tests

- **Coverage Target:** 100% for new code
- **Focus:** Individual components, error scenarios, edge cases
- **Tools:** Vitest (existing test framework)

### Integration Tests

- **Coverage Target:** All critical paths
- **Focus:** End-to-end operations, failover, batch operations
- **Tools:** Vitest with test database and storage

### Performance Tests

- **Coverage Target:** All performance-critical operations
- **Focus:** Cache hit rates, batch throughput, large file streaming,
  concurrency limits
- **Tools:** Vitest with performance benchmarks

### Load Tests

- **Coverage Target:** High concurrency scenarios
- **Focus:** Concurrent uploads, large files, failover under load
- **Tools:** Artillery or k6 (optional, for production validation)

---

## Documentation Updates

### 1. Storage Guide (`docs/uuid-storage-system.md`)

- Add performance tuning section
- Add failover configuration
- Add metrics endpoint documentation
- Add quota configuration
- Add lifecycle policies

### 2. API Documentation (`docs/api.md`)

- Document new endpoints:
  - `/api/v1/storage/health`
  - `/api/v1/storage/metrics`
  - `/api/v1/storage/usage`
  - `/api/v1/storage/quota/:folder`
  - `/api/v1/storage/cleanup`
  - `/api/v1/storage/files/batch`
- Document batch operations
- Document error codes

### 3. CLI Documentation (`docs/cli.md`)

- Document new commands:
  - `civic storage:usage`
  - `civic storage:cleanup`
  - `civic storage:lifecycle`
- Document configuration options

### 4. Configuration Guide

- Update `docs/configuration-architecture.md`
- Document all new storage configuration options
- Provide configuration examples

---

## Risk Assessment & Mitigation

### Low Risk

- **Metadata caching**: Well-understood pattern, low complexity
- **Batch operations**: Straightforward implementation
- **Metrics collection**: Non-invasive, additive

### Medium Risk

- **Failover logic**: Complex state management, needs thorough testing
- **Circuit breaker**: Complex state transitions, needs careful implementation
- **Lifecycle management**: Data loss risk if misconfigured

### Mitigation Strategies

1. **Comprehensive testing**: Unit, integration, and performance tests
2. **Feature flags**: Gradual rollout for high-risk features
3. **Dry-run modes**: Safe testing for destructive operations
4. **Clear documentation**: Warnings and best practices
5. **Monitoring**: Track metrics and errors in production

---

## Success Criteria

### Performance

- [ ] List operations: < 50ms (cached), < 500ms (uncached)
- [ ] Upload latency: p95 < 2s (small files), p95 < 30s (large files)
- [ ] Batch operations: 5-10x faster than sequential
- [ ] Memory usage: Constant for large files (streaming)

### Reliability

- [ ] Success rate: > 99.9% (with retries)
- [ ] Failover time: < 5 seconds
- [ ] Zero data loss on failover
- [ ] Circuit breaker prevents cascading failures

### Observability

- [ ] 100% operation metrics coverage
- [ ] Real-time health status
- [ ] Storage usage visibility
- [ ] Quota enforcement working

### Code Quality

- [ ] 100% test coverage for new code
- [ ] All tests passing
- [ ] No performance regressions
- [ ] Documentation complete

---

## Timeline

### Week 1: Performance (5-7 days)

- Day 1-3: Metadata caching (Task 1.1)
- Day 1-4: Batch operations (Task 1.2) - parallel with 1.1
- Day 2-6: Streaming (Task 1.3)
- Day 4-5: Connection pooling (Task 1.4)
- Day 5-6: Concurrency limits (Task 1.5)

### Week 2: Reliability (5-7 days)

- Day 1-3: Retry logic (Task 2.1)
- Day 2-5: Failover (Task 2.2) - depends on 2.1, 2.4
- Day 3-5: Circuit breaker (Task 2.3) - depends on 2.1
- Day 1-3: Health checks (Task 2.4) - parallel with 2.1
- Day 4-5: Timeouts (Task 2.5)

### Week 3: Observability & Management (5-7 days)

- Day 1-4: Metrics (Task 3.1)
- Day 2-4: Usage reporting (Task 3.2) - depends on 3.1
- Day 3-5: Quota enforcement (Task 3.3) - depends on 3.2
- Day 4-6: Cleanup (Task 3.4)
- Day 5-8: Lifecycle (Task 3.5) - depends on 3.2

### Throughout: Error Handling (2-3 days)

- Day 1-2: Structured errors (Task 4.1) - parallel with other phases
- Day 1: Partial failures (Task 4.2) - part of Task 1.2

**Total:** 15-20 days (3-4 weeks with buffer)

---

## Dependencies

### External Dependencies

- `node-cache` - LRU cache library
- `p-limit` - Concurrency limiting
- (No new dependencies for streaming, retry, failover - use existing patterns)

### Internal Dependencies

- Database service (existing)
- Logger (existing)
- Configuration system (existing)

---

## Rollout Plan

### Phase 1: Performance (Week 1)

1. Deploy caching (low risk)
2. Deploy batch operations (medium risk)
3. Deploy streaming (medium risk)
4. Deploy connection pooling (low risk)
5. Deploy concurrency limits (low risk)

### Phase 2: Reliability (Week 2)

1. Deploy retry logic (low risk)
2. Deploy health checks (low risk)
3. Deploy timeouts (low risk)
4. Deploy circuit breaker (medium risk)
5. Deploy failover (high risk - test thoroughly)

### Phase 3: Observability (Week 3)

1. Deploy metrics (low risk)
2. Deploy usage reporting (low risk)
3. Deploy quota enforcement (medium risk - test with limits)
4. Deploy cleanup (low risk - dry-run first)
5. Deploy lifecycle (medium risk - test with old files)

---

## Monitoring & Validation

### Key Metrics to Track

- Operation success rates (should improve with retries)
- Operation latency (should improve with caching)
- Cache hit rates (target: > 80%)
- Failover events (should be rare)
- Storage usage (for quota enforcement)
- Error rates (should decrease)

### Validation Checklist

- [ ] All tests passing
- [ ] No performance regressions
- [ ] Metrics collection working
- [ ] Health checks working
- [ ] Failover tested and working
- [ ] Quota enforcement tested
- [ ] Documentation updated
- [ ] Production monitoring in place

---

## Conclusion

This implementation plan provides a clear, actionable roadmap for enhancing the
storage abstraction layer. Each phase builds on the previous one, with clear
acceptance criteria and testing strategies. The plan is designed to be flexible,
allowing for parallel work where possible while maintaining clear dependencies.

**Next Steps:**

1. Review and approve this plan
2. Assign tasks to team members
3. Set up project tracking (GitHub issues, Jira, etc.)
4. Begin Phase 1 implementation
