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
        let service;
        try {
          service = createConfigService();
        } catch (serviceError: any) {
          const serviceErrMsg =
            serviceError?.message ||
            serviceError?.toString() ||
            String(serviceError) ||
            'Unknown error';
          throw new Error(
            `Failed to create configuration service: ${serviceErrMsg}`
          );
        }

        let status;
        try {
          status = await service.getConfigurationStatus();
        } catch (statusError: any) {
          const statusErrMsg =
            statusError?.message ||
            statusError?.toString() ||
            String(statusError) ||
            'Unknown error';
          throw new Error(
            `Failed to get configuration status: ${statusErrMsg}`
          );
        }

        const initOne = async (t: string) => {
          try {
            const state = (status as any)[t];
            if (state === 'user') return { type: t, created: false };
            await service.resetToDefaults(t);
            return { type: t, created: true };
          } catch (innerError: any) {
            // Wrap inner error with more context
            const innerMsg =
              innerError?.message ||
              innerError?.toString() ||
              String(innerError) ||
              'Unknown inner error';
            throw new Error(
              `Failed to reset config ${t} to defaults: ${innerMsg}`
            );
          }
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
        for (const t of types) {
          try {
            results.push(await initOne(t));
          } catch (initError: any) {
            // Enhanced error extraction to handle empty messages
            let initErrMsg = 'Unknown error';
            if (initError?.message && initError.message.trim()) {
              initErrMsg = initError.message;
            } else if (typeof initError === 'string' && initError.trim()) {
              initErrMsg = initError;
            } else if (
              initError?.toString &&
              initError.toString() !== '[object Object]' &&
              initError.toString().trim()
            ) {
              initErrMsg = initError.toString();
            } else if (initError?.stack) {
              initErrMsg = initError.stack.split('\n')[0];
            } else if (initError?.code) {
              initErrMsg = `Error code: ${initError.code}`;
            } else if (initError?.name) {
              initErrMsg = `Error: ${initError.name}`;
            } else {
              // Last resort: try to stringify the entire error object
              try {
                const errorStr = JSON.stringify(
                  initError,
                  Object.getOwnPropertyNames(initError)
                );
                if (errorStr && errorStr !== '{}') {
                  initErrMsg = `Error details: ${errorStr}`;
                }
              } catch {
                // If stringification fails, use a generic message with the type
                initErrMsg = `Error of type ${typeof initError} occurred`;
              }
            }
            throw new Error(
              `Failed to initialize configuration ${t}: ${initErrMsg}`
            );
          }
        }

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
        // Extract error message from various error formats
        let errorMessage = 'Unknown error';
        if (err?.message && err.message.trim()) {
          errorMessage = err.message;
        } else if (typeof err === 'string' && err.trim()) {
          errorMessage = err;
        } else if (
          err?.toString &&
          err.toString() !== '[object Object]' &&
          err.toString().trim()
        ) {
          errorMessage = err.toString();
        } else if (err?.stack) {
          errorMessage = err.stack.split('\n')[0];
        }

        // If still empty, try to get more context
        if (
          errorMessage === 'Unknown error' ||
          !errorMessage.trim() ||
          errorMessage === 'Error'
        ) {
          // Build a descriptive error message from available properties
          const parts: string[] = [];
          if (err?.name) parts.push(`Error type: ${err.name}`);
          if (err?.code) parts.push(`Code: ${err.code}`);
          if (err?.path) parts.push(`Path: ${err.path}`);
          if (err?.syscall) parts.push(`Syscall: ${err.syscall}`);
          if (err?.errno) parts.push(`Errno: ${err.errno}`);

          if (parts.length > 0) {
            errorMessage = parts.join(', ');
          } else if (err?.stack) {
            // Use first non-empty line from stack
            const stackLines = err.stack
              .split('\n')
              .filter((line: string) => line.trim());
            if (stackLines.length > 1) {
              errorMessage = stackLines[1].trim();
            } else if (stackLines.length > 0) {
              errorMessage = stackLines[0].trim();
            }
          }

          // Final fallback
          if (
            !errorMessage ||
            errorMessage === 'Unknown error' ||
            errorMessage === 'Error'
          ) {
            errorMessage =
              'Error occurred during initialization (no error details available)';
          }
        }

        if (json) {
          console.log(
            JSON.stringify({ success: false, error: errorMessage }, null, 2)
          );
        } else {
          // Always output error message, even if logger might suppress it
          // Use console.error directly to ensure it's always visible
          if (errorMessage && errorMessage.trim()) {
            console.error('❌ Initialization failed:', errorMessage);
            logger.error('❌ Initialization failed:', errorMessage);
          } else {
            // Fallback: output directly to stderr if message is empty
            console.error(
              '❌ Initialization failed: Error occurred (no error message available)'
            );
            // Also log the raw error object for debugging
            if (err) {
              console.error(
                'Raw error object:',
                JSON.stringify(err, Object.getOwnPropertyNames(err), 2)
              );
            }
          }
          if (err?.stack && !json) {
            console.error('Stack trace:', err.stack);
            logger.debug('Stack trace:', err.stack);
          }
        }
        process.exit(1);
      }
    });
}
