import { CAC } from 'cac';

export const infoCommand = (cli: CAC) => {
  cli
    .command('info', 'Show organization and system configuration info')
    .option('--json', 'Output as JSON')
    .option(
      '--token <token>',
      'Session token for authentication (required for system config)'
    )
    .action(async (options) => {
      const shouldOutputJson = options.json;
      const token = options.token;
      let isAdmin = false;
      let userInfo: any = null;
      let systemConfig: any = null;
      let dataDir: string | undefined = undefined;
      let dbConfig: any = undefined;
      try {
        const { CentralConfigManager } = await import('@civicpress/core');
        const orgConfig = CentralConfigManager.getOrgConfig();
        if (token) {
          // Validate token and check admin without exiting
          const { CivicPress } = await import('@civicpress/core');
          const { CentralConfigManager } = await import('@civicpress/core');
          try {
            const dataDir = CentralConfigManager.getDataDir();
            const dbConfig = CentralConfigManager.getDatabaseConfig();

            const civic = new CivicPress({
              dataDir,
              database: dbConfig,
              logger: { json: shouldOutputJson },
            });
            await civic.initialize();

            const authService = civic.getAuthService();
            const user = await authService.validateSession(token);

            if (user) {
              userInfo = user;
              isAdmin = user.role === 'admin';
            } else {
              isAdmin = false;
              userInfo = null;
            }

            await civic.shutdown();
          } catch {
            // Invalid token, treat as not admin but don't exit
            isAdmin = false;
            userInfo = null;
          }
        }
        if (isAdmin) {
          systemConfig = CentralConfigManager.getConfig();
          dataDir = CentralConfigManager.getDataDir();
          dbConfig = CentralConfigManager.getDatabaseConfig();
        }
        if (shouldOutputJson) {
          const output: any = {
            success: true,
            organization: orgConfig,
          };
          if (isAdmin) {
            output.system = {
              ...systemConfig,
              dataDir,
              database: dbConfig,
            };
            output.user = userInfo;
          } else if (token) {
            output.note = 'System config is only visible to admin users.';
            if (userInfo) output.user = userInfo;
          }
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.log('🏢 Organization Information:');
          console.log(`   Name: ${orgConfig.name || 'Not set'}`);
          console.log(`   City: ${orgConfig.city || 'Not set'}`);
          console.log(`   State: ${orgConfig.state || 'Not set'}`);
          console.log(`   Country: ${orgConfig.country || 'Not set'}`);
          console.log(`   Timezone: ${orgConfig.timezone || 'Not set'}`);
          if (orgConfig.website)
            console.log(`   Website: ${orgConfig.website}`);
          if (orgConfig.repo_url)
            console.log(`   Repository: ${orgConfig.repo_url}`);
          if (orgConfig.email) console.log(`   Email: ${orgConfig.email}`);
          if (orgConfig.phone) console.log(`   Phone: ${orgConfig.phone}`);
          if (orgConfig.logo) console.log(`   Logo: ${orgConfig.logo}`);
          if (orgConfig.tagline)
            console.log(`   Tagline: ${orgConfig.tagline}`);
          if (orgConfig.mission)
            console.log(`   Mission: ${orgConfig.mission}`);
          if (orgConfig.description)
            console.log(`   Description: ${orgConfig.description}`);
          if (orgConfig.social) {
            console.log('   Social:');
            Object.entries(orgConfig.social).forEach(([key, value]) => {
              if (value) console.log(`     ${key}: ${value}`);
            });
          }
          if (orgConfig.custom) {
            console.log('   Custom:');
            Object.entries(orgConfig.custom).forEach(([key, value]) => {
              if (value) console.log(`     ${key}: ${value}`);
            });
          }
          if (isAdmin) {
            console.log('');
            console.log('⚙️ System Configuration:');
            console.log(`   Data Directory: ${dataDir}`);
            console.log(
              `   Database Type: ${dbConfig?.type || 'Not configured'}`
            );
            if (dbConfig?.sqlite?.file)
              console.log(`   SQLite File: ${dbConfig.sqlite.file}`);
            if (dbConfig?.postgres?.url)
              console.log(`   PostgreSQL URL: ${dbConfig.postgres.url}`);
          } else if (token) {
            if (userInfo && userInfo.role !== 'admin') {
              console.log('\n🔒 System config is only visible to admin users.');
            } else if (!userInfo) {
              console.log(
                '\n🔒 Invalid or expired token. System config hidden.'
              );
            }
          }
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
          console.error('❌ Failed to load info:', error);
        }
        process.exit(1);
      }
    });
};
