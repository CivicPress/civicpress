# Preview Network Requirements

**Purpose**: Understand network requirements for WebRTC preview to work.

**Last Updated**: 2026-01-08

---

## Quick Answer

**Preview works across networks, not just the same network.**

- ✅ **Same network**: Always works (direct connection)
- ✅ **Different networks**: Works in ~70-80% of cases with STUN alone
- ⚠️ **Restrictive networks**: May need TURN servers for the remaining 20-30%

---

## How It Works

### Scenario 1: Same Network (Best Case)

```
Browser (192.168.1.10) ←→ Device (192.168.1.100)
```

- **Connection**: Direct, no NAT traversal needed
- **Success rate**: ~100%
- **STUN needed**: No (but doesn't hurt)
- **TURN needed**: No
- **Latency**: Lowest (~10-50ms)

### Scenario 2: Different Networks - Home Networks (Most Common)

```
Browser (Home Network) ←→ Device (Different Network)
```

**With STUN only:**

```
Browser (192.168.1.10)
  ↓ (STUN finds public IP: 203.0.113.1)
Internet
  ↓
Device (192.168.2.50, public IP: 198.51.100.1)
```

- **Connection**: Direct through NAT (STUN helps)
- **Success rate**: ~70-80% (works in most home networks)
- **STUN needed**: Yes
- **TURN needed**: Usually no (unless symmetric NAT)
- **Latency**: Low (~20-100ms)

### Scenario 3: Different Networks - Restrictive (Needs TURN)

```
Browser (Corporate/Strict NAT)
  ↓ (Direct connection blocked)
TURN Server ←→ Device (Different Network)
```

- **Connection**: Relayed through TURN server
- **Success rate**: ~95-99% (with TURN)
- **STUN needed**: Yes (tried first)
- **TURN needed**: Yes (fallback when direct fails)
- **Latency**: Higher (~50-200ms, depending on TURN server location)

---

## Current Configuration

Your preview currently uses:

```typescript
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' }, // STUN only
]
```

**This means:**

- ✅ Works on same network
- ✅ Works on different networks in ~70-80% of cases
- ❌ Fails in ~20-30% of cases (symmetric NAT, corporate firewalls)

**To improve success rate:**

- Add TURN servers (increases success rate to ~95-99%)
- Handle failures gracefully (show error, suggest network troubleshooting)

---

## Network Types and Success Rates

### Home Networks (Most Users)

**Typical setup:**

- Router with simple NAT (cone NAT)
- Consumer ISP
- Standard firewall

**Success with STUN only:** ~80-90%

- Usually works
- Fails only with symmetric NAT (rare in home networks)

### Corporate Networks

**Typical setup:**

- Enterprise firewall
- Strict NAT policies
- Proxy servers
- VPN connections

**Success with STUN only:** ~30-50%

- Often fails due to firewall rules
- Usually needs TURN servers

### Mobile Networks (4G/5G)

**Typical setup:**

- Carrier-grade NAT (CGNAT)
- Symmetric NAT (common)
- IP restrictions

**Success with STUN only:** ~40-60%

- CGNAT often blocks direct connections
- Usually needs TURN servers

### Public WiFi (Coffee shops, hotels, etc.)

**Typical setup:**

- Guest networks
- AP isolation (devices can't talk to each other)
- Firewall rules

**Success with STUN only:** ~20-40%

- AP isolation prevents same-network connections
- Firewall rules often block P2P
- Usually needs TURN servers

---

## Testing Network Compatibility

### Test 1: Same Network

1. Browser and device on same WiFi/network
2. Expected: Should work immediately
3. If fails: Check device isn't using `127.0.0.1`

### Test 2: Different Networks (STUN Only)

1. Browser on one network, device on another
2. Expected: Works in ~70-80% of cases
3. If fails: Check ICE connection state in browser console

### Test 3: Different Networks (With TURN)

1. Browser on one network, device on another
2. Add TURN server to configuration
3. Expected: Works in ~95-99% of cases
4. If still fails: Check TURN server connectivity

---

## Recommendations

### For Development/Testing

```typescript
// STUN only - good enough for most testing
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
]
```

- Works on same network (always)
- Works on different networks (most cases)
- Simple configuration
- No cost

### For Production (Home Users)

```typescript
// STUN only - acceptable for most users
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
]
```

**Success rate**: ~70-80%

- Good enough for most users
- Failures are rare (can show error message)
- No additional cost
- Low latency

### For Production (Enterprise/Reliable)

```typescript
// STUN + TURN - maximum compatibility
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:your-turn-server.com:3478',
    username: 'username',
    credential: 'password',
  },
]
```

**Success rate**: ~95-99%

- Works in almost all scenarios
- Handles corporate networks
- Requires TURN server (costs)
- Higher latency (TURN relay)

---

## Handling Failures

### When Preview Fails

1. **Show clear error message**:

   ```
   "Preview connection failed. This may be due to network restrictions.
   Please try:
   - Ensure both devices are on the same network
   - Check firewall settings
   - Contact administrator if on corporate network"
   ```

2. **Provide troubleshooting steps**:
   - Check network connectivity
   - Try on same network first
   - Check firewall allows UDP traffic

3. **Suggest network configuration**:
   - For corporate networks: May need TURN server
   - For mobile networks: May need TURN server
   - For home networks: Usually works with STUN

---

## Summary

| Scenario                         | STUN Only | STUN + TURN |
| -------------------------------- | --------- | ----------- |
| Same network                     | ✅ 100%   | ✅ 100%     |
| Different networks (home)        | ✅ ~80%   | ✅ ~99%     |
| Different networks (corporate)   | ⚠️ ~40%   | ✅ ~99%     |
| Different networks (mobile)      | ⚠️ ~50%   | ✅ ~99%     |
| Different networks (public WiFi) | ⚠️ ~30%   | ✅ ~95%     |

**Bottom line:**

- Preview **does work across networks** with STUN
- STUN alone works in most cases (~70-80%)
- TURN increases success rate to ~95-99%
- Same network always works (100%)

---

## Related Documentation

- [TURN Server Configuration](./TURN-SERVER-CONFIGURATION.md) - How to add TURN
  servers
- [Preview Debugging Guide](./PREVIEW-DEBUGGING-GUIDE.md) - How to debug network
  issues
