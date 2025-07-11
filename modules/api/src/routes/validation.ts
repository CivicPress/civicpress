import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth';
import { Logger } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
  handleValidationError,
} from '../utils/api-logger';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

type Severity = 'error' | 'warning' | 'info';
function isSeverity(val: any): val is Severity {
  return val === 'error' || val === 'warning' || val === 'info';
}

const logger = new Logger();

export function createValidationRouter() {
  const router = Router();

  // POST /api/validation/record - Validate a single record
  router.post(
    '/record',
    requirePermission('records:view'),
    [
      body('recordId')
        .isString()
        .notEmpty()
        .withMessage('Record ID is required'),
      body('type').optional().isString().withMessage('Type must be a string'),
    ],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'validate_record' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'validate_record',
            errors.array(),
            req,
            res
          );
        }

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const { recordId, type } = req.body;

        const result = await validateSingleRecord(dataDir, recordId, type);

        logger.info('Record validation completed', {
          recordId,
          isValid: result.isValid,
          issues: result.issues.length,
          requestId: (req as any).requestId,
        });

        sendSuccess(result, req, res, {
          operation: 'validate_record',
          meta: {
            isValid: result.isValid,
            issues: result.issues.length,
          },
        });
      } catch (error) {
        handleApiError(
          'validate_record',
          error,
          req,
          res,
          'Failed to validate record'
        );
      }
    }
  );

  // POST /api/validation/bulk - Validate multiple records
  router.post(
    '/bulk',
    requirePermission('records:view'),
    [
      body('recordIds').isArray().withMessage('Record IDs must be an array'),
      body('types').optional().isArray().withMessage('Types must be an array'),
      body('includeContent')
        .optional()
        .isBoolean()
        .withMessage('Include content must be boolean'),
    ],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'validate_bulk' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'validate_bulk',
            errors.array(),
            req,
            res
          );
        }

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const { recordIds, types, includeContent = false } = req.body;

        const validationResults = await validateBulkRecords(
          dataDir,
          recordIds,
          types,
          includeContent
        );

        logger.info('Bulk validation completed', {
          totalRecords: validationResults.results.length,
          validRecords: validationResults.summary.validCount,
          invalidRecords: validationResults.summary.invalidCount,
          requestId: (req as any).requestId,
        });

        sendSuccess(validationResults, req, res, {
          operation: 'validate_bulk',
          meta: {
            totalRecords: validationResults.results.length,
            validRecords: validationResults.summary.validCount,
            invalidRecords: validationResults.summary.invalidCount,
          },
        });
      } catch (error) {
        handleApiError(
          'validate_bulk',
          error,
          req,
          res,
          'Failed to validate records'
        );
      }
    }
  );

  // GET /api/validation/status - Get validation status and issues
  router.get(
    '/status',
    requirePermission('records:view'),
    [
      query('type').optional().isString().withMessage('Type must be a string'),
      query('severity')
        .optional()
        .isIn(['error', 'warning', 'info'])
        .withMessage('Severity must be error, warning, or info'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    ],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_validation_status' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'get_validation_status',
            errors.array(),
            req,
            res
          );
        }

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const { type, severity, limit = '50' } = req.query;

        const validationStatus = await getValidationStatus(dataDir, {
          type: type as string,
          severity: severity as string,
          limit: parseInt(limit as string),
        });

        logger.info('Validation status retrieved', {
          totalIssues: validationStatus.summary.totalIssues,
          bySeverity: validationStatus.summary.bySeverity,
          requestId: (req as any).requestId,
        });

        sendSuccess(validationStatus, req, res, {
          operation: 'get_validation_status',
          meta: {
            totalIssues: validationStatus.summary.totalIssues,
          },
        });
      } catch (error) {
        handleApiError(
          'get_validation_status',
          error,
          req,
          res,
          'Failed to get validation status'
        );
      }
    }
  );

  // GET /api/validation/record/:recordId - Validate a specific record by ID
  router.get(
    '/record/:recordId',
    requirePermission('records:view'),
    [
      param('recordId')
        .isString()
        .notEmpty()
        .withMessage('Record ID is required'),
      query('type').optional().isString().withMessage('Type must be a string'),
    ],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record_validation' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return handleValidationError(
            'get_record_validation',
            errors.array(),
            req,
            res
          );
        }

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const { recordId } = req.params;
        const { type } = req.query;

        const result = await validateSingleRecord(
          dataDir,
          recordId,
          type as string
        );

        logger.info('Record validation retrieved', {
          recordId,
          isValid: result.isValid,
          issues: result.issues.length,
          requestId: (req as any).requestId,
        });

        sendSuccess(result, req, res, {
          operation: 'get_record_validation',
          meta: {
            isValid: result.isValid,
            issues: result.issues.length,
          },
        });
      } catch (error) {
        handleApiError(
          'get_record_validation',
          error,
          req,
          res,
          'Failed to get record validation'
        );
      }
    }
  );

  return router;
}

// Helper function to validate a single record
async function validateSingleRecord(
  dataDir: string,
  recordId: string,
  type?: string
): Promise<any> {
  const recordsDir = path.join(dataDir, 'records');
  const issues: any[] = [];
  let recordPath: string | null = null;
  let recordContent: string | null = null;

  // Find the record file
  if (type) {
    const typeDir = path.join(recordsDir, type);
    if (fs.existsSync(typeDir)) {
      const filePath = path.join(typeDir, `${recordId}.md`);
      if (fs.existsSync(filePath)) {
        recordPath = filePath;
      }
    }
  } else {
    // Search all record types
    const recordTypes = fs
      .readdirSync(recordsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const recordType of recordTypes) {
      const typeDir = path.join(recordsDir, recordType);
      const filePath = path.join(typeDir, `${recordId}.md`);
      if (fs.existsSync(filePath)) {
        recordPath = filePath;
        break;
      }
    }
  }

  if (!recordPath) {
    issues.push({
      severity: 'error' as Severity,
      code: 'RECORD_NOT_FOUND',
      message: `Record '${recordId}' not found`,
      field: 'recordId',
    });
    return {
      recordId,
      isValid: false,
      issues,
      content: null,
    };
  }

  try {
    recordContent = fs.readFileSync(recordPath, 'utf-8');
  } catch (error) {
    issues.push({
      severity: 'error' as Severity,
      code: 'READ_ERROR',
      message: `Failed to read record file: ${(error as Error).message}`,
      field: 'file',
    });
    return {
      recordId,
      isValid: false,
      issues,
      content: null,
    };
  }

  // Validate record structure
  const validationResult = await validateRecordContent(recordContent, recordId);
  issues.push(...validationResult.issues);

  return {
    recordId,
    isValid: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
    content: recordContent,
    metadata: validationResult.metadata,
  };
}

// Helper function to validate record content
async function validateRecordContent(
  content: string,
  _recordId: string
): Promise<any> {
  const issues: any[] = [];
  const metadata: any = {};

  try {
    // Check for required frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (!frontmatterMatch) {
      issues.push({
        severity: 'error' as Severity,
        code: 'MISSING_FRONTMATTER',
        message: 'Record must have YAML frontmatter',
        field: 'frontmatter',
      });
      return { issues, metadata };
    }

    const frontmatter = frontmatterMatch[1];

    try {
      const parsed = yaml.load(frontmatter) as any;

      // Validate required fields
      if (!parsed.title) {
        issues.push({
          severity: 'error' as Severity,
          code: 'MISSING_TITLE',
          message: 'Record must have a title',
          field: 'title',
        });
      }

      if (!parsed.type) {
        issues.push({
          severity: 'error' as Severity,
          code: 'MISSING_TYPE',
          message: 'Record must have a type',
          field: 'type',
        });
      }

      if (!parsed.status) {
        issues.push({
          severity: 'warning' as Severity,
          code: 'MISSING_STATUS',
          message: 'Record should have a status',
          field: 'status',
        });
      }

      // Validate status values
      if (
        parsed.status &&
        ![
          'draft',
          'proposed',
          'reviewed',
          'approved',
          'active',
          'archived',
        ].includes(parsed.status)
      ) {
        issues.push({
          severity: 'warning' as Severity,
          code: 'INVALID_STATUS',
          message: `Status '${parsed.status}' is not a standard status`,
          field: 'status',
        });
      }

      // Validate type values
      if (
        parsed.type &&
        !['bylaw', 'policy', 'resolution', 'proposition', 'ordinance'].includes(
          parsed.type
        )
      ) {
        issues.push({
          severity: 'warning' as Severity,
          code: 'INVALID_TYPE',
          message: `Type '${parsed.type}' is not a standard type`,
          field: 'type',
        });
      }

      metadata.title = parsed.title;
      metadata.type = parsed.type;
      metadata.status = parsed.status;
      metadata.author = parsed.author;
      metadata.created = parsed.created;
      metadata.updated = parsed.updated;
    } catch (yamlError) {
      issues.push({
        severity: 'error' as Severity,
        code: 'INVALID_YAML',
        message: `Invalid YAML frontmatter: ${(yamlError as Error).message}`,
        field: 'frontmatter',
      });
    }

    // Check content length
    const contentWithoutFrontmatter = content.replace(
      /^---\s*\n[\s\S]*?\n---\s*\n/,
      ''
    );
    if (contentWithoutFrontmatter.trim().length < 10) {
      issues.push({
        severity: 'warning' as Severity,
        code: 'SHORT_CONTENT',
        message: 'Record content is very short',
        field: 'content',
      });
    }

    // Check for common issues
    if (content.includes('TODO') || content.includes('FIXME')) {
      issues.push({
        severity: 'info' as Severity,
        code: 'TODO_FOUND',
        message: 'Record contains TODO or FIXME markers',
        field: 'content',
      });
    }

    if (content.includes('{{') && content.includes('}}')) {
      issues.push({
        severity: 'warning' as Severity,
        code: 'TEMPLATE_VARIABLES',
        message: 'Record contains template variables that may not be resolved',
        field: 'content',
      });
    }
  } catch (error) {
    issues.push({
      severity: 'error' as Severity,
      code: 'VALIDATION_ERROR',
      message: `Validation error: ${(error as Error).message}`,
      field: 'general',
    });
  }

  return { issues, metadata };
}

// Helper function to validate multiple records
async function validateBulkRecords(
  dataDir: string,
  recordIds: string[],
  types?: string[],
  includeContent = false
): Promise<any> {
  const results = [];
  const summary = {
    totalRecords: recordIds.length,
    validCount: 0,
    invalidCount: 0,
    bySeverity: {
      error: 0,
      warning: 0,
      info: 0,
    },
  };

  for (const recordId of recordIds) {
    const type = types ? types[recordIds.indexOf(recordId)] : undefined;
    const result = await validateSingleRecord(dataDir, recordId, type);

    if (!includeContent) {
      delete result.content;
    }

    results.push(result);

    if (result.isValid) {
      summary.validCount++;
    } else {
      summary.invalidCount++;
    }

    // Count issues by severity
    for (const issue of result.issues) {
      if (
        issue.severity === 'error' ||
        issue.severity === 'warning' ||
        issue.severity === 'info'
      ) {
        summary.bySeverity[issue.severity as Severity]++;
      }
    }
  }

  return {
    results,
    summary,
  };
}

// Helper function to get validation status
async function getValidationStatus(
  dataDir: string,
  options: {
    type?: string;
    severity?: string;
    limit?: number;
  }
): Promise<any> {
  const recordsDir = path.join(dataDir, 'records');
  const allIssues: any[] = [];
  const summary = {
    totalIssues: 0,
    bySeverity: {
      error: 0,
      warning: 0,
      info: 0,
    },
    byType: {} as Record<string, number>,
  };

  if (!fs.existsSync(recordsDir)) {
    return {
      issues: [],
      summary,
    };
  }

  const recordTypes = fs
    .readdirSync(recordsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const recordType of recordTypes) {
    if (options.type && recordType !== options.type) continue;

    const typeDir = path.join(recordsDir, recordType);
    const files = fs
      .readdirSync(typeDir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => path.join(typeDir, file));

    for (const file of files) {
      const recordId = path.basename(file, '.md');
      const result = await validateSingleRecord(dataDir, recordId, recordType);

      for (const issue of result.issues) {
        if (options.severity && issue.severity !== options.severity) continue;

        allIssues.push({
          ...issue,
          recordId,
          recordType,
          file: path.relative(dataDir, file),
        });

        if (isSeverity(issue.severity)) {
          summary.bySeverity[issue.severity as Severity]++;
        }
        summary.byType[recordType] = (summary.byType[recordType] || 0) + 1;
      }
    }
  }

  summary.totalIssues = allIssues.length;

  // Apply limit and sort by severity (error > warning > info)
  const sortedIssues = allIssues.sort((a, b) => {
    const severityOrder = { error: 3, warning: 2, info: 1 };
    return (
      severityOrder[b.severity as Severity] -
      severityOrder[a.severity as Severity]
    );
  });

  const limitedIssues = options.limit
    ? sortedIssues.slice(0, options.limit)
    : sortedIssues;

  return {
    issues: limitedIssues,
    summary,
  };
}
