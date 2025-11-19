import { CAC } from 'cac';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';
import { AuthUtils } from '../utils/auth-utils.js';
import { userCan } from '@civicpress/core';
import {
  getAvailableRecords,
  resolveRecordReference,
} from '../utils/record-locator.js';

export const editCommand = (cli: CAC) => {
  cli
    .command('edit <record>', 'Edit a specific civic record')
    .option('--token <token>', 'Session token for authentication')
    .option('-e, --editor <editor>', 'Specify editor (code, vim, nano, etc.)')
    .option('--dry-run', 'Show what would be done without opening the editor')
    .action(async (recordName: string, options: any) => {
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();
      const logger = initializeLogger();
      const shouldOutputJson = globalOptions.json;

      // Validate authentication and get civic instance
      const { civic, user } = await AuthUtils.requireAuthWithCivic(
        options.token,
        shouldOutputJson
      );
      const dataDir = civic.getDataDir();

      // Check edit permissions
      const canEdit = await userCan(user, 'records:edit');
      if (!canEdit) {
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: 'Insufficient permissions',
                details: 'You do not have permission to edit records',
                requiredPermission: 'records:edit',
                userRole: user.role,
              },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Insufficient permissions to edit records');
          logger.info(`Role '${user.role}' cannot edit records`);
        }
        process.exit(1);
      }

      try {
        if (!shouldOutputJson) {
          logger.info(`✏️  Opening record for editing: ${recordName}`);
        }

        const recordsDir = path.join(dataDir, 'records');
        if (!fs.existsSync(recordsDir)) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'No records directory found',
                  details: 'Create some records first',
                },
                null,
                2
              )
            );
          } else {
            logger.warn(
              '📁 No records directory found. Create some records first!'
            );
          }
          process.exit(1);
        }

        const resolvedRecord = resolveRecordReference(dataDir, recordName);

        if (!resolvedRecord) {
          const availableRecords = getAvailableRecords(dataDir);

          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Record not found',
                  details: `Record "${recordName}" not found`,
                  availableRecords,
                },
                null,
                2
              )
            );
          } else {
            logger.error(`❌ Record "${recordName}" not found.`);
            logger.info('Available records:');

            for (const [type, files] of Object.entries(availableRecords)) {
              if (files.length > 0) {
                logger.info(`  ${type}:`);
                for (const file of files) {
                  logger.debug(`    ${file}`);
                }
              }
            }
          }
          process.exit(1);
        }

        const recordPath = resolvedRecord.absolutePath;
        const parsedRecord = resolvedRecord.parsed;
        const recordType = parsedRecord.type;

        // Display record info before editing
        if (!shouldOutputJson) {
          logger.info(`📄 Opening: ${path.basename(recordPath)}`);
          logger.debug(`📁 Type: ${recordType}`);
          if (parsedRecord.year) {
            logger.debug(`📅 Year: ${parsedRecord.year}`);
          }
          logger.debug(`📂 Path: ${path.relative(dataDir, recordPath)}`);
        }

        // Determine editor to use
        let editor: string | undefined = undefined;
        if (typeof options.editor === 'string' && options.editor.trim()) {
          editor = options.editor.trim();
        } else if (process.env.EDITOR && process.env.EDITOR.trim()) {
          editor = process.env.EDITOR.trim();
        } else if (process.env.VISUAL && process.env.VISUAL.trim()) {
          editor = process.env.VISUAL.trim();
        } else {
          // Fallback to common editors
          const commonEditors = ['code', 'vim', 'nano', 'notepad++', 'subl'];
          for (const ed of commonEditors) {
            try {
              execSync(`which ${ed}`, { stdio: 'ignore' });
              editor = ed;
              break;
            } catch {
              // Editor not found, try next one
            }
          }
        }

        if (!editor) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'No editor found',
                  details: 'Please specify one with --editor',
                  example: 'civic edit <record> --editor code',
                  availableEditors: [
                    'code',
                    'vim',
                    'nano',
                    'notepad++',
                    'subl',
                  ],
                },
                null,
                2
              )
            );
          } else {
            logger.error(
              '❌ No editor found. Please specify one with --editor'
            );
            logger.info('Available editors: code, vim, nano, notepad++, subl');
          }
          process.exit(1);
        }

        if (options.dryRun) {
          if (!shouldOutputJson) {
            logger.info(`Would open editor: ${editor} ${recordPath}`);
          }
        } else {
          // Actually open the editor
          spawn(editor, [recordPath], {
            stdio: 'inherit',
          });
        }
      } catch (error) {
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: 'Failed to edit record',
                details: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Failed to edit record:', error);
        }
        process.exit(1);
      }
    });
};
