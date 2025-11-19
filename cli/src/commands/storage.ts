import { CAC } from 'cac';
import { CivicPress } from '@civicpress/core';
import { AuthUtils } from '../utils/auth-utils.js';
import fs from 'fs-extra';
import path from 'path';
import {
  CloudUuidStorageService,
  StorageConfigManager,
  StorageFile,
  MulterFile,
} from '@civicpress/storage';

// Helper function to initialize storage services
async function initializeStorageServices(
  civic: CivicPress,
  dataDir: string
): Promise<{
  storageService: CloudUuidStorageService;
  configManager: StorageConfigManager;
}> {
  // Determine system data directory (same logic as API routes)
  const projectRootSystemData = path.join(process.cwd(), '.system-data');
  const isTestEnvironment =
    dataDir.includes('/tmp/') ||
    dataDir.includes('test') ||
    process.env.NODE_ENV === 'test';

  let systemDataDir: string;

  // In test environments, always use test directory to ensure isolation
  if (isTestEnvironment) {
    // Test environment: use dataDir/.system-data (isolated per test)
    systemDataDir = path.join(dataDir, '.system-data');
  } else {
    // Production: check if .system-data exists at project root
    try {
      await fs.access(projectRootSystemData);
      // .system-data exists at project root, use it (production)
      systemDataDir = projectRootSystemData;
    } catch {
      // Production but .system-data missing at root - use project root anyway
      systemDataDir = projectRootSystemData;
    }
  }

  const configManager = new StorageConfigManager(systemDataDir);
  const config = await configManager.loadConfig();
  const storageService = new CloudUuidStorageService(config, systemDataDir);

  // Get database service from CivicPress instance
  const databaseService = (civic as any).getDatabaseService();
  if (!databaseService) {
    throw new Error('Database service not available');
  }

  storageService.setDatabaseService(databaseService);
  await storageService.initialize();

  return { storageService, configManager };
}

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

        // Initialize storage services
        const { storageService, configManager } =
          await initializeStorageServices(civic, dataDir);

        if (options.update) {
          // Update configuration
          const currentConfig = await configManager.loadConfig();
          const updateData: any = { ...currentConfig };

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

          // Save updated configuration
          await configManager.saveConfig(updateData);

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  data: { config: updateData },
                },
                null,
                2
              )
            );
          } else {
            console.log('✅ Storage configuration updated successfully');
          }
        } else {
          // Get configuration
          const config = await configManager.loadConfig();

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  data: { config },
                },
                null,
                2
              )
            );
          } else {
            console.log('📁 Storage Configuration:');
            console.log(`Backend: ${config.backend.type}`);
            console.log(
              `Folders: ${Object.keys(config.folders).length} configured`
            );
            console.log(
              `Metadata: ${Object.keys(config.metadata).length} settings`
            );
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

        // Initialize storage services
        const { storageService } = await initializeStorageServices(
          civic,
          dataDir
        );

        // Read file and create MulterFile-like object
        const fileBuffer = await fs.readFile(options.file);
        const fileName = path.basename(options.file);
        const mimeType =
          (await import('mime-types')).lookup(options.file) ||
          'application/octet-stream';

        const multerFile: MulterFile = {
          fieldname: 'file',
          originalname: fileName,
          encoding: '7bit',
          mimetype: mimeType,
          buffer: fileBuffer,
          size: fileBuffer.length,
          destination: '',
          filename: fileName,
          path: options.file,
        };

        // Upload file
        const result = await storageService.uploadFile({
          folder: options.folder,
          file: multerFile,
          uploaded_by: user.username,
        });

        if (result.success && result.file) {
          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  data: {
                    file: {
                      name: result.file.original_name,
                      size: result.file.size,
                      id: result.file.id,
                    },
                    path: result.file.relative_path,
                  },
                },
                null,
                2
              )
            );
          } else {
            console.log('✅ File uploaded successfully');
            console.log(`File: ${result.file.original_name}`);
            console.log(`Size: ${result.file.size} bytes`);
            console.log(`Path: ${result.file.relative_path}`);
          }
        } else {
          if (!options.json) {
            console.error(
              `❌ Failed to upload file: ${result.error || 'Unknown error'}`
            );
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

        // Initialize storage services
        const { storageService } = await initializeStorageServices(
          civic,
          dataDir
        );

        // List files
        const files = await storageService.listFiles(options.folder);

        // Apply filters
        let filteredFiles: StorageFile[] = files;
        if (options.search) {
          filteredFiles = filteredFiles.filter((file: StorageFile) =>
            file.original_name
              .toLowerCase()
              .includes(options.search.toLowerCase())
          );
        }
        if (options.type) {
          const ext = options.type.startsWith('.')
            ? options.type.slice(1)
            : options.type;
          filteredFiles = filteredFiles.filter((file: StorageFile) =>
            file.original_name.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
          );
        }

        // Apply pagination
        const page = parseInt(options.page) || 1;
        const limit = parseInt(options.limit) || 50;
        const start = (page - 1) * limit;
        const end = start + limit;
        const paginatedFiles = filteredFiles.slice(start, end);
        const total = filteredFiles.length;
        const pages = Math.ceil(total / limit);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                data: {
                  files: paginatedFiles.map((file) => ({
                    id: file.id,
                    name: file.original_name,
                    size: file.size,
                    mime_type: file.mime_type,
                    created_at: file.created_at,
                    updated_at: file.updated_at,
                  })),
                  pagination: {
                    page,
                    limit,
                    total,
                    pages,
                  },
                },
              },
              null,
              2
            )
          );
        } else {
          console.log(`📁 Files in ${options.folder}:`);
          console.log(`Total: ${total} files`);
          console.log(`Page: ${page} of ${pages}`);

          if (paginatedFiles.length === 0) {
            console.log('No files found');
          } else {
            paginatedFiles.forEach((file: StorageFile) => {
              console.log(
                `  ${file.original_name} (${file.size} bytes, ${file.mime_type})`
              );
            });
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

        // Initialize storage services
        const { storageService } = await initializeStorageServices(
          civic,
          dataDir
        );

        // Find file by name in folder
        const files = await storageService.listFiles(options.folder);
        const file = files.find(
          (f: StorageFile) =>
            f.original_name === options.file ||
            f.stored_filename === options.file
        );

        if (!file) {
          if (!options.json) {
            console.error(
              `❌ File not found: ${options.file} in folder ${options.folder}`
            );
          }
          process.exit(1);
        }

        // Download file content
        const content = await storageService.getFileContent(file.id);
        if (!content) {
          if (!options.json) {
            console.error('❌ Failed to read file content');
          }
          process.exit(1);
        }

        const outputPath = options.output || options.file;
        await fs.writeFile(outputPath, content);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                file: options.file,
                output: outputPath,
                size: content.length,
              },
              null,
              2
            )
          );
        } else {
          console.log('✅ File downloaded successfully');
          console.log(`File: ${options.file}`);
          console.log(`Output: ${outputPath}`);
          console.log(`Size: ${content.length} bytes`);
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

        // Initialize storage services
        const { storageService } = await initializeStorageServices(
          civic,
          dataDir
        );

        // Find file by name in folder
        const files = await storageService.listFiles(options.folder);
        const file = files.find(
          (f: StorageFile) =>
            f.original_name === options.file ||
            f.stored_filename === options.file
        );

        if (!file) {
          if (!options.json) {
            console.error(
              `❌ File not found: ${options.file} in folder ${options.folder}`
            );
          }
          process.exit(1);
        }

        // Delete file
        const success = await storageService.deleteFile(file.id, user.username);

        if (success) {
          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  message: 'File deleted successfully',
                },
                null,
                2
              )
            );
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

        // Initialize storage services
        const { configManager } = await initializeStorageServices(
          civic,
          dataDir
        );

        // Load current config
        const config = await configManager.loadConfig();

        // Check if folder already exists
        if (config.folders[options.name]) {
          if (!options.json) {
            console.error(`❌ Folder '${options.name}' already exists`);
          }
          process.exit(1);
        }

        // Add folder configuration
        config.folders[options.name] = {
          path: options.path,
          access: options.access,
          allowed_types: options.types
            ? options.types.split(',')
            : ['txt', 'md'],
          max_size: options.maxSize || '1MB',
          description: options.description || `Storage folder: ${options.name}`,
        };

        // Save updated configuration
        await configManager.saveConfig(config);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                data: {
                  name: options.name,
                  config: config.folders[options.name],
                },
              },
              null,
              2
            )
          );
        } else {
          console.log('✅ Storage folder added successfully');
          console.log(`Name: ${options.name}`);
          console.log(`Path: ${options.path}`);
          console.log(`Access: ${options.access}`);
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

        // Initialize storage services
        const { configManager } = await initializeStorageServices(
          civic,
          dataDir
        );

        // Load current config
        const config = await configManager.loadConfig();

        // Check if folder exists
        if (!config.folders[options.name]) {
          if (!options.json) {
            console.error(`❌ Folder '${options.name}' not found`);
          }
          process.exit(1);
        }

        // Update folder configuration
        const folderConfig = config.folders[options.name];
        if (options.access) {
          folderConfig.access = options.access;
        }
        if (options.types) {
          folderConfig.allowed_types = options.types.split(',');
        }
        if (options.maxSize) {
          folderConfig.max_size = options.maxSize;
        }
        if (options.description) {
          folderConfig.description = options.description;
        }

        // Save updated configuration
        await configManager.saveConfig(config);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                data: {
                  name: options.name,
                  config: folderConfig,
                },
              },
              null,
              2
            )
          );
        } else {
          console.log('✅ Storage folder updated successfully');
          console.log(`Name: ${options.name}`);
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

        // Initialize storage services
        const { configManager } = await initializeStorageServices(
          civic,
          dataDir
        );

        // Load current config
        const config = await configManager.loadConfig();

        // Check if folder exists
        if (!config.folders[options.name]) {
          if (!options.json) {
            console.error(`❌ Folder '${options.name}' not found`);
          }
          process.exit(1);
        }

        // Remove folder from configuration
        delete config.folders[options.name];

        // Save updated configuration
        await configManager.saveConfig(config);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                message: 'Storage folder removed successfully',
              },
              null,
              2
            )
          );
        } else {
          console.log('✅ Storage folder removed successfully');
          console.log(`Name: ${options.name}`);
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

        // Initialize storage services
        const { storageService } = await initializeStorageServices(
          civic,
          dataDir
        );

        // Find file by name in folder
        const files = await storageService.listFiles(options.folder);
        const file = files.find(
          (f: StorageFile) =>
            f.original_name === options.file ||
            f.stored_filename === options.file
        );

        if (!file) {
          if (!options.json) {
            console.error(
              `❌ File not found: ${options.file} in folder ${options.folder}`
            );
          }
          process.exit(1);
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                data: {
                  file: {
                    id: file.id,
                    name: file.original_name,
                    size: file.size,
                    mime_type: file.mime_type,
                    created_at: file.created_at,
                    updated_at: file.updated_at,
                    folder: file.folder,
                    relative_path: file.relative_path,
                  },
                },
              },
              null,
              2
            )
          );
        } else {
          console.log('📄 File Information:');
          console.log(`Name: ${file.original_name}`);
          console.log(`Size: ${file.size} bytes`);
          console.log(`Type: ${file.mime_type}`);
          console.log(`Created: ${file.created_at}`);
          console.log(`Modified: ${file.updated_at}`);
        }
      } catch (error: any) {
        if (!options.json) {
          console.error('❌ Error:', error.message);
        }
        process.exit(1);
      }
    });
}
