# 🧩 CivicPress Spec: `plugin-api.md`

---

version: 1.0.0 status: stable created: '2025-07-15' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive API interfaces
- lifecycle hooks
- UI widget API
- hook system
- route API
- CLI API
- testing frameworks
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
  'null' dependencies:
  - 'plugins.md: >=1.5.0'
  - 'hooks.md: >=1.2.0'
  - 'testing-framework.md: >=1.0.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Plugin API & Development Interface

## 🎯 Purpose

Define the complete API surface, interfaces, and development patterns for
CivicPress plugins. This spec provides the technical foundation for plugin
development, including TypeScript definitions, runtime interfaces, and best
practices.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define TypeScript interfaces for all plugin APIs
- Specify plugin lifecycle hooks and event system
- Document data access patterns and security boundaries
- Provide development tools and debugging capabilities
- Establish plugin testing and validation frameworks

❌ Out of Scope:

- Plugin marketplace implementation
- Third-party plugin distribution

---

## 🔗 Inputs & Outputs

| Input                | Description                               |
| -------------------- | ----------------------------------------- |
| Plugin code          | JavaScript/TypeScript plugin source files |
| Plugin manifests     | Plugin configuration and metadata         |
| API requests         | Plugin API calls and method invocations   |
| Hook events          | System events and plugin-triggered hooks  |
| Plugin configuration | User settings and plugin options          |

| Output         | Description                              |
| -------------- | ---------------------------------------- |
| API responses  | Data returned from plugin API calls      |
| Hook handlers  | Event handlers registered by plugins     |
| UI components  | Vue components and widgets rendered      |
| CLI commands   | Command-line tools registered by plugins |
| Route handlers | HTTP endpoints and middleware            |

---

## 📂 File/Folder Location

```
core/
├── plugin-api.ts          # Main plugin API interface
├── plugin-loader.ts       # Plugin loading and initialization
├── plugin-sandbox.ts      # Plugin security sandboxing
└── plugin-manager.ts      # Plugin lifecycle management

modules/
├── plugin-api/
│   ├── components/
│   │   ├── PluginAPIDocs.tsx # API documentation component
│   │   └── PluginDebugger.tsx # Plugin debugging interface
│   ├── hooks/
│   │   └── usePluginAPI.ts    # Plugin API data hook
│   └── utils/
│       ├── api-validator.ts    # API request validation
│       └── plugin-testing.ts   # Plugin testing utilities
└── ui/
    └── components/
        └── PluginAPIProvider.tsx # Plugin API context provider

types/
├── plugin-api.d.ts        # TypeScript definitions
├── plugin-hooks.d.ts      # Hook system types
├── plugin-widgets.d.ts    # Widget API types
└── plugin-routes.d.ts     # Route API types

tests/
├── plugin-api/
│   ├── api-interfaces.test.ts
│   ├── plugin-sandbox.test.ts
│   └── api-security.test.ts
└── integration/
    └── plugin-api-integration.test.ts
```

---

## 🔧 Core API Interfaces

### Plugin Base Class

```typescript
// @civicpress/plugin-api
export abstract class Plugin {
  protected config: PluginConfig;
  protected logger: PluginLogger;
  protected api: CivicPressAPI;
  protected hooks: HookManager;
  protected widgets: WidgetManager;
  protected routes: RouteManager;
  protected cli: CLIManager;

  constructor(options: PluginOptions) {
    this.config = new PluginConfig(options);
    this.logger = new PluginLogger(options.name);
    this.api = new CivicPressAPI();
    this.hooks = new HookManager();
    this.widgets = new WidgetManager();
    this.routes = new RouteManager();
    this.cli = new CLIManager();
  }

  // Lifecycle hooks
  abstract onInit(): Promise<void>;
  abstract onEnable(): Promise<void>;
  abstract onDisable(): Promise<void>;
  abstract onConfigChange(key: string, value: any): Promise<void>;
}
```

### CivicPress API Interface

```typescript
export interface CivicPressAPI {
  // Record management
  records: {
    create(data: RecordData): Promise<Record>;
    find(query: RecordQuery): Promise<Record[]>;
    update(id: string, data: Partial<RecordData>): Promise<Record>;
    delete(id: string): Promise<void>;
    publish(id: string): Promise<Record>;
    archive(id: string): Promise<Record>;
  };

  // Configuration management
  config: {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
    delete(key: string): Promise<void>;
    watch(key: string, callback: (value: any) => void): void;
  };

  // Notification system
  notifications: {
    send(data: NotificationData): Promise<void>;
    subscribe(channel: string, callback: (data: any) => void): void;
    unsubscribe(channel: string): void;
  };

  // Hook system
  hooks: {
    emit(event: string, data?: any): Promise<void>;
    on(event: string, handler: (data: any) => void): void;
    off(event: string, handler: (data: any) => void): void;
  };

  // File system (read-only)
  files: {
    read(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
    list(path: string): Promise<string[]>;
  };

  // Database access (via APIs only)
  database: {
    query(sql: string, params?: any[]): Promise<any[]>;
    execute(sql: string, params?: any[]): Promise<void>;
    transaction<T>(fn: () => Promise<T>): Promise<T>;
  };
}
```

### Plugin Configuration Interface

```typescript
export interface PluginConfig {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  repository?: string;
  homepage?: string;

  capabilities: string[];
  dependencies: Record<string, string>;
  permissions: string[];

  config_schema: Record<string, ConfigField>;
  security: SecurityConfig;
  metadata: PluginMetadata;
}

export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  default?: any;
  validation?: (value: any) => boolean;
}

export interface SecurityConfig {
  signed: boolean;
  gpg_key?: string;
  permissions: string[];
  sandbox: SandboxConfig;
}

export interface SandboxConfig {
  filesystem: {
    read: string[];
    write: string[];
  };
  network: {
    allowed_domains: string[];
    allowed_ports: number[];
  };
  memory: {
    max_heap: number;
    max_stack: number;
  };
  cpu: {
    max_usage: number;
    timeout: number;
  };
}
```

---

## 🎨 UI Widget API

### Widget Base Class

```typescript
export abstract class Widget {
  protected props: WidgetProps;
  protected api: CivicPressAPI;
  protected config: PluginConfig;

  constructor(props: WidgetProps, api: CivicPressAPI, config: PluginConfig) {
    this.props = props;
    this.api = api;
    this.config = config;
  }

  abstract render(): string | HTMLElement | VueComponent;
  abstract mount(container: HTMLElement): void;
  abstract unmount(): void;
  abstract update(props: Partial<WidgetProps>): void;
}

export interface WidgetProps {
  id: string;
  type: string;
  position: 'header' | 'sidebar' | 'content' | 'footer';
  config: Record<string, any>;
  permissions: string[];
}
```

### Vue Component Integration

```typescript
// Vue 3 Composition API integration
export function useCivicPress() {
  const config = inject('civicpress-config');
  const api = inject('civicpress-api');
  const hooks = inject('civicpress-hooks');
  const widgets = inject('civicpress-widgets');

  return {
    config,
    api,
    hooks,
    widgets,
  };
}

// Vue 3 Plugin
export const CivicPressPlugin = {
  install(app: App, options: CivicPressOptions) {
    app.provide('civicpress-config', options.config);
    app.provide('civicpress-api', options.api);
    app.provide('civicpress-hooks', options.hooks);
    app.provide('civicpress-widgets', options.widgets);
  },
};
```

---

## 🔌 Hook System API

### Hook Manager Interface

```typescript
export interface HookManager {
  // Register hooks
  registerHook(event: string, handler: HookHandler): void;
  registerHookOnce(event: string, handler: HookHandler): void;

  // Emit events
  emit(event: string, data?: any): Promise<void>;
  emitAsync(event: string, data?: any): Promise<void>;

  // Listen to events
  on(event: string, handler: HookHandler): void;
  once(event: string, handler: HookHandler): void;
  off(event: string, handler: HookHandler): void;

  // Hook management
  listHooks(): string[];
  getHookHandlers(event: string): HookHandler[];
  clearHooks(event?: string): void;
}

export type HookHandler = (
  data: any,
  context: HookContext
) => Promise<void> | void;

export interface HookContext {
  plugin: string;
  timestamp: Date;
  user?: string;
  session?: string;
  metadata?: Record<string, any>;
}
```

### Built-in Hook Events

```typescript
export const BUILT_IN_HOOKS = {
  // Record lifecycle
  onRecordCreated: 'Triggered when a new record is created',
  onRecordUpdated: 'Triggered when a record is updated',
  onRecordPublished: 'Triggered when a record is published',
  onRecordArchived: 'Triggered when a record is archived',
  onRecordDeleted: 'Triggered when a record is deleted',

  // User lifecycle
  onUserRegistered: 'Triggered when a new user registers',
  onUserLogin: 'Triggered when a user logs in',
  onUserLogout: 'Triggered when a user logs out',
  onUserRoleChanged: 'Triggered when a user role changes',

  // Workflow events
  onWorkflowStarted: 'Triggered when a workflow starts',
  onWorkflowCompleted: 'Triggered when a workflow completes',
  onWorkflowFailed: 'Triggered when a workflow fails',

  // System events
  onSystemStartup: 'Triggered when CivicPress starts',
  onSystemShutdown: 'Triggered when CivicPress shuts down',
  onDailyCron: 'Triggered daily at midnight',
  onWeeklyCron: 'Triggered weekly on Sunday',
  onMonthlyCron: 'Triggered monthly on the 1st',

  // Plugin events
  onPluginEnabled: 'Triggered when a plugin is enabled',
  onPluginDisabled: 'Triggered when a plugin is disabled',
  onPluginError: 'Triggered when a plugin encounters an error',
} as const;
```

---

## 🛣️ Route API

### Route Manager Interface

```typescript
export interface RouteManager {
  // Register routes
  get(path: string, handler: RouteHandler): void;
  post(path: string, handler: RouteHandler): void;
  put(path: string, handler: RouteHandler): void;
  delete(path: string, handler: RouteHandler): void;
  patch(path: string, handler: RouteHandler): void;

  // Middleware
  use(middleware: RouteMiddleware): void;
  use(path: string, middleware: RouteMiddleware): void;

  // Route management
  listRoutes(): RouteInfo[];
  removeRoute(method: string, path: string): void;
  clearRoutes(): void;
}

export type RouteHandler = (
  req: Request,
  res: Response
) => Promise<void> | void;
export type RouteMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => void;

export interface RouteInfo {
  method: string;
  path: string;
  handler: string;
  middleware: string[];
  permissions: string[];
}
```

### Request/Response Interfaces

```typescript
export interface Request {
  method: string;
  url: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  headers: Record<string, string>;
  user?: User;
  session?: Session;
  plugin: string;
}

export interface Response {
  status(code: number): Response;
  json(data: any): void;
  send(data: any): void;
  redirect(url: string): void;
  setHeader(name: string, value: string): Response;
  end(): void;
}
```

---

## 🖥️ CLI API

### CLI Manager Interface

```typescript
export interface CLIManager {
  // Register commands
  command(name: string, description?: string): Command;
  addCommand(command: Command): void;

  // Command management
  listCommands(): CommandInfo[];
  removeCommand(name: string): void;
  clearCommands(): void;
}

export interface Command {
  name: string;
  description: string;
  options: CommandOption[];
  arguments: CommandArgument[];
  action: (args: any, options: any) => Promise<void> | void;

  // Command configuration
  option(flags: string, description?: string, defaultValue?: any): Command;
  argument(name: string, description?: string, required?: boolean): Command;
  help(): void;
}

export interface CommandOption {
  flags: string;
  description?: string;
  defaultValue?: any;
  required?: boolean;
}

export interface CommandArgument {
  name: string;
  description?: string;
  required?: boolean;
  variadic?: boolean;
}

export interface CommandInfo {
  name: string;
  description: string;
  options: CommandOption[];
  arguments: CommandArgument[];
  permissions: string[];
}
```

---

## 🧪 Testing & Validation

### Plugin Testing Framework

```typescript
export class PluginTestSuite {
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.api = new MockCivicPressAPI();
    this.hooks = new MockHookManager();
  }

  // Lifecycle testing
  async testInit(): Promise<void> {
    await this.plugin.onInit();
    // Verify initialization
  }

  async testEnable(): Promise<void> {
    await this.plugin.onEnable();
    // Verify routes, widgets, CLI commands registered
  }

  async testDisable(): Promise<void> {
    await this.plugin.onDisable();
    // Verify cleanup
  }

  // Hook testing
  async testHook(event: string, data: any): Promise<void> {
    const handlers = this.hooks.getHookHandlers(event);
    for (const handler of handlers) {
      await handler(data, { plugin: this.plugin.name, timestamp: new Date() });
    }
  }

  // API testing
  async testAPI(): Promise<void> {
    // Test all API endpoints
    const routes = this.plugin.routes.listRoutes();
    for (const route of routes) {
      await this.testRoute(route);
    }
  }

  // Widget testing
  async testWidgets(): Promise<void> {
    // Test all registered widgets
    const widgets = this.plugin.widgets.listWidgets();
    for (const widget of widgets) {
      await this.testWidget(widget);
    }
  }

  // CLI testing
  async testCLI(): Promise<void> {
    // Test all CLI commands
    const commands = this.plugin.cli.listCommands();
    for (const command of commands) {
      await this.testCommand(command);
    }
  }
}
```

### Mock APIs for Testing

```typescript
export class MockCivicPressAPI implements CivicPressAPI {
  private records: Record[] = [];
  private config: Record<string, any> = {};
  private notifications: NotificationData[] = [];
  private hooks: HookData[] = [];

  // Mock implementations
  records = {
    create: async (data: RecordData) => {
      const record = { id: crypto.randomUUID(), ...data, created: new Date() };
      this.records.push(record);
      return record;
    },
    find: async (query: RecordQuery) => {
      // Implement mock query logic
      return this.records.filter((record) => this.matchesQuery(record, query));
    },
    update: async (id: string, data: Partial<RecordData>) => {
      const record = this.records.find((r) => r.id === id);
      if (record) {
        Object.assign(record, data, { updated: new Date() });
        return record;
      }
      throw new Error('Record not found');
    },
    delete: async (id: string) => {
      const index = this.records.findIndex((r) => r.id === id);
      if (index >= 0) {
        this.records.splice(index, 1);
      }
    },
  };

  config = {
    get: async (key: string) => this.config[key],
    set: async (key: string, value: any) => {
      this.config[key] = value;
    },
    delete: async (key: string) => {
      delete this.config[key];
    },
  };

  notifications = {
    send: async (data: NotificationData) => {
      this.notifications.push(data);
    },
  };

  hooks = {
    emit: async (event: string, data?: any) => {
      this.hooks.push({ event, data, timestamp: new Date() });
    },
  };
}
```

---

## 🔐 Security & Trust Considerations

### API Security Boundaries

- All plugin APIs enforce sandboxed execution environments
- Network access restricted to approved domains and protocols
- File system access limited to plugin directory and read-only civic data
- Database access only through CivicPress APIs, never direct connection
- Memory and CPU limits enforced to prevent resource exhaustion

### Authentication & Authorization

- Plugin API calls require valid user session and appropriate permissions
- Role-based access control enforced at API method level
- Plugin actions logged for audit trail and accountability
- Emergency API lockdown capability during security incidents

### Data Protection & Privacy

- All plugin data encrypted in transit and at rest
- Personal information automatically redacted from plugin logs
- GDPR-compliant data handling for plugin operations
- User consent management for plugin data processing

### Code Quality & Safety

- Static analysis of plugin code for security vulnerabilities
- Dependency scanning for known CVEs in plugin packages
- TypeScript compilation required for all plugin code
- Regular security audits of plugin API usage patterns

---

## 🛠️ Future Enhancements

- Plugin dependency resolution and management
- Plugin marketplace and distribution system
- Advanced plugin debugging and profiling tools
- Plugin performance monitoring and optimization
- Cross-plugin communication and data sharing APIs

## 🔗 Related Specs

- [`plugins.md`](./plugins.md) — Plugin system overview and structure
- [`hooks.md`](./hooks.md) — Event system and lifecycle hooks
- [`permissions.md`](./permissions.md) — Plugin security and access control
- [`module-api.md`](./module-api.md) — Module development patterns

---

## 📅 History

- Drafted: 2025-07-04
