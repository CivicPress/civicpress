/* eslint-disable @typescript-eslint/no-explicit-any -- CLI command handlers pass CAC's untyped options through withCli. */
import { withCli } from '../utils/with-cli.js';
import { CAC } from 'cac';
import { promises as fsp } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationService, CentralConfigManager } from '@civicpress/core';
import { createRequire } from 'module';
import {} from '../utils/global-options.js';
import { AuthUtils } from '../utils/auth-utils.js';
import { cliSuccess, cliError } from '../utils/cli-output.js';

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

/**
 * Derive a human error string from whatever config:init's `resetToDefaults`
 * threw. Extracted verbatim from the old catch so the withCli details thunk
 * reports exactly what it used to: message, then a non-`[object Object]`
 * toString, then the first stack line, and — when all of those are empty —
 * the structured fields (name/code/path/syscall/errno) as a last resort.
 */
function describeInitError(err: any): string {
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

  if (
    errorMessage === 'Unknown error' ||
    !errorMessage.trim() ||
    errorMessage === 'Error'
  ) {
    const parts: string[] = [];
    if (err?.name) parts.push(`Error type: ${err.name}`);
    if (err?.code) parts.push(`Code: ${err.code}`);
    if (err?.path) parts.push(`Path: ${err.path}`);
    if (err?.syscall) parts.push(`Syscall: ${err.syscall}`);
    if (err?.errno) parts.push(`Errno: ${err.errno}`);

    errorMessage =
      parts.length > 0
        ? parts.join(', ')
        : 'Error occurred during initialization (no error details available)';
  }

  return errorMessage;
}

export function registerConfigCommands(cli: CAC) {
  // Status of configurations (user/default/missing)
  cli
    .command(
      'config:status',
      'Show configuration status (user/default/missing)'
    )
    .action(
      withCli(
        {
          operation: 'config:status',
          errorMessage: 'Failed to get configuration status',
          errorCode: 'GET_CONFIG_STATUS_FAILED',
          details: (error) => ({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
        async (_ctx) => {
          const service = createConfigService();
          const status = await service.getConfigurationStatus();

          cliSuccess({ status }, `Configuration status retrieved`, {
            operation: 'config:status',
            configCount: Object.keys(status).length,
          });
        }
      )
    );

  // List available configurations
  cli.command('config:list', 'List available configuration files').action(
    withCli(
      {
        operation: 'config:list',
        errorMessage: 'Failed to list configurations',
        errorCode: 'LIST_CONFIGS_FAILED',
        details: (error) => ({
          error: error instanceof Error ? error.message : String(error),
        }),
      },
      async (_ctx) => {
        const service = createConfigService();
        const list = await service.getConfigurationList();

        cliSuccess(
          { list },
          `Found ${list.length} available configuration${list.length === 1 ? '' : 's'}`,
          {
            operation: 'config:list',
            configCount: list.length,
          }
        );
      }
    )
  );

  // Get configuration (optionally raw YAML)
  cli
    .command('config:get <type>', 'Get a configuration file')
    .option('--raw', 'Output raw YAML (no transforms)')
    .action(
      withCli<[any, any]>(
        {
          operation: 'config:get',
          errorMessage: (type: any) => `Failed to get configuration '${type}'`,
          errorCode: 'GET_CONFIG_FAILED',
          details: (error, type, _options) => ({
            error: error instanceof Error ? error.message : String(error),
            configType: type,
          }),
        },
        async (_ctx, type: any, options: any) => {
          const service = createConfigService();
          if (options.raw) {
            const yamlTxt = await (service as any).loadRawConfigurationYAML(
              type
            );
            cliSuccess(
              { type, yaml: yamlTxt },
              `Raw configuration for ${type}`,
              {
                operation: 'config:get',
                configType: type,
                format: 'raw',
              }
            );
          } else {
            const config = await service.loadConfiguration(type);
            cliSuccess({ config }, `Configuration for ${type} (normalized)`, {
              operation: 'config:get',
              configType: type,
              format: 'normalized',
            });
          }
        }
      )
    );

  // Put configuration (raw YAML only for now)
  cli
    .command('config:put <type>', 'Save a configuration file')
    .option('--raw', 'Save raw YAML (no transforms)', { default: true })
    .option('--file <path>', 'Path to YAML file to save')
    .option('--token <token>', 'Session token for authentication (for audit)')
    .action(
      withCli<[any, any]>(
        {
          operation: 'config:put',
          errorMessage: (type: any) => `Failed to save configuration '${type}'`,
          errorCode: 'SAVE_CONFIG_FAILED',
          details: (error, type, _options) => ({
            error: error instanceof Error ? error.message : String(error),
            configType: type,
          }),
        },
        async ({ globalOptions }, type: any, options: any) => {
          const coreMod: any = await import('@civicpress/core');
          const audit = new coreMod.AuditLogger();
          let actor: any | undefined;
          if (options?.token) {
            try {
              actor = await AuthUtils.requireAuth(
                options.token,
                globalOptions.json
              );
            } catch {
              // intentional: auth failure is non-fatal — continue as anonymous
            }
          }
          try {
            const service = createConfigService();

            if (!options.file) {
              cliError(
                'Missing --file <path> argument',
                'VALIDATION_ERROR',
                undefined,
                'config:put'
              );
              process.exit(1);
            }
            const filePath = path.resolve(options.file);
            if (!fs.existsSync(filePath)) {
              cliError(
                `File not found: ${filePath}`,
                'FILE_NOT_FOUND',
                undefined,
                'config:put'
              );
              process.exit(1);
            }
            const yamlTxt = await fsp.readFile(filePath, 'utf8');
            await (service as any).saveRawConfigurationYAML(type, yamlTxt);

            cliSuccess({ type }, `Saved configuration '${type}'`, {
              operation: 'config:put',
              configType: type,
            });

            await audit.log({
              source: 'cli',
              actor: actor
                ? { username: actor.username, role: actor.role }
                : undefined,
              action: 'config_put',
              target: { type: 'config', name: type },
              outcome: 'success',
            });
          } catch (error) {
            // The failure audit record is written HERE rather than in the
            // wrapper: it needs the handler's own context (actor, target,
            // config type). Re-thrown so withCli still reports and exits.
            // Moving this catch wholesale would have silently dropped
            // failure auditing from every config-mutating command.
            await audit.log({
              source: 'cli',
              actor: actor
                ? { username: actor.username, role: actor.role }
                : undefined,
              action: 'config_put',
              target: { type: 'config', name: type },
              outcome: 'failure',
              message: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }
      )
    );

  // Validate configuration(s)
  cli
    .command('config:validate [type]', 'Validate configuration (one or all)')
    .option('--all', 'Validate all configurations')
    .option('--token <token>', 'Session token for authentication (for audit)')
    .action(
      withCli<[any, any]>(
        {
          operation: 'config:validate',
          errorMessage: 'Configuration validation failed',
          errorCode: 'VALIDATION_ERROR',
          details: (error, type, _options) => ({
            error: error instanceof Error ? error.message : String(error),
            configType: type || 'all',
          }),
        },
        async ({ globalOptions }, type: any, options: any) => {
          const coreMod: any = await import('@civicpress/core');
          const audit = new coreMod.AuditLogger();
          let actor: any | undefined;
          if (options?.token) {
            try {
              actor = await AuthUtils.requireAuth(
                options.token,
                globalOptions.json
              );
            } catch {
              // intentional: auth failure is non-fatal — continue as anonymous
            }
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

              const validCount = results.filter((r) => r.valid).length;
              const invalidCount = results.length - validCount;
              const message =
                invalidCount === 0
                  ? `All ${results.length} configuration${results.length === 1 ? '' : 's'} are valid`
                  : `${validCount} valid, ${invalidCount} invalid configuration${results.length === 1 ? '' : 's'}`;

              cliSuccess({ results }, message, {
                operation: 'config:validate',
                totalCount: results.length,
                validCount,
                invalidCount,
              });

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

              if (r.valid) {
                cliSuccess({ result: r }, `Configuration '${type}' is valid`, {
                  operation: 'config:validate',
                  configType: type,
                });
              } else {
                cliError(
                  `Configuration '${type}' is invalid: ${r.errors.join(', ')}`,
                  'VALIDATION_FAILED',
                  {
                    errors: r.errors,
                    configType: type,
                  },
                  'config:validate'
                );
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

              if (!r.valid) {
                process.exit(1);
              }
            } else {
              cliError(
                'Specify a type or use --all',
                'VALIDATION_ERROR',
                undefined,
                'config:validate'
              );
              process.exit(1);
            }
          } catch (error) {
            // The failure audit record is written HERE rather than in the
            // wrapper: it needs the handler's own context (actor, target,
            // config type). Re-thrown so withCli still reports and exits.
            // Moving this catch wholesale would have silently dropped
            // failure auditing from every config-mutating command.
            await audit.log({
              source: 'cli',
              actor: actor
                ? { username: actor.username, role: actor.role }
                : undefined,
              action: 'config_validate',
              target: { type: 'config', name: type || 'all' },
              outcome: 'failure',
              message: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }
      )
    );

  // Reset to defaults
  cli
    .command('config:reset <type>', 'Reset a configuration to defaults')
    .option('--token <token>', 'Session token for authentication (for audit)')
    .action(
      withCli<[any, any]>(
        {
          operation: 'config:reset',
          errorMessage: (type: any) => `Failed to reset '${type}'`,
          errorCode: 'RESET_CONFIG_FAILED',
          details: (error, type, _options) => ({
            error: error instanceof Error ? error.message : String(error),
            configType: type,
          }),
        },
        async ({ globalOptions }, type: any, options: any) => {
          const coreMod: any = await import('@civicpress/core');
          const audit = new coreMod.AuditLogger();
          let actor: any | undefined;
          if (options?.token) {
            try {
              actor = await AuthUtils.requireAuth(
                options.token,
                globalOptions.json
              );
            } catch {
              // intentional: auth failure is non-fatal — continue as anonymous
            }
          }
          try {
            const service = createConfigService();
            await service.resetToDefaults(type);

            cliSuccess({ type }, `Reset '${type}' to defaults`, {
              operation: 'config:reset',
              configType: type,
            });

            await audit.log({
              source: 'cli',
              actor: actor
                ? { username: actor.username, role: actor.role }
                : undefined,
              action: 'config_reset',
              target: { type: 'config', name: type },
              outcome: 'success',
            });
          } catch (error) {
            // The failure audit record is written HERE rather than in the
            // wrapper: it needs the handler's own context (actor, target,
            // config type). Re-thrown so withCli still reports and exits.
            // Moving this catch wholesale would have silently dropped
            // failure auditing from every config-mutating command.
            await audit.log({
              source: 'cli',
              actor: actor
                ? { username: actor.username, role: actor.role }
                : undefined,
              action: 'config_reset',
              target: { type: 'config', name: type },
              outcome: 'failure',
              message: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }
      )
    );

  // Export configurations to a directory
  cli
    .command('config:export', 'Export configurations to a directory')
    .option('--dir <path>', 'Destination directory', {
      default: 'civic-config-export',
    })
    .option('--token <token>', 'Session token for authentication (for audit)')
    .action(
      withCli<[any]>(
        {
          operation: 'config:export',
          errorMessage: 'Configuration export failed',
          errorCode: 'EXPORT_CONFIG_FAILED',
          details: (error, _options) => ({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
        async ({ globalOptions }, options: any) => {
          const coreMod: any = await import('@civicpress/core');
          const audit = new coreMod.AuditLogger();
          let actor: any | undefined;
          if (options?.token) {
            try {
              actor = await AuthUtils.requireAuth(
                options.token,
                globalOptions.json
              );
            } catch {
              // intentional: auth failure is non-fatal — continue as anonymous
            }
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
              const yamlTxt = await (service as any).loadRawConfigurationYAML(
                type
              );
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

            cliSuccess(
              {
                dir: destRoot,
                files: list.map((i: any) => i.file),
              },
              `Exported ${list.length} configuration${list.length === 1 ? '' : 's'} to ${destRoot}`,
              {
                operation: 'config:export',
                destination: destRoot,
                fileCount: list.length,
              }
            );

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
          } catch (error) {
            // The failure audit record is written HERE rather than in the
            // wrapper: it needs the handler's own context (actor, target,
            // config type). Re-thrown so withCli still reports and exits.
            // Moving this catch wholesale would have silently dropped
            // failure auditing from every config-mutating command.
            await audit.log({
              source: 'cli',
              actor: actor
                ? { username: actor.username, role: actor.role }
                : undefined,
              action: 'config_export',
              target: { type: 'config', name: 'all' },
              outcome: 'failure',
              message: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }
      )
    );

  // Import configurations from a directory
  cli
    .command('config:import', 'Import configurations from a directory')
    .option('--dir <path>', 'Source directory', {
      default: 'civic-config-export',
    })
    .option('--token <token>', 'Session token for authentication (for audit)')
    .action(
      withCli<[any]>(
        {
          operation: 'config:import',
          errorMessage: 'Configuration import failed',
          errorCode: 'IMPORT_CONFIG_FAILED',
          details: (error, _options) => ({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
        async ({ globalOptions }, options: any) => {
          const coreMod: any = await import('@civicpress/core');
          const audit = new coreMod.AuditLogger();
          let actor: any | undefined;
          if (options?.token) {
            try {
              actor = await AuthUtils.requireAuth(
                options.token,
                globalOptions.json
              );
            } catch {
              // intentional: auth failure is non-fatal — continue as anonymous
            }
          }
          try {
            const service = createConfigService();
            const srcRoot = path.resolve(options.dir);
            const srcCivic = path.join(srcRoot, 'data', '.civic');
            const srcSystem = path.join(srcRoot, '.system-data');

            const toImport = [
              {
                type: 'org-config',
                file: path.join(srcCivic, 'org-config.yml'),
              },
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
                await (service as any).saveRawConfigurationYAML(
                  item.type,
                  yamlTxt
                );
                imported.push(item.type);
              }
            }

            cliSuccess(
              { imported },
              `Imported ${imported.length} configuration${imported.length === 1 ? '' : 's'}: ${imported.join(', ')}`,
              {
                operation: 'config:import',
                importedCount: imported.length,
              }
            );

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
          } catch (error) {
            // The failure audit record is written HERE rather than in the
            // wrapper: it needs the handler's own context (actor, target,
            // config type). Re-thrown so withCli still reports and exits.
            // Moving this catch wholesale would have silently dropped
            // failure auditing from every config-mutating command.
            await audit.log({
              source: 'cli',
              actor: actor
                ? { username: actor.username, role: actor.role }
                : undefined,
              action: 'config_import',
              target: { type: 'config', name: 'multiple' },
              outcome: 'failure',
              message: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }
      )
    );

  // Initialize configurations from defaults if missing
  cli
    .command(
      'config:init [type]',
      'Create user configs from defaults if missing'
    )
    .option('--all', 'Initialize all configurations')
    .action(
      withCli<[string | undefined, any]>(
        {
          operation: 'config:init',
          errorMessage: 'Configuration initialization failed',
          errorCode: 'INIT_CONFIG_FAILED',
          details: (error) => ({
            error: describeInitError(error),
            stack: (error as any)?.stack,
          }),
        },
        async (_ctx, type: string | undefined, options: any) => {
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
            cliError(
              'Specify a type or use --all',
              'VALIDATION_ERROR',
              undefined,
              'config:init'
            );
            process.exit(1);
          }

          const results: Array<{ type: string; created: boolean }> = [];
          for (const t of types) {
            try {
              results.push(await initOne(t));
            } catch (initError: any) {
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
              }
              throw new Error(
                `Failed to initialize configuration ${t}: ${initErrMsg}`
              );
            }
          }

          const createdCount = results.filter((r) => r.created).length;
          const skippedCount = results.length - createdCount;
          const message =
            createdCount > 0
              ? `Initialized ${createdCount} configuration${createdCount === 1 ? '' : 's'}${skippedCount > 0 ? `, skipped ${skippedCount}` : ''}`
              : `All ${results.length} configuration${results.length === 1 ? '' : 's'} already exist`;

          cliSuccess({ results }, message, {
            operation: 'config:init',
            totalCount: results.length,
            createdCount,
            skippedCount,
          });
        }
      )
    );
}
