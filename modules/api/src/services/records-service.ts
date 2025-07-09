import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { WorkflowConfigManager } from '@civicpress/core';

export interface CivicRecord {
  id: string;
  title: string;
  type: string;
  status: string;
  content: string;
  metadata: {
    author?: string;
    created?: string;
    updated?: string;
    version?: string;
    [key: string]: any;
  };
  path: string;
}

export interface CreateRecordRequest {
  title: string;
  type: string;
  content?: string;
  template?: string;
  role?: string;
  metadata?: Record<string, any>;
}

export interface UpdateRecordRequest {
  title?: string;
  content?: string;
  status?: string;
  metadata?: Record<string, any>;
}

export class RecordsService {
  private civicPress: CivicPress;
  private dataDir: string | null = null;

  constructor(civicPress: CivicPress) {
    this.civicPress = civicPress;
    this.dataDir = civicPress.getCore().getDataDir();
  }

  /**
   * List all records with optional filtering
   */
  async listRecords(
    options: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    records: CivicRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    if (!this.dataDir) {
      throw new Error('Data directory not found. Run "civic init" first.');
    }

    const recordsDir = path.join(this.dataDir, 'records');
    if (!fs.existsSync(recordsDir)) {
      return {
        records: [],
        total: 0,
        page: 1,
        limit: options.limit || 10,
      };
    }

    const records: CivicRecord[] = [];
    const recordTypes = fs
      .readdirSync(recordsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    // Filter by type if specified
    const typesToShow = options.type ? [options.type] : recordTypes;

    for (const recordType of typesToShow) {
      const typeDir = path.join(recordsDir, recordType);
      if (!fs.existsSync(typeDir)) continue;

      const files = fs
        .readdirSync(typeDir)
        .filter((file) => file.endsWith('.md'))
        .map((file) => path.join(typeDir, file));

      for (const filePath of files) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const { data: frontmatter, content: markdownContent } =
            matter(content);

          const title = frontmatter.title || path.basename(filePath, '.md');
          const status = frontmatter.status || 'draft';

          // Apply status filter if specified
          if (options.status && status !== options.status) {
            continue;
          }

          const record: CivicRecord = {
            id: path.basename(filePath, '.md'),
            title,
            type: recordType,
            status,
            content: markdownContent,
            metadata: {
              author: frontmatter.author || 'unknown',
              created: frontmatter.created,
              updated: frontmatter.updated,
              version: frontmatter.version || '1.0.0',
              ...frontmatter,
            },
            path: path.relative(this.dataDir!, filePath),
          };

          records.push(record);
        } catch (error) {
          // Log error but continue processing other files
          console.error(`Error reading ${filePath}:`, error);
        }
      }
    }

    // Apply pagination
    const limit = options.limit || 10;
    const offset = options.offset || 0;
    const paginatedRecords = records.slice(offset, offset + limit);

    return {
      records: paginatedRecords,
      total: records.length,
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  }

  /**
   * Get a specific record by ID
   */
  async getRecord(id: string, type?: string): Promise<CivicRecord | null> {
    if (!this.dataDir) {
      throw new Error('Data directory not found. Run "civic init" first.');
    }

    const recordsDir = path.join(this.dataDir, 'records');
    if (!fs.existsSync(recordsDir)) {
      return null;
    }

    // If type is specified, look in that directory
    if (type) {
      const filePath = path.join(recordsDir, type, `${id}.md`);
      if (fs.existsSync(filePath)) {
        return this.readRecordFile(filePath, id, type);
      }
    } else {
      // Search all record types
      const recordTypes = fs
        .readdirSync(recordsDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      for (const recordType of recordTypes) {
        const filePath = path.join(recordsDir, recordType, `${id}.md`);
        if (fs.existsSync(filePath)) {
          return this.readRecordFile(filePath, id, recordType);
        }
      }
    }

    return null;
  }

  /**
   * Create a new record
   */
  async createRecord(
    request: CreateRecordRequest,
    userRole: string = 'unknown'
  ): Promise<CivicRecord> {
    if (!this.dataDir) {
      throw new Error('Data directory not found. Run "civic init" first.');
    }

    // Validate record type
    const validTypes = ['bylaw', 'policy', 'proposal', 'resolution'];
    if (!validTypes.includes(request.type)) {
      throw new Error(
        `Invalid record type: ${request.type}. Valid types: ${validTypes.join(', ')}`
      );
    }

    // Validate role permissions
    const workflowManager = new WorkflowConfigManager(this.dataDir);
    const actionValidation = await workflowManager.validateAction(
      'create',
      request.type,
      userRole
    );

    if (!actionValidation.valid) {
      throw new Error(`Insufficient permissions: ${actionValidation.reason}`);
    }

    // Create filename from title
    const filename = request.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    // Create directory structure
    const recordsDir = path.join(this.dataDir, 'records', request.type);
    if (!fs.existsSync(recordsDir)) {
      fs.mkdirSync(recordsDir, { recursive: true });
    }

    // Create the record file
    const filePath = path.join(recordsDir, `${filename}.md`);

    // Create frontmatter
    const frontmatter = {
      title: request.title,
      type: request.type,
      status: 'draft',
      author: userRole,
      version: '1.0.0',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      ...request.metadata,
    };

    // Create content
    const content =
      request.content || `# ${request.title}\n\nContent goes here...`;

    // Write the file
    const fileContent = matter.stringify(content, frontmatter);
    fs.writeFileSync(filePath, fileContent);

    // Return the created record
    return {
      id: filename,
      title: request.title,
      type: request.type,
      status: 'draft',
      content,
      metadata: frontmatter,
      path: path.relative(this.dataDir, filePath),
    };
  }

  /**
   * Update an existing record
   */
  async updateRecord(
    id: string,
    request: UpdateRecordRequest,
    userRole: string = 'unknown'
  ): Promise<CivicRecord | null> {
    if (!this.dataDir) {
      throw new Error('Data directory not found. Run "civic init" first.');
    }

    // Find the record
    const record = await this.getRecord(id);
    if (!record) {
      return null;
    }

    // Validate status transition if status is being updated
    if (request.status && request.status !== record.status) {
      const workflowManager = new WorkflowConfigManager(this.dataDir);
      const transitionValidation = await workflowManager.validateTransition(
        record.status,
        request.status,
        userRole
      );

      if (!transitionValidation.valid) {
        throw new Error(
          `Invalid status transition: ${transitionValidation.reason}`
        );
      }
    }

    // Update the record
    const filePath = path.join(this.dataDir, record.path);
    const { data: frontmatter, content: existingContent } = matter(
      fs.readFileSync(filePath, 'utf8')
    );

    // Update frontmatter
    const updatedFrontmatter = {
      ...frontmatter,
      ...(request.title && { title: request.title }),
      ...(request.status && { status: request.status }),
      updated: new Date().toISOString(),
      updatedBy: userRole,
      ...request.metadata,
    };

    // Update content
    const updatedContent = request.content || existingContent;

    // Write the updated file
    const fileContent = matter.stringify(updatedContent, updatedFrontmatter);
    fs.writeFileSync(filePath, fileContent);

    // Return the updated record
    return {
      ...record,
      title: request.title || record.title,
      status: request.status || record.status,
      content: updatedContent,
      metadata: updatedFrontmatter,
    };
  }

  /**
   * Delete a record
   */
  async deleteRecord(
    id: string,
    userRole: string = 'unknown'
  ): Promise<boolean> {
    if (!this.dataDir) {
      throw new Error('Data directory not found. Run "civic init" first.');
    }

    // Find the record
    const record = await this.getRecord(id);
    if (!record) {
      return false;
    }

    // Validate permissions for deletion
    const workflowManager = new WorkflowConfigManager(this.dataDir);
    const actionValidation = await workflowManager.validateAction(
      'delete',
      record.type,
      userRole
    );

    if (!actionValidation.valid) {
      throw new Error(`Insufficient permissions: ${actionValidation.reason}`);
    }

    // Delete the file
    const filePath = path.join(this.dataDir, record.path);
    fs.unlinkSync(filePath);

    return true;
  }

  /**
   * Helper method to read a record file
   */
  private readRecordFile(
    filePath: string,
    id: string,
    type: string
  ): CivicRecord {
    const content = fs.readFileSync(filePath, 'utf8');
    const { data: frontmatter, content: markdownContent } = matter(content);

    return {
      id,
      title: frontmatter.title || path.basename(filePath, '.md'),
      type,
      status: frontmatter.status || 'draft',
      content: markdownContent,
      metadata: {
        author: frontmatter.author || 'unknown',
        created: frontmatter.created,
        updated: frontmatter.updated,
        version: frontmatter.version || '1.0.0',
        ...frontmatter,
      },
      path: path.relative(this.dataDir!, filePath),
    };
  }
}
