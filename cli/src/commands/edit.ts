import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress, getLogger } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';
import matter from 'gray-matter';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

export const editCommand = (cli: CAC) => {
  cli
    .command('edit <record>', 'Edit a specific civic record')
    .option('-e, --editor <editor>', 'Specify editor (code, vim, nano, etc.)')
    .option('--dry-run', 'Show what would be done without opening the editor')
    .action(async (recordName: string, options: any) => {
      try {
        // Initialize logger with global options
        const globalOptions = getGlobalOptionsFromArgs();
        initializeLogger(globalOptions);
        const logger = getLogger();

        logger.info(`✏️  Opening record for editing: ${recordName}`);

        // Initialize CivicPress (will auto-discover config)
        const civic = new CivicPress();
        const core = civic.getCore();
        const dataDir = core.getDataDir();

        if (!dataDir) {
          throw new Error('Data directory not found. Run "civic init" first.');
        }

        const recordsDir = path.join(dataDir, 'records');
        if (!fs.existsSync(recordsDir)) {
          logger.warn(
            '📁 No records directory found. Create some records first!'
          );
          return;
        }

        // Find the record file
        let recordPath: string | null = null;
        let recordType: string | null = null;

        // Search through all record types
        const recordTypes = fs
          .readdirSync(recordsDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);

        for (const type of recordTypes) {
          const typeDir = path.join(recordsDir, type);
          const files = fs
            .readdirSync(typeDir)
            .filter((file) => file.endsWith('.md'))
            .map((file) => path.join(typeDir, file));

          for (const filePath of files) {
            const filename = path.basename(filePath, '.md');
            if (filename === recordName || filePath.includes(recordName)) {
              recordPath = filePath;
              recordType = type;
              break;
            }
          }
          if (recordPath) break;
        }

        if (!recordPath) {
          logger.error(`❌ Record "${recordName}" not found.`);
          logger.info('Available records:');

          // List available records
          for (const type of recordTypes) {
            const typeDir = path.join(recordsDir, type);
            const files = fs
              .readdirSync(typeDir)
              .filter((file) => file.endsWith('.md'))
              .map((file) => path.basename(file, '.md'));

            if (files.length > 0) {
              logger.info(`  ${type}:`);
              for (const file of files) {
                logger.debug(`    ${file}`);
              }
            }
          }
          return;
        }

        // Display record info before editing
        logger.info(`📄 Opening: ${path.basename(recordPath)}`);
        logger.debug(`📁 Type: ${recordType}`);
        logger.debug(`📂 Path: ${path.relative(dataDir, recordPath)}`);

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
          logger.warn('⚠️  No editor found. Please specify one with --editor');
          logger.info('Example: civic edit <record> --editor code');
          logger.info('Available editors: code, vim, nano, etc.');
          return;
        }

        // Dry-run: just print what would be done
        if (options.dryRun) {
          logger.info(`✏️  Opening record for editing: ${recordName}`);
          logger.info(`📄 Opening: ${path.basename(recordPath)}`);
          logger.debug(`📁 Type: ${recordType}`);
          logger.debug(`📂 Path: ${path.relative(dataDir, recordPath)}`);
          logger.warn(`Would open editor: ${editor} ${recordPath}`);
          return;
        }

        // Open the file in the editor
        logger.info(`🚀 Opening in ${editor}...`);

        const child = spawn(editor, [recordPath], {
          stdio: 'inherit',
          detached: true,
        });

        child.on('error', (error) => {
          logger.error(`❌ Failed to open editor: ${error.message}`);
          logger.info('Try specifying a different editor with --editor');
        });

        child.on('exit', (code) => {
          if (code === 0) {
            logger.success('✅ Editor closed successfully');
            logger.info(
              '💡 Remember to commit your changes with: civic commit -m "message" -r <role>'
            );
          } else {
            logger.warn(`⚠️  Editor exited with code ${code}`);
          }
        });

        // Don't wait for the editor to close
        child.unref();
      } catch (error) {
        const logger = getLogger();
        logger.error('❌ Failed to edit record:', error);
        process.exit(1);
      }
    });
};
