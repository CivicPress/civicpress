# TURN Server Configuration Guide

**Purpose**: Guide to understanding and configuring TURN servers for WebRTC
preview.

**Last Updated**: 2026-01-08

---

## What is a TURN Server?

**TURN** (Traversal Using Relays around NAT) is a server that relays media
traffic when direct peer-to-peer connection fails.

### How WebRTC Connection Works

```
Browser ←→ Device (direct connection - preferred)
```

When direct connection fails (NAT/firewall blocking), TURN relays the traffic:

```
Browser ←→ TURN Server ←→ Device (relayed connection - fallback)
```

---

## STUN vs TURN

### STUN (Session Traversal Utilities for NAT)

- **Purpose**: Discovers the public IP address and NAT type
- **How it works**: Helps peers find each other's public addresses
- **When it's enough**:
  - **Same network**: Always works (direct connection)
  - **Different networks**: Works in ~70-80% of cases (most home networks,
    simple NAT)
  - **Fails when**: Complex NAT (symmetric), restrictive firewalls, corporate
    networks
- **Traffic**: Only for discovery, doesn't relay media (direct connection)
- **Cost**: Usually free (Google's public STUN)
- **Latency**: Lowest (direct connection)

### TURN (Traversal Using Relays around NAT)

- **Purpose**: Relays actual media traffic when direct connection fails
- **How it works**: Acts as a relay/middleman for all video/audio data
- **When it's needed**:
  - Complex NAT (symmetric NAT)
  - Firewalls blocking UDP
  - Corporate networks
  - Different networks with strict NAT
- **Traffic**: Relays ALL media data (video/audio), uses bandwidth
- **Cost**: Usually requires hosting or paid service

---

## When Do You Need TURN?

You typically need TURN when:

1. **ICE connection fails** even with STUN (happens in ~20-30% of cases)
2. **Symmetric NAT** - both peers are behind complex NAT
3. **Firewall blocking UDP** - can't establish direct connection
4. **Corporate networks** - restrictive firewall rules
5. **Different networks with strict NAT** - some ISPs use symmetric NAT that
   blocks direct connections

**Important**: STUN alone works in most cases (~70-80%), but TURN provides a
reliable fallback for the remaining cases.

---

## Where to Add TURN Servers

### Current Location

TURN servers are configured in:

**File**: `modules/ui/app/composables/useDevicePreview.ts`

**Current Code** (lines 64-70):

```typescript
// STUN servers for NAT traversal
const iceServers: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Can add TURN servers later if needed
  ],
};
```

### Adding TURN Server (Basic)

```typescript
// STUN and TURN servers for NAT traversal
const iceServers: RTCConfiguration = {
  iceServers: [
    // STUN server (for discovery)
    { urls: 'stun:stun.l.google.com:19302' },
    // TURN server (for relay when direct connection fails)
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'your-username',
      credential: 'your-password',
    },
  ],
};
```

### Adding Multiple TURN Servers

```typescript
const iceServers: RTCConfiguration = {
  iceServers: [
    // STUN server
    { urls: 'stun:stun.l.google.com:19302' },
    // Primary TURN server
    {
      urls: 'turn:turn1.example.com:3478',
      username: 'username1',
      credential: 'password1',
    },
    // Secondary TURN server (fallback)
    {
      urls: 'turn:turn2.example.com:3478',
      username: 'username2',
      credential: 'password2',
    },
  ],
};
```

---

## TURN Server Options

### Option 1: Public TURN Services (Easiest)

Several services provide TURN servers:

1. **Twilio** (Paid, reliable)
   - URL: `turn:global.turn.twilio.com:3478`
   - Requires account and credentials
   - Pricing: Pay-as-you-go

2. **Coturn** (Self-hosted, free)
   - Open-source TURN server
   - You host it yourself
   - Free but requires server infrastructure

3. **Xirsys** (Paid, reliable)
   - URL: `turn:your-xirsys-url`
   - Requires account and credentials
   - Pricing: Subscription-based

### Option 2: Self-Hosted TURN Server

**Using Coturn** (most popular):

1. **Install Coturn**:

   ```bash
   # Ubuntu/Debian
   sudo apt-get install coturn

   # macOS
   brew install coturn
   ```

2. **Configure Coturn** (`/etc/turnserver.conf`):

   ```conf
   # Listen on port 3478
   listening-port=3478
   listening-ip=0.0.0.0

   # External IP (your server's public IP)
   external-ip=YOUR_PUBLIC_IP

   # Realm and authentication
   realm=your-realm.com
   user=username:password

   # Allow all IPs (or restrict as needed)
   no-cli
   ```

3. **Start Coturn**:

   ```bash
   sudo systemctl start coturn
   sudo systemctl enable coturn
   ```

4. **Use in code**:

   ```typescript
   {
     urls: 'turn:your-server-ip:3478',
     username: 'username',
     credential: 'password',
   }
   ```

### Option 3: Cloud-Hosted TURN

Many cloud providers offer TURN services:

- **AWS** - Amazon Chime SDK
- **Azure** - Azure Communication Services
- **Google Cloud** - Can deploy Coturn on GCP

---

## Making TURN Servers Configurable

### Current: Hardcoded

Currently, ICE servers are hardcoded in the composable.

### Future: Runtime Configuration

You could make it configurable via:

1. **Runtime Config** (Nuxt):

   ```typescript
   // nuxt.config.ts
   export default defineNuxtConfig({
     runtimeConfig: {
       public: {
         webrtc: {
           stun: 'stun:stun.l.google.com:19302',
           turn: {
             urls: 'turn:your-turn-server.com:3478',
             username: process.env.TURN_USERNAME,
             credential: process.env.TURN_CREDENTIAL,
           },
         },
       },
     },
   });
   ```

   Then use in composable:

   ```typescript
   const config = useRuntimeConfig();
   const iceServers: RTCConfiguration = {
     iceServers: [
       { urls: config.public.webrtc.stun },
       config.public.webrtc.turn ? {
         urls: config.public.webrtc.turn.urls,
         username: config.public.webrtc.turn.username,
         credential: config.public.webrtc.turn.credential,
       } : null,
     ].filter(Boolean),
   };
   ```

2. **Environment Variables**:

   ```typescript
   const iceServers: RTCConfiguration = {
     iceServers: [
       { urls: process.env.WEBRTC_STUN || 'stun:stun.l.google.com:19302' },
       process.env.WEBRTC_TURN_URLS ? {
         urls: process.env.WEBRTC_TURN_URLS,
         username: process.env.WEBRTC_TURN_USERNAME,
         credential: process.env.WEBRTC_TURN_CREDENTIAL,
       } : null,
     ].filter(Boolean),
   };
   ```

3. **Settings UI** (Future):
   - Add settings page to configure TURN servers
   - Store in user preferences or device config
   - Apply dynamically when creating peer connections

---

## Testing TURN Servers

### Test if TURN is Being Used

1. **Chrome WebRTC Internals**:
   - Open `chrome://webrtc-internals/`
   - Start preview
   - Check candidate pairs
   - Look for `relay` candidates (not `host` or `srflx`)

2. **Check ICE Connection State**:
   - If connection succeeds after adding TURN, it's working
   - TURN is only used if direct connection fails

### Test TURN Server Directly

```bash
# Test TURN server connectivity
turnutils_stunclient turn-server-ip:3478

# Test with credentials
turnutils_stunclient turn-server-ip:3478 \
  -u username -w password
```

---

## Security Considerations

1. **Credentials**: Never hardcode TURN credentials in frontend code
   - Use environment variables
   - Or fetch from backend API (temporary tokens)

2. **Access Control**: Restrict TURN server access
   - Use IP whitelisting
   - Use time-limited credentials
   - Use token-based authentication

3. **Rate Limiting**: Prevent abuse
   - Limit bandwidth per user
   - Monitor usage
   - Block suspicious activity

---

## Performance Considerations

1. **Latency**: TURN adds latency (extra hop)
   - Direct connection: ~10-50ms
   - TURN relay: ~50-200ms (depending on server location)

2. **Bandwidth**: TURN uses server bandwidth
   - All media goes through TURN server
   - For video: ~500kbps - 2Mbps per connection
   - Plan server capacity accordingly

3. **Cost**: TURN can be expensive
   - Bandwidth costs
   - Server hosting costs
   - Consider pay-as-you-go vs fixed plans

---

## Recommended Setup

### For Development

```typescript
const iceServers: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // No TURN needed for localhost/same network
  ],
};
```

### For Production (Same Network)

```typescript
const iceServers: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // TURN only if needed
    // Most same-network connections work with STUN only
  ],
};
```

### For Production (Different Networks/Restrictive NAT)

```typescript
const iceServers: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    },
  ],
};
```

---

## Troubleshooting

### TURN Server Not Working

1. **Check Connectivity**:

   ```bash
   telnet turn-server.com 3478
   ```

2. **Check Credentials**:
   - Verify username and password
   - Check if credentials are correct

3. **Check Firewall**:
   - Ensure ports 3478 (TURN) and 49152-65535 (media) are open
   - Check if UDP is allowed

4. **Check Logs**:
   - Check TURN server logs
   - Check browser console for errors
   - Check `chrome://webrtc-internals/` for candidate pairs

### TURN Too Slow

1. **Server Location**: Use TURN server closer to users
2. **Bandwidth**: Ensure TURN server has enough bandwidth
3. **Connection Quality**: Check network path quality

---

## Related Documentation

- [Preview Debugging Guide](./PREVIEW-DEBUGGING-GUIDE.md) - How to debug WebRTC
  issues
- [Preview Message Format](./PREVIEW-MESSAGE-FORMAT.md) - WebRTC message formats

---

## External Resources

- [Coturn Documentation](https://github.com/coturn/coturn)
- [WebRTC.org TURN Server Guide](https://webrtc.org/getting-started/turn-server)
- [Twilio TURN Service](https://www.twilio.com/stun-turn)
