/**
 * WorkflowEngine - Process Automation
 *
 * Handles civic process workflows and automation.
 * Manages approval processes, lifecycle transitions, and business rules.
 */
import { IndexingService } from '../indexing/indexing-service.js';

/* global console */

export class WorkflowEngine {
  private workflows: Map<string, any>;
  private activeWorkflows: Map<string, any>;
  private indexingService?: IndexingService;

  constructor() {
    this.workflows = new Map();
    this.activeWorkflows = new Map();
  }

  /**
   * Initialize the workflow engine
   */
  initialize(): void {
    // Register default workflows
    this.registerWorkflow('approval', this.approvalWorkflow.bind(this));
    this.registerWorkflow('publication', this.publicationWorkflow.bind(this));
    this.registerWorkflow('archival', this.archivalWorkflow.bind(this));
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
  registerWorkflow(name: string, workflow: any): void {
    this.workflows.set(name, workflow);
  }

  /**
   * Start a workflow
   */
  async startWorkflow(name: string, data: any): Promise<string> {
    const workflow = this.workflows.get(name);
    if (!workflow) {
      throw new Error(`Workflow '${name}' not found`);
    }

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
  getWorkflowStatus(workflowId: string): any {
    return this.activeWorkflows.get(workflowId);
  }

  /**
   * Get all active workflows
   */
  getActiveWorkflows(): Map<string, any> {
    return this.activeWorkflows;
  }

  /**
   * Generate a unique workflow ID
   */
  private generateWorkflowId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Default workflows
  private async approvalWorkflow(data: any, workflowId: string): Promise<void> {
    // TODO: Implement approval workflow
    // - Check permissions
    // - Send notifications
    // - Update record status
    console.log('Approval workflow started:', { workflowId, data });
  }

  private async publicationWorkflow(
    data: any,
    workflowId: string
  ): Promise<void> {
    // TODO: Implement publication workflow
    // - Validate record
    // - Update status to published
    // - Notify stakeholders
    console.log('Publication workflow started:', { workflowId, data });
  }

  private async archivalWorkflow(data: any, workflowId: string): Promise<void> {
    // TODO: Implement archival workflow
    // - Archive record
    // - Update metadata
    // - Notify stakeholders
    console.log('Archival workflow started:', { workflowId, data });
  }

  /**
   * Auto-indexing workflow - triggered when records are updated
   */
  private async updateIndexWorkflow(
    data: any,
    workflowId: string
  ): Promise<void> {
    if (!this.indexingService) {
      console.warn('IndexingService not available for auto-indexing workflow');
      return;
    }

    try {
      console.log('🔄 Auto-indexing workflow started:', {
        workflowId,
        record: data?.record?.title,
      });

      // Determine indexing scope based on the updated record
      const indexingOptions: any = {};

      if (data?.record?.module) {
        indexingOptions.modules = [data.record.module];
      }

      if (data?.record?.type) {
        indexingOptions.types = [data.record.type];
      }

      // Generate indexes with the determined scope
      const index = await this.indexingService.generateIndexes(indexingOptions);

      console.log(
        `✅ Auto-indexing completed: ${index.metadata.totalRecords} records indexed`
      );

      // Log the workflow completion
      this.activeWorkflows.get(workflowId)!.metadata = {
        indexedRecords: index.metadata.totalRecords,
        modules: index.metadata.modules,
        types: index.metadata.types,
        generated: index.metadata.generated,
      };
    } catch (error) {
      console.error('❌ Auto-indexing workflow failed:', error);
      throw error;
    }
  }
}
