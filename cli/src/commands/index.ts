import { CAC } from 'cac';
import { CivicPress } from '@civicpress/core';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliStartOperation,
} from '../utils/cli-output.js';

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
    .option('--sync-db', 'Sync indexed records to database')
    .option(
      '--conflict-resolution <strategy>',
      'Conflict resolution strategy (file-wins, database-wins, timestamp, manual)',
      { default: 'file-wins' }
    )
    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
    .action(async (options: any) => {
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('index');

      try {
        // Initialize CivicPress
        const civicPress = new CivicPress({
          dataDir: 'data',
        });

        await civicPress.initialize();

        const indexingService = civicPress.getIndexingService();

        // Handle different sub-commands based on options
        if (options.search) {
          await handleSearch(indexingService, options.search, options);
        } else if (options.list) {
          await handleList(indexingService, options);
        } else if (options.validate) {
          await handleValidate(indexingService, options);
        } else {
          await handleGenerate(indexingService, options);
        }

        await civicPress.shutdown();

        // Explicitly exit to ensure process terminates
        process.exit(0);
      } catch (error) {
        cliError(
          'Index command failed',
          'INDEX_COMMAND_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'index'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
};

async function handleGenerate(indexingService: any, options: any) {
  const indexingOptions = {
    rebuild: options.rebuild,
    modules: options.module ? [options.module] : undefined,
    types: options.type ? [options.type] : undefined,
    statuses: options.status ? [options.status] : undefined,
    syncDatabase: options.syncDb || options['sync-db'],
    conflictResolution: options.conflictResolution,
  };

  const index = await indexingService.generateIndexes(indexingOptions);

  const globalOptions = getGlobalOptionsFromArgs();
  const isJson = globalOptions.json;

  const message =
    options.syncDb || options['sync-db']
      ? `Generated index with ${index.metadata.totalRecords} records and synced to database`
      : `Generated index with ${index.metadata.totalRecords} records`;

  cliSuccess(
    {
      index,
      metadata: {
        totalRecords: index.metadata.totalRecords,
        modules: index.metadata.modules,
        types: index.metadata.types,
        statuses: index.metadata.statuses,
        generated: index.metadata.generated,
        synced: options.syncDb || options['sync-db'],
        conflictResolution: options.conflictResolution,
      },
    },
    message,
    {
      operation: 'index:generate',
      totalRecords: index.metadata.totalRecords,
      modules: index.metadata.modules,
    }
  );

  // Output detailed information in human-readable mode (after success message)
  if (!isJson) {
    if (index.metadata.types.length > 0) {
      cliInfo(`Types: ${index.metadata.types.join(', ')}`, 'index:generate');
    }
    if (index.metadata.modules.length > 0) {
      cliInfo(
        `Modules: ${index.metadata.modules.join(', ')}`,
        'index:generate'
      );
    }
    if (options.syncDb || options['sync-db']) {
      const strategy = options.conflictResolution || 'file-wins';
      cliInfo(
        `Database sync completed with conflict resolution: ${strategy}`,
        'index:generate'
      );
    }
  }
}

async function handleSearch(indexingService: any, query: string, options: any) {
  const recordsDir = 'data/records';
  const indexPath = `${recordsDir}/index.yml`;

  const index = indexingService.loadIndex(indexPath);

  if (!index) {
    cliError(
      'No index found. Run "civic index" to generate indexes first.',
      'INDEX_NOT_FOUND',
      undefined,
      'index:search'
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

  if (results.length === 0) {
    cliInfo('No records found matching your search criteria.', 'index:search');
  } else {
    cliSuccess(
      { results, query, searchOptions },
      `Found ${results.length} record${results.length === 1 ? '' : 's'} matching "${query}"`,
      {
        operation: 'index:search',
        query,
        resultCount: results.length,
      }
    );
  }
}

async function handleList(indexingService: any, options: any) {
  const recordsDir = 'data/records';
  const indexPath = `${recordsDir}/index.yml`;

  const index = indexingService.loadIndex(indexPath);

  if (!index) {
    cliError(
      'No index found. Run "civic index" to generate indexes first.',
      'INDEX_NOT_FOUND',
      undefined,
      'index:list'
    );
    process.exit(1);
  }

  const moduleIndexes: any[] = [];
  for (const module of index.metadata.modules) {
    const moduleIndexPath = `${recordsDir}/${module}/index.yml`;
    const moduleIndex = indexingService.loadIndex(moduleIndexPath);
    if (moduleIndex) {
      moduleIndexes.push({
        module,
        path: moduleIndexPath,
        recordCount: moduleIndex.metadata.totalRecords,
      });
    }
  }

  cliSuccess(
    {
      globalIndex: {
        path: indexPath,
        recordCount: index.metadata.totalRecords,
      },
      moduleIndexes,
    },
    `Available indexes: global (${index.metadata.totalRecords} records)${moduleIndexes.length > 0 ? `, ${moduleIndexes.length} module index${moduleIndexes.length === 1 ? '' : 'es'}` : ''}`,
    {
      operation: 'index:list',
      totalRecords: index.metadata.totalRecords,
      moduleCount: moduleIndexes.length,
    }
  );
}

async function handleValidate(indexingService: any, options: any) {
  const recordsDir = 'data/records';
  const indexPath = `${recordsDir}/index.yml`;

  const index = indexingService.loadIndex(indexPath);

  if (!index) {
    cliError(
      'No index found to validate',
      'INDEX_NOT_FOUND',
      undefined,
      'index:validate'
    );
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

  if (errors.length === 0 && warnings.length === 0) {
    cliSuccess(
      {
        valid: true,
        errors,
        warnings,
        totalRecords: index.metadata.totalRecords,
      },
      `Index validation passed (${index.metadata.totalRecords} records)`,
      {
        operation: 'index:validate',
        totalRecords: index.metadata.totalRecords,
      }
    );
  } else if (errors.length === 0) {
    cliWarn(
      `Index validation passed with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`,
      'index:validate'
    );
  } else {
    cliError(
      `Index validation failed with ${errors.length} error${errors.length === 1 ? '' : 's'}${warnings.length > 0 ? ` and ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}`,
      'VALIDATION_FAILED',
      {
        valid: false,
        errors,
        warnings,
        totalRecords: index.metadata.totalRecords,
      },
      'index:validate'
    );
    process.exit(1);
  }
}
