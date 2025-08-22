import { CAC } from 'cac';
import { CivicPress } from '@civicpress/core';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';
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
    .action(async (options: any) => {
      try {
        const globalOpts = getGlobalOptionsFromArgs();
        const logger = initializeLogger();
        const shouldOutputJson = globalOpts.json;

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
          logger.info('Auto-indexing workflow test command');
          logger.info('Use --demo to run a complete demonstration');
          logger.info('Use --create <title> to create a test record');
          logger.info('Use --update <id> to update a record');
          logger.info('Use --list to list all records');
        }

        await civicPress.shutdown();
      } catch (error) {
        console.error('Auto-index command failed:', error);
        process.exit(1);
      }
    });
};

async function runAutoIndexingDemo(
  civicPress: CivicPress,
  options: any,
  globalOpts: any,
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

  if (!globalOpts.silent) {
    if (globalOpts.json) {
      console.log(
        JSON.stringify(
          {
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
          },
          null,
          2
        )
      );
    } else {
      logger.info('📊 Indexing Results:');
      logger.info(`  Total records: ${index.metadata.totalRecords}`);
      logger.info(`  Modules: ${index.metadata.modules.join(', ')}`);
      logger.info(`  Types: ${index.metadata.types.join(', ')}`);
      logger.info(`  Statuses: ${index.metadata.statuses.join(', ')}`);

      // Check if our updated record is in the index
      const demoRecordInIndex = index.entries.find(
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
  options: any,
  globalOpts: any,
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
  options: any,
  globalOpts: any,
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
  options: any,
  globalOpts: any,
  logger: any
) {
  const result = await civicPress.getRecordManager().listRecords();

  if (!globalOpts.silent) {
    if (globalOpts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      logger.info(`📋 Found ${result.total} records:`);
      for (const record of result.records) {
        logger.info(`  - ${record.title} (${record.type}, ${record.status})`);
      }
    }
  }
}
