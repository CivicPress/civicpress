import { CAC } from 'cac';
import { CivicPress } from '@civicpress/core';
import { AuthUtils } from '../utils/auth-utils.js';
import fs from 'fs-extra';
import fetch from 'node-fetch';

export default function setupStorageCommand(cli: CAC) {
  cli
    .command('storage:config', 'Get or update storage configuration')
    .option('--token <token>', 'Session token for authentication')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .option('--update', 'Update configuration instead of viewing')
    .option('--backend <backend>', 'Backend configuration (JSON string)')
    .option('--folders <folders>', 'Folders configuration (JSON string)')
    .option('--metadata <metadata>', 'Metadata configuration (JSON string)')
    .action(async (options) => {
      try {
        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          options.json
        );

        if (options.update) {
          // Update configuration
          const updateData: any = {};

          if (options.backend) {
            try {
              updateData.backend = JSON.parse(options.backend);
            } catch (error) {
              if (!options.json) {
                console.error('❌ Invalid backend JSON format');
              }
              process.exit(1);
            }
          }

          if (options.folders) {
            try {
              updateData.folders = JSON.parse(options.folders);
            } catch (error) {
              if (!options.json) {
                console.error('❌ Invalid folders JSON format');
              }
              process.exit(1);
            }
          }

          if (options.metadata) {
            try {
              updateData.metadata = JSON.parse(options.metadata);
            } catch (error) {
              if (!options.json) {
                console.error('❌ Invalid metadata JSON format');
              }
              process.exit(1);
            }
          }

          // Make API call to update storage config
          const response = await fetch(
            `http://localhost:3000/api/v1/storage/config`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${options.token}`,
              },
              body: JSON.stringify(updateData),
            }
          );

          if (response.ok) {
            const result = await response.json();
            if (options.json) {
              console.log(JSON.stringify(result, null, 2));
            } else {
              console.log('✅ Storage configuration updated successfully');
            }
          } else {
            if (!options.json) {
              console.error('❌ Failed to update storage configuration');
            }
            process.exit(1);
          }
        } else {
          // Get configuration
          const response = await fetch(
            `http://localhost:3000/api/v1/storage/config`,
            {
              headers: {
                Authorization: `Bearer ${options.token}`,
              },
            }
          );

          if (response.ok) {
            const result = (await response.json()) as any;
            if (options.json) {
              console.log(JSON.stringify(result, null, 2));
            } else {
              console.log('📁 Storage Configuration:');
              console.log(`Backend: ${result.data.config.backend.type}`);
              console.log(
                `Folders: ${Object.keys(result.data.config.folders).length} configured`
              );
              console.log(
                `Metadata: ${Object.keys(result.data.config.metadata).length} settings`
              );
            }
          } else {
            if (!options.json) {
              console.error('❌ Failed to get storage configuration');
            }
            process.exit(1);
          }
        }
      } catch (error: any) {
        if (!options.json) {
          console.error('❌ Error:', error.message);
        }
        process.exit(1);
      }
    });

  cli
    .command('storage:upload', 'Upload a file to storage')
    .option('--token <token>', 'Session token for authentication')
    .option('--file <file>', 'Path to file to upload')
    .option('--folder <folder>', 'Storage folder to upload to')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        if (!options.file || !options.folder) {
          if (!options.json) {
            console.error('❌ Both --file and --folder are required');
          }
          process.exit(1);
        }

        // Check if file exists
        if (!(await fs.pathExists(options.file))) {
          if (!options.json) {
            console.error(`❌ File not found: ${options.file}`);
          }
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          options.json
        );

        // Create form data for file upload
        const { default: FormData } = await import('form-data');
        const form = new FormData();
        form.append('file', fs.createReadStream(options.file));

        // Make API call to upload file
        const response = await fetch(
          `http://localhost:3000/api/v1/storage/upload/${options.folder}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${options.token}`,
              ...form.getHeaders(),
            },
            body: form,
          }
        );

        if (response.ok) {
          const result = (await response.json()) as any;
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log('✅ File uploaded successfully');
            console.log(`File: ${result.data.file.name}`);
            console.log(`Size: ${result.data.file.size} bytes`);
            console.log(`Path: ${result.data.path}`);
          }
        } else {
          if (!options.json) {
            console.error('❌ Failed to upload file');
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.json) {
          console.error('❌ Error:', error.message);
        }
        process.exit(1);
      }
    });

  cli
    .command('storage:list', 'List files in a storage folder')
    .option('--token <token>', 'Session token for authentication')
    .option('--folder <folder>', 'Storage folder to list')
    .option('--page <page>', 'Page number for pagination', { default: '1' })
    .option('--limit <limit>', 'Number of files per page', { default: '50' })
    .option('--search <search>', 'Search term for file names')
    .option('--type <type>', 'Filter by file type')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        if (!options.folder) {
          if (!options.json) {
            console.error('❌ --folder is required');
          }
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          options.json
        );

        // Build query parameters
        const params = new URLSearchParams({
          page: options.page,
          limit: options.limit,
        });

        if (options.search) {
          params.append('search', options.search);
        }

        if (options.type) {
          params.append('type', options.type);
        }

        // Make API call to list files
        const response = await fetch(
          `http://localhost:3000/api/v1/storage/files/${options.folder}?${params}`,
          {
            headers: {
              Authorization: `Bearer ${options.token}`,
            },
          }
        );

        if (response.ok) {
          const result = (await response.json()) as any;
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(`📁 Files in ${options.folder}:`);
            console.log(`Total: ${result.data.pagination.total} files`);
            console.log(
              `Page: ${result.data.pagination.page} of ${result.data.pagination.pages}`
            );

            if (result.data.files.length === 0) {
              console.log('No files found');
            } else {
              result.data.files.forEach((file: any) => {
                console.log(
                  `  ${file.name} (${file.size} bytes, ${file.mime_type})`
                );
              });
            }
          }
        } else {
          if (!options.json) {
            console.error('❌ Failed to list files');
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.json) {
          console.error('❌ Error:', error.message);
        }
        process.exit(1);
      }
    });

  cli
    .command('storage:download', 'Download a file from storage')
    .option('--token <token>', 'Session token for authentication')
    .option('--folder <folder>', 'Storage folder containing the file')
    .option('--file <file>', 'Name of file to download')
    .option('--output <output>', 'Output path for downloaded file')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        if (!options.folder || !options.file) {
          if (!options.json) {
            console.error('❌ Both --folder and --file are required');
          }
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          options.json
        );

        // Make API call to download file
        const response = await fetch(
          `http://localhost:3000/api/v1/storage/download/${options.folder}/${options.file}`,
          {
            headers: {
              Authorization: `Bearer ${options.token}`,
            },
          }
        );

        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const outputPath = options.output || options.file;

          await fs.writeFile(outputPath, Buffer.from(buffer));

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  file: options.file,
                  output: outputPath,
                  size: buffer.byteLength,
                },
                null,
                2
              )
            );
          } else {
            console.log('✅ File downloaded successfully');
            console.log(`File: ${options.file}`);
            console.log(`Output: ${outputPath}`);
            console.log(`Size: ${buffer.byteLength} bytes`);
          }
        } else {
          if (!options.json) {
            console.error('❌ Failed to download file');
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.json) {
          console.error('❌ Error:', error.message);
        }
        process.exit(1);
      }
    });

  cli
    .command('storage:delete', 'Delete a file from storage')
    .option('--token <token>', 'Session token for authentication')
    .option('--folder <folder>', 'Storage folder containing the file')
    .option('--file <file>', 'Name of file to delete')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        if (!options.folder || !options.file) {
          if (!options.json) {
            console.error('❌ Both --folder and --file are required');
          }
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          options.json
        );

        // Make API call to delete file
        const response = await fetch(
          `http://localhost:3000/api/v1/storage/files/${options.folder}/${options.file}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${options.token}`,
            },
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log('✅ File deleted successfully');
            console.log(`File: ${options.file}`);
          }
        } else {
          if (!options.json) {
            console.error('❌ Failed to delete file');
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.json) {
          console.error('❌ Error:', error.message);
        }
        process.exit(1);
      }
    });

  cli
    .command('storage:folder:add', 'Add a new storage folder')
    .option('--token <token>', 'Session token for authentication')
    .option('--name <name>', 'Name of the folder')
    .option('--path <path>', 'Path for the folder')
    .option(
      '--access <access>',
      'Access level (public, authenticated, private)',
      { default: 'public' }
    )
    .option('--types <types>', 'Allowed file types (comma-separated)')
    .option('--max-size <maxSize>', 'Maximum file size (e.g., 1MB, 5MB)')
    .option('--description <description>', 'Folder description')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        if (!options.name || !options.path) {
          if (!options.json) {
            console.error('❌ Both --name and --path are required');
          }
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          options.json
        );

        // Prepare folder configuration
        const folderConfig = {
          path: options.path,
          access: options.access,
          allowed_types: options.types
            ? options.types.split(',')
            : ['txt', 'md'],
          max_size: options.maxSize || '1MB',
          description: options.description || `Storage folder: ${options.name}`,
        };

        // Make API call to add folder
        const response = await fetch(
          `http://localhost:3000/api/v1/storage/folders`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${options.token}`,
            },
            body: JSON.stringify({
              name: options.name,
              config: folderConfig,
            }),
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log('✅ Storage folder added successfully');
            console.log(`Name: ${options.name}`);
            console.log(`Path: ${options.path}`);
            console.log(`Access: ${options.access}`);
          }
        } else {
          if (!options.json) {
            console.error('❌ Failed to add storage folder');
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.json) {
          console.error('❌ Error:', error.message);
        }
        process.exit(1);
      }
    });

  cli
    .command('storage:folder:update', 'Update a storage folder configuration')
    .option('--token <token>', 'Session token for authentication')
    .option('--name <name>', 'Name of the folder to update')
    .option(
      '--access <access>',
      'New access level (public, authenticated, private)'
    )
    .option('--types <types>', 'New allowed file types (comma-separated)')
    .option('--max-size <maxSize>', 'New maximum file size')
    .option('--description <description>', 'New folder description')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        if (!options.name) {
          if (!options.json) {
            console.error('❌ --name is required');
          }
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          options.json
        );

        // Prepare update configuration
        const updateConfig: any = {};

        if (options.access) {
          updateConfig.access = options.access;
        }

        if (options.types) {
          updateConfig.allowed_types = options.types.split(',');
        }

        if (options.maxSize) {
          updateConfig.max_size = options.maxSize;
        }

        if (options.description) {
          updateConfig.description = options.description;
        }

        // Make API call to update folder
        const response = await fetch(
          `http://localhost:3000/api/v1/storage/folders/${options.name}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${options.token}`,
            },
            body: JSON.stringify({
              config: updateConfig,
            }),
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log('✅ Storage folder updated successfully');
            console.log(`Name: ${options.name}`);
          }
        } else {
          if (!options.json) {
            console.error('❌ Failed to update storage folder');
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.json) {
          console.error('❌ Error:', error.message);
        }
        process.exit(1);
      }
    });

  cli
    .command('storage:folder:remove', 'Remove a storage folder')
    .option('--token <token>', 'Session token for authentication')
    .option('--name <name>', 'Name of the folder to remove')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        if (!options.name) {
          if (!options.json) {
            console.error('❌ --name is required');
          }
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          options.json
        );

        // Make API call to remove folder
        const response = await fetch(
          `http://localhost:3000/api/v1/storage/folders/${options.name}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${options.token}`,
            },
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log('✅ Storage folder removed successfully');
            console.log(`Name: ${options.name}`);
          }
        } else {
          if (!options.json) {
            console.error('❌ Failed to remove storage folder');
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.json) {
          console.error('❌ Error:', error.message);
        }
        process.exit(1);
      }
    });

  cli
    .command('storage:info', 'Get information about a file in storage')
    .option('--token <token>', 'Session token for authentication')
    .option('--folder <folder>', 'Storage folder containing the file')
    .option('--file <file>', 'Name of file to get info for')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        if (!options.folder || !options.file) {
          if (!options.json) {
            console.error('❌ Both --folder and --file are required');
          }
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          options.json
        );

        // Make API call to get file info
        const response = await fetch(
          `http://localhost:3000/api/v1/storage/files/${options.folder}/${options.file}/info`,
          {
            headers: {
              Authorization: `Bearer ${options.token}`,
            },
          }
        );

        if (response.ok) {
          const result = (await response.json()) as any;
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log('📄 File Information:');
            console.log(`Name: ${result.data.file.name}`);
            console.log(`Size: ${result.data.file.size} bytes`);
            console.log(`Type: ${result.data.file.mime_type}`);
            console.log(`Created: ${result.data.file.created_at}`);
            console.log(`Modified: ${result.data.file.updated_at}`);
          }
        } else {
          if (!options.json) {
            console.error('❌ Failed to get file information');
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.json) {
          console.error('❌ Error:', error.message);
        }
        process.exit(1);
      }
    });
}
