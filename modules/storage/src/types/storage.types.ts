export interface StorageConfig {
  backend: StorageBackend; // Legacy support
  providers?: Record<string, StorageProvider>;
  active_provider?: string;
  failover_providers?: string[];
  global?: GlobalStorageSettings;
  folders: Record<string, StorageFolder>;
  metadata: StorageMetadata;
}

export interface StorageBackend {
  type: 'local' | 's3' | 'minio' | 'ipfs';
  path?: string;
  endpoint?: string;
  bucket?: string;
  region?: string;
  credentials?: {
    access_key?: string;
    secret_key?: string;
  };
}

// New multi-provider configuration
export interface StorageProvider {
  type: 'local' | 's3' | 'azure' | 'gcs';
  enabled: boolean;
  // Local provider config
  path?: string;
  // S3 provider config
  region?: string;
  bucket?: string;
  endpoint?: string;
  prefix?: string;
  // Azure provider config
  account_name?: string;
  container_name?: string;
  // GCS provider config
  project_id?: string;
  // Provider-specific options
  options?: Record<string, any>;
}

export interface GlobalStorageSettings {
  max_file_size: string;
  health_checks: boolean;
  health_check_interval: number;
  retry_attempts: number;
  cross_provider_backup: boolean;
  backup_providers: string[];
}

// Provider-specific credential interfaces
export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface AzureCredentials {
  connectionString?: string;
  accountName?: string;
  accountKey?: string;
}

export interface GCSCredentials {
  projectId: string;
  keyFilename?: string;
  credentials?: Record<string, any>;
}

export type ProviderCredentials =
  | S3Credentials
  | AzureCredentials
  | GCSCredentials;

export interface StorageFolder {
  path: string;
  access: 'public' | 'authenticated' | 'private';
  allowed_types: string[];
  max_size: string; // e.g., "10MB", "100MB"
  description?: string;
}

export interface StorageMetadata {
  auto_generate_thumbnails: boolean;
  store_exif: boolean;
  compress_images: boolean;
  backup_included: boolean;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  mime_type: string;
  created: Date;
  modified: Date;
  metadata?: Record<string, any>;
}

export interface UploadResult {
  success: boolean;
  file: FileInfo;
  path: string;
  url: string;
  error?: string;
}

export interface StorageOperation {
  operation: 'upload' | 'download' | 'delete' | 'list' | 'move';
  path: string;
  user_id?: string;
  timestamp: Date;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface StorageQuota {
  used: number;
  limit: number;
  available: number;
  unit: 'bytes' | 'KB' | 'MB' | 'GB';
}

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// UUID-based file system interfaces
export interface StorageFile {
  id: string; // UUID
  original_name: string;
  stored_filename: string; // filename with UUID suffix
  folder: string;
  relative_path: string; // folder/stored_filename
  provider_path: string; // full path in storage provider
  size: number;
  mime_type: string;
  description?: string;
  uploaded_by?: string;
  created_at: Date;
  updated_at: Date;
}

// Multer file interface
export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

export interface UploadFileRequest {
  file: Buffer | MulterFile;
  folder: string;
  description?: string;
  uploaded_by?: string;
}

export interface UploadFileResponse {
  success: boolean;
  file?: StorageFile;
  error?: string;
}

// Enhanced file info with UUID support
export interface FileInfoWithId extends FileInfo {
  id?: string; // UUID if tracked in database
  relative_path?: string;
}
