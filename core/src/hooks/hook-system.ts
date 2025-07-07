/**
 * HookSystem - Event-Driven Architecture
 *
 * Handles event emission and listening for CivicPress.
 * Provides the foundation for plugin and workflow integration.
 */
export class HookSystem {
  private listeners: Map<string, Array<(data: any) => void>>;
  private hooks: Map<string, any>;

  constructor() {
    this.listeners = new Map();
    this.hooks = new Map();
  }

  /**
   * Initialize the hook system
   */
  initialize(): void {
    // Set up default hooks
    this.registerHook('civic:initialized', this.onInitialized.bind(this));
    this.registerHook('record:created', this.onRecordCreated.bind(this));
    this.registerHook('record:updated', this.onRecordUpdated.bind(this));
    this.registerHook('record:published', this.onRecordPublished.bind(this));
  }

  /**
   * Register a hook
   */
  registerHook(name: string, handler: (data: any) => void): void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, []);
    }
    this.listeners.get(name)!.push(handler);
  }

  /**
   * Emit a hook event
   */
  async emit(name: string, data: any): Promise<void> {
    const handlers = this.listeners.get(name);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(data);
        } catch (error) {
          console.error(`Error in hook handler for ${name}:`, error);
        }
      }
    }
  }

  /**
   * Remove a hook listener
   */
  removeHook(name: string, handler: (data: any) => void): void {
    const handlers = this.listeners.get(name);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get all registered hooks
   */
  getRegisteredHooks(): string[] {
    return Array.from(this.listeners.keys());
  }

  // Default hook handlers
  private onInitialized(data: any): void {
    console.log('CivicPress initialized:', data);
  }

  private onRecordCreated(data: any): void {
    console.log('Record created:', data);
  }

  private onRecordUpdated(data: any): void {
    console.log('Record updated:', data);
  }

  private onRecordPublished(data: any): void {
    console.log('Record published:', data);
  }
}
