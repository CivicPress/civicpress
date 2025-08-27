export interface StorageConfig {
  backend: StorageBackend;
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
