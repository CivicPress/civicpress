import { CAC } from 'cac';
import { promises as fsp } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import {
  ConfigurationService,
  CentralConfigManager,
  Logger,
} from '@civicpress/core';
import { createRequire } from 'module';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';
import { AuthUtils } from '../utils/auth-utils.js';

function createConfigService(): ConfigurationService {
  const central = CentralConfigManager.getConfig();
  const dataDir = central.dataDir || 'data';
  const require = createRequire(import.meta.url);

  // Resolve defaults path via the core package root to work in tests and repo root
  let defaultsPath = path.join(process.cwd(), 'core', 'src', 'defaults');
  try {
    const corePkgPath = require.resolve('@civicpress/core/package.json');
    const coreRoot = path.dirname(corePkgPath); // .../core
    const candidate = path.join(coreRoot, 'src', 'defaults');
    if (fs.existsSync(candidate)) {
      defaultsPath = candidate;
    }
  } catch {
    // fallback to process.cwd-based path
  }

  return new ConfigurationService({
    dataPath: path.join(dataDir, '.civic'),
    defaultsPath,
    systemDataPath: path.join(process.cwd(), '.system-data'),
  });
}

export function registerConfigCommands(cli: CAC) {
  // Status of configurations (user/default/missing)
  cli
    .command(
      'config:status',
      'Show configuration status (user/default/missing)'
    )
    .action(async () => {
      const logger = initializeLogger();
      const { json } = getGlobalOptionsFromArgs();
      try {
        const service = createConfigService();
        const status = await service.getConfigurationStatus();
        if (json) {
          console.log(JSON.stringify({ success: true, data: status }, null, 2));
        } else {
          logger.info('📊 Configuration status:');
          for (const [type, state] of Object.entries(status)) {
            logger.info(`  • ${type}: ${state}`);
          }
        }
      } catch (err: any) {
        if (json) {
          console.log(
            JSON.stringify(
              { success: false, error: err?.message || String(err) },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Failed to get configuration status:', err);
        }
        process.exit(1);
      }
    });

  // List available configurations
  cli
    .command('config:list', 'List available configuration files')
    .action(async () => {
      const logger = initializeLogger();
      const { json } = getGlobalOptionsFromArgs();
      try {
        const service = createConfigService();
        const list = await service.getConfigurationList();
        if (json) {
          console.log(JSON.stringify({ success: true, data: list }, null, 2));
        } else {
          logger.info('📄 Available configurations:');
          for (const item of list) {
            logger.info(`  • ${item.file} (${item.status})`);
            logger.debug(`    ${item.name} — ${item.description}`);
          }
        }
      } catch (err: any) {
        if (json) {
          console.log(
            JSON.stringify(
              { success: false, error: err?.message || String(err) },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Failed to list configurations:', err);
        }
        process.exit(1);
      }
    });

  // Get configuration (optionally raw YAML)
  cli
    .command('config:get <type>', 'Get a configuration file')
    .option('--raw', 'Output raw YAML (no transforms)')
    .action(async (type: string, options: any) => {
      const logger = initializeLogger();
      const { json } = getGlobalOptionsFromArgs();
      try {
        const service = createConfigService();
        if (options.raw) {
          const yamlTxt = await (service as any).loadRawConfigurationYAML(type);
          if (json) {
            console.log(
              JSON.stringify(
                { success: true, data: { type, yaml: yamlTxt } },
                null,
                2
              )
            );
          } else {
            // Print raw YAML directly
            process.stdout.write(yamlTxt);
          }
        } else {
          const config = await service.loadConfiguration(type);
          if (json) {
            console.log(
              JSON.stringify({ success: true, data: config }, null, 2)
            );
          } else {
            logger.info(`📄 ${type} (normalized):`);
            logger.info(JSON.stringify(config, null, 2));
          }
        }
      } catch (err: any) {
        if (json) {
          console.log(
            JSON.stringify(
              { success: false, error: err?.message || String(err) },
              null,
              2
            )
          );
        } else {
          logger.error(`❌ Failed to get configuration '${type}':`, err);
        }
        process.exit(1);
      }
    });

  // Put configuration (raw YAML only for now)
  cli
    .command('config:put <type>', 'Save a configuration file')
    .option('--raw', 'Save raw YAML (no transforms)', { default: true })
    .option('--file <path>', 'Path to YAML file to save')
    .option('--token <token>', 'Session token for authentication (for audit)')
    .action(async (type: string, options: any) => {
      const logger = initializeLogger();
      const { json } = getGlobalOptionsFromArgs();
      const coreMod: any = await import('@civicpress/core');
      const audit = new coreMod.AuditLogger();
      let actor: any | undefined;
      if (options?.token) {
        try {
          actor = await AuthUtils.requireAuth(options.token, json);
        } catch {}
      }
      try {
        const service = createConfigService();

        if (!options.file) {
          throw new Error('Missing --file <path> argument');
        }
        const filePath = path.resolve(options.file);
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }
        const yamlTxt = await fsp.readFile(filePath, 'utf8');
        await (service as any).saveRawConfigurationYAML(type, yamlTxt);

        if (json) {
          console.log(
            JSON.stringify({ success: true, data: { type } }, null, 2)
          );
        } else {
          logger.success(`✅ Saved configuration '${type}'`);
        }
        await audit.log({
          source: 'cli',
          actor: actor
            ? { username: actor.username, role: actor.role }
            : undefined,
          action: 'config_put',
          target: { type: 'config', name: type },
          outcome: 'success',
        });
      } catch (err: any) {
        await audit.log({
          source: 'cli',
          actor: actor
            ? { username: actor.username, role: actor.role }
            : undefined,
          action: 'config_put',
          target: { type: 'config', name: type },
          outcome: 'failure',
          message: err?.message || String(err),
        });
        if (json) {
          console.log(
            JSON.stringify(
              { success: false, error: err?.message || String(err) },
              null,
              2
            )
          );
        } else {
          logger.error(`❌ Failed to save configuration '${type}':`, err);
        }
        process.exit(1);
      }
    });

  // Validate configuration(s)
  cli
    .command('config:validate [type]', 'Validate configuration (one or all)')
    .option('--all', 'Validate all configurations')
    .option('--token <token>', 'Session token for authentication (for audit)')
    .action(async (type: string | undefined, options: any) => {
      const logger = initializeLogger();
      const { json } = getGlobalOptionsFromArgs();
      const coreMod: any = await import('@civicpress/core');
      const audit = new coreMod.AuditLogger();
      let actor: any | undefined;
      if (options?.token) {
        try {
          actor = await AuthUtils.requireAuth(options.token, json);
        } catch {}
      }
      try {
        const service = createConfigService();

        const validateOne = async (t: string) => {
          const result = await service.validateConfiguration(t);
          return { type: t, ...result };
        };

        if (options.all) {
          const list = await service.getConfigurationList();
          const types = list.map((i: any) => i.file);
          const results = [] as any[];
          for (const t of types) {
            results.push(await validateOne(t));
          }
          if (json) {
            console.log(
              JSON.stringify({ success: true, data: results }, null, 2)
            );
          } else {
            logger.info('🔍 Configuration validation results:');
            for (const r of results) {
              if (r.valid) {
                logger.info(`  ✅ ${r.type}: valid`);
              } else {
                logger.error(`  ❌ ${r.type}: invalid`);
                for (const e of r.errors) logger.error(`     - ${e}`);
              }
            }
          }
          await audit.log({
            source: 'cli',
            actor: actor
              ? { username: actor.username, role: actor.role }
              : undefined,
            action: 'config_validate_all',
            target: { type: 'config', name: 'all' },
            outcome: 'success',
            metadata: { total: results.length },
          });
        } else if (type) {
          const r = await validateOne(type);
          if (json) {
            console.log(JSON.stringify({ success: true, data: r }, null, 2));
          } else {
            if (r.valid) {
              logger.success(`✅ ${type} is valid`);
            } else {
              logger.error(`❌ ${type} is invalid`);
              for (const e of r.errors) logger.error(`   - ${e}`);
            }
          }
          await audit.log({
            source: 'cli',
            actor: actor
              ? { username: actor.username, role: actor.role }
              : undefined,
            action: 'config_validate',
            target: { type: 'config', name: type },
            outcome: r.valid ? 'success' : 'failure',
          });
        } else {
          if (json) {
            console.log(
              JSON.stringify(
                { success: false, error: 'Specify a type or use --all' },
                null,
                2
              )
            );
          } else {
            logger.info('Usage: civic config:validate <type> | --all');
          }
          process.exit(1);
        }
      } catch (err: any) {
        await audit.log({
          source: 'cli',
          actor: actor
            ? { username: actor.username, role: actor.role }
            : undefined,
          action: 'config_validate',
          target: { type: 'config', name: type || 'all' },
          outcome: 'failure',
          message: err?.message || String(err),
        });
        if (json) {
          console.log(
            JSON.stringify(
              { success: false, error: err?.message || String(err) },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Validation failed:', err);
        }
        process.exit(1);
      }
    });

  // Reset to defaults
  cli
    .command('config:reset <type>', 'Reset a configuration to defaults')
    .option('--token <token>', 'Session token for authentication (for audit)')
    .action(async (type: string, options: any) => {
      const logger = initializeLogger();
      const { json } = getGlobalOptionsFromArgs();
      const coreMod: any = await import('@civicpress/core');
      const audit = new coreMod.AuditLogger();
      let actor: any | undefined;
      if (options?.token) {
        try {
          actor = await AuthUtils.requireAuth(options.token, json);
        } catch {}
      }
      try {
        const service = createConfigService();
        await service.resetToDefaults(type);
        if (json) {
          console.log(
            JSON.stringify({ success: true, data: { type } }, null, 2)
          );
        } else {
          logger.success(`✅ Reset '${type}' to defaults`);
        }
        await audit.log({
          source: 'cli',
          actor: actor
            ? { username: actor.username, role: actor.role }
            : undefined,
          action: 'config_reset',
          target: { type: 'config', name: type },
          outcome: 'success',
        });
      } catch (err: any) {
        await audit.log({
          source: 'cli',
          actor: actor
            ? { username: actor.username, role: actor.role }
            : undefined,
          action: 'config_reset',
          target: { type: 'config', name: type },
          outcome: 'failure',
          message: err?.message || String(err),
        });
        if (json) {
          console.log(
            JSON.stringify(
              { success: false, error: err?.message || String(err) },
              null,
              2
            )
          );
        } else {
          logger.error(`❌ Failed to reset '${type}':`, err);
        }
        process.exit(1);
      }
    });

  // Export configurations to a directory
  cli
    .command('config:export', 'Export configurations to a directory')
    .option('--dir <path>', 'Destination directory', {
      default: 'civic-config-export',
    })
    .option('--token <token>', 'Session token for authentication (for audit)')
    .action(async (options: any) => {
      const logger = initializeLogger();
      const { json } = getGlobalOptionsFromArgs();
      const coreMod: any = await import('@civicpress/core');
      const audit = new coreMod.AuditLogger();
      let actor: any | undefined;
      if (options?.token) {
        try {
          actor = await AuthUtils.requireAuth(options.token, json);
        } catch {}
      }
      try {
        const service = createConfigService();
        const destRoot = path.resolve(options.dir);
        const destCivic = path.join(destRoot, 'data', '.civic');
        const destSystem = path.join(destRoot, '.system-data');

        await fsp.mkdir(destCivic, { recursive: true });
        await fsp.mkdir(destSystem, { recursive: true });

        const list = await service.getConfigurationList();
        for (const item of list) {
          const type = item.file;
          const yamlTxt = await (service as any).loadRawConfigurationYAML(type);
          if (type === 'notifications') {
            await fsp.writeFile(
              path.join(destSystem, `${type}.yml`),
              yamlTxt,
              'utf8'
            );
          } else {
            await fsp.writeFile(
              path.join(destCivic, `${type}.yml`),
              yamlTxt,
              'utf8'
            );
          }
        }

        if (json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                data: { dir: destRoot, files: list.map((i: any) => i.file) },
              },
              null,
              2
            )
          );
        } else {
          logger.success(`✅ Exported configurations to ${destRoot}`);
        }
        await audit.log({
          source: 'cli',
          actor: actor
            ? { username: actor.username, role: actor.role }
            : undefined,
          action: 'config_export',
          target: { type: 'config', name: 'all' },
          outcome: 'success',
          metadata: { dir: destRoot },
        });
      } catch (err: any) {
        await audit.log({
          source: 'cli',
          actor: actor
            ? { username: actor.username, role: actor.role }
            : undefined,
          action: 'config_export',
          target: { type: 'config', name: 'all' },
          outcome: 'failure',
          message: err?.message || String(err),
        });
        if (json) {
          console.log(
            JSON.stringify(
              { success: false, error: err?.message || String(err) },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Export failed:', err);
        }
        process.exit(1);
      }
    });

  // Import configurations from a directory
  cli
    .command('config:import', 'Import configurations from a directory')
    .option('--dir <path>', 'Source directory', {
      default: 'civic-config-export',
    })
    .option('--token <token>', 'Session token for authentication (for audit)')
    .action(async (options: any) => {
      const logger = initializeLogger();
      const { json } = getGlobalOptionsFromArgs();
      const coreMod: any = await import('@civicpress/core');
      const audit = new coreMod.AuditLogger();
      let actor: any | undefined;
      if (options?.token) {
        try {
          actor = await AuthUtils.requireAuth(options.token, json);
        } catch {}
      }
      try {
        const service = createConfigService();
        const srcRoot = path.resolve(options.dir);
        const srcCivic = path.join(srcRoot, 'data', '.civic');
        const srcSystem = path.join(srcRoot, '.system-data');

        const toImport = [
          { type: 'org-config', file: path.join(srcCivic, 'org-config.yml') },
          { type: 'roles', file: path.join(srcCivic, 'roles.yml') },
          { type: 'workflows', file: path.join(srcCivic, 'workflows.yml') },
          { type: 'hooks', file: path.join(srcCivic, 'hooks.yml') },
          {
            type: 'notifications',
            file: path.join(srcSystem, 'notifications.yml'),
          },
        ];

        const imported: string[] = [];
        for (const item of toImport) {
          if (fs.existsSync(item.file)) {
            const yamlTxt = await fsp.readFile(item.file, 'utf8');
            await (service as any).saveRawConfigurationYAML(item.type, yamlTxt);
            imported.push(item.type);
          }
        }

        if (json) {
          console.log(
            JSON.stringify({ success: true, data: { imported } }, null, 2)
          );
        } else {
          logger.success(`✅ Imported configurations: ${imported.join(', ')}`);
        }
        await audit.log({
          source: 'cli',
          actor: actor
            ? { username: actor.username, role: actor.role }
            : undefined,
          action: 'config_import',
          target: { type: 'config', name: 'multiple' },
          outcome: 'success',
          metadata: { imported },
        });
      } catch (err: any) {
        await audit.log({
          source: 'cli',
          actor: actor
            ? { username: actor.username, role: actor.role }
            : undefined,
          action: 'config_import',
          target: { type: 'config', name: 'multiple' },
          outcome: 'failure',
          message: err?.message || String(err),
        });
        if (json) {
          console.log(
            JSON.stringify(
              { success: false, error: err?.message || String(err) },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Import failed:', err);
        }
        process.exit(1);
      }
    });

  // Initialize configurations from defaults if missing
  cli
    .command(
      'config:init [type]',
      'Create user configs from defaults if missing'
    )
    .option('--all', 'Initialize all configurations')
    .action(async (type: string | undefined, options: any) => {
      const logger = initializeLogger();
      const { json } = getGlobalOptionsFromArgs();
      try {
        const service = createConfigService();
        const status = await service.getConfigurationStatus();

        const initOne = async (t: string) => {
          const state = (status as any)[t];
          if (state === 'user') return { type: t, created: false };
          await service.resetToDefaults(t);
          return { type: t, created: true };
        };

        const types = options.all ? Object.keys(status) : type ? [type] : [];
        if (types.length === 0) {
          if (json) {
            console.log(
              JSON.stringify(
                { success: false, error: 'Specify a type or use --all' },
                null,
                2
              )
            );
          } else {
            logger.info('Usage: civic config:init <type> | --all');
          }
          process.exit(1);
        }

        const results: Array<{ type: string; created: boolean }> = [];
        for (const t of types) results.push(await initOne(t));

        if (json) {
          console.log(
            JSON.stringify({ success: true, data: results }, null, 2)
          );
        } else {
          for (const r of results) {
            if (r.created)
              logger.success(`✅ Initialized '${r.type}' from defaults`);
            else logger.info(`ℹ️  Skipped '${r.type}' (already exists)`);
          }
        }
      } catch (err: any) {
        const errorMessage = err?.message || err?.toString() || 'Unknown error';
        if (json) {
          console.log(
            JSON.stringify({ success: false, error: errorMessage }, null, 2)
          );
        } else {
          logger.error('❌ Initialization failed:', errorMessage);
        }
        process.exit(1);
      }
    });
}
