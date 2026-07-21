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
  cliStartOperation,
} from '../utils/cli-output.js';
import { AuthUtils } from '../utils/auth-utils.js';

export const autoIndexCommand = (cli: CAC) => {
  cli
    .command('auto-index', 'Test and demonstrate auto-indexing workflow')
    .option('--token <token>', 'Session token for authentication')
    .option('--create <title>', 'Create a test record with title')
    .option('--update <id>', 'Update a record by ID')
    .option('--list', 'List all records')
    .option('--demo', 'Run a complete auto-indexing demo')
    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .action(async (options: any) => {
      // Initialize CLI output with global options
      const globalOpts = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOpts);

      const logger = initializeLogger();
      const endOperation = cliStartOperation('auto-index');

      // Check if we should output JSON
      const shouldOutputJson = globalOpts.json;

      try {
        // Validate authentication and get civic instance
        const { civic } = await AuthUtils.requireAuthWithCivic(
          options.token,
          shouldOutputJson
        );

        // Use the authenticated civic instance
        const civicPress = civic;

        if (options.demo) {
          await runAutoIndexingDemo(civicPress, options, globalOpts, logger);
        } else if (options.create) {
          await createTestRecord(
            civicPress,
            options.create,
            options,
            globalOpts,
            logger
          );
        } else if (options.update) {
          await updateTestRecord(
            civicPress,
            options.update,
            options,
            globalOpts,
            logger
          );
        } else if (options.list) {
          await listRecords(civicPress, options, globalOpts, logger);
        } else {
          cliInfo('Auto-indexing workflow test command', 'auto-index');
          cliInfo('Use --demo to run a complete demonstration', 'auto-index');
          cliInfo('Use --create <title> to create a test record', 'auto-index');
          cliInfo('Use --update <id> to update a record', 'auto-index');
          cliInfo('Use --list to list all records', 'auto-index');
        }

        await civicPress.shutdown();
      } catch (error) {
        cliError(
          'Auto-index command failed',
          'AUTO_INDEX_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'auto-index'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
};

async function runAutoIndexingDemo(
  civicPress: CivicPress,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalOpts: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any
) {
  if (!globalOpts.silent) {
    logger.info('🚀 Starting auto-indexing workflow demo...');
  }

  // Step 1: Create a test record
  // TODO: Fix type compatibility between CLI and Core API
  if (!globalOpts.silent) {
    logger.warn(
      '⚠️  Auto-indexing demo temporarily disabled due to type compatibility'
    );
    logger.info(
      'The demo would create and update records to test auto-indexing workflows'
    );
  }

  // Mock the record for demo purposes
  const record = { id: 'demo-record', title: 'Demo Bylaw for Auto-Indexing' };

  if (!globalOpts.silent) {
    logger.info(`✅ Would create record: ${record.title} (ID: ${record.id})`);
  }

  // Step 2: Update the record to trigger auto-indexing
  if (!globalOpts.silent) {
    logger.info('🔄 Would update record to trigger auto-indexing workflow');
  }

  if (!globalOpts.silent) {
    logger.info('✅ Would update record to trigger auto-indexing workflow');
  }

  // Step 3: Check the indexing results
  const indexingService = civicPress.getIndexingService();
  const index = await indexingService.generateIndexes();

  const demoResult = {
    demo: {
      originalRecord: record,
      updatedRecord: {
        id: 'demo-record',
        title: 'Updated Demo Bylaw for Auto-Indexing',
      },
      indexResults: {
        totalRecords: index.metadata.totalRecords,
        modules: index.metadata.modules,
        types: index.metadata.types,
        statuses: index.metadata.statuses,
      },
    },
  };

  cliSuccess(demoResult, 'Auto-indexing demo completed', {
    operation: 'auto-index',
  });

  if (!globalOpts.silent) {
    logger.info('📊 Indexing Results:');
    logger.info(`  Total records: ${index.metadata.totalRecords}`);
    logger.info(`  Modules: ${index.metadata.modules.join(', ')}`);
    logger.info(`  Types: ${index.metadata.types.join(', ')}`);
    logger.info(`  Statuses: ${index.metadata.statuses.join(', ')}`);

    // Check if our updated record is in the index
    const demoRecordInIndex = index.entries.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (entry: any) => entry.title === 'Updated Demo Bylaw for Auto-Indexing'
    );

    if (demoRecordInIndex) {
      logger.info(
        '✅ Demo record found in index with correct status: ' +
          demoRecordInIndex.status
      );
    } else {
      logger.warn('⚠️  Demo record not found in index');
    }
  }

  // Step 4: Check workflow status
  const workflowEngine = civicPress.getWorkflowEngine();
  const activeWorkflows = workflowEngine.getActiveWorkflows();

  if (!globalOpts.silent) {
    logger.info(`🔄 Active workflows: ${activeWorkflows.size}`);

    for (const [, workflow] of activeWorkflows) {
      logger.info(`  - ${workflow.name}: ${workflow.status}`);
      if (workflow.metadata) {
        logger.info(`    Indexed records: ${workflow.metadata.indexedRecords}`);
      }
    }
  }
}

async function createTestRecord(
  civicPress: CivicPress,
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalOpts: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any
) {
  // TODO: Fix AuthUser type compatibility
  if (!globalOpts.silent) {
    logger.warn(
      '⚠️  createTestRecord function temporarily disabled due to type compatibility'
    );
  }
  return null;
}

async function updateTestRecord(
  civicPress: CivicPress,
  recordId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalOpts: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any
) {
  // TODO: Fix AuthUser type compatibility
  if (!globalOpts.silent) {
    logger.warn(
      '⚠️  updateTestRecord function temporarily disabled due to type compatibility'
    );
  }
  return null;
}

async function listRecords(
  civicPress: CivicPress,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalOpts: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any
) {
  // Explicitly the complete set: this prints one line per record and reports
  // `result.total` alongside, so a page would have it claim N records and then
  // list 10 of them. (That is exactly what a bare listRecords() used to do,
  // back when the store defaulted to a silent LIMIT 10.)
  const result = await civicPress
    .getRecordManager()
    .listRecords({ limit: 'all' });

  cliSuccess(result, 'Records listed', {
    operation: 'auto-index',
  });

  if (!globalOpts.silent) {
    logger.info(`📋 Found ${result.total} records:`);
    for (const record of result.records) {
      logger.info(`  - ${record.title} (${record.type}, ${record.status})`);
    }
  }
}
