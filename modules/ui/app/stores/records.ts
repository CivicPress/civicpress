import { defineStore } from 'pinia';

export interface CivicRecord {
  id: string;
  title: string;
  type: 'bylaw' | 'ordinance' | 'policy' | 'proclamation' | 'resolution';
  content: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  author: string;
  tags: string[];
  metadata?: Record<string, any>;
}

export interface RecordsState {
  records: CivicRecord[];
  loading: boolean;
  error: string | null;
  filters: {
    type?: string;
    status?: string;
    search?: string;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export const useRecordsStore = defineStore('records', {
  state: (): RecordsState => ({
    records: [],
    loading: false,
    error: null,
    filters: {},
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
    },
  }),

  getters: {
    filteredRecords: (state) => {
      let filtered = state.records;

      if (state.filters.type) {
        filtered = filtered.filter(
          (record) => record.type === state.filters.type
        );
      }

      if (state.filters.status) {
        filtered = filtered.filter(
          (record) => record.status === state.filters.status
        );
      }

      if (state.filters.search) {
        const search = state.filters.search.toLowerCase();
        filtered = filtered.filter(
          (record) =>
            record.title.toLowerCase().includes(search) ||
            record.content.toLowerCase().includes(search) ||
            record.tags.some((tag) => tag.toLowerCase().includes(search))
        );
      }

      return filtered;
    },

    recordsByType: (state) => {
      return state.records.reduce(
        (acc, record) => {
          if (!acc[record.type]) {
            acc[record.type] = [];
          }
          acc[record.type].push(record);
          return acc;
        },
        {} as Record<string, CivicRecord[]>
      );
    },

    isLoading: (state) => state.loading,
    recordsError: (state) => state.error,
    currentFilters: (state) => state.filters,
    currentPagination: (state) => state.pagination,
  },

  actions: {
    async fetchRecords(params?: {
      page?: number;
      limit?: number;
      type?: string;
      status?: string;
      search?: string;
    }) {
      this.loading = true;
      this.error = null;

      try {
        const queryParams = new URLSearchParams();

        if (params?.page) queryParams.append('page', params.page.toString());
        if (params?.limit) queryParams.append('limit', params.limit.toString());
        if (params?.type) queryParams.append('type', params.type);
        if (params?.status) queryParams.append('status', params.status);
        if (params?.search) queryParams.append('search', params.search);

        const response = await $fetch(`/api/records?${queryParams.toString()}`);

        this.records = response.records;
        this.pagination = response.pagination;
        this.filters = {
          type: params?.type,
          status: params?.status,
          search: params?.search,
        };

        return response;
      } catch (error: any) {
        this.error = error.message || 'Failed to fetch records';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchRecord(id: string) {
      this.loading = true;
      this.error = null;

      try {
        const record = await $fetch(`/api/records/${id}`);

        // Update or add the record to the store
        const index = this.records.findIndex((r) => r.id === id);
        if (index > -1) {
          this.records[index] = record;
        } else {
          this.records.push(record);
        }

        return record;
      } catch (error: any) {
        this.error = error.message || 'Failed to fetch record';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createRecord(
      recordData: Omit<CivicRecord, 'id' | 'createdAt' | 'updatedAt'>
    ) {
      this.loading = true;
      this.error = null;

      try {
        const newRecord = await $fetch('/api/records', {
          method: 'POST',
          body: recordData,
        });

        this.records.unshift(newRecord);
        return newRecord;
      } catch (error: any) {
        this.error = error.message || 'Failed to create record';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async updateRecord(id: string, updates: Partial<CivicRecord>) {
      this.loading = true;
      this.error = null;

      try {
        const updatedRecord = await $fetch(`/api/records/${id}`, {
          method: 'PUT',
          body: updates,
        });

        const index = this.records.findIndex((r) => r.id === id);
        if (index > -1) {
          this.records[index] = updatedRecord;
        }

        return updatedRecord;
      } catch (error: any) {
        this.error = error.message || 'Failed to update record';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async deleteRecord(id: string) {
      this.loading = true;
      this.error = null;

      try {
        await $fetch(`/api/records/${id}`, {
          method: 'DELETE',
        });

        const index = this.records.findIndex((r) => r.id === id);
        if (index > -1) {
          this.records.splice(index, 1);
        }
      } catch (error: any) {
        this.error = error.message || 'Failed to delete record';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    setFilters(filters: Partial<RecordsState['filters']>) {
      this.filters = { ...this.filters, ...filters };
    },

    clearFilters() {
      this.filters = {};
    },

    setError(error: string) {
      this.error = error;
    },

    clearError() {
      this.error = null;
    },
  },
});
