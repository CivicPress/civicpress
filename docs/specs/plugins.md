# CivicPress Spec: `plugins.md`

---

version: 1.0.0 status: stable created: '2025-07-04' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive development examples
- security testing patterns
- CLI documentation
- performance testing frameworks fixes: [] migration_guide: null compatibility:
 min_civicpress: 1.0.0 max_civicpress: 'null' dependencies:
 - 'auth.md: >=1.0.0'
 - 'permissions.md: >=1.0.0'
 - 'plugin-api.md: >=1.0.0'
 - 'plugin-development.md: >=1.0.0'
 - 'testing-framework.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

Plugin System

## Purpose

Enable developers to build optional, reusable CivicPress extensions — like
custom modules, integrations, workflows, or UI enhancements — without modifying
core code.

This spec defines how plugins are structured, loaded, and sandboxed.

---

## Scope & Responsibilities

Responsibilities:

- Define plugin folder structure and manifest
- Support plugin discovery at runtime
- Enable lifecycle hooks (init, prePublish, postFeedback, etc.)
- Allow plugins to register routes, UI widgets, CLI, or workflows
- Load plugins from `.civic/plugins/` or via npm

Out of Scope:

- Full plugin marketplace (for now)
- Third-party JS execution from CDN

---

## Inputs & Outputs

| Input | Description |
| -------------------- | ---------------------------------------- |
| Plugin manifests | Plugin configuration and metadata files |
| Plugin code | JavaScript/TypeScript plugin source code |
| Plugin assets | UI components, styles, and resources |
| Plugin hooks | Event handlers and lifecycle callbacks |
| Plugin configuration | User-defined plugin settings and options |

| Output | Description |
| -------------------- | ---------------------------------------- |
| Loaded plugins | Active plugins in the CivicPress system |
| Plugin routes | API endpoints registered by plugins |
| Plugin widgets | UI components injected by plugins |
| Plugin workflows | Automated processes triggered by plugins |
| Plugin notifications | Alerts and messages from plugins |

---

## File/Folder Location

```
.civic/
├── plugins/ # Local plugin directory
│ ├── civic-anniversary/
│ │ ├── plugin.yml
│ │ ├── hooks.js
│ │ ├── routes.ts
│ │ └── widgets.vue
│ └── civic-feedback/
│ ├── plugin.yml
│ └── hooks.js
├── plugin-config.yml # Global plugin configuration
└── plugin-registry.yml # Plugin registry and metadata

core/
├── plugin-loader.ts # Plugin loading and initialization
├── plugin-manager.ts # Plugin lifecycle management
├── plugin-sandbox.ts # Plugin security sandboxing
└── plugin-api.ts # Plugin API and interfaces

modules/
├── plugins/
│ ├── components/
│ │ ├── PluginManager.tsx # Plugin management UI
│ │ ├── PluginGallery.tsx # Plugin discovery interface
│ │ └── PluginSettings.tsx # Plugin configuration UI
│ ├── hooks/
│ │ └── usePlugins.ts # Plugin data hook
│ └── utils/
│ ├── plugin-validator.ts # Plugin validation
│ └── plugin-installer.ts # Plugin installation
└── ui/
 └── components/
 └── PluginProvider.tsx # Plugin context provider

tests/
├── plugins/
│ ├── plugin-loading.test.ts
│ ├── plugin-security.test.ts
│ └── plugin-api.test.ts
└── integration/
 └── plugins-integration.test.ts
```

---

## Security & Trust Considerations

### Plugin Security

- All plugins must be cryptographically signed
- Plugin code execution in isolated sandbox environment
- Code signing verification for all plugin installations
- Automated security scanning of plugin code
- Plugin permission model with least privilege access

### Plugin Validation & Trust

- Plugin manifest validation and integrity checks
- Plugin code review and approval workflows
- Trusted plugin registry with curated plugins
- Plugin version control and update mechanisms
- Plugin compatibility testing and validation

### Access Control & Permissions

- Granular plugin permissions and capabilities
- Plugin isolation and resource limits
- Role-based plugin access and management
- Plugin audit logging and monitoring
- Emergency plugin disable capabilities

### Compliance & Legal Requirements

- Plugin licensing and legal compliance
- Support for open source plugin requirements
- Plugin data handling and privacy compliance
- Plugin security disclosure and vulnerability management
- Regular plugin security audits and assessments

### Data Protection & Privacy

- Plugin data access controls and encryption
- Plugin user data handling and privacy
- Plugin configuration data protection
- Plugin audit trail and logging
- Plugin data retention and cleanup

### Performance & Reliability

- Plugin performance monitoring and limits
- Plugin error handling and recovery
- Plugin resource usage monitoring
- Plugin dependency management and resolution
- Plugin update and rollback mechanisms

---

## Plugin Structure

```
.civic/plugins/
 └── civic-anniversary/
 ├── plugin.yml
 ├── routes.ts
 ├── widgets.vue
 └── hooks.js
```

---

## Example `plugin.yml`

```yaml
name: 'Civic Anniversary'
slug: 'civic-anniversary'
version: '1.0.0'
description: 'Adds town founding anniversary banner and calendar reminders.'
entry: 'hooks.js'
author: 'Sophie Germain'
license: 'MIT'
repository: 'https://github.com/CivicPress/civic-anniversary'
homepage: 'https://civicpress.org/plugins/anniversary'

# Plugin capabilities and permissions
capabilities:
 - 'api:routes'
 - 'ui:widgets'
 - 'cli:commands'
 - 'hooks:events'
 - 'files:read'

# Dependencies and requirements
dependencies:
 civicpress: '>=1.0.0'
 node: '>=18.0.0'

# Plugin configuration schema
config_schema:
 anniversary_date:
 type: 'string'
 format: 'date'
 description: 'Town founding anniversary date'
 required: true
 banner_enabled:
 type: 'boolean'
 default: true
 description: 'Show anniversary banner on public site'
 reminder_days:
 type: 'number'
 default: 7
 description: 'Days in advance to send reminders'

# Security and trust
security:
 signed: true
 gpg_key: '0x1234567890ABCDEF'
 permissions:
 - 'read:records'
 - 'write:notifications'
 - 'execute:cli'

# Plugin metadata
metadata:
 category: 'civic-engagement'
 tags: ['anniversary', 'calendar', 'reminders']
 maintainers:
 - 'sophie@civicpress.io'
 support:
 email: 'support@civicpress.org'
 issues: 'https://github.com/CivicPress/civic-anniversary/issues'
```

---

## Plugin Capabilities

| Feature | Plugins Can... | Example Use Case |
| ------------- | -------------------------------- | ------------------------------ |
| API | Add routes or middleware | Custom civic data endpoints |
| CLI | Register new `civic` subcommands | Administrative tools |
| Workflows | Emit or listen to hooks | Automated civic processes |
| UI | Inject widgets (admin/public) | Custom dashboards and forms |
| Files | Load records or templates | Custom record types |
| Database | Read/write via CivicPress APIs | Data integration and reporting |
| Notifications | Send custom notifications | Event-driven civic alerts |
| Scheduler | Register scheduled tasks | Automated civic workflows |

---

## ️ Plugin Development Guide

### Plugin Structure

```
.civic/plugins/
 └── civic-anniversary/
 ├── plugin.yml # Plugin manifest and configuration
 ├── package.json # Node.js dependencies
 ├── README.md # Plugin documentation
 ├── LICENSE # Open source license
 ├── hooks.js # Main plugin entry point
 ├── routes.ts # API routes (optional)
 ├── widgets.vue # UI components (optional)
 ├── cli.ts # CLI commands (optional)
 ├── types.ts # TypeScript definitions
 ├── tests/ # Test suite
 │ ├── unit/
 │ └── integration/
 ├── src/ # Source code
 │ ├── components/
 │ ├── services/
 │ └── utils/
 └── dist/ # Built assets (optional)
```

### Plugin Entry Point (`hooks.js`)

```javascript
// hooks.js - Main plugin entry point
const { Plugin, Hook, Widget, Route } = require('@civicpress/plugin-api');

class CivicAnniversaryPlugin extends Plugin {
 constructor() {
 super({
 name: 'civic-anniversary',
 version: '1.0.0',
 description: 'Town founding anniversary celebrations',
 });
 }

 // Plugin lifecycle hooks
 async onInit() {
 // Initialize plugin resources
 this.logger.info('Civic Anniversary plugin initialized');

 // Register hooks
 this.registerHook('onRecordPublished', this.handleRecordPublished);
 this.registerHook('onDailyCron', this.checkAnniversary);
 }

 async onEnable() {
 // Plugin enabled - register routes, widgets, CLI commands
 this.registerRoute('/api/anniversary', this.anniversaryHandler);
 this.registerWidget('anniversary-banner', this.AnniversaryBanner);
 this.registerCLI('anniversary', this.anniversaryCommand);
 }

 async onDisable() {
 // Cleanup when plugin disabled
 this.logger.info('Civic Anniversary plugin disabled');
 }

 // Hook handlers
 async handleRecordPublished(record) {
 if (record.type === 'bylaw' && record.status === 'adopted') {
 await this.sendAnniversaryNotification(record);
 }
 }

 async checkAnniversary() {
 const today = new Date();
 const anniversary = this.config.get('anniversary_date');

 if (this.isAnniversaryDay(today, anniversary)) {
 await this.triggerAnniversaryCelebration();
 }
 }

 // API route handler
 async anniversaryHandler(req, res) {
 const anniversary = await this.getAnniversaryData();
 res.json(anniversary);
 }

 // CLI command handler
 async anniversaryCommand(args) {
 const { list, add, remove } = args;

 if (list) {
 const events = await this.listAnniversaryEvents();
 console.table(events);
 } else if (add) {
 await this.addAnniversaryEvent(add);
 console.log('Anniversary event added');
 }
 }
}

module.exports = CivicAnniversaryPlugin;
```

### UI Widget Development (`widgets.vue`)

```vue
<!-- widgets.vue - UI Components -->
<template>
 <div class="anniversary-banner" v-if="showBanner">
 <div class="banner-content">
 <h2>🎉 {{ townName }} Anniversary</h2>
 <p>
 {{ daysUntilAnniversary }} days until our {{ anniversaryYear }}th
 anniversary!
 </p>
 <button @click="celebrate" class="celebrate-btn">
 Join the Celebration
 </button>
 </div>
 </div>
</template>

<script>
import { defineComponent } from 'vue';
import { useCivicPress } from '@civicpress/composables';

export default defineComponent({
 name: 'AnniversaryBanner',

 setup() {
 const { config, api, hooks } = useCivicPress();

 const showBanner = ref(false);
 const daysUntilAnniversary = ref(0);
 const anniversaryYear = ref(0);
 const townName = ref('');

 onMounted(async () => {
 // Load configuration
 const anniversaryDate = config.get('anniversary_date');
 const bannerEnabled = config.get('banner_enabled');

 if (bannerEnabled) {
 await calculateAnniversary();
 showBanner.value = true;
 }
 });

 const calculateAnniversary = async () => {
 const anniversary = new Date(config.get('anniversary_date'));
 const today = new Date();

 const nextAnniversary = new Date(
 today.getFullYear(),
 anniversary.getMonth(),
 anniversary.getDate()
 );

 if (nextAnniversary < today) {
 nextAnniversary.setFullYear(today.getFullYear() + 1);
 }

 const diffTime = nextAnniversary - today;
 daysUntilAnniversary.value = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
 anniversaryYear.value = nextAnniversary.getFullYear();
 townName.value = config.get('town_name');
 };

 const celebrate = async () => {
 // Emit hook for celebration event
 await hooks.emit('onAnniversaryCelebration', {
 year: anniversaryYear.value,
 town: townName.value,
 });

 // Show celebration modal or redirect
 window.location.href = '/anniversary-celebration';
 };

 return {
 showBanner,
 daysUntilAnniversary,
 anniversaryYear,
 townName,
 celebrate,
 };
 },
});
</script>

<style scoped>
.anniversary-banner {
 background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
 color: white;
 padding: 2rem;
 border-radius: 8px;
 margin: 1rem 0;
 text-align: center;
}

.celebrate-btn {
 background: rgba(255, 255, 255, 0.2);
 border: 2px solid white;
 color: white;
 padding: 0.5rem 1rem;
 border-radius: 4px;
 cursor: pointer;
 transition: all 0.3s ease;
}

.celebrate-btn:hover {
 background: rgba(255, 255, 255, 0.3);
 transform: translateY(-2px);
}
</style>
```

### API Route Development (`routes.ts`)

```typescript
// routes.ts - API Routes
import { Router, Request, Response } from 'express';
import { PluginAPI } from '@civicpress/plugin-api';

export class AnniversaryRoutes {
 private router: Router;
 private api: PluginAPI;

 constructor(api: PluginAPI) {
 this.api = api;
 this.router = Router();
 this.setupRoutes();
 }

 private setupRoutes() {
 // GET /api/anniversary - Get anniversary information
 this.router.get('/', async (req: Request, res: Response) => {
 try {
 const anniversary = await this.getAnniversaryData();
 res.json(anniversary);
 } catch (error) {
 res.status(500).json({ error: 'Failed to fetch anniversary data' });
 }
 });

 // POST /api/anniversary/events - Add anniversary event
 this.router.post('/events', async (req: Request, res: Response) => {
 try {
 const { title, date, description } = req.body;

 // Validate input
 if (!title || !date) {
 return res.status(400).json({
 error: 'Title and date are required',
 });
 }

 // Create event record
 const event = await this.api.records.create({
 type: 'anniversary-event',
 title,
 date,
 description,
 status: 'draft',
 });

 res.status(201).json(event);
 } catch (error) {
 res.status(500).json({ error: 'Failed to create event' });
 }
 });

 // GET /api/anniversary/events - List anniversary events
 this.router.get('/events', async (req: Request, res: Response) => {
 try {
 const events = await this.api.records.find({
 type: 'anniversary-event',
 status: 'published',
 });

 res.json(events);
 } catch (error) {
 res.status(500).json({ error: 'Failed to fetch events' });
 }
 });
 }

 private async getAnniversaryData() {
 const config = await this.api.config.get('anniversary');
 const townName = await this.api.config.get('town_name');

 return {
 townName,
 anniversaryDate: config.anniversary_date,
 daysUntilAnniversary: this.calculateDaysUntil(config.anniversary_date),
 events: await this.getUpcomingEvents(),
 };
 }

 private calculateDaysUntil(dateString: string): number {
 const anniversary = new Date(dateString);
 const today = new Date();

 const nextAnniversary = new Date(
 today.getFullYear(),
 anniversary.getMonth(),
 anniversary.getDate()
 );

 if (nextAnniversary < today) {
 nextAnniversary.setFullYear(today.getFullYear() + 1);
 }

 const diffTime = nextAnniversary.getTime() - today.getTime();
 return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
 }

 private async getUpcomingEvents() {
 const events = await this.api.records.find({
 type: 'anniversary-event',
 status: 'published',
 date: { $gte: new Date().toISOString() },
 });

 return events.sort(
 (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
 );
 }

 getRouter(): Router {
 return this.router;
 }
}
```

### ️ CLI Command Development (`cli.ts`)

```typescript
// cli.ts - CLI Commands
import { Command, Option } from 'commander';
import { PluginAPI } from '@civicpress/plugin-api';

export class AnniversaryCLI {
 private api: PluginAPI;

 constructor(api: PluginAPI) {
 this.api = api;
 }

 registerCommands(program: Command) {
 const anniversary = program
 .command('anniversary')
 .description('Manage anniversary events and celebrations')
 .addOption(new Option('-l, --list', 'List all anniversary events'))
 .addOption(new Option('-a, --add <event>', 'Add new anniversary event'))
 .addOption(new Option('-r, --remove <id>', 'Remove anniversary event'))
 .addOption(
 new Option('-c, --celebrate', 'Trigger anniversary celebration')
 )
 .action(this.handleCommand.bind(this));

 // Subcommands
 anniversary
 .command('events')
 .description('Manage anniversary events')
 .option('-l, --list', 'List events')
 .option('-a, --add <title>', 'Add event')
 .option('-d, --date <date>', 'Event date')
 .option('-r, --remove <id>', 'Remove event')
 .action(this.handleEvents.bind(this));

 anniversary
 .command('celebrate')
 .description('Trigger anniversary celebration')
 .option('-y, --year <year>', 'Celebration year')
 .option('-m, --message <message>', 'Custom celebration message')
 .action(this.handleCelebration.bind(this));
 }

 async handleCommand(options: any) {
 if (options.list) {
 await this.listEvents();
 } else if (options.add) {
 await this.addEvent(options.add);
 } else if (options.remove) {
 await this.removeEvent(options.remove);
 } else if (options.celebrate) {
 await this.triggerCelebration();
 } else {
 console.log('Use --help for available options');
 }
 }

 async handleEvents(options: any) {
 if (options.list) {
 await this.listEvents();
 } else if (options.add) {
 const eventData = {
 title: options.add,
 date: options.date || new Date().toISOString(),
 description: options.description || '',
 };
 await this.addEvent(eventData);
 } else if (options.remove) {
 await this.removeEvent(options.remove);
 }
 }

 async handleCelebration(options: any) {
 const year = options.year || new Date().getFullYear();
 const message = options.message || `Happy ${year}th Anniversary!`;

 await this.triggerCelebration({ year, message });
 }

 private async listEvents() {
 try {
 const events = await this.api.records.find({
 type: 'anniversary-event',
 status: 'published',
 });

 if (events.length === 0) {
 console.log('No anniversary events found.');
 return;
 }

 console.log('\nAnniversary Events:');
 console.log('==================');

 events.forEach((event, index) => {
 console.log(`${index + 1}. ${event.title}`);
 console.log(` Date: ${new Date(event.date).toLocaleDateString()}`);
 console.log(` Description: ${event.description || 'No description'}`);
 console.log('');
 });
 } catch (error) {
 console.error('Failed to list events:', error.message);
 }
 }

 private async addEvent(eventData: any) {
 try {
 const event = await this.api.records.create({
 type: 'anniversary-event',
 title: eventData.title,
 date: eventData.date,
 description: eventData.description,
 status: 'draft',
 });

 console.log(
 `✅ Anniversary event "${eventData.title}" added successfully!`
 );
 console.log(`Event ID: ${event.id}`);
 } catch (error) {
 console.error('Failed to add event:', error.message);
 }
 }

 private async removeEvent(eventId: string) {
 try {
 await this.api.records.delete(eventId);
 console.log(`✅ Event ${eventId} removed successfully!`);
 } catch (error) {
 console.error('Failed to remove event:', error.message);
 }
 }

 private async triggerCelebration(options: any = {}) {
 try {
 // Emit celebration hook
 await this.api.hooks.emit('onAnniversaryCelebration', {
 year: options.year,
 message: options.message,
 timestamp: new Date().toISOString(),
 });

 // Send notifications
 await this.api.notifications.send({
 type: 'anniversary-celebration',
 title: '🎉 Anniversary Celebration!',
 message: options.message,
 recipients: ['public'],
 });

 console.log('🎉 Anniversary celebration triggered successfully!');
 console.log(`Year: ${options.year}`);
 console.log(`Message: ${options.message}`);
 } catch (error) {
 console.error('Failed to trigger celebration:', error.message);
 }
 }
}
```

### Package Configuration (`package.json`)

```json
{
 "name": "civic-anniversary",
 "version": "1.0.0",
 "description": "CivicPress plugin for town anniversary celebrations",
 "main": "hooks.js",
 "type": "module",
 "scripts": {
 "build": "tsc",
 "test": "jest",
 "lint": "eslint src/**/*.ts",
 "dev": "civic plugin dev",
 "validate": "civic plugin validate"
 },
 "dependencies": {
 "@civicpress/plugin-api": "^1.0.0",
 "vue": "^3.0.0",
 "express": "^4.18.0"
 },
 "devDependencies": {
 "@types/node": "^18.0.0",
 "@types/express": "^4.17.0",
 "typescript": "^5.0.0",
 "jest": "^29.0.0",
 "eslint": "^8.0.0"
 },
 "peerDependencies": {
 "civicpress": ">=1.0.0"
 },
 "civicpress": {
 "plugin": true,
 "capabilities": [
 "api:routes",
 "ui:widgets",
 "cli:commands",
 "hooks:events",
 "files:read"
 ]
 },
 "keywords": ["civicpress", "plugin", "anniversary", "civic-engagement"],
 "author": "Sophie Germain <sophie@civicpress.io>",
 "license": "MIT",
 "repository": {
 "type": "git",
 "url": "https://github.com/CivicPress/civic-anniversary.git"
 },
 "bugs": {
 "url": "https://github.com/CivicPress/civic-anniversary/issues"
 },
 "homepage": "https://civicpress.org/plugins/anniversary"
}
```

---

## Testing & Validation

- Load sample plugin in dev mode
- Validate routes/widgets/hooks execute properly
- Simulate invalid or malicious plugin
- CLI: `civic plugins list` / `civic plugins validate`

---

## ️ Future Enhancements

- Plugin manager UI
- Versioned plugin registry or curated hub
- Scoped permissions per plugin
- Plugin dependency resolution

## Related Specs

- [`module-api.md`](./module-api.md) — Module development and integration
- [`hooks.md`](./hooks.md) — Plugin event system and lifecycle hooks
- [`permissions.md`](./permissions.md) — Plugin security and access control
- [`workflows.md`](./workflows.md) — Plugin workflow integration

---

## History

- Drafted: 2025-07-04
