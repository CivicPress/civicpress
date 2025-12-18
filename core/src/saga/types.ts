/**
 * Saga Pattern Types and Interfaces
 *
 * Core type definitions for the Saga pattern implementation.
 */

/**
 * Saga step execution result
 */
export type SagaStepResult<TResult> = TResult;

/**
 * Saga context base interface
 * All saga contexts must extend this
 */
export interface SagaContext {
  /** Unique correlation ID for tracing */
  correlationId: string;
  /** Optional idempotency key for safe retries */
  idempotencyKey?: string;
  /** User who initiated the saga (flexible format - accepts string or number id) */
  user?: {
    id: string | number;
    username: string;
    role: string;
    email?: string;
    name?: string;
  };
  /** Timestamp when saga started */
  startedAt: Date;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Saga step interface
 * Each step in a saga must implement this interface
 */
export interface SagaStep<TContext extends SagaContext, TResult> {
  /** Step name for logging and identification */
  name: string;
  /** Whether this step can be compensated */
  isCompensatable: boolean;
  /** Optional timeout in milliseconds */
  timeout?: number;
  /** Execute the step */
  execute(context: TContext): Promise<TResult>;
  /** Optional compensation function (called in reverse order) */
  compensate?(context: TContext, result: TResult): Promise<void>;
}

/**
 * Saga interface
 * Defines a complete saga with its steps
 */
export interface Saga<TContext extends SagaContext, TFinalResult> {
  /** Saga name for logging and identification */
  name: string;
  /** Saga version for migration support */
  version?: string;
  /** Steps to execute in order */
  steps: SagaStep<TContext, any>[];
  /** Optional context validation */
  validateContext?(context: TContext): ValidationResult;
  /** Optional context migration for version changes */
  migrateContext?(oldContext: any, fromVersion: string): TContext;
}

/**
 * Validation result for context validation
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Saga state for persistence and recovery
 */
export interface SagaState {
  /** Unique saga execution ID */
  id: string;
  /** Saga type/name */
  sagaType: string;
  /** Saga version */
  sagaVersion?: string;
  /** Serialized context (JSON) */
  context: string;
  /** Current status */
  status: SagaStatus;
  /** Current step index (0-based) */
  currentStep: number;
  /** Step results (serialized) */
  stepResults: string[];
  /** When saga started */
  startedAt: Date;
  /** When saga completed (if completed) */
  completedAt?: Date;
  /** Error message (if failed) */
  error?: string;
  /** Compensation status */
  compensationStatus?: CompensationStatus;
  /** When compensation completed (if compensated) */
  compensationCompletedAt?: Date;
  /** Compensation error (if compensation failed) */
  compensationError?: string;
  /** Idempotency key for safe retries */
  idempotencyKey?: string;
  /** Correlation ID for tracing */
  correlationId: string;
}

/**
 * Saga execution status
 */
export type SagaStatus =
  | 'pending'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'compensating'
  | 'compensated';

/**
 * Compensation status
 */
export type CompensationStatus =
  | 'pending'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'partial';

/**
 * Compensation result
 */
export interface CompensationResult {
  /** Whether compensation was successful */
  success: boolean;
  /** Steps that failed to compensate */
  failedSteps: string[];
  /** Whether manual intervention is required */
  requiresManualIntervention: boolean;
  /** Error message if compensation failed */
  error?: string;
}

/**
 * Saga execution result
 */
export interface SagaExecutionResult<TResult> {
  /** Final result */
  result: TResult;
  /** Saga execution ID */
  sagaId: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Whether compensation was required */
  compensated: boolean;
  /** Compensation result if compensation occurred */
  compensationResult?: CompensationResult;
}

/**
 * Saga metrics for observability
 */
export interface SagaMetrics {
  /** Saga type */
  sagaType: string;
  /** Total execution count */
  executionCount: number;
  /** Successful execution count */
  successCount: number;
  /** Failed execution count */
  failureCount: number;
  /** Average execution duration in milliseconds */
  averageDuration: number;
  /** P50 execution duration */
  p50Duration: number;
  /** P95 execution duration */
  p95Duration: number;
  /** P99 execution duration */
  p99Duration: number;
  /** Compensation count */
  compensationCount: number;
  /** Compensation failure count */
  compensationFailureCount: number;
}

/**
 * Resource lock for concurrency control
 */
export interface ResourceLock {
  /** Lock key (resource identifier) */
  key: string;
  /** Lock holder (saga ID) */
  holder: string;
  /** When lock was acquired */
  acquiredAt: Date;
  /** Lock timeout in milliseconds */
  timeout: number;
  /** When lock expires */
  expiresAt: Date;
}
