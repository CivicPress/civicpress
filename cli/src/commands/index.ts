import { CAC } from 'cac';
import { CivicPress, IndexingService } from '@civicpress/core';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

export const indexCommand = (cli: CAC) => {
  cli
    .command('index', 'Generate and manage civic record indexes')
    .option('--rebuild', 'Rebuild all indexes from scratch')
    .option('--module <module>', 'Generate index for specific module')
    .option('--type <type>', 'Filter by record type')
    .option('--status <status>', 'Filter by record status')
    .option('--search <query>', 'Search within existing index')
    .option('--list', 'List all available indexes')
    .option('--validate', 'Validate existing indexes')
    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
    .action(async (options: any) => {
      try {
        const globalOpts = getGlobalOptionsFromArgs();
        const logger = initializeLogger();

        // Initialize CivicPress
        const civicPress = new CivicPress({
          dataDir: 'data',
        });

        await civicPress.initialize();

        const indexingService = new IndexingService(civicPress, 'data');

        // Handle different sub-commands based on options
        if (options.search) {
          await handleSearch(
            indexingService,
            options.search,
            options,
            globalOpts,
            logger
          );
        } else if (options.list) {
          await handleList(indexingService, options, globalOpts, logger);
        } else if (options.validate) {
          await handleValidate(indexingService, options, globalOpts, logger);
        } else {
          await handleGenerate(indexingService, options, globalOpts, logger);
        }

        await civicPress.shutdown();
      } catch (error) {
        console.error('Index command failed:', error);
        process.exit(1);
      }
    });
};

async function handleGenerate(
  indexingService: any,
  options: any,
  globalOpts: any,
  logger: any
) {
  const indexingOptions = {
    rebuild: options.rebuild,
    modules: options.module ? [options.module] : undefined,
    types: options.type ? [options.type] : undefined,
    statuses: options.status ? [options.status] : undefined,
  };

  if (!globalOpts.silent) {
    logger.info('Generating civic record indexes...');
  }

  const index = await indexingService.generateIndexes(indexingOptions);

  if (!globalOpts.silent) {
    if (globalOpts.json) {
      console.log(JSON.stringify(index, null, 2));
    } else {
      logger.info(
        `Generated index with ${index.metadata.totalRecords} records`
      );
      logger.info(`Modules: ${index.metadata.modules.join(', ')}`);
      logger.info(`Types: ${index.metadata.types.join(', ')}`);
      logger.info(`Statuses: ${index.metadata.statuses.join(', ')}`);
      logger.info(`Generated at: ${index.metadata.generated}`);
    }
  }
}

async function handleSearch(
  indexingService: any,
  query: string,
  options: any,
  globalOpts: any,
  logger: any
) {
  const recordsDir = globalOpts.dataDir
    ? `${globalOpts.dataDir}/records`
    : 'data/records';
  const indexPath = `${recordsDir}/index.yml`;

  const index = indexingService.loadIndex(indexPath);

  if (!index) {
    logger.error(
      'No index found. Run "civic index" to generate indexes first.'
    );
    process.exit(1);
  }

  const searchOptions = {
    type: options.type,
    status: options.status,
    module: options.module,
    tags: options.tags ? options.tags.split(',') : undefined,
  };

  const results = indexingService.searchIndex(index, query, searchOptions);

  if (!globalOpts.silent) {
    if (globalOpts.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      if (results.length === 0) {
        logger.info('No records found matching your search criteria.');
      } else {
        logger.info(`Found ${results.length} records:`);
        results.forEach((entry: any, index: number) => {
          console.log(
            `${index + 1}. ${entry.title} (${entry.type}/${entry.status})`
          );
          console.log(`   File: ${entry.file}`);
          if (entry.tags && entry.tags.length > 0) {
            console.log(`   Tags: ${entry.tags.join(', ')}`);
          }
          console.log('');
        });
      }
    }
  }
}

async function handleList(
  indexingService: any,
  options: any,
  globalOpts: any,
  logger: any
) {
  const recordsDir = globalOpts.dataDir
    ? `${globalOpts.dataDir}/records`
    : 'data/records';
  const indexPath = `${recordsDir}/index.yml`;

  const index = indexingService.loadIndex(indexPath);

  if (!index) {
    logger.error(
      'No index found. Run "civic index" to generate indexes first.'
    );
    process.exit(1);
  }

  if (!globalOpts.silent) {
    if (globalOpts.json) {
      console.log(JSON.stringify(index, null, 2));
    } else {
      logger.info('Available indexes:');
      logger.info(
        `- Global index: ${indexPath} (${index.metadata.totalRecords} records)`
      );

      // List module-specific indexes
      for (const module of index.metadata.modules) {
        const moduleIndexPath = `${recordsDir}/${module}/index.yml`;
        const moduleIndex = indexingService.loadIndex(moduleIndexPath);
        if (moduleIndex) {
          logger.info(
            `- ${module} index: ${moduleIndexPath} (${moduleIndex.metadata.totalRecords} records)`
          );
        }
      }
    }
  }
}

async function handleValidate(
  indexingService: any,
  options: any,
  globalOpts: any,
  logger: any
) {
  const recordsDir = globalOpts.dataDir
    ? `${globalOpts.dataDir}/records`
    : 'data/records';
  const indexPath = `${recordsDir}/index.yml`;

  const index = indexingService.loadIndex(indexPath);

  if (!index) {
    logger.error('No index found to validate.');
    process.exit(1);
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate index structure
  if (!index.entries || !Array.isArray(index.entries)) {
    errors.push('Index entries is not an array');
  }

  if (!index.metadata) {
    errors.push('Index metadata is missing');
  }

  // Validate each entry
  for (const entry of index.entries) {
    if (!entry.file) {
      errors.push(`Entry missing file path: ${JSON.stringify(entry)}`);
    }

    if (!entry.title) {
      warnings.push(`Entry missing title: ${entry.file}`);
    }

    if (!entry.type) {
      warnings.push(`Entry missing type: ${entry.file}`);
    }

    if (!entry.status) {
      warnings.push(`Entry missing status: ${entry.file}`);
    }
  }

  if (!globalOpts.silent) {
    if (globalOpts.json) {
      console.log(
        JSON.stringify(
          {
            valid: errors.length === 0,
            errors,
            warnings,
            totalRecords: index.metadata.totalRecords,
          },
          null,
          2
        )
      );
    } else {
      if (errors.length === 0 && warnings.length === 0) {
        logger.info('✅ Index validation passed');
        logger.info(`Total records: ${index.metadata.totalRecords}`);
      } else {
        if (errors.length > 0) {
          logger.error('❌ Index validation failed:');
          errors.forEach((error: string) => logger.error(`  - ${error}`));
        }
        if (warnings.length > 0) {
          logger.warn('⚠️  Index validation warnings:');
          warnings.forEach((warning: string) => logger.warn(`  - ${warning}`));
        }
      }
    }
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}
