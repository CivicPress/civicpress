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
import {
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import {
  cliSuccess,
  cliError,
  cliStartOperation,
} from '../utils/cli-output.js';

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

  // Get cache manager from CivicPress instance if available
  const cacheManager = (civic as any).getCacheManager?.();
  const storageService = new CloudUuidStorageService(
    config,
    systemDataDir,
    cacheManager
  );

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
      // If --help is present, let CAC handle it and exit 0
      if (options.help) {
        return;
      }

      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('storage:config');

      let civic: CivicPress | null = null;
      let shutdownCalled = false;

      try {
        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: globalOptions.json,
            silent: globalOptions.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
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
              cliError(
                'Invalid backend JSON format',
                'INVALID_JSON',
                undefined,
                'storage:config'
              );
              process.exit(1);
            }
          }

          if (options.folders) {
            try {
              updateData.folders = JSON.parse(options.folders);
            } catch (error) {
              cliError(
                'Invalid folders JSON format',
                'INVALID_JSON',
                undefined,
                'storage:config'
              );
              process.exit(1);
            }
          }

          if (options.metadata) {
            try {
              updateData.metadata = JSON.parse(options.metadata);
            } catch (error) {
              cliError(
                'Invalid metadata JSON format',
                'INVALID_JSON',
                undefined,
                'storage:config'
              );
              process.exit(1);
            }
          }

          // Save updated configuration
          await configManager.saveConfig(updateData);

          cliSuccess(
            { config: updateData },
            'Storage configuration updated successfully',
            { operation: 'storage:config' }
          );
        } else {
          // Get configuration
          const config = await configManager.loadConfig();

          const message = `Backend: ${config.backend.type}, ${Object.keys(config.folders).length} folders, ${Object.keys(config.metadata).length} metadata settings`;

          cliSuccess({ config }, message, {
            operation: 'storage:config',
            backendType: config.backend.type,
            folderCount: Object.keys(config.folders).length,
          });
        }

        // Explicitly exit to ensure process terminates
        if (civic) {
          await civic.shutdown();
          shutdownCalled = true;
        }
        process.exit(0);
      } catch (error: any) {
        cliError(
          'Error managing storage configuration',
          'STORAGE_CONFIG_ERROR',
          { error: error.message || 'Unknown error' },
          'storage:config'
        );
        process.exit(1);
      } finally {
        // Always shutdown, even on error (if not already called)
        if (civic && !shutdownCalled) {
          try {
            await civic.shutdown();
          } catch (shutdownError) {
            // Ignore shutdown errors
          }
        }
        endOperation();
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
      // If --help is present, let CAC handle it and exit 0
      if (options.help) {
        return;
      }

      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('storage:upload');

      let civic: CivicPress | null = null;
      let shutdownCalled = false;

      try {
        if (!options.file || !options.folder) {
          cliError(
            'Both --file and --folder are required',
            'VALIDATION_ERROR',
            undefined,
            'storage:upload'
          );
          process.exit(1);
        }

        // Check if file exists
        if (!(await fs.pathExists(options.file))) {
          cliError(
            `File not found: ${options.file}`,
            'FILE_NOT_FOUND',
            undefined,
            'storage:upload'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: globalOptions.json,
            silent: globalOptions.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
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
          cliSuccess(
            {
              file: {
                name: result.file.original_name,
                size: result.file.size,
                id: result.file.id,
              },
              path: result.file.relative_path,
            },
            `File uploaded successfully: ${result.file.original_name}`,
            {
              operation: 'storage:upload',
              fileName: result.file.original_name,
              fileSize: result.file.size,
              fileId: result.file.id,
            }
          );

          // Explicitly exit to ensure process terminates
          if (civic) {
            await civic.shutdown();
            shutdownCalled = true;
          }
          process.exit(0);
        } else {
          cliError(
            `Failed to upload file: ${result.error || 'Unknown error'}`,
            'UPLOAD_FAILED',
            { error: result.error },
            'storage:upload'
          );
          process.exit(1);
        }
      } catch (error: any) {
        cliError(
          'Error uploading file',
          'UPLOAD_ERROR',
          { error: error.message || 'Unknown error' },
          'storage:upload'
        );
        process.exit(1);
      } finally {
        // Always shutdown, even on error (if not already called)
        if (civic && !shutdownCalled) {
          try {
            await civic.shutdown();
          } catch (shutdownError) {
            // Ignore shutdown errors
          }
        }
        endOperation();
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
      // If --help is present, let CAC handle it and exit 0
      if (options.help) {
        return;
      }

      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('storage:list');

      let civic: CivicPress | null = null;
      let shutdownCalled = false;

      try {
        if (!options.folder) {
          cliError(
            '--folder is required',
            'VALIDATION_ERROR',
            undefined,
            'storage:list'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: globalOptions.json,
            silent: globalOptions.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
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

        const filesData = paginatedFiles.map((file) => ({
          id: file.id,
          name: file.original_name,
          size: file.size,
          mime_type: file.mime_type,
          created_at: file.created_at,
          updated_at: file.updated_at,
        }));

        const message =
          paginatedFiles.length === 0
            ? `No files found in ${options.folder}`
            : `Found ${total} file${total === 1 ? '' : 's'} in ${options.folder} (page ${page} of ${pages})`;

        cliSuccess(
          {
            files: filesData,
            pagination: {
              page,
              limit,
              total,
              pages,
            },
          },
          message,
          {
            operation: 'storage:list',
            folder: options.folder,
            totalFiles: total,
            currentPage: page,
          }
        );

        // Explicitly exit to ensure process terminates
        if (civic) {
          await civic.shutdown();
          shutdownCalled = true;
        }
        process.exit(0);
      } catch (error: any) {
        cliError(
          'Error listing files',
          'LIST_FILES_ERROR',
          { error: error.message || 'Unknown error' },
          'storage:list'
        );
        process.exit(1);
      } finally {
        // Always shutdown, even on error (if not already called)
        if (civic && !shutdownCalled) {
          try {
            await civic.shutdown();
          } catch (shutdownError) {
            // Ignore shutdown errors
          }
        }
        endOperation();
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
      // If --help is present, let CAC handle it and exit 0
      if (options.help) {
        return;
      }

      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('storage:download');

      let civic: CivicPress | null = null;
      let shutdownCalled = false;

      try {
        if (!options.folder || !options.file) {
          cliError(
            'Both --folder and --file are required',
            'VALIDATION_ERROR',
            undefined,
            'storage:download'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: globalOptions.json,
            silent: globalOptions.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
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
          cliError(
            `File not found: ${options.file} in folder ${options.folder}`,
            'FILE_NOT_FOUND',
            { fileName: options.file, folder: options.folder },
            'storage:download'
          );
          process.exit(1);
        }

        // Download file content
        const content = await storageService.getFileContent(file.id);
        if (!content) {
          cliError(
            'Failed to read file content',
            'READ_FILE_ERROR',
            undefined,
            'storage:download'
          );
          process.exit(1);
        }

        const outputPath = options.output || options.file;
        await fs.writeFile(outputPath, content);

        cliSuccess(
          {
            file: options.file,
            output: outputPath,
            size: content.length,
          },
          `File downloaded successfully to ${outputPath}`,
          {
            operation: 'storage:download',
            fileName: options.file,
            outputPath,
            fileSize: content.length,
          }
        );

        // Explicitly exit to ensure process terminates
        if (civic) {
          await civic.shutdown();
          shutdownCalled = true;
        }
        process.exit(0);
      } catch (error: any) {
        cliError(
          'Error downloading file',
          'DOWNLOAD_ERROR',
          { error: error.message || 'Unknown error' },
          'storage:download'
        );
        process.exit(1);
      } finally {
        // Always shutdown, even on error (if not already called)
        if (civic && !shutdownCalled) {
          try {
            await civic.shutdown();
          } catch (shutdownError) {
            // Ignore shutdown errors
          }
        }
        endOperation();
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
      // If --help is present, let CAC handle it and exit 0
      if (options.help) {
        return;
      }

      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('storage:delete');

      let civic: CivicPress | null = null;
      let shutdownCalled = false;

      try {
        if (!options.folder || !options.file) {
          cliError(
            'Both --folder and --file are required',
            'VALIDATION_ERROR',
            undefined,
            'storage:delete'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: globalOptions.json,
            silent: globalOptions.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
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
          cliError(
            `File not found: ${options.file} in folder ${options.folder}`,
            'FILE_NOT_FOUND',
            { fileName: options.file, folder: options.folder },
            'storage:delete'
          );
          process.exit(1);
        }

        // Delete file
        const success = await storageService.deleteFile(file.id, user.username);

        if (success) {
          cliSuccess(
            { fileName: options.file },
            `File deleted successfully: ${options.file}`,
            {
              operation: 'storage:delete',
              fileName: options.file,
            }
          );

          // Explicitly exit to ensure process terminates
          if (civic) {
            await civic.shutdown();
            shutdownCalled = true;
          }
          process.exit(0);
        } else {
          cliError(
            'Failed to delete file',
            'DELETE_FAILED',
            undefined,
            'storage:delete'
          );
          process.exit(1);
        }
      } catch (error: any) {
        cliError(
          'Error deleting file',
          'DELETE_ERROR',
          { error: error.message || 'Unknown error' },
          'storage:delete'
        );
        process.exit(1);
      } finally {
        // Always shutdown, even on error (if not already called)
        if (civic && !shutdownCalled) {
          try {
            await civic.shutdown();
          } catch (shutdownError) {
            // Ignore shutdown errors
          }
        }
        endOperation();
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
      // If --help is present, let CAC handle it and exit 0
      if (options.help) {
        return;
      }

      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('storage:folder:add');

      let civic: CivicPress | null = null;
      let shutdownCalled = false;

      try {
        if (!options.name || !options.path) {
          cliError(
            'Both --name and --path are required',
            'VALIDATION_ERROR',
            undefined,
            'storage:folder:add'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: globalOptions.json,
            silent: globalOptions.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
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
          cliError(
            `Folder '${options.name}' already exists`,
            'FOLDER_EXISTS',
            undefined,
            'storage:folder:add'
          );
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

        cliSuccess(
          {
            name: options.name,
            config: config.folders[options.name],
          },
          `Storage folder added successfully: ${options.name}`,
          {
            operation: 'storage:folder:add',
            folderName: options.name,
            path: options.path,
            access: options.access,
          }
        );

        // Explicitly exit to ensure process terminates
        if (civic) {
          await civic.shutdown();
          shutdownCalled = true;
        }
        process.exit(0);
      } catch (error: any) {
        cliError(
          'Error adding storage folder',
          'ADD_FOLDER_ERROR',
          { error: error.message || 'Unknown error' },
          'storage:folder:add'
        );
        process.exit(1);
      } finally {
        // Always shutdown, even on error (if not already called)
        if (civic && !shutdownCalled) {
          try {
            await civic.shutdown();
          } catch (shutdownError) {
            // Ignore shutdown errors
          }
        }
        endOperation();
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
      // If --help is present, let CAC handle it and exit 0
      if (options.help) {
        return;
      }

      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('storage:folder:update');

      let civic: CivicPress | null = null;
      let shutdownCalled = false;

      try {
        if (!options.name) {
          cliError(
            '--name is required',
            'VALIDATION_ERROR',
            undefined,
            'storage:folder:update'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: globalOptions.json,
            silent: globalOptions.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
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
          cliError(
            `Folder '${options.name}' not found`,
            'FOLDER_NOT_FOUND',
            undefined,
            'storage:folder:update'
          );
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

        cliSuccess(
          {
            name: options.name,
            config: folderConfig,
          },
          `Storage folder updated successfully: ${options.name}`,
          {
            operation: 'storage:folder:update',
            folderName: options.name,
          }
        );

        // Explicitly exit to ensure process terminates
        if (civic) {
          await civic.shutdown();
          shutdownCalled = true;
        }
        process.exit(0);
      } catch (error: any) {
        cliError(
          'Error updating storage folder',
          'UPDATE_FOLDER_ERROR',
          { error: error.message || 'Unknown error' },
          'storage:folder:update'
        );
        process.exit(1);
      } finally {
        // Always shutdown, even on error (if not already called)
        if (civic && !shutdownCalled) {
          try {
            await civic.shutdown();
          } catch (shutdownError) {
            // Ignore shutdown errors
          }
        }
        endOperation();
      }
    });

  cli
    .command('storage:folder:remove', 'Remove a storage folder')
    .option('--token <token>', 'Session token for authentication')
    .option('--name <name>', 'Name of the folder to remove')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      // If --help is present, let CAC handle it and exit 0
      if (options.help) {
        return;
      }

      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('storage:folder:remove');

      let civic: CivicPress | null = null;
      let shutdownCalled = false;

      try {
        if (!options.name) {
          cliError(
            '--name is required',
            'VALIDATION_ERROR',
            undefined,
            'storage:folder:remove'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: globalOptions.json,
            silent: globalOptions.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
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
          cliError(
            `Folder '${options.name}' not found`,
            'FOLDER_NOT_FOUND',
            undefined,
            'storage:folder:remove'
          );
          process.exit(1);
        }

        // Remove folder from configuration
        delete config.folders[options.name];

        // Save updated configuration
        await configManager.saveConfig(config);

        cliSuccess(
          { folderName: options.name },
          `Storage folder removed successfully: ${options.name}`,
          {
            operation: 'storage:folder:remove',
            folderName: options.name,
          }
        );

        // Explicitly exit to ensure process terminates
        if (civic) {
          await civic.shutdown();
          shutdownCalled = true;
        }
        process.exit(0);
      } catch (error: any) {
        cliError(
          'Error removing storage folder',
          'REMOVE_FOLDER_ERROR',
          { error: error.message || 'Unknown error' },
          'storage:folder:remove'
        );
        process.exit(1);
      } finally {
        // Always shutdown, even on error (if not already called)
        if (civic && !shutdownCalled) {
          try {
            await civic.shutdown();
          } catch (shutdownError) {
            // Ignore shutdown errors
          }
        }
        endOperation();
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
      // If --help is present, let CAC handle it and exit 0
      if (options.help) {
        return;
      }

      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('storage:info');

      let civic: CivicPress | null = null;
      let shutdownCalled = false;

      try {
        if (!options.folder || !options.file) {
          cliError(
            'Both --folder and --file are required',
            'VALIDATION_ERROR',
            undefined,
            'storage:info'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: globalOptions.json,
            silent: globalOptions.silent,
          },
        });
        await civic.initialize();

        // Require authentication
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
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
          cliError(
            `File not found: ${options.file} in folder ${options.folder}`,
            'FILE_NOT_FOUND',
            { fileName: options.file, folder: options.folder },
            'storage:info'
          );
          process.exit(1);
        }

        cliSuccess(
          {
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
          `File information for ${file.original_name}`,
          {
            operation: 'storage:info',
            fileName: file.original_name,
            fileId: file.id,
          }
        );

        // Explicitly exit to ensure process terminates
        if (civic) {
          await civic.shutdown();
          shutdownCalled = true;
        }
        process.exit(0);
      } catch (error: any) {
        cliError(
          'Error getting file information',
          'GET_FILE_INFO_ERROR',
          { error: error.message || 'Unknown error' },
          'storage:info'
        );
        process.exit(1);
      } finally {
        // Always shutdown, even on error (if not already called)
        if (civic && !shutdownCalled) {
          try {
            await civic.shutdown();
          } catch (shutdownError) {
            // Ignore shutdown errors
          }
        }
        endOperation();
      }
    });
}
