/**
 * WorkflowEngine - Process Automation
 *
 * Handles civic process workflows and automation.
 * Manages approval processes, lifecycle transitions, and business rules.
 */
import { IndexingService } from '../indexing/indexing-service.js';
import {
  coreInfo,
  coreWarn,
  coreError,
} from '../utils/core-output.js';

/**
 * Workflow payload type — polymorphic by design (each workflow takes a
 * different data shape). `unknown` forces consumers to narrow before
 * accessing fields.
 */
export type WorkflowData = unknown;

/**
 * Workflow callable signature: each workflow receives the start data
 * plus its assigned workflow ID.
 */
export type WorkflowFn = (
  data: WorkflowData,
  workflowId: string
) => Promise<void>;

export interface ActiveWorkflow {
  name: string;
  data: WorkflowData;
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  /** Workflow-specific metadata recorded on completion. */
  metadata?: Record<string, unknown>;
}

export class WorkflowEngine {
  private workflows: Map<string, WorkflowFn>;
  private activeWorkflows: Map<string, ActiveWorkflow>;
  private indexingService?: IndexingService;

  constructor() {
    this.workflows = new Map();
    this.activeWorkflows = new Map();
  }

  /** Cap on retained active-workflow entries (see pruneActiveWorkflows). */
  private static readonly MAX_ACTIVE_WORKFLOWS = 100;

  /**
   * Initialize the workflow engine
   */
  initialize(): void {
    // Register default workflows. `update-index` is the only real built-in — it
    // re-runs indexing when a record changes (driven by the record:updated hook).
    //
    // core-002: the former `approval` / `publication` / `archival` entries were
    // TODO log-only stubs registered as if functional. They were removed rather
    // than left advertised — nothing triggered them (no hook config references
    // them), and the engine has no auth/notification/record services to
    // implement them against. Programmable civic workflows are specified as
    // sandboxed user `.js` files in `data/.civic/workflows/` (see
    // docs/specs/workflows.md), not hardcoded engine methods, so these stubs
    // were not the real implementation path.
    this.registerWorkflow('update-index', this.updateIndexWorkflow.bind(this));
  }

  /**
   * Set the indexing service for auto-indexing workflows
   */
  setIndexingService(indexingService: IndexingService): void {
    this.indexingService = indexingService;
  }

  /**
   * Register a workflow
   */
  registerWorkflow(name: string, workflow: WorkflowFn): void {
    this.workflows.set(name, workflow);
  }

  /**
   * Whether a workflow name is registered. Callers (e.g. HookSystem) use this to
   * skip config-referenced-but-unregistered names quietly instead of letting
   * startWorkflow throw "not found" on every hook.
   */
  hasWorkflow(name: string): boolean {
    return this.workflows.has(name);
  }

  /**
   * Start a workflow
   */
  async startWorkflow(name: string, data: WorkflowData): Promise<string> {
    const workflow = this.workflows.get(name);
    if (!workflow) {
      throw new Error(`Workflow '${name}' not found`);
    }

    // Now that hooks drive workflows at record-op volume, bound the retained
    // history so completed/failed entries can't accumulate for the process
    // lifetime. Running entries are always kept.
    this.pruneActiveWorkflows();

    const workflowId = this.generateWorkflowId();
    this.activeWorkflows.set(workflowId, {
      name,
      data,
      status: 'running',
      startTime: new Date(),
    });

    try {
      await workflow(data, workflowId);
      this.activeWorkflows.get(workflowId)!.status = 'completed';
    } catch (error) {
      this.activeWorkflows.get(workflowId)!.status = 'failed';
      throw error;
    }

    return workflowId;
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId: string): ActiveWorkflow | undefined {
    return this.activeWorkflows.get(workflowId);
  }

  /**
   * Get all active workflows
   */
  getActiveWorkflows(): Map<string, ActiveWorkflow> {
    return this.activeWorkflows;
  }

  /**
   * Generate a unique workflow ID
   */
  private generateWorkflowId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Evict oldest terminal (completed/failed) entries once the retained history
   * exceeds MAX_ACTIVE_WORKFLOWS. Map preserves insertion order, so iterating
   * removes oldest-first; still-running entries are never evicted.
   */
  private pruneActiveWorkflows(): void {
    if (this.activeWorkflows.size <= WorkflowEngine.MAX_ACTIVE_WORKFLOWS) {
      return;
    }
    for (const [id, wf] of this.activeWorkflows) {
      if (this.activeWorkflows.size <= WorkflowEngine.MAX_ACTIVE_WORKFLOWS) {
        break;
      }
      if (wf.status !== 'running') {
        this.activeWorkflows.delete(id);
      }
    }
  }

  /**
   * Auto-indexing workflow - triggered when records are updated
   */
  private async updateIndexWorkflow(
    data: WorkflowData,
    workflowId: string
  ): Promise<void> {
    if (!this.indexingService) {
      coreWarn('IndexingService not available for auto-indexing workflow', {
        operation: 'workflow:update-index',
        workflowId,
      });
      return;
    }

    try {
      // Narrow the polymorphic `data` payload to extract the record
      // metadata this workflow needs (title/module/type). The shape
      // is set by record-manager when it emits the update event.
      const record =
        data &&
        typeof data === 'object' &&
        'record' in data &&
        typeof (data as { record?: unknown }).record === 'object' &&
        (data as { record?: unknown }).record !== null
          ? ((data as { record: Record<string, unknown> }).record)
          : null;

      coreInfo('Auto-indexing workflow started', {
        operation: 'workflow:update-index',
        workflowId,
        record: record?.title,
      });

      // Determine indexing scope based on the updated record
      const indexingOptions: Record<string, unknown> = {};

      if (typeof record?.module === 'string') {
        indexingOptions.modules = [record.module];
      }

      if (typeof record?.type === 'string') {
        indexingOptions.types = [record.type];
      }

      // Generate indexes with the determined scope
      const index = await this.indexingService.generateIndexes(indexingOptions);

      coreInfo(
        `Auto-indexing completed: ${index.metadata.totalRecords} records indexed`,
        {
          operation: 'workflow:update-index',
          workflowId,
          totalRecords: index.metadata.totalRecords,
        }
      );

      // Log the workflow completion
      this.activeWorkflows.get(workflowId)!.metadata = {
        indexedRecords: index.metadata.totalRecords,
        modules: index.metadata.modules,
        types: index.metadata.types,
        generated: index.metadata.generated,
      };
    } catch (error) {
      coreError(
        'Auto-indexing workflow failed',
        'INDEXING_WORKFLOW_FAILED',
        {
          error: error instanceof Error ? error.message : String(error),
          workflowId,
        },
        { operation: 'workflow:update-index' }
      );
      throw error;
    }
  }
}
