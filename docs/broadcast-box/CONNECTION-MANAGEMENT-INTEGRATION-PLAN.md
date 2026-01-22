# Connection Management Integration Plan

**Last Updated**: 2026-01-16  
**Status**: Draft  
**Purpose**: Multi-layered approach to handle multiple device connections
gracefully while maintaining reliability and observability

---

## Executive Summary

This plan implements a **Resilient Multi-Connection Handling** strategy to
address the issue of multiple WebSocket connections for the same device UUID.
Unlike aggressive connection displacement (which violates best practices), this
approach prioritizes:

1. **Resilience**: System works even with multiple connections
2. **Observability**: Logging and metrics expose issues without hiding them
3. **Graceful Degradation**: Handles edge cases without breaking functionality
4. **Root Cause Resolution**: Device-side documentation prevents issues at
   source

---

## Implementation Phases

### Phase 1: Immediate (Priority: Critical)

**Goal**: Implement connection quality tracking, enhanced observability, and
command delivery resilience

**Estimated Effort**: 2-3 days  
**Risk Level**: Low (additive changes, no breaking changes)

#### Task 1.1: Connection Metadata Tracking

**Files to Modify**:

- `modules/realtime/src/realtime-server.ts`
- `modules/realtime/src/types/realtime.types.ts`

**Implementation Steps**:

1. **Extend connection tracking data structure**:
   - Add new Map:
     `deviceConnectionMetadata: Map<string, DeviceConnectionMetadata>`
   - Create interface `DeviceConnectionMetadata`:

     ```typescript
     interface DeviceConnectionMetadata {
       clientId: string;
       deviceUuid: string;
       deviceId: string;
       connectedAt: number;        // Timestamp when connection was established
       lastMessageAt: number;      // Timestamp of last message from device
       lastMessageFromServer: number; // Timestamp of last message sent to device
       messageCount: number;       // Total messages received from device
       connectionScore: number;    // Calculated quality score (higher = better)
     }
     ```

2. **Update `trackDeviceConnection()` method**:
   - Initialize metadata when connection is established
   - Set `connectedAt = Date.now()`
   - Set `lastMessageAt = Date.now()`
   - Set `messageCount = 0`
   - Calculate initial `connectionScore` (based on recency)

3. **Update message handlers**:
   - On device message received: Update `lastMessageAt` and increment
     `messageCount`
   - On command sent to device: Update `lastMessageFromServer`
   - Recalculate `connectionScore` after each update

4. **Connection scoring algorithm**:

   ```typescript
   function calculateConnectionScore(metadata: DeviceConnectionMetadata): number {
     const now = Date.now();
     const ageMs = now - metadata.connectedAt;
     const activityMs = now - metadata.lastMessageAt;

     // Recent connections score higher (decay over 10 minutes)
     const recencyScore = Math.max(0, 1 - (ageMs / 600000));

     // Active connections score higher (decay over 5 minutes)
     const activityScore = Math.max(0, 1 - (activityMs / 300000));

     // Connections with more messages score slightly higher (log scale)
     const volumeScore = Math.min(1, Math.log10(metadata.messageCount + 1) / 2);

     // Weighted combination
     return (recencyScore * 0.4) + (activityScore * 0.4) + (volumeScore * 0.2);
   }
   ```

**Testing Requirements**:

- Unit test: Connection metadata creation on connect
- Unit test: Metadata updates on message receive
- Unit test: Scoring algorithm correctness
- Integration test: Multiple connections with different activity levels

**Success Criteria**:

- All device connections have metadata tracked
- Metadata updates correctly on message events
- Connection scores reflect connection quality accurately

---

#### Task 1.2: Connection Quality Prioritization in `sendToDevice()`

**Files to Modify**:

- `modules/broadcast-box/src/rooms/device-room.ts`

**Implementation Steps**:

1. **Enhance `sendToDevice()` method**:
   - Retrieve connection metadata for all matching OPEN connections
   - Sort connections by `connectionScore` (descending)
   - Use highest-scored connection for primary send attempt
   - Store remaining connections as fallback candidates

2. **Update connection selection logic** (replace lines 254-276):

   ```typescript
   // Sort OPEN connections by quality score (highest first)
   const scoredConnections = openConnections.map(conn => {
     const metadata = this.getConnectionMetadata(conn.clientId);
     return {
       ...conn,
       metadata,
       score: metadata ? this.calculateConnectionScore(metadata) : 0,
     };
   }).sort((a, b) => b.score - a.score);

   // Use highest-scored connection
   const primaryConnection = scoredConnections[0];
   const fallbackConnections = scoredConnections.slice(1);
   ```

3. **Add metadata access method**:
   - Add method to `DeviceRoom` to access `deviceConnectionMetadata` from
     realtime server
   - Method signature:
     `getConnectionMetadata(clientId: string): DeviceConnectionMetadata | undefined`

**Testing Requirements**:

- Unit test: Connection sorting by score
- Integration test: Command sent to highest-scored connection when multiple
  exist
- Integration test: Older inactive connection deprioritized correctly

**Success Criteria**:

- Commands always sent to the most recent/active connection
- Multiple connections logged with their scores
- Connection selection is deterministic

---

#### Task 1.3: Enhanced Observability and Logging

**Files to Modify**:

- `modules/broadcast-box/src/rooms/device-room.ts`
- `modules/realtime/src/realtime-server.ts`

**Implementation Steps**:

1. **Enhance existing multiple-connection warning**:
   - Include connection metadata in warning logs
   - Log connection scores, ages, and activity levels
   - Add structured log entry with operation:
     `broadcast-box:device-room:multiple-connections-detected`

2. **Add connection metrics logging**:
   - Log when connection metadata is created/updated
   - Track connection count per device over time
   - Log connection quality scores periodically (debug level)

3. **Update `handleDeviceConnection()`**:
   - Log existing connections for the same `deviceUuid` when new connection
     arrives
   - Include count, clientIds, and ages of existing connections
   - Operation: `realtime:server:device-connection:duplicate-detected`

**Example Log Output**:

```json
{
  "operation": "broadcast-box:device-room:multiple-connections-detected",
  "deviceUuid": "75fa2989-39dc-4d1d-bc9f-d3c0503ff6df",
  "totalOpenConnections": 3,
  "connections": [
    {
      "clientId": "client_xxx",
      "connectedAt": 1768593838335,
      "ageMinutes": 2.5,
      "lastMessageAt": 1768593950000,
      "messageCount": 15,
      "score": 0.95,
      "selected": true
    },
    {
      "clientId": "client_yyy",
      "connectedAt": 1768593500000,
      "ageMinutes": 10.2,
      "lastMessageAt": 1768593800000,
      "messageCount": 8,
      "score": 0.72,
      "selected": false
    }
  ]
}
```

**Testing Requirements**:

- Verify logs include all required metadata
- Verify structured logs are searchable/queryable
- Integration test: Multiple connections scenario produces expected logs

**Success Criteria**:

- All multiple-connection scenarios are logged with full context
- Logs are structured and searchable
- Operations team can diagnose connection issues from logs

---

#### Task 1.4: Command Delivery Resilience (Fallback)

**Files to Modify**:

- `modules/broadcast-box/src/rooms/device-room.ts`

**Implementation Steps**:

1. **Enhance `sendToDevice()` error handling**:
   - If primary connection send fails, automatically try fallback connections
   - Try connections in order of score (highest to lowest)
   - Only fail if all connections fail
   - Log each attempt with result

2. **Update try/catch block** (lines 278-351):

   ```typescript
   let lastError: Error | null = null;
   let attemptCount = 0;

   for (const connection of scoredConnections) {
     attemptCount++;
     try {
       const messageJson = JSON.stringify(message);

       // Log attempt
       coreInfo('Attempting to send command to connection', {
         operation: 'broadcast-box:device-room:command-send-attempt',
         deviceUuid: this.deviceId,
         clientId: connection.clientId,
         attempt: attemptCount,
         totalAttempts: scoredConnections.length,
         connectionScore: connection.score,
       });

       connection.ws.send(messageJson);

       // Success - log and return
       coreInfo('Command sent successfully', {
         operation: 'broadcast-box:device-room:command-sent',
         deviceUuid: this.deviceId,
         clientId: connection.clientId,
         attempt: attemptCount,
         connectionScore: connection.score,
       });

       return true;
     } catch (error) {
       lastError = error instanceof Error ? error : new Error(String(error));

       coreWarn('Command send attempt failed, trying next connection', {
         operation: 'broadcast-box:device-room:command-send-attempt-failed',
         deviceUuid: this.deviceId,
         clientId: connection.clientId,
         attempt: attemptCount,
         error: lastError.message,
       });

       // Continue to next connection
     }
   }

   // All attempts failed
   coreError('All connection attempts failed', {
     operation: 'broadcast-box:device-room:command-send-all-failed',
     deviceUuid: this.deviceId,
     totalAttempts: attemptCount,
     lastError: lastError?.message,
   });

   return false;
   ```

3. **Track successful connection**:
   - When a fallback connection succeeds, log which connection index was used
   - This helps identify if primary connection is consistently failing

**Testing Requirements**:

- Unit test: Primary connection failure triggers fallback
- Unit test: Fallback succeeds if secondary connection works
- Integration test: All connections fail scenario handled gracefully
- Integration test: Fallback connection selection works correctly

**Success Criteria**:

- Commands are delivered if ANY connection is available
- All send attempts are logged
- System gracefully handles partial connection failures

---

### Phase 1 Summary

**Deliverables**:

- Connection metadata tracking system
- Quality-based connection prioritization
- Enhanced observability (logs + structured data)
- Resilient command delivery with fallback

**Rollback Plan**:

- All changes are additive (no breaking changes)
- Can disable new features via feature flag if needed
- Revert commits if critical issues arise

**Monitoring**:

- Track: Connection count per device over time
- Alert: Multiple connections detected (threshold: > 1 connection)
- Dashboard: Connection quality scores distribution

---

## Phase 2: Short-Term (Priority: High)

**Goal**: Document device-side requirements and implement graceful stale
connection cleanup

**Estimated Effort**: 1-2 days  
**Risk Level**: Low-Medium (background cleanup job has minimal impact)

---

#### Task 2.1: Device-Side Connection Lifecycle Documentation

**Files to Modify**:

- `docs/broadcast-box/DEVICE-TROUBLESHOOTING.md`

**Implementation Steps**:

1. **Add new section: "Connection Lifecycle Management"**:
   - Requirement: Close old connection before creating new one
   - Detection: How to detect if multiple connections exist
   - Best practices: Proper WebSocket cleanup
   - Error handling: What to do if connection is rejected

2. **Add example code**:

   ```javascript
   // Example: Proper connection lifecycle management
   class DeviceConnection {
     constructor(deviceUuid, token, serverUrl) {
       this.deviceUuid = deviceUuid;
       this.token = token;
       this.serverUrl = serverUrl;
       this.ws = null;
       this.reconnectAttempts = 0;
       this.maxReconnectAttempts = 5;
     }

     connect() {
       // CRITICAL: Close existing connection before creating new one
       if (this.ws && this.ws.readyState === WebSocket.OPEN) {
         console.log('[Device] Closing existing connection before reconnecting');
         this.ws.close(1000, 'Reconnecting');
         this.ws = null;
       }

       // Wait a brief moment for cleanup
       setTimeout(() => {
         this._doConnect();
       }, 100);
     }

     _doConnect() {
       const url = `${this.serverUrl}/realtime/devices/${this.deviceUuid}?token=${this.token}`;
       this.ws = new WebSocket(url);

       this.ws.onopen = () => {
         console.log('[Device] Connected');
         this.reconnectAttempts = 0;
       };

       this.ws.onclose = (event) => {
         console.log('[Device] Disconnected:', event.code, event.reason);
         // Implement reconnection logic if needed
         if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
           this.reconnectAttempts++;
           setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
         }
       };

       this.ws.onerror = (error) => {
         console.error('[Device] WebSocket error:', error);
       };
     }

     disconnect() {
       if (this.ws) {
         this.ws.close(1000, 'Device disconnecting');
         this.ws = null;
       }
     }
   }
   ```

3. **Add troubleshooting section**:
   - Symptom: "Server logs show multiple connections for my device"
   - Check: Device code for connection cleanup
   - Fix: Ensure old connection is closed before new one

**Testing Requirements**:

- Documentation review by device developers
- Code examples tested for correctness
- Examples work with actual CivicPress server

**Success Criteria**:

- Device developers can follow documentation to implement proper lifecycle
- Examples are clear and copy-paste ready
- Documentation prevents root cause issues

---

#### Task 2.2: Graceful Stale Connection Cleanup

**Files to Modify**:

- `modules/realtime/src/realtime-server.ts`
- `modules/realtime/src/types/realtime.types.ts`

**Implementation Steps**:

1. **Add configuration**:
   - Extend `RealtimeConfig` interface:

     ```typescript
     interface RealtimeConfig {
       // ... existing fields
       connection_cleanup?: {
         enabled: boolean;
         check_interval: number;  // seconds, default: 60
         stale_threshold: number; // seconds, default: 600 (10 minutes)
       };
     }
     ```

2. **Add cleanup job**:
   - Create method: `startConnectionCleanupJob()`
   - Run on interval (configurable, default: 60 seconds)
   - Check all device connections for staleness

3. **Staleness detection logic**:

   ```typescript
   private checkStaleConnections(): void {
     const now = Date.now();
     const staleThreshold = this.realtimeConfig?.connection_cleanup?.stale_threshold || 600000; // 10 minutes

     const staleConnections: Array<{ clientId: string; deviceUuid: string; age: number }> = [];

     for (const [clientId, metadata] of this.deviceConnectionMetadata.entries()) {
       const lastActivity = Math.max(metadata.lastMessageAt, metadata.lastMessageFromServer);
       const inactivityMs = now - lastActivity;

       // Connection is stale if:
       // 1. No activity for threshold period
       // 2. Connection is still OPEN (hasn't closed naturally)
       const ws = this.connections.get(clientId);
       if (ws && ws.readyState === 1 && inactivityMs > staleThreshold) {
         staleConnections.push({
           clientId,
           deviceUuid: metadata.deviceUuid,
           age: inactivityMs,
         });
       }
     }

     // Close stale connections gracefully
     for (const stale of staleConnections) {
       const ws = this.connections.get(stale.clientId);
       if (ws && ws.readyState === 1) {
         coreInfo('Closing stale connection', {
           operation: 'realtime:server:connection-cleanup:close-stale',
           clientId: stale.clientId,
           deviceUuid: stale.deviceUuid,
           inactivityMinutes: Math.round(stale.age / 60000),
         });

         // Send close frame with reason
         ws.close(1001, 'Connection inactive'); // 1001 = going away

         // Cleanup will happen in handleDeviceDisconnect()
       }
     }
   }
   ```

4. **Start cleanup job**:
   - Call `startConnectionCleanupJob()` in `initialize()` method
   - Store interval handle for cleanup on shutdown

5. **Add shutdown cleanup**:
   - Clear interval on server shutdown
   - Ensure all connections are tracked properly

**Testing Requirements**:

- Unit test: Staleness detection logic
- Unit test: Stale connections are closed correctly
- Integration test: Cleanup job runs on interval
- Integration test: Active connections are not closed
- Integration test: Cleanup respects configuration

**Success Criteria**:

- Stale connections are cleaned up automatically
- Active connections are never closed
- Cleanup is configurable and can be disabled
- Logs clearly indicate when connections are closed for inactivity

---

### Phase 2 Summary

**Deliverables**:

- Complete device-side documentation
- Automatic stale connection cleanup
- Configurable cleanup thresholds

**Rollback Plan**:

- Documentation: Non-breaking, can revert
- Cleanup job: Can be disabled via config immediately
- Feature can be removed if issues arise

**Monitoring**:

- Track: Number of connections closed by cleanup job
- Alert: Cleanup job not running
- Dashboard: Stale connection count over time

---

## Phase 3: Optional (Priority: Medium)

**Goal**: Add connection limit enforcement with clear error messages

**Estimated Effort**: 1 day  
**Risk Level**: Medium (may block legitimate reconnections)

**Note**: Only implement if Phase 1-2 don't resolve the issue. Review metrics
after Phase 1-2 for 1-2 weeks before deciding.

---

#### Task 3.1: Connection Limit Per Device

**Files to Modify**:

- `modules/realtime/src/realtime-server.ts`
- `modules/realtime/src/types/realtime.types.ts`
- `modules/realtime/src/realtime-config-manager.ts`

**Implementation Steps**:

1. **Add configuration**:

   ```typescript
   interface RealtimeConfig {
     // ... existing fields
     rate_limiting: {
       messages_per_second: number;
       connections_per_ip: number;
       connections_per_user: number;
       connections_per_device?: number; // NEW, default: 1
     };
   }
   ```

2. **Update `handleDeviceConnection()`**:
   - Check existing connections for device before accepting new one
   - If limit exceeded, reject with HTTP 409 (Conflict)
   - Include clear error message in close reason

3. **Error handling**:

   ```typescript
   // Before accepting connection (after authentication, before tracking)
   const existingConnections = this.getDeviceConnections(deviceAuth.deviceUuid);
   const connectionLimit = this.realtimeConfig?.rate_limiting?.connections_per_device || 1;

   if (existingConnections.filter(c => {
     const ws = this.connections.get(c.clientId);
     return ws && ws.readyState === 1;
   }).length >= connectionLimit) {
     coreWarn('Device connection rejected: limit exceeded', {
       operation: 'realtime:server:device-connection:limit-exceeded',
       deviceUuid: deviceAuth.deviceUuid,
       existingConnections: existingConnections.length,
       limit: connectionLimit,
     });

     // Send error and close
     ws.send(JSON.stringify({
       type: 'error',
       code: 'CONNECTION_LIMIT_EXCEEDED',
       message: `Device connection limit exceeded: ${connectionLimit}. Close existing connection before reconnecting.`,
     }));

     ws.close(1008, 'Connection limit exceeded'); // 1008 = policy violation
     return;
   }
   ```

4. **Helper method**:

   ```typescript
   private getDeviceConnections(deviceUuid: string): Array<{ clientId: string; metadata: DeviceConnectionMetadata }> {
     const connections: Array<{ clientId: string; metadata: DeviceConnectionMetadata }> = [];

     for (const [clientId, metadata] of this.deviceConnectionMetadata.entries()) {
       if (metadata.deviceUuid === deviceUuid) {
         connections.push({ clientId, metadata });
       }
     }

     return connections;
   }
   ```

**Testing Requirements**:

- Unit test: Connection limit enforcement
- Unit test: Limit can be configured
- Integration test: New connection rejected when limit reached
- Integration test: Old connection closed allows new connection
- Integration test: Limit of 1 works correctly

**Success Criteria**:

- Connections are rejected when limit is exceeded
- Error message is clear and actionable
- Configuration is respected
- System degrades gracefully

**Considerations**:

- **Default limit**: Should be 1 or higher? Recommendation: Start with 2-3 to
  allow legitimate reconnections during network issues
- **Error message**: Must be clear that device should close old connection
- **Monitoring**: Track rejection rate to understand impact

---

### Phase 3 Summary

**Deliverables**:

- Configurable connection limit per device
- Clear error messages when limit exceeded
- Graceful rejection handling

**Rollback Plan**:

- Can increase limit to very high number to effectively disable
- Can remove limit check entirely
- Feature is optional and only if needed

**Monitoring**:

- Track: Connection rejection rate
- Alert: High rejection rate (may indicate device-side issues)
- Dashboard: Rejections by device over time

---

## Testing Strategy

### Unit Tests

**Files to Create/Modify**:

- `modules/realtime/src/__tests__/connection-metadata.test.ts` (new)
- `modules/realtime/src/__tests__/connection-cleanup.test.ts` (new)
- `modules/broadcast-box/src/rooms/__tests__/device-room-connection-selection.test.ts`
  (new)
- `modules/realtime/src/__tests__/connection-limit.test.ts` (new)

**Coverage Requirements**:

- Connection metadata creation and updates
- Connection scoring algorithm
- Staleness detection logic
- Connection limit enforcement
- Command delivery fallback logic

### Integration Tests

**Scenarios to Test**:

1. Multiple connections created by device → Command delivered to best connection
2. Primary connection fails → Fallback connection used
3. Stale connection detected → Automatically closed
4. Connection limit reached → New connection rejected with clear error
5. Device closes old connection → New connection accepted

### Load Testing

**Scenarios**:

- 100 devices with multiple connections each
- Rapid reconnection scenarios
- Connection cleanup job performance

---

## Rollout Plan

### Week 1: Phase 1 Implementation

- Days 1-2: Task 1.1 (Connection Metadata)
- Days 2-3: Task 1.2 (Prioritization)
- Day 3: Task 1.3 (Observability)
- Day 4: Task 1.4 (Resilience)
- Day 5: Testing and bug fixes

### Week 2: Phase 1 Deployment + Phase 2 Start

- Deploy Phase 1 to staging
- Monitor for 2-3 days
- Start Phase 2 (documentation)
- Begin Phase 2 (cleanup job)

### Week 3: Phase 2 Completion + Monitoring

- Complete Phase 2
- Deploy to staging
- Monitor for 1 week
- Collect metrics

### Week 4: Decision Point

- Review metrics from Phase 1-2
- Decide if Phase 3 is needed
- If yes, implement Phase 3
- If no, mark as complete

---

## Success Metrics

### Phase 1 Success Criteria

- ✅ Commands delivered to most active connection (100% of time)
- ✅ Multiple connections detected and logged (within 1 second)
- ✅ Fallback works when primary connection fails
- ✅ Zero command loss due to connection selection

### Phase 2 Success Criteria

- ✅ Stale connections cleaned up within 10 minutes
- ✅ Active connections never closed incorrectly
- ✅ Device documentation prevents new issues (tracked via support tickets)

### Phase 3 Success Criteria (if implemented)

- ✅ Connection rejections logged with clear reasons
- ✅ Device developers can resolve rejections using error messages
- ✅ Connection count per device stays at or below limit

---

## Monitoring & Alerts

### Key Metrics to Track

1. **Connection Count per Device**:
   - Current value
   - Distribution histogram
   - P95, P99 values

2. **Connection Quality Scores**:
   - Average score
   - Distribution
   - Correlation with command delivery success

3. **Command Delivery Success Rate**:
   - Primary connection success rate
   - Fallback usage rate
   - Overall success rate

4. **Stale Connection Cleanup**:
   - Connections closed per hour
   - Average staleness before cleanup
   - Cleanup job execution time

5. **Connection Rejections** (if Phase 3):
   - Rejection rate
   - Top devices by rejection count
   - Rejection reasons

### Alerts to Configure

1. **Multiple Connections Alert** (Warning):
   - Condition: Device has > 1 OPEN connection
   - Threshold: Any occurrence (informational)
   - Action: Log and notify (don't page)

2. **High Connection Count Alert** (Warning):
   - Condition: Device has > 3 OPEN connections
   - Threshold: 1 occurrence
   - Action: Investigate device-side code

3. **Command Delivery Failure Alert** (Critical):
   - Condition: Command delivery failure rate > 5%
   - Threshold: 5 minutes
   - Action: Page on-call engineer

4. **Cleanup Job Failure Alert** (Warning):
   - Condition: Cleanup job hasn't run in 5 minutes
   - Threshold: 1 occurrence
   - Action: Log and investigate

---

## Risk Assessment

### Low Risk Items

- ✅ Connection metadata tracking (additive)
- ✅ Enhanced logging (additive)
- ✅ Documentation updates (non-breaking)

### Medium Risk Items

- ⚠️ Connection cleanup job (may close legitimate connections if threshold too
  low)
- ⚠️ Connection limit enforcement (may block legitimate reconnections)

### Mitigation Strategies

1. **Connection Cleanup**:
   - Start with conservative threshold (10 minutes)
   - Monitor false positive rate
   - Adjust threshold based on metrics

2. **Connection Limit**:
   - Start with limit of 2-3 (not 1)
   - Monitor rejection rate
   - Provide clear error messages
   - Make limit configurable per device if needed

3. **Rollback Plan**:
   - Each phase can be independently disabled
   - Feature flags available for gradual rollout
   - Can revert to previous behavior if needed

---

## Dependencies

### Internal Dependencies

- Realtime server must be running
- Device connection tracker must be available
- Logging infrastructure must support structured logs

### External Dependencies

- None

---

## Documentation Updates

### Files to Update

1. `docs/broadcast-box/DEVICE-TROUBLESHOOTING.md` - Add connection lifecycle
   section
2. `docs/broadcast-box/DEVICE-MESSAGE-PROTOCOL.md` - No changes needed
3. `docs/realtime/README.md` - Add connection management section
4. `docs/realtime/CONFIGURATION.md` (if exists) - Add cleanup configuration

### New Documentation

1. `docs/broadcast-box/CONNECTION-MANAGEMENT.md` - Architecture and design
   decisions
2. Internal wiki page for operations team - Monitoring and alerting guide

---

## Conclusion

This integration plan provides a comprehensive, phased approach to handling
multiple device connections. By prioritizing resilience, observability, and root
cause resolution, we ensure the system is robust while maintaining best
practices.

**Next Steps**:

1. Review and approve plan
2. Assign tasks to team members
3. Begin Phase 1 implementation
4. Set up monitoring dashboards
5. Schedule Phase 1 deployment

**Questions or Concerns**:

- Should Phase 3 limit be configurable per device?
- What should be the default stale connection threshold?
- Should cleanup job run more frequently during high-connection periods?

---

**Plan Status**: ✅ Ready for Implementation  
**Last Reviewed**: 2026-01-16  
**Next Review**: After Phase 1 completion
