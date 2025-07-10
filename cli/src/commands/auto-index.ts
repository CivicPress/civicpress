import { CAC } from 'cac';
import { CivicPress } from '@civicpress/core';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

export const autoIndexCommand = (cli: CAC) => {
  cli
    .command('auto-index', 'Test and demonstrate auto-indexing workflow')
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

        // Initialize CivicPress
        const civicPress = new CivicPress({
          dataDir: 'data',
        });

        await civicPress.initialize();

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
  const record = await civicPress.getRecordManager().createRecord(
    {
      title: 'Demo Bylaw for Auto-Indexing',
      type: 'bylaw',
      content:
        '# Demo Bylaw\n\nThis is a demonstration bylaw for auto-indexing.',
      metadata: {
        module: 'legal-register',
        tags: ['demo', 'auto-indexing', 'workflow'],
      },
    },
    'clerk'
  );

  if (!globalOpts.silent) {
    logger.info(`✅ Created record: ${record.title} (ID: ${record.id})`);
  }

  // Step 2: Update the record to trigger auto-indexing
  const updatedRecord = await civicPress.getRecordManager().updateRecord(
    record.id,
    {
      title: 'Updated Demo Bylaw for Auto-Indexing',
      content:
        '# Updated Demo Bylaw\n\nThis is an updated demonstration bylaw.',
      status: 'proposed',
    },
    'clerk'
  );

  if (!globalOpts.silent) {
    logger.info(`✅ Updated record: ${updatedRecord?.title}`);
    logger.info('🔄 Auto-indexing workflow should have been triggered');
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
              updatedRecord: updatedRecord,
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
  const record = await civicPress.getRecordManager().createRecord(
    {
      title: title,
      type: 'bylaw',
      content: `# ${title}\n\nThis is a test record created via CLI.`,
      metadata: {
        module: 'legal-register',
        tags: ['cli-created', 'test'],
      },
    },
    'clerk'
  );

  if (!globalOpts.silent) {
    if (globalOpts.json) {
      console.log(JSON.stringify(record, null, 2));
    } else {
      logger.info(`✅ Created record: ${record.title} (ID: ${record.id})`);
    }
  }
}

async function updateTestRecord(
  civicPress: CivicPress,
  recordId: string,
  options: any,
  globalOpts: any,
  logger: any
) {
  const updatedRecord = await civicPress.getRecordManager().updateRecord(
    recordId,
    {
      title: `Updated ${recordId}`,
      status: 'proposed',
      content: `# Updated ${recordId}\n\nThis record was updated via CLI.`,
    },
    'clerk'
  );

  if (!globalOpts.silent) {
    if (globalOpts.json) {
      console.log(JSON.stringify(updatedRecord, null, 2));
    } else {
      if (updatedRecord) {
        logger.info(`✅ Updated record: ${updatedRecord.title}`);
        logger.info('🔄 Auto-indexing workflow should have been triggered');
      } else {
        logger.error(`❌ Record not found: ${recordId}`);
      }
    }
  }
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
