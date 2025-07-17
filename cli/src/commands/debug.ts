import { CAC } from 'cac';
import { CivicPress } from '@civicpress/core';

export const debugCommand = (cli: CAC) => {
  cli
    .command('debug:permissions', 'Debug permission system')
    .option('--token <token>', 'Session token for authentication')
    .option('--user <username>', 'Username to test')
    .option('--permission <permission>', 'Permission to test')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const shouldOutputJson = options.json;

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: shouldOutputJson,
            silent: false,
          },
        });
        await civic.initialize();

        const authService = civic.getAuthService();
        const roleManager = (authService as any).roleManager;

        // Test role loading
        const config = await roleManager['loadConfig']();

        // Print the full config for inspection
        console.log('🗂️ Full loaded config:', JSON.stringify(config, null, 2));

        await civic.shutdown();
      } catch (error) {
        console.error('❌ Debug failed:', error);
        process.exit(1);
      }
    });

  cli
    .command('debug:config', 'Debug central configuration')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const shouldOutputJson = options.json;
      try {
        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');

        const config = CentralConfigManager.getConfig();
        const orgConfig = CentralConfigManager.getOrgConfig();
        const orgInfo = CentralConfigManager.getOrganizationInfo();
        const orgName = CentralConfigManager.getOrganizationName();
        const orgLocation = CentralConfigManager.getOrganizationLocation();
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: true,
                config: {
                  system: config,
                  organization: orgConfig,
                  basic: orgInfo,
                  name: orgName,
                  location: orgLocation,
                  dataDir,
                  database: dbConfig,
                },
              },
              null,
              2
            )
          );
        } else {
          console.log('🔧 Central Configuration Debug');
          console.log('');
          console.log('📋 Organization Information:');
          console.log(`   Name: ${orgName || 'Not set'}`);
          console.log(`   City: ${orgLocation.city || 'Not set'}`);
          console.log(`   State: ${orgLocation.state || 'Not set'}`);
          console.log(`   Country: ${orgLocation.country || 'Not set'}`);
          console.log(`   Timezone: ${orgInfo.timezone || 'Not set'}`);
          console.log(`   Repository: ${orgInfo.repo_url || 'Not set'}`);
          console.log('');
          console.log('📁 System Information:');
          console.log(`   Data Directory: ${dataDir}`);
          console.log(
            `   Database Type: ${dbConfig?.type || 'Not configured'}`
          );
          console.log('');
          console.log('⚙️ System Configuration:');
          console.log(JSON.stringify(config, null, 2));
          console.log('');
          console.log('🏢 Organization Configuration:');
          console.log(JSON.stringify(orgConfig, null, 2));
        }
      } catch (error) {
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        } else {
          console.error('❌ Debug failed:', error);
        }
        process.exit(1);
      }
    });
};
