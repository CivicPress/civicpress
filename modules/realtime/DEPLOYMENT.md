# Realtime Module Deployment Guide

## Overview

This guide covers deploying the CivicPress Realtime Module in production
environments.

## Prerequisites

- CivicPress core initialized and running
- Database configured (for snapshot storage)
- Authentication system configured
- Network access to WebSocket port (default: 3001)

## Deployment Options

### Option 1: Standalone Deployment (Recommended)

Run the realtime module as a separate service:

```bash
# Start realtime server standalone
pnpm run dev:realtime

# Or using the CLI
civic realtime:start
```

**Benefits:**

- Independent scaling
- Isolated failures
- Separate resource allocation
- Easier monitoring

### Option 2: Bundled with API Server

Run realtime alongside the API server:

```bash
# Start API server with realtime bundled
pnpm run dev:api:with-realtime
```

**Benefits:**

- Simpler deployment
- Shared resources
- Single process management

### Option 3: Microservices Architecture

Deploy realtime as a separate microservice:

```yaml
# docker-compose.yml example
services:
  api:
    image: civicpress/api:latest
    ports:
      - "3000:3000"

  realtime:
    image: civicpress/realtime:latest
    ports:
      - "3001:3001"
    environment:
      - CIVIC_DATA_DIR=/data
      - CIVIC_SYSTEM_DATA_DIR=/system-data
```

## Configuration

### Production Configuration

Create `.system-data/realtime.yml`:

```yaml
realtime:
  enabled: true
  port: 3001
  host: '0.0.0.0'  # Use specific IP in production
  path: '/realtime'

  rooms:
    max_rooms: 1000
    cleanup_timeout: 3600

  snapshots:
    enabled: true
    interval: 300  # 5 minutes
    max_updates: 100
    storage: 'database'  # Use 'database' for production

  rate_limiting:
    messages_per_second: 20
    connections_per_ip: 50
    connections_per_user: 5
```

### Security Configuration

**Required for Production:**

1. **Use WSS (WebSocket Secure)**:

   ```yaml
   realtime:
     tls:
       enabled: true
       cert: /path/to/cert.pem
       key: /path/to/key.pem
   ```

2. **Enable Rate Limiting**:
   - Configure appropriate limits for your use case
   - Monitor and adjust based on traffic

3. **Restrict Access**:

   ```yaml
   realtime:
     allowed_origins:
       - 'https://yourdomain.com'
       - 'https://app.yourdomain.com'
   ```

## Environment Variables

```bash
# Data directory
CIVIC_DATA_DIR=/path/to/data

# System data directory
CIVIC_SYSTEM_DATA_DIR=/path/to/.system-data

# Database connection (if using database snapshots)
DATABASE_URL=postgresql://user:pass@host:5432/civicpress

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

## Process Management

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start realtime module
pm2 start ecosystem.config.js --name realtime

# ecosystem.config.js
module.exports = {
  apps: [{
    name: 'civicpress-realtime',
    script: './node_modules/.bin/civic',
    args: 'realtime:start',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      CIVIC_DATA_DIR: '/var/lib/civicpress/data',
      CIVIC_SYSTEM_DATA_DIR: '/var/lib/civicpress/.system-data'
    }
  }]
};
```

### Using systemd

Create `/etc/systemd/system/civicpress-realtime.service`:

```ini
[Unit]
Description=CivicPress Realtime Module
After=network.target

[Service]
Type=simple
User=civicpress
WorkingDirectory=/opt/civicpress
ExecStart=/usr/bin/node /opt/civicpress/node_modules/.bin/civic realtime:start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=CIVIC_DATA_DIR=/var/lib/civicpress/data
Environment=CIVIC_SYSTEM_DATA_DIR=/var/lib/civicpress/.system-data

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable civicpress-realtime
sudo systemctl start civicpress-realtime
```

## Scaling

### Single Node

- Default configuration supports moderate load
- Monitor connection counts and room usage
- Adjust `max_rooms` and connection limits as needed

### Multi-Node (Future)

For multi-node deployments, Redis is required for shared state:

```yaml
realtime:
  redis:
    enabled: true
    url: 'redis://redis-host:6379'
    prefix: 'civicpress:realtime:'
```

**Note**: Multi-node support is planned for future releases.

## Monitoring

### Health Checks

The realtime server exposes health status:

```typescript
const health = realtimeServer.getHealthStatus();
// Returns: { server: { listening: boolean, connections: number }, ... }
```

### Metrics to Monitor

- **Connection Count**: Total active WebSocket connections
- **Room Count**: Number of active collaboration rooms
- **Message Rate**: Messages per second
- **Snapshot Operations**: Snapshot save/load frequency
- **Error Rate**: Authentication failures, permission denials

### Logging

Structured logging is available:

```typescript
// Logs include:
// - Connection events (connect, disconnect)
// - Authentication events
// - Room lifecycle (create, cleanup)
// - Snapshot operations
// - Errors and warnings
```

## Backup & Recovery

### Snapshot Storage

Snapshots are stored in:

- **Database**: `snapshots` table (recommended for production)
- **Filesystem**: `.system-data/realtime/snapshots/` (development)

### Backup Strategy

1. **Database Snapshots**: Include `snapshots` table in database backups
2. **Filesystem Snapshots**: Backup `.system-data/realtime/` directory
3. **Frequency**: Snapshots are created every 5 minutes (configurable)

### Recovery

On restart, the realtime server:

- Loads existing rooms from database/filesystem
- Restores snapshot state for faster reconnection
- Recreates rooms as clients reconnect

## Troubleshooting

### Connection Issues

**Problem**: Clients cannot connect

**Solutions**:

- Check firewall rules (port 3001)
- Verify WebSocket path matches configuration
- Check authentication token validity
- Review server logs for errors

### Performance Issues

**Problem**: High CPU or memory usage

**Solutions**:

- Reduce `max_rooms` limit
- Increase `cleanup_timeout` to reduce cleanup frequency
- Adjust rate limiting thresholds
- Monitor and limit concurrent connections

### Snapshot Issues

**Problem**: Snapshots not being created

**Solutions**:

- Verify snapshot storage is enabled
- Check database/filesystem permissions
- Review `snapshots.interval` configuration
- Check available disk space

## Security Checklist

- [ ] WSS (WebSocket Secure) enabled in production
- [ ] Rate limiting configured appropriately
- [ ] Origin restrictions configured
- [ ] Authentication tokens validated
- [ ] Permission checks enforced
- [ ] Connection limits set
- [ ] Logging configured (no sensitive data)
- [ ] Firewall rules configured
- [ ] Regular security updates applied

## Reference

- [Architecture Documentation](./ARCHITECTURE.md)
- [Configuration Guide](./README.md#configuration)
- [Testing Guide](./TESTING.md)
- [Quick Start](./QUICK-START.md)
