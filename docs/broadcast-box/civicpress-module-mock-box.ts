/**
 * Mock Broadcast Box for Testing
 *
 * Copy this into: modules/broadcast-box/tests/mocks/broadcast-box.ts
 *
 * This mock simulates a Broadcast Box device for testing the CivicPress module
 * without requiring actual hardware.
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

export interface MockBoxConfig {
  deviceUuid: string;
  name?: string;
  capabilities?: {
    videoSources: string[];
    audioSources: string[];
    pipSupported: boolean;
  };
  simulateLatency?: boolean;
  simulateErrors?: boolean;
}

export class MockBroadcastBox {
  private ws: WebSocket | null = null;
  private config: MockBoxConfig;
  private state: {
    connected: boolean;
    recording: boolean;
    sessionId?: string;
    streaming: boolean;
    streamConfig: {
      url?: string;
      stream_key?: string;
      platform?: string;
    };
    health: {
      score: number;
      status: 'healthy' | 'degraded' | 'unhealthy';
      metrics: {
        memoryPercent: number;
        cpuPercent: number;
        diskPercent: number;
      };
    };
  };

  constructor(config: MockBoxConfig) {
    this.config = {
      name: 'Mock Broadcast Box',
      capabilities: {
        videoSources: ['hdmi1', 'hdmi2', 'usb_camera'],
        audioSources: ['usb_audio', 'hdmi_audio'],
        pipSupported: true,
      },
      simulateLatency: false,
      simulateErrors: false,
      ...config,
    };

    this.state = {
      connected: false,
      recording: false,
      streaming: false,
      streamConfig: {},
      health: {
        score: 95,
        status: 'healthy',
        metrics: {
          memoryPercent: 45,
          cpuPercent: 30,
          diskPercent: 60,
        },
      },
    };
  }

  /**
   * Connect to CivicPress WebSocket server
   */
  async connect(endpoint: string, token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = token ? `${endpoint}?token=${token}` : endpoint;
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.state.connected = true;
        this.sendDeviceConnected();
        this.startHeartbeat();
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (error) => {
        reject(error);
      });

      this.ws.on('close', () => {
        this.state.connected = false;
        this.stopHeartbeat();
      });
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state.connected = false;
  }

  /**
   * Send device.connected event
   */
  private sendDeviceConnected(): void {
    this.sendEvent({
      type: 'event',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      event: 'device.connected',
      payload: {
        device_id: this.config.deviceUuid,
        version: '1.0.0',
        capabilities: this.config.capabilities?.videoSources || [],
      },
    });

    // Send state sync
    setTimeout(() => {
      this.sendStateSync();
    }, 100);
  }

  /**
   * Send state_sync event
   */
  private sendStateSync(): void {
    this.sendEvent({
      type: 'event',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      event: 'state_sync',
      payload: {
        device_id: this.config.deviceUuid,
        status: this.state.recording ? 'recording' : 'idle',
        active_session: this.state.sessionId || null,
        health: this.state.health,
        storage: {
          free_bytes: 100000000000,
          used_bytes: 50000000000,
        },
      },
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message.type === 'command') {
        this.handleCommand(message);
      } else if (message.type === 'ping') {
        this.sendPong();
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  /**
   * Handle commands from CivicPress
   */
  private async handleCommand(command: any): Promise<void> {
    if (this.config.simulateLatency) {
      await this.delay(100);
    }

    switch (command.action) {
      case 'start_session':
        await this.handleStartSession(command);
        break;
      case 'stop_session':
        await this.handleStopSession(command);
        break;
      case 'update_config':
        await this.handleUpdateConfig(command);
        break;
      case 'get_status':
        await this.handleGetStatus(command);
        break;
      case 'sources.set':
        await this.handleSourcesSet(command);
        break;
      case 'stream.configure':
        await this.handleStreamConfigure(command);
        break;
      case 'stream.start':
        await this.handleStreamStart(command);
        break;
      case 'stream.stop':
        await this.handleStreamStop(command);
        break;
      default:
        this.sendAck(command.id, false, {
          error: 'UNKNOWN_COMMAND',
          message: `Unknown command: ${command.action}`,
        });
    }
  }

  /**
   * Handle sources.set command (centralized source configuration)
   */
  private async handleSourcesSet(command: any): Promise<void> {
    const { video, audio } = command.payload || {};
    if (!video && !audio) {
      this.sendAck(command.id, false, {
        error: 'INVALID_CONFIG',
        message: 'At least one of video or audio must be provided',
      });
      return;
    }
    const videoSource =
      video ?? this.config.capabilities?.videoSources?.[0] ?? 'hdmi1';
    const audioSource =
      audio ?? this.config.capabilities?.audioSources?.[0] ?? 'usb_audio';
    this.sendAck(command.id, true, {
      video: videoSource,
      audio: audioSource,
      status: 'configured',
    });
    // Optionally emit sources.changed for clients
    this.sendEvent({
      type: 'event',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      event: 'sources.changed',
      payload: { video: videoSource, audio: audioSource },
    });
  }

  /**
   * Handle start_session command
   */
  private async handleStartSession(command: any): Promise<void> {
    if (this.state.recording) {
      this.sendAck(command.id, false, {
        error: 'SESSION_ALREADY_ACTIVE',
        message: 'Another session is already in progress',
      });
      return;
    }

    if (this.config.simulateErrors && Math.random() < 0.1) {
      this.sendAck(command.id, false, {
        error: 'CAPTURE_ERROR',
        message: 'Video capture device not found',
      });
      return;
    }

    this.state.recording = true;
    this.state.sessionId = command.payload.session_id;

    // Send acknowledgment
    this.sendAck(command.id, true, {
      session_id: command.payload.session_id,
      state: 'recording',
    });

    // Simulate session started event
    setTimeout(() => {
      this.sendEvent({
        type: 'event',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        event: 'session.started',
        payload: {
          session_id: command.payload.session_id,
          state: 'recording',
          started_at: new Date().toISOString(),
        },
      });
    }, 200);
  }

  /**
   * Handle stop_session command
   */
  private async handleStopSession(command: any): Promise<void> {
    if (!this.state.recording) {
      this.sendAck(command.id, false, {
        error: 'SESSION_NOT_FOUND',
        message: 'No active session',
      });
      return;
    }

    this.state.recording = false;
    const sessionId = this.state.sessionId;
    this.state.sessionId = undefined;

    // Send acknowledgment
    this.sendAck(command.id, true, {
      session_id: sessionId,
      state: 'encoding',
    });

    // Simulate session stopped event
    setTimeout(() => {
      this.sendEvent({
        type: 'event',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        event: 'session.stopped',
        payload: {
          session_id: sessionId,
          state: 'encoding',
          stopped_at: new Date().toISOString(),
        },
      });
    }, 200);

    // Simulate session complete after encoding
    setTimeout(() => {
      this.sendEvent({
        type: 'event',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        event: 'session.complete',
        payload: {
          session_id: sessionId,
          file_path: `/data/sessions/${sessionId}.mp4`,
          file_size: 1000000000,
          duration_seconds: 1800,
          hash: 'sha256:mock-hash',
          completed_at: new Date().toISOString(),
        },
      });
    }, 5000);
  }

  /**
   * Handle stream.configure command (RTMP destination)
   */
  private async handleStreamConfigure(command: any): Promise<void> {
    const { url, stream_key, platform } = command.payload || {};
    if (!url || !stream_key) {
      this.sendAck(command.id, false, {
        error: 'INVALID_CONFIG',
        message: 'url and stream_key are required',
      });
      return;
    }
    this.state.streamConfig = {
      url,
      stream_key,
      platform: platform || 'generic',
    };
    this.sendAck(command.id, true, {
      status: 'configured',
      platform: this.state.streamConfig.platform,
      url: this.state.streamConfig.url,
      stream_key_set: true,
    });
  }

  /**
   * Handle stream.start command (start RTMP streaming)
   */
  private async handleStreamStart(command: any): Promise<void> {
    if (this.state.streaming) {
      this.sendAck(command.id, true, {
        status: 'streaming',
        platform: this.state.streamConfig.platform,
        url: this.state.streamConfig.url,
        quality: command.payload?.quality || 'standard',
      });
      return;
    }
    if (!this.state.streamConfig.url || !this.state.streamConfig.stream_key) {
      this.sendAck(command.id, false, {
        error: 'NOT_CONFIGURED',
        message: 'Call stream.configure first with url and stream_key',
      });
      return;
    }
    if (this.config.simulateErrors && Math.random() < 0.1) {
      this.sendAck(command.id, true, {
        status: 'streaming',
        platform: this.state.streamConfig.platform,
        url: this.state.streamConfig.url,
        quality: command.payload?.quality || 'standard',
      });
      setTimeout(() => {
        this.sendEvent({
          type: 'event',
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          event: 'streaming.rtmp.connection_failed',
          payload: {
            platform: this.state.streamConfig.platform,
            error: 'Connection refused (simulated)',
            retry_count: 0,
          },
        });
      }, 500);
      return;
    }
    this.state.streaming = true;
    const quality = command.payload?.quality || 'standard';
    const fullUrl = `${this.state.streamConfig.url}/${this.state.streamConfig.stream_key}`;
    this.sendAck(command.id, true, {
      status: 'streaming',
      platform: this.state.streamConfig.platform,
      url: fullUrl,
      quality,
    });
    setTimeout(() => {
      this.sendEvent({
        type: 'event',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        event: 'streaming.rtmp.started',
        payload: {
          platform: this.state.streamConfig.platform,
          url: fullUrl,
        },
      });
    }, 300);
  }

  /**
   * Handle stream.stop command (stop RTMP streaming)
   */
  private async handleStreamStop(command: any): Promise<void> {
    if (!this.state.streaming) {
      this.sendAck(command.id, true, {
        status: 'stopped',
        platform: this.state.streamConfig.platform || 'generic',
      });
      return;
    }
    this.state.streaming = false;
    const platform = this.state.streamConfig.platform || 'generic';
    this.sendAck(command.id, true, {
      status: 'stopped',
      platform,
    });
    this.sendEvent({
      type: 'event',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      event: 'streaming.rtmp.stopped',
      payload: { platform },
    });
  }

  /**
   * Handle update_config command
   */
  private async handleUpdateConfig(command: any): Promise<void> {
    this.sendAck(command.id, true, {
      updated_keys: Object.keys(command.payload.config || {}),
    });
  }

  /**
   * Handle get_status command
   * Sends status with sources (video/audio, active, pip using configured) and streaming per new protocol.
   */
  private async handleGetStatus(command: any): Promise<void> {
    const videoSources = this.config.capabilities?.videoSources ?? [
      'hdmi1',
      'hdmi2',
      'usb_camera',
    ];
    const audioSources = this.config.capabilities?.audioSources ?? [
      'usb_audio',
      'hdmi_audio',
    ];
    const hasPip =
      this.config.capabilities?.pipSupported && videoSources.length >= 2;
    const videoSourceObjects = videoSources.map((id, i) =>
      id === 'pip'
        ? {
            id: 'pip',
            identifier: 'pip',
            name: 'Picture-in-Picture',
            type: 'virtual',
          }
        : { id: i, identifier: id, name: id, type: 'camera' }
    );
    if (
      hasPip &&
      !videoSourceObjects.some((s: any) => s.identifier === 'pip')
    ) {
      videoSourceObjects.push({
        id: 'pip',
        identifier: 'pip',
        name: 'Picture-in-Picture',
        type: 'virtual',
      });
    }
    const audioSourceObjects = audioSources.map((id, i) => ({
      id: i,
      identifier: id,
      name: id,
    }));

    this.sendMessage({
      type: 'status',
      id: uuidv4(),
      command_id: command.id,
      timestamp: new Date().toISOString(),
      payload: {
        device_id: this.config.deviceUuid,
        status: this.state.recording ? 'recording' : 'active',
        state: this.state.recording ? 'recording' : 'idle',
        session_id: this.state.sessionId ?? undefined,
        session: {
          state: this.state.recording ? 'recording' : 'idle',
          session_id: this.state.sessionId ?? null,
          metadata: {},
        },
        resources: {
          cpu_percent: this.state.health.metrics.cpuPercent,
          memory_percent: this.state.health.metrics.memoryPercent,
          disk_percent: this.state.health.metrics.diskPercent,
          healthy: this.state.health.status === 'healthy',
        },
        sources: {
          video: videoSourceObjects,
          audio: audioSourceObjects,
          active: {
            video: { id: 0, identifier: videoSources[0] },
            audio: { id: 0, identifier: audioSources[0] },
          },
          pip: {
            configured: false,
            supported: !!this.config.capabilities?.pipSupported,
            pip_source: null,
            main_source: null,
            position: 'top_right',
            size: 0.25,
          },
        },
        streaming: {
          available: true,
          configured: !!(
            this.state.streamConfig.url && this.state.streamConfig.stream_key
          ),
          streaming: this.state.streaming,
          platform: this.state.streamConfig.platform ?? undefined,
        },
        storage: {
          free_bytes: 100000000000,
          used_bytes: 50000000000,
        },
        health: this.state.health,
      },
    });
  }

  /**
   * Send acknowledgment
   */
  private sendAck(commandId: string, success: boolean, result: any): void {
    this.sendMessage({
      type: 'ack',
      id: uuidv4(),
      command_id: commandId,
      timestamp: new Date().toISOString(),
      status: success ? 'success' : 'error',
      payload: success ? result : undefined,
      error: success
        ? undefined
        : {
            code: result.error || 'UNKNOWN_ERROR',
            message: result.message || 'Unknown error',
          },
    });
  }

  /**
   * Send event
   */
  sendEvent(event: any): void {
    this.sendMessage(event);
  }

  /**
   * Send message
   */
  private sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start heartbeat
   */
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendMessage({
        type: 'heartbeat',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
      });
    }, 10000); // Every 10 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send pong response
   */
  private sendPong(): void {
    this.sendMessage({
      type: 'pong',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Simulate health update
   */
  simulateHealthUpdate(health: Partial<typeof this.state.health>): void {
    this.state.health = { ...this.state.health, ...health };
    this.sendEvent({
      type: 'event',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      event: 'health.update',
      payload: {
        device_id: this.config.deviceUuid,
        health: this.state.health,
      },
    });
  }

  /**
   * Simulate error
   */
  simulateError(
    severity: 'info' | 'warning' | 'error' | 'critical',
    code: string,
    message: string
  ): void {
    this.sendEvent({
      type: 'event',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      event: 'device.error',
      payload: {
        severity,
        error: {
          code,
          message,
        },
      },
    });
  }

  /**
   * Get current state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Utility: Delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Test helper: Create mock box
 */
export function createMockBox(
  config?: Partial<MockBoxConfig>
): MockBroadcastBox {
  return new MockBroadcastBox({
    deviceUuid: uuidv4(),
    ...config,
  });
}
