import { CAC } from 'cac';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';
import { withCli } from '../utils/with-cli.js';
import { AuthUtils } from '../utils/auth-utils.js';
import { userCan } from '@civicpress/core';
import {
  getAvailableRecords,
  resolveRecordReference,
} from '../utils/record-locator.js';
import { cliSuccess, cliError, cliInfo } from '../utils/cli-output.js';

export const editCommand = (cli: CAC) => {
  cli
    .command('edit <record>', 'Edit a specific civic record')
    .option('--token <token>', 'Session token for authentication')
    .option('-e, --editor <editor>', 'Specify editor (code, vim, nano, etc.)')
    .option('--dry-run', 'Show what would be done without opening the editor')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .action(
      withCli<[string, any]>(
        {
          operation: 'edit',
          errorMessage: 'Failed to edit record',
          errorCode: 'EDIT_FAILED',
          details: (error, recordName) => ({
            error: error instanceof Error ? error.message : String(error),
            recordName,
          }),
        },
        // The editor is spawned fire-and-forget with stdio:'inherit'; withCli
        // never force-exits on success (it only exits in its catch), so the
        // child keeps the process alive until the editor closes — exactly as
        // before. A wrapper that exited on handler return would have killed it.
        async ({ globalOptions, logger }, recordName: string, options: any) => {
          // Check if we should output JSON
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
            cliError(
              'Insufficient permissions to edit records',
              'PERMISSION_DENIED',
              {
                requiredPermission: 'records:edit',
                userRole: user.role,
              },
              'edit'
            );
            process.exit(1);
          }

          if (!shouldOutputJson) {
            logger.info(`✏️  Opening record for editing: ${recordName}`);
          }

          const recordsDir = path.join(dataDir, 'records');
          if (!fs.existsSync(recordsDir)) {
            cliError(
              'No records directory found',
              'RECORDS_DIR_NOT_FOUND',
              { dataDir },
              'edit'
            );
            process.exit(1);
          }

          const resolvedRecord = resolveRecordReference(dataDir, recordName);

          if (!resolvedRecord) {
            const availableRecords = getAvailableRecords(dataDir);

            cliError(
              `Record "${recordName}" not found`,
              'RECORD_NOT_FOUND',
              {
                recordName,
                availableRecords,
              },
              'edit'
            );
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
            cliError(
              'No editor found. Please specify one with --editor',
              'EDITOR_NOT_FOUND',
              {
                availableEditors: ['code', 'vim', 'nano', 'notepad++', 'subl'],
              },
              'edit'
            );
            process.exit(1);
          }

          if (options.dryRun) {
            cliInfo(`Would open editor: ${editor} ${recordPath}`, 'edit');
          } else {
            // Actually open the editor
            spawn(editor, [recordPath], {
              stdio: 'inherit',
            });
            cliSuccess(
              {
                editor,
                recordPath,
              },
              `Opened ${recordName} in ${editor}`,
              {
                operation: 'edit',
                editor,
                recordName,
              }
            );
          }
        }
      )
    );
};
