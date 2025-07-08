import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';
import matter from 'gray-matter';

export const editCommand = (cli: CAC) => {
  cli
    .command('edit <record>', 'Edit a specific civic record')
    .option('-e, --editor <editor>', 'Specify editor (code, vim, nano, etc.)')
    .option('--dry-run', 'Show what would be done without opening the editor')
    .action(async (recordName: string, options: any) => {
      try {
        console.log(
          chalk.blue(`✏️  Opening record for editing: ${recordName}`)
        );

        // Initialize CivicPress (will auto-discover config)
        const civic = new CivicPress();
        const core = civic.getCore();
        const dataDir = core.getDataDir();

        if (!dataDir) {
          throw new Error('Data directory not found. Run "civic init" first.');
        }

        const recordsDir = path.join(dataDir, 'records');
        if (!fs.existsSync(recordsDir)) {
          console.log(
            chalk.yellow(
              '📁 No records directory found. Create some records first!'
            )
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
          console.log(chalk.red(`❌ Record "${recordName}" not found.`));
          console.log(chalk.blue('Available records:'));

          // List available records
          for (const type of recordTypes) {
            const typeDir = path.join(recordsDir, type);
            const files = fs
              .readdirSync(typeDir)
              .filter((file) => file.endsWith('.md'))
              .map((file) => path.basename(file, '.md'));

            if (files.length > 0) {
              console.log(chalk.cyan(`  ${type}:`));
              for (const file of files) {
                console.log(chalk.gray(`    ${file}`));
              }
            }
          }
          return;
        }

        // Display record info before editing
        console.log(chalk.cyan(`📄 Opening: ${path.basename(recordPath)}`));
        console.log(chalk.gray(`📁 Type: ${recordType}`));
        console.log(
          chalk.gray(`📂 Path: ${path.relative(dataDir, recordPath)}`)
        );

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
          console.log(
            chalk.yellow(
              '⚠️  No editor found. Please specify one with --editor'
            )
          );
          console.log(chalk.blue('Example: civic edit <record> --editor code'));
          console.log(chalk.blue('Available editors: code, vim, nano, etc.'));
          return;
        }

        // Dry-run: just print what would be done
        if (options.dryRun) {
          console.log(
            chalk.blue(`✏️  Opening record for editing: ${recordName}`)
          );
          console.log(chalk.cyan(`📄 Opening: ${path.basename(recordPath)}`));
          console.log(chalk.gray(`📁 Type: ${recordType}`));
          console.log(
            chalk.gray(`📂 Path: ${path.relative(dataDir, recordPath)}`)
          );
          console.log(
            chalk.yellow(`Would open editor: ${editor} ${recordPath}`)
          );
          return;
        }

        // Open the file in the editor
        console.log(chalk.blue(`🚀 Opening in ${editor}...`));

        const child = spawn(editor, [recordPath], {
          stdio: 'inherit',
          detached: true,
        });

        child.on('error', (error) => {
          console.error(
            chalk.red(`❌ Failed to open editor: ${error.message}`)
          );
          console.log(
            chalk.blue('Try specifying a different editor with --editor')
          );
        });

        child.on('exit', (code) => {
          if (code === 0) {
            console.log(chalk.green('✅ Editor closed successfully'));
            console.log(
              chalk.blue(
                '💡 Remember to commit your changes with: civic commit -m "message" -r <role>'
              )
            );
          } else {
            console.log(chalk.yellow(`⚠️  Editor exited with code ${code}`));
          }
        });

        // Don't wait for the editor to close
        child.unref();
      } catch (error) {
        console.error(chalk.red('❌ Failed to edit record:'), error);
        process.exit(1);
      }
    });
};
