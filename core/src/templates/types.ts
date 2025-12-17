/**
 * Template API Types
 *
 * Type definitions for the template service layer and API
 */

import type {
  Template as CoreTemplate,
  TemplateValidation,
  TemplateSection,
  TemplateVariable,
  ValidationResult as CoreValidationResult,
} from '../utils/template-engine.js';

/**
 * Template ID format: {type}/{name}
 * Examples: "bylaw/default", "policy/advanced"
 */
export type TemplateId = string;

/**
 * Template response for API
 */
export interface TemplateResponse {
  id: TemplateId;
  type: string;
  name: string;
  description?: string;
  extends?: string;
  content: string;
  rawContent: string;
  validation: TemplateValidation;
  sections: TemplateSection[];
  variables?: TemplateVariable[];
  partials?: string[];
  metadata?: {
    created?: string;
    updated?: string;
    author?: string;
    version?: string;
  };
}

/**
 * Template filters for listing
 */
export interface TemplateFilters {
  type?: string;
  search?: string;
  include?: ('metadata' | 'validation' | 'variables')[];
  page?: number;
  limit?: number;
}

/**
 * Create template request
 */
export interface CreateTemplateRequest {
  type: string;
  name: string;
  description?: string;
  extends?: string;
  content: string;
  validation?: Partial<TemplateValidation>;
  sections?: TemplateSection[];
}

/**
 * Update template request (all fields optional)
 */
export interface UpdateTemplateRequest {
  description?: string;
  extends?: string;
  content?: string;
  validation?: Partial<TemplateValidation>;
  sections?: TemplateSection[];
}

/**
 * Template list response
 */
export interface TemplateListResponse {
  templates: TemplateResponse[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Template preview request
 */
export interface TemplatePreviewRequest {
  variables: Record<string, any>;
}

/**
 * Template preview response
 */
export interface TemplatePreviewResponse {
  rendered: string;
  variables: {
    used: string[];
    missing: string[];
    available: TemplateVariable[];
  };
}

/**
 * Enhanced validation result for API
 */
export interface ValidationResult extends CoreValidationResult {
  inheritance?: {
    chain: string[];
    hasCycle: boolean;
  };
  structure?: {
    valid: boolean;
    errors: string[];
  };
}

/**
 * Template service interface
 */
export interface ITemplateService {
  listTemplates(filters?: TemplateFilters): Promise<TemplateListResponse>;
  getTemplate(id: TemplateId): Promise<TemplateResponse | null>;
  createTemplate(data: CreateTemplateRequest): Promise<TemplateResponse>;
  updateTemplate(
    id: TemplateId,
    data: UpdateTemplateRequest
  ): Promise<TemplateResponse>;
  deleteTemplate(id: TemplateId): Promise<void>;
  previewTemplate(
    id: TemplateId,
    variables: Record<string, any>
  ): Promise<TemplatePreviewResponse>;
  validateTemplate(id: TemplateId): Promise<ValidationResult>;
  invalidateCache(id?: TemplateId): Promise<void>;
}

/**
 * Convert core Template to TemplateResponse
 */
export function templateToResponse(
  template: CoreTemplate,
  id: TemplateId
): TemplateResponse {
  return {
    id,
    type: template.type,
    name: template.name,
    description: undefined, // Will be extracted from frontmatter if available
    extends: template.extends,
    content: template.content,
    rawContent: template.rawContent,
    validation: template.validation,
    sections: template.sections,
    variables: undefined, // Will be populated by service
    partials: template.partials,
    metadata: undefined, // Will be populated from file stats if available
  };
}

/**
 * Parse template ID into type and name
 */
export function parseTemplateId(id: TemplateId): {
  type: string;
  name: string;
} {
  const parts = id.split('/');
  if (parts.length !== 2) {
    throw new Error(
      `Invalid template ID format: ${id}. Expected format: {type}/{name}`
    );
  }
  return {
    type: parts[0],
    name: parts[1],
  };
}

/**
 * Build template ID from type and name
 */
export function buildTemplateId(type: string, name: string): TemplateId {
  // Validate type and name
  if (!/^[a-z0-9_-]+$/i.test(type)) {
    throw new Error(
      `Invalid template type: ${type}. Only alphanumeric, hyphens, and underscores allowed.`
    );
  }
  if (!/^[a-z0-9_-]+$/i.test(name)) {
    throw new Error(
      `Invalid template name: ${name}. Only alphanumeric, hyphens, and underscores allowed.`
    );
  }
  return `${type}/${name}`;
}
