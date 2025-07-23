import { defineStore } from 'pinia';

export interface CivicRecord {
  id: string;
  title: string;
  type: 'bylaw' | 'ordinance' | 'policy' | 'proclamation' | 'resolution';
  content: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  path: string;
  author: string;
  created_at: string;
  updated_at: string;
  metadata: {
    author: string;
    created: string;
    updated: string;
    tags: string[];
    module: string;
    source: string;
    file_path: string;
    updated_by: string;
  };
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
            record.metadata?.tags?.some((tag: string) =>
              tag.toLowerCase().includes(search)
            ) ||
            false
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

        const response = await useNuxtApp().$civicApi('/api/records');

        console.log('response >>>>>', response);

        // Safely extract data from response
        if (
          typeof response === 'object' &&
          response !== null &&
          'success' in response &&
          (response as any).success &&
          'data' in response &&
          (response as any).data
        ) {
          const data = (response as any).data;
          this.records = data.records || [];
          this.pagination = {
            page: data.page || 1,
            limit: data.limit || 20,
            total: data.total || 0,
          };
        } else {
          this.records = [];
          this.pagination = { page: 1, limit: 20, total: 0 };
        }
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
        const response = await useNuxtApp().$civicApi(`/records/${id}`);

        console.log('response >>>>>', response.data);
        // Safely extract record from response
        let record: CivicRecord;
        if (
          typeof response === 'object' &&
          response !== null &&
          'data' in response &&
          (response as any).data
        ) {
          record = (response as any).data as CivicRecord;
        } else {
          throw new Error('Invalid response format');
        }

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
        const response = await useNuxtApp().$civicApi('/records', {
          method: 'POST',
          body: recordData,
        });

        // Safely extract record from response
        let newRecord: CivicRecord;
        if (
          typeof response === 'object' &&
          response !== null &&
          'data' in response &&
          (response as any).data
        ) {
          newRecord = (response as any).data as CivicRecord;
        } else {
          throw new Error('Invalid response format');
        }

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
        const response = await useNuxtApp().$civicApi(`/records/${id}`, {
          method: 'PUT',
          body: updates,
        });

        // Safely extract record from response
        let updatedRecord: CivicRecord;
        if (
          typeof response === 'object' &&
          response !== null &&
          'data' in response &&
          (response as any).data
        ) {
          updatedRecord = (response as any).data as CivicRecord;
        } else {
          throw new Error('Invalid response format');
        }

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
        await useNuxtApp().$civicApi(`/records/${id}`, {
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
