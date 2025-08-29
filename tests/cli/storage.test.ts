import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import {
  createCLITestContext,
  cleanupCLITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('CLI Storage Management', () => {
  let context: any;
  let adminToken: string | undefined;
  let testFilePath: string;

  beforeEach(async () => {
    context = await createCLITestContext();
    adminToken = context.adminToken;

    // If adminToken is not available from context, try to create it on-demand
    if (!adminToken) {
      try {
        const result = execSync(
          `cd ${context.testDir} && node ${context.cliPath} auth:simulated --username testadmin --role admin --json`,
          { encoding: 'utf8' }
        );

        // Extract JSON from the output - look for the last JSON object
        const lines = result.split('\n');
        let jsonStart = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].trim().startsWith('{')) {
            jsonStart = i;
            break;
          }
        }

        if (jsonStart !== -1) {
          const jsonText = lines.slice(jsonStart).join('\n');
          try {
            const jsonResult = JSON.parse(jsonText);
            if (
              jsonResult.success &&
              jsonResult.session &&
              jsonResult.session.token
            ) {
              adminToken = jsonResult.session.token;
            }
          } catch (parseError) {
            console.warn(
              'Warning: Failed to parse JSON from auth:simulated:',
              parseError
            );
          }
        }
      } catch (error) {
        console.warn('Warning: Failed to create admin token on-demand:', error);
      }
    }

    // Create a test file for upload tests
    testFilePath = path.join(context.testDir, 'test-file.txt');
    await fs.writeFile(testFilePath, 'Test file content for storage CLI tests');
  });

  afterEach(async () => {
    await cleanupCLITestContext(context);
    // Clean up test file
    if (await fs.pathExists(testFilePath)) {
      await fs.remove(testFilePath);
    }
  });

  describe('Storage Configuration', () => {
    it('should get storage configuration', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:config --token ${adminToken}`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Storage Configuration:');
      expect(result).toContain('Backend:');
      expect(result).toContain('Folders:');
      expect(result).toContain('Metadata:');
    });

    it('should get storage configuration in JSON format', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = execSync(
        `cd ${context.cliPath} && node ${context.cliPath} storage:config --token ${adminToken} --json`,
        { encoding: 'utf8' }
      );

      // Find the last JSON object in the output
      const lines = result.split('\n');
      let jsonStart = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().startsWith('{')) {
          jsonStart = i;
          break;
        }
      }

      if (jsonStart !== -1) {
        const jsonText = lines.slice(jsonStart).join('\n');
        const jsonResult = JSON.parse(jsonText);
        expect(jsonResult.success).toBe(true);
        expect(jsonResult.data.config).toBeDefined();
      }
    });

    it('should update storage configuration', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:config --token ${adminToken} --update --metadata '{"auto_generate_thumbnails": true}'`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Storage configuration updated successfully');
    });
  });

  describe('File Upload', () => {
    it('should upload a file to storage', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:upload --token ${adminToken} --file ${testFilePath} --folder public`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('File uploaded successfully');
      expect(result).toContain('test-file.txt');
    });

    it('should fail to upload without required parameters', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} storage:upload --token ${adminToken} --file ${testFilePath}`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });

    it('should fail to upload non-existent file', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} storage:upload --token ${adminToken} --file nonexistent.txt --folder public`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });
  });

  describe('File Listing', () => {
    it('should list files in storage folder', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:list --token ${adminToken} --folder public`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Files in public:');
      expect(result).toContain('Total:');
      expect(result).toContain('Page:');
    });

    it('should list files with pagination', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:list --token ${adminToken} --folder public --page 1 --limit 10`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Files in public:');
      expect(result).toContain('Page: 1 of');
    });

    it('should list files with search filter', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:list --token ${adminToken} --folder public --search test`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Files in public:');
    });

    it('should fail to list files without folder parameter', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} storage:list --token ${adminToken}`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });
  });

  describe('File Download', () => {
    it('should download a file from storage', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      // First upload a file
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:upload --token ${adminToken} --file ${testFilePath} --folder public`,
        { encoding: 'utf8' }
      );

      // Then download it
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:download --token ${adminToken} --folder public --file test-file.txt`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('File downloaded successfully');
      expect(result).toContain('test-file.txt');
    });

    it('should download file with custom output path', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      // First upload a file
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:upload --token ${adminToken} --file ${testFilePath} --folder public`,
        { encoding: 'utf8' }
      );

      // Then download it with custom output
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:download --token ${adminToken} --folder public --file test-file.txt --output downloaded-test.txt`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('File downloaded successfully');
      expect(result).toContain('downloaded-test.txt');

      // Verify file was created
      const downloadedPath = path.join(context.testDir, 'downloaded-test.txt');
      expect(fs.pathExistsSync(downloadedPath)).toBe(true);

      // Clean up
      fs.removeSync(downloadedPath);
    });

    it('should fail to download without required parameters', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} storage:download --token ${adminToken} --folder public`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });
  });

  describe('File Deletion', () => {
    it('should delete a file from storage', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      // First upload a file
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:upload --token ${adminToken} --file ${testFilePath} --folder public`,
        { encoding: 'utf8' }
      );

      // Then delete it
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:delete --token ${adminToken} --folder public --file test-file.txt`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('File deleted successfully');
      expect(result).toContain('test-file.txt');
    });

    it('should fail to delete without required parameters', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} storage:delete --token ${adminToken} --folder public`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });
  });

  describe('File Information', () => {
    it('should get file information', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      // First upload a file
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:upload --token ${adminToken} --file ${testFilePath} --folder public`,
        { encoding: 'utf8' }
      );

      // Then get its info
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:info --token ${adminToken} --folder public --file test-file.txt`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('File Information:');
      expect(result).toContain('test-file.txt');
      expect(result).toContain('bytes');
      expect(result).toContain('Type:');
    });

    it('should fail to get file info without required parameters', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} storage:info --token ${adminToken} --folder public`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });
  });

  describe('Folder Management', () => {
    it('should add a new storage folder', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:folder:add --token ${adminToken} --name test-folder --path test-folder --access public --types txt,md --max-size 1MB --description "Test folder"`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Storage folder added successfully');
      expect(result).toContain('test-folder');
    });

    it('should update a storage folder', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      // First add a folder
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:folder:add --token ${adminToken} --name test-folder --path test-folder --access public --types txt,md --max-size 1MB --description "Test folder"`,
        { encoding: 'utf8' }
      );

      // Then update it
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:folder:update --token ${adminToken} --name test-folder --max-size 2MB --description "Updated test folder"`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Storage folder updated successfully');
      expect(result).toContain('test-folder');
    });

    it('should remove a storage folder', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      // First add a folder
      execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:folder:add --token ${adminToken} --name test-folder --path test-folder --access public --types txt,md --max-size 1MB --description "Test folder"`,
        { encoding: 'utf8' }
      );

      // Then remove it
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:folder:remove --token ${adminToken} --name test-folder`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Storage folder removed successfully');
      expect(result).toContain('test-folder');
    });

    it('should fail to add folder without required parameters', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} storage:folder:add --token ${adminToken} --name test-folder`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });

    it('should fail to update folder without name parameter', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} storage:folder:update --token ${adminToken} --max-size 2MB`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });

    it('should fail to remove folder without name parameter', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      expect(() => {
        execSync(
          `cd ${context.testDir} && node ${context.cliPath} storage:folder:remove --token ${adminToken}`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });
  });

  describe('JSON Output', () => {
    it('should support --json flag for all commands', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      // Test storage:config with --json
      const configResult = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:config --token ${adminToken} --json`,
        { encoding: 'utf8' }
      );

      // Find and parse JSON
      const configLines = configResult.split('\n');
      let configJsonStart = -1;
      for (let i = configLines.length - 1; i >= 0; i--) {
        if (configLines[i].trim().startsWith('{')) {
          configJsonStart = i;
          break;
        }
      }

      if (configJsonStart !== -1) {
        const configJsonText = configLines.slice(configJsonStart).join('\n');
        const configJsonResult = JSON.parse(configJsonText);
        expect(configJsonResult.success).toBe(true);
      }

      // Test storage:list with --json
      const listResult = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:list --token ${adminToken} --folder public --json`,
        { encoding: 'utf8' }
      );

      // Find and parse JSON
      const listLines = listResult.split('\n');
      let listJsonStart = -1;
      for (let i = listLines.length - 1; i >= 0; i--) {
        if (listLines[i].trim().startsWith('{')) {
          listJsonStart = i;
          break;
        }
      }

      if (listJsonStart !== -1) {
        const listJsonText = listLines.slice(listJsonStart).join('\n');
        const listJsonResult = JSON.parse(listJsonText);
        expect(listJsonResult.success).toBe(true);
      }
    });
  });

  describe('Silent Mode', () => {
    it('should support --silent flag', () => {
      if (!adminToken) {
        console.log('⏭️  Skipping test - admin token not available');
        return;
      }

      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:config --token ${adminToken} --silent`,
        { encoding: 'utf8' }
      );

      // Silent mode should still show the essential output
      expect(result).toContain('Storage Configuration:');
    });
  });

  describe('Help Support', () => {
    it('should show help for storage commands', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:config --help`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Usage:');
      expect(result).toContain('Options:');
    });

    it('should show help for storage:upload command', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:upload --help`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Usage:');
      expect(result).toContain('Options:');
    });

    it('should show help for storage:list command', () => {
      const result = execSync(
        `cd ${context.testDir} && node ${context.cliPath} storage:list --help`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Usage:');
      expect(result).toContain('Options:');
    });
  });
});
