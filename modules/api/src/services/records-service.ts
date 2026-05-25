/**
 * RecordsService — API record-management facade.
 *
 * Phase 2d W2-T8 decomposed the prior 1,760-LoC monolith into 6
 * collaborators under `records-service/`:
 *
 *   - helpers           — pure helpers (date normalization, kind priority,
 *                          filter-clause builder)
 *   - crud              — create/get/getRaw/update/delete
 *   - listing           — list/search/summary/changeStatus/getAllowedTransitions
 *   - drafts            — createDraft/updateDraft/listDrafts/listUnpublished
 *                          Records/deleteDraft
 *   - frontmatter-and-publish — getFrontmatterYaml/getDraftOrRecord/publishDraft
 *   - locks             — acquireLock/releaseLock/getLock/refreshLock
 *
 * This file is the orchestrator: holds the CivicPress + RecordManager
 * + WorkflowConfigManager + DatabaseService + Logger handles, instantiates
 * the collaborators, and delegates each public method. Public API is
 * preserved exactly so route handlers (modules/api/src/routes/*) don't
 * need to change.
 */

import {
  CivicPress,
  WorkflowConfigManager,
  RecordManager,
  DatabaseService,
  Logger,
} from '@civicpress/core';
import { RecordsCrud } from './records-service/crud.js';
import { RecordsListing } from './records-service/listing.js';
import { RecordsDrafts } from './records-service/drafts.js';
import { RecordsFrontmatterAndPublish } from './records-service/frontmatter-and-publish.js';
import { RecordsLocks } from './records-service/locks.js';

export class RecordsService {
  private civicPress: CivicPress;
  private recordManager: RecordManager;
  private logger: Logger;
  private workflowManager: WorkflowConfigManager;
  private dataDir: string | null = null;
  private db: DatabaseService;

  private crud: RecordsCrud;
  private listing: RecordsListing;
  private drafts: RecordsDrafts;
  private frontmatterAndPublish: RecordsFrontmatterAndPublish;
  private locks: RecordsLocks;

  constructor(
    civicPress: CivicPress,
    recordManager?: RecordManager,
    workflowManager?: WorkflowConfigManager,
    db?: DatabaseService
  ) {
    this.civicPress = civicPress;
    const dataDir = civicPress.getDataDir() || './data';
    this.dataDir = dataDir;

    this.workflowManager =
      workflowManager || new WorkflowConfigManager(dataDir);
    this.recordManager = recordManager || civicPress.getRecordManager();
    this.db = db || civicPress.getDatabaseService();
    this.logger = new Logger();

    // Wire collaborators
    this.crud = new RecordsCrud({
      civicPress: this.civicPress,
      recordManager: this.recordManager,
      logger: this.logger,
      dataDir: this.dataDir,
    });
    this.listing = new RecordsListing({
      civicPress: this.civicPress,
      recordManager: this.recordManager,
      workflowManager: this.workflowManager,
      db: this.db,
      logger: this.logger,
    });
    this.drafts = new RecordsDrafts({
      civicPress: this.civicPress,
      recordManager: this.recordManager,
      db: this.db,
      logger: this.logger,
    });
    this.frontmatterAndPublish = new RecordsFrontmatterAndPublish({
      civicPress: this.civicPress,
      recordManager: this.recordManager,
      db: this.db,
      logger: this.logger,
      // getDraftOrRecord falls back to the published-record path; wire it
      // to the CRUD collaborator's getRecord so we don't duplicate it.
      getRecord: (id: string) => this.crud.getRecord(id),
    });
    this.locks = new RecordsLocks({ db: this.db });
  }

  /**
   * Get the CivicPress instance
   */
  getCivicPress(): CivicPress {
    return this.civicPress;
  }

  // ----- CRUD delegations -----

  async createRecord(
    ...args: Parameters<RecordsCrud['createRecord']>
  ): ReturnType<RecordsCrud['createRecord']> {
    return this.crud.createRecord(...args);
  }
  async getRecord(
    ...args: Parameters<RecordsCrud['getRecord']>
  ): ReturnType<RecordsCrud['getRecord']> {
    return this.crud.getRecord(...args);
  }
  async getRawRecord(
    ...args: Parameters<RecordsCrud['getRawRecord']>
  ): ReturnType<RecordsCrud['getRawRecord']> {
    return this.crud.getRawRecord(...args);
  }
  async updateRecord(
    ...args: Parameters<RecordsCrud['updateRecord']>
  ): ReturnType<RecordsCrud['updateRecord']> {
    return this.crud.updateRecord(...args);
  }
  async deleteRecord(
    ...args: Parameters<RecordsCrud['deleteRecord']>
  ): ReturnType<RecordsCrud['deleteRecord']> {
    return this.crud.deleteRecord(...args);
  }

  // ----- Listing / search / status delegations -----

  async listRecords(
    ...args: Parameters<RecordsListing['listRecords']>
  ): ReturnType<RecordsListing['listRecords']> {
    return this.listing.listRecords(...args);
  }
  async searchRecords(
    ...args: Parameters<RecordsListing['searchRecords']>
  ): ReturnType<RecordsListing['searchRecords']> {
    return this.listing.searchRecords(...args);
  }
  async getRecordSummary(
    ...args: Parameters<RecordsListing['getRecordSummary']>
  ): ReturnType<RecordsListing['getRecordSummary']> {
    return this.listing.getRecordSummary(...args);
  }
  async changeRecordStatus(
    ...args: Parameters<RecordsListing['changeRecordStatus']>
  ): ReturnType<RecordsListing['changeRecordStatus']> {
    return this.listing.changeRecordStatus(...args);
  }
  async getAllowedTransitions(
    ...args: Parameters<RecordsListing['getAllowedTransitions']>
  ): ReturnType<RecordsListing['getAllowedTransitions']> {
    return this.listing.getAllowedTransitions(...args);
  }

  // ----- Drafts delegations -----

  async createDraft(
    ...args: Parameters<RecordsDrafts['createDraft']>
  ): ReturnType<RecordsDrafts['createDraft']> {
    return this.drafts.createDraft(...args);
  }
  async updateDraft(
    ...args: Parameters<RecordsDrafts['updateDraft']>
  ): ReturnType<RecordsDrafts['updateDraft']> {
    return this.drafts.updateDraft(...args);
  }
  async listDrafts(
    ...args: Parameters<RecordsDrafts['listDrafts']>
  ): ReturnType<RecordsDrafts['listDrafts']> {
    return this.drafts.listDrafts(...args);
  }
  async listUnpublishedRecords(
    ...args: Parameters<RecordsDrafts['listUnpublishedRecords']>
  ): ReturnType<RecordsDrafts['listUnpublishedRecords']> {
    return this.drafts.listUnpublishedRecords(...args);
  }
  async deleteDraft(
    ...args: Parameters<RecordsDrafts['deleteDraft']>
  ): ReturnType<RecordsDrafts['deleteDraft']> {
    return this.drafts.deleteDraft(...args);
  }

  // ----- Frontmatter + publish delegations -----

  async getFrontmatterYaml(
    ...args: Parameters<RecordsFrontmatterAndPublish['getFrontmatterYaml']>
  ): ReturnType<RecordsFrontmatterAndPublish['getFrontmatterYaml']> {
    return this.frontmatterAndPublish.getFrontmatterYaml(...args);
  }
  async getDraftOrRecord(
    ...args: Parameters<RecordsFrontmatterAndPublish['getDraftOrRecord']>
  ): ReturnType<RecordsFrontmatterAndPublish['getDraftOrRecord']> {
    return this.frontmatterAndPublish.getDraftOrRecord(...args);
  }
  async publishDraft(
    ...args: Parameters<RecordsFrontmatterAndPublish['publishDraft']>
  ): ReturnType<RecordsFrontmatterAndPublish['publishDraft']> {
    return this.frontmatterAndPublish.publishDraft(...args);
  }

  // ----- Lock delegations -----

  async acquireLock(
    ...args: Parameters<RecordsLocks['acquireLock']>
  ): ReturnType<RecordsLocks['acquireLock']> {
    return this.locks.acquireLock(...args);
  }
  async releaseLock(
    ...args: Parameters<RecordsLocks['releaseLock']>
  ): ReturnType<RecordsLocks['releaseLock']> {
    return this.locks.releaseLock(...args);
  }
  async getLock(
    ...args: Parameters<RecordsLocks['getLock']>
  ): ReturnType<RecordsLocks['getLock']> {
    return this.locks.getLock(...args);
  }
  async refreshLock(
    ...args: Parameters<RecordsLocks['refreshLock']>
  ): ReturnType<RecordsLocks['refreshLock']> {
    return this.locks.refreshLock(...args);
  }
}
