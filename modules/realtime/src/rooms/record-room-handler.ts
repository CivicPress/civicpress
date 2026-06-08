import type {
  RoomTypeHandler,
  ConnectionContext,
  MessageContext,
  DisconnectContext,
  AuthResult,
} from '../types/handler-registry.types.js';

/**
 * RecordRoomHandler — handler for `records:<id>` room type.
 *
 * W1: stub that compiles and registers; behavior lands in W5 once the
 * server-side serializer (W3) and snapshot persistence rework (W4) are in place.
 */
export class RecordRoomHandler implements RoomTypeHandler {
  public readonly roomType = 'records';

  async onConnect(_ctx: ConnectionContext): Promise<AuthResult> {
    // Generic auth already runs in realtime-server.ts before the handler is called.
    return { success: true };
  }

  async onMessage(_ctx: MessageContext): Promise<void> {
    // Yjs sync messages are handled by RoomManager/YjsRoom; no per-handler routing.
  }

  onDisconnect(_ctx: DisconnectContext): void {
    // Snapshot scheduling lands in W5.
  }
}
