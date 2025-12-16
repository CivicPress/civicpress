import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useRecordsStore } from '~/stores/records';

describe('Records Store - Pagination', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('Initial State', () => {
    it('should initialize with correct default pagination values', () => {
      const store = useRecordsStore();

      expect(store.currentPage).toBe(1);
      expect(store.pageSize).toBe(50);
      expect(store.totalPages).toBe(0);
      expect(store.totalCount).toBe(0);
      expect(store.records).toEqual([]);
    });

    it('should have hasMoreRecords computed property', () => {
      const store = useRecordsStore();

      // Initially no more records (totalPages is 0)
      expect(store.hasMoreRecords).toBe(false);

      // Set up a scenario where there are more pages
      store.totalPages = 5;
      store.currentPage = 1;
      expect(store.hasMoreRecords).toBe(true);

      // Last page should return false
      store.currentPage = 5;
      expect(store.hasMoreRecords).toBe(false);
    });
  });

  describe('setPageSize', () => {
    it('should update pageSize state', () => {
      const store = useRecordsStore();

      store.setPageSize(25);
      expect(store.pageSize).toBe(25);

      store.setPageSize(100);
      expect(store.pageSize).toBe(100);
    });
  });

  describe('getPageSize', () => {
    it('should return current page size', () => {
      const store = useRecordsStore();

      expect(store.getPageSize()).toBe(50); // default

      store.setPageSize(25);
      expect(store.getPageSize()).toBe(25);
    });
  });

  describe('replaceRecords', () => {
    it('should replace all existing records', () => {
      const store = useRecordsStore();

      store.replaceRecords([
        { id: '1', title: 'Record 1' } as any,
        { id: '2', title: 'Record 2' } as any,
      ]);

      expect(store.records.length).toBe(2);

      store.replaceRecords([{ id: '3', title: 'Record 3' } as any]);

      expect(store.records.length).toBe(1);
      expect(store.records[0].id).toBe('3');
    });

    it('should handle empty array', () => {
      const store = useRecordsStore();

      store.replaceRecords([{ id: '1', title: 'Record 1' } as any]);

      store.replaceRecords([]);
      expect(store.records).toEqual([]);
    });
  });

  describe('Pagination State Updates', () => {
    it('should update currentPage state', () => {
      const store = useRecordsStore();

      store.currentPage = 2;
      expect(store.currentPage).toBe(2);
    });

    it('should update totalPages state', () => {
      const store = useRecordsStore();

      store.totalPages = 10;
      expect(store.totalPages).toBe(10);
    });

    it('should update totalCount state', () => {
      const store = useRecordsStore();

      store.totalCount = 100;
      expect(store.totalCount).toBe(100);
    });
  });
});
