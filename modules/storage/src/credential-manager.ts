import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';
import {
  StorageProvider,
  S3Credentials,
  AzureCredentials,
  GCSCredentials,
  ProviderCredentials,
} from './types/storage.types.js';
import { Logger } from '@civicpress/core';

export class CredentialManager {
  private logger: Logger;
  private configPath: string;

  constructor(configPath?: string) {
    this.logger = new Logger();
    this.configPath =
      configPath || join(process.cwd(), '.system-data', 'storage.yml');
  }

  /**
   * Get credentials for a specific provider
   * Priority: Environment Variables > Instance Profiles > Configuration File
   */
  async getCredentials(
    providerType: string
  ): Promise<ProviderCredentials | null> {
    try {
      // 1. Try environment variables first
      const envCredentials = this.getEnvironmentCredentials(providerType);
      if (envCredentials) {
        this.logger.info(`Using environment credentials for ${providerType}`);
        return envCredentials;
      }

      // 2. Try cloud instance profiles (AWS IAM, Azure Managed Identity, etc.)
      const instanceCredentials =
        await this.getInstanceCredentials(providerType);
      if (instanceCredentials) {
        this.logger.info(
          `Using instance profile credentials for ${providerType}`
        );
        return instanceCredentials;
      }

      // 3. Fallback to configuration file
      const configCredentials = this.getConfigCredentials(providerType);
      if (configCredentials) {
        this.logger.info(
          `Using configuration file credentials for ${providerType}`
        );
        return configCredentials;
      }

      this.logger.warn(
        `No credentials found for ${providerType} in environment, instance profiles, or config file`
      );
      return null;
    } catch (error) {
      this.logger.error(
        `Failed to get credentials for ${providerType}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get credentials from environment variables
   */
  private getEnvironmentCredentials(
    providerType: string
  ): ProviderCredentials | null {
    switch (providerType) {
      case 's3':
        const s3AccessKey =
          process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
        const s3SecretKey =
          process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
        const s3SessionToken =
          process.env.S3_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;

        if (s3AccessKey && s3SecretKey) {
          return {
            accessKeyId: s3AccessKey,
            secretAccessKey: s3SecretKey,
            sessionToken: s3SessionToken,
          } as S3Credentials;
        }
        break;

      case 'azure':
        const azureConnectionString =
          process.env.AZURE_STORAGE_CONNECTION_STRING;
        const azureAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
        const azureAccountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;

        if (azureConnectionString) {
          return {
            connectionString: azureConnectionString,
          } as AzureCredentials;
        }

        if (azureAccountName && azureAccountKey) {
          return {
            accountName: azureAccountName,
            accountKey: azureAccountKey,
          } as AzureCredentials;
        }
        break;

      case 'gcs':
        const gcsProjectId =
          process.env.GOOGLE_CLOUD_PROJECT || process.env.GCS_PROJECT_ID;
        const gcsKeyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        if (gcsProjectId) {
          return {
            projectId: gcsProjectId,
            keyFilename: gcsKeyFile,
          } as GCSCredentials;
        }
        break;
    }

    return null;
  }

  /**
   * Get credentials from configuration file
   */
  private getConfigCredentials(
    providerType: string
  ): ProviderCredentials | null {
    try {
      const config = this.getStorageConfig();
      const providers = config.providers || {};
      const provider = providers[providerType];

      if (!provider || !provider.credentials) {
        return null;
      }

      switch (providerType) {
        case 's3':
          const s3Creds = provider.credentials;
          if (s3Creds.access_key_id && s3Creds.secret_access_key) {
            return {
              accessKeyId: s3Creds.access_key_id,
              secretAccessKey: s3Creds.secret_access_key,
              sessionToken: s3Creds.session_token || undefined,
            } as S3Credentials;
          }
          break;

        case 'azure':
          const azureCreds = provider.credentials;
          if (azureCreds.connection_string) {
            return {
              connectionString: azureCreds.connection_string,
            } as AzureCredentials;
          }
          if (provider.account_name && azureCreds.account_key) {
            return {
              accountName: provider.account_name,
              accountKey: azureCreds.account_key,
            } as AzureCredentials;
          }
          break;

        case 'gcs':
          const gcsCreds = provider.credentials;
          if (gcsCreds.project_id) {
            return {
              projectId: gcsCreds.project_id,
              keyFilename: gcsCreds.service_account_key || undefined,
            } as GCSCredentials;
          }
          break;
      }

      return null;
    } catch (error) {
      this.logger.debug(
        `Failed to read config credentials for ${providerType}:`,
        error
      );
      return null;
    }
  }

  /**
   * Try to get credentials from cloud instance profiles
   */
  private async getInstanceCredentials(
    providerType: string
  ): Promise<ProviderCredentials | null> {
    switch (providerType) {
      case 's3':
        // AWS EC2 Instance Profile or ECS Task Role
        return await this.getAWSInstanceCredentials();

      case 'azure':
        // Azure Managed Identity
        return await this.getAzureManagedIdentity();

      case 'gcs':
        // Google Cloud Instance Metadata
        return await this.getGCPInstanceCredentials();
    }

    return null;
  }

  /**
   * Get AWS credentials from instance metadata service
   */
  private async getAWSInstanceCredentials(): Promise<S3Credentials | null> {
    try {
      // This would use AWS SDK's default credential chain
      // For now, we'll return null and let the AWS SDK handle it
      this.logger.info('AWS instance credentials will be handled by AWS SDK');
      return null;
    } catch (error) {
      this.logger.debug('No AWS instance credentials available');
      return null;
    }
  }

  /**
   * Get Azure credentials from managed identity
   */
  private async getAzureManagedIdentity(): Promise<AzureCredentials | null> {
    try {
      // This would use Azure's DefaultAzureCredential
      // For now, we'll return null and let the Azure SDK handle it
      this.logger.info('Azure managed identity will be handled by Azure SDK');
      return null;
    } catch (error) {
      this.logger.debug('No Azure managed identity available');
      return null;
    }
  }

  /**
   * Get GCP credentials from instance metadata
   */
  private async getGCPInstanceCredentials(): Promise<GCSCredentials | null> {
    try {
      // This would use Google's Application Default Credentials
      // For now, we'll return null and let the Google SDK handle it
      this.logger.info(
        'GCP instance credentials will be handled by Google SDK'
      );
      return null;
    } catch (error) {
      this.logger.debug('No GCP instance credentials available');
      return null;
    }
  }

  /**
   * Validate credentials for a provider
   */
  async validateCredentials(
    providerType: string,
    credentials: ProviderCredentials
  ): Promise<boolean> {
    try {
      switch (providerType) {
        case 's3':
          return await this.validateS3Credentials(credentials as S3Credentials);
        case 'azure':
          return await this.validateAzureCredentials(
            credentials as AzureCredentials
          );
        case 'gcs':
          return await this.validateGCSCredentials(
            credentials as GCSCredentials
          );
        default:
          return false;
      }
    } catch (error) {
      this.logger.error(
        `Credential validation failed for ${providerType}:`,
        error
      );
      return false;
    }
  }

  private async validateS3Credentials(
    credentials: S3Credentials
  ): Promise<boolean> {
    // Basic format validation
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      return false;
    }

    // AWS access keys should start with 'AKIA' for IAM users
    if (
      !credentials.accessKeyId.startsWith('AKIA') &&
      !credentials.accessKeyId.startsWith('ASIA')
    ) {
      this.logger.warn('S3 access key format may be invalid');
    }

    // TODO: Test actual S3 connection
    this.logger.info('S3 credentials format validation passed');
    return true;
  }

  private async validateAzureCredentials(
    credentials: AzureCredentials
  ): Promise<boolean> {
    // Basic validation
    if (credentials.connectionString) {
      return (
        credentials.connectionString.includes('AccountName') &&
        credentials.connectionString.includes('AccountKey')
      );
    }

    if (credentials.accountName && credentials.accountKey) {
      return (
        credentials.accountName.length > 0 && credentials.accountKey.length > 0
      );
    }

    return false;
  }

  private async validateGCSCredentials(
    credentials: GCSCredentials
  ): Promise<boolean> {
    // Basic validation
    return !!credentials.projectId;
  }

  /**
   * Mask sensitive information in credentials for logging
   */
  maskCredentials(credentials: ProviderCredentials): Record<string, any> {
    if ('accessKeyId' in credentials) {
      // S3 credentials
      return {
        accessKeyId: credentials.accessKeyId?.substring(0, 4) + '****',
        secretAccessKey: '****',
        sessionToken: credentials.sessionToken ? '****' : undefined,
      };
    }

    if ('connectionString' in credentials) {
      // Azure credentials
      return {
        connectionString: credentials.connectionString?.replace(
          /AccountKey=[^;]+/,
          'AccountKey=****'
        ),
        accountName: credentials.accountName,
        accountKey: credentials.accountKey ? '****' : undefined,
      };
    }

    if ('projectId' in credentials) {
      // GCS credentials
      return {
        projectId: credentials.projectId,
        keyFilename: credentials.keyFilename ? '****' : undefined,
        credentials: credentials.credentials ? '****' : undefined,
      };
    }

    return {};
  }

  /**
   * Get current storage configuration
   */
  getStorageConfig(): any {
    try {
      if (!existsSync(this.configPath)) {
        throw new Error(`Storage configuration not found: ${this.configPath}`);
      }

      const configContent = readFileSync(this.configPath, 'utf8');
      return parse(configContent);
    } catch (error) {
      this.logger.error('Failed to read storage configuration:', error);
      throw error;
    }
  }

  /**
   * Update storage configuration
   */
  updateStorageConfig(config: any): void {
    try {
      const yamlContent = stringify(config, { indent: 2 });
      writeFileSync(this.configPath, yamlContent, 'utf8');
      this.logger.info('Storage configuration updated successfully');
    } catch (error) {
      this.logger.error('Failed to update storage configuration:', error);
      throw error;
    }
  }
}

export default CredentialManager;
