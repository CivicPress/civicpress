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
  // Track the current fetch strategy
  lastFetchStrategy: 'all' | 'filtered' | 'search' | null;
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
    lastFetchStrategy: null,
  }),

  getters: {
    /**
     * Get filtered records based on current filters
     * This is the main getter that returns the correct subset
     */
    filteredRecords: (state) => {
      let filtered = state.records;

      // Apply type filter (handle comma-separated values)
      if (state.filters.type) {
        const typeFilters = state.filters.type.split(',').map((t) => t.trim());
        filtered = filtered.filter((record) =>
          typeFilters.includes(record.type)
        );
      }

      // Apply status filter (handle comma-separated values)
      if (state.filters.status) {
        const statusFilters = state.filters.status
          .split(',')
          .map((s) => s.trim());
        filtered = filtered.filter((record) =>
          statusFilters.includes(record.status)
        );
      }

      // Apply search filter (client-side search)
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

      // Apply pagination
      const startIndex = (state.pagination.page - 1) * state.pagination.limit;
      const endIndex = startIndex + state.pagination.limit;
      const paginated = filtered.slice(startIndex, endIndex);

      return paginated;
    },

    /**
     * Get records grouped by type
     */
    recordsByType: (state) => {
      return state.records.reduce(
        (acc, record) => {
          if (!acc[record.type]) {
            acc[record.type] = [];
          }
          acc[record.type]!.push(record);
          return acc;
        },
        {} as Record<string, CivicRecord[]>
      );
    },

    /**
     * Get records grouped by status
     */
    recordsByStatus: (state) => {
      return state.records.reduce(
        (acc, record) => {
          if (!acc[record.status]) {
            acc[record.status] = [];
          }
          acc[record.status]!.push(record);
          return acc;
        },
        {} as Record<string, CivicRecord[]>
      );
    },

    isLoading: (state) => state.loading,
    recordsError: (state) => state.error,
    currentFilters: (state) => state.filters,
    currentPagination: (state) => state.pagination,
    totalRecords: (state) => state.records.length,
    totalFilteredRecords: (state) => {
      // Use the filteredRecords getter to get the count
      const store = useRecordsStore();
      const allFiltered = store.getFilteredRecordsWithoutPagination();
      return allFiltered.length;
    },

    /**
     * Get filtered records without pagination (for counting total)
     */
    getFilteredRecordsWithoutPagination: (state) => () => {
      let filtered = state.records;

      // Apply type filter (handle comma-separated values)
      if (state.filters.type) {
        const typeFilters = state.filters.type.split(',').map((t) => t.trim());
        filtered = filtered.filter((record) =>
          typeFilters.includes(record.type)
        );
      }

      // Apply status filter (handle comma-separated values)
      if (state.filters.status) {
        const statusFilters = state.filters.status
          .split(',')
          .map((s) => s.trim());
        filtered = filtered.filter((record) =>
          statusFilters.includes(record.status)
        );
      }

      // Apply search filter (client-side search)
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
  },

  actions: {
    /**
     * Add or update records in the store
     * This is the main method for accumulating records
     */
    addOrUpdateRecords(newRecords: CivicRecord[]) {
      newRecords.forEach((newRecord) => {
        const existingIndex = this.records.findIndex(
          (record) => record.id === newRecord.id
        );

        if (existingIndex >= 0) {
          // Update existing record
          this.records[existingIndex] = newRecord;
        } else {
          // Add new record
          this.records.push(newRecord);
        }
      });
    },

    /**
     * Replace all records (for pagination)
     */
    replaceRecords(newRecords: CivicRecord[]) {
      this.records = [...newRecords];
    },

    /**
     * Fetch all records (no filters)
     * Use this for initial load or when clearing filters
     */
    async fetchAllRecords(params?: { offset?: number; limit?: number }) {
      this.loading = true;
      this.error = null;

      try {
        const queryParams = new URLSearchParams();

        if (params?.offset !== undefined)
          queryParams.append('offset', params.offset.toString());
        if (params?.limit) queryParams.append('limit', params.limit.toString());

        const url = `/api/records${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
        console.log('Fetching records from:', url);
        const response = await useNuxtApp().$civicApi(url);

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
          const newRecords = data.records || [];

          // Always add or update records to accumulate them in the store
          this.addOrUpdateRecords(newRecords);

          this.pagination = {
            page: data.page || 1,
            limit: data.limit || 20,
            total: data.total || 0,
          };
        } else {
          console.log('Response structure not as expected:', response);
        }

        this.filters = {};
        this.lastFetchStrategy = 'all';

        return response;
      } catch (error: any) {
        console.error('Error in fetchAllRecords:', error);
        this.error = error.message || 'Failed to fetch records';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Fetch records with server-side filtering
     * Use this when type or status filters are applied
     */
    async fetchFilteredRecords(params: {
      type?: string;
      status?: string;
      offset?: number;
      limit?: number;
    }) {
      this.loading = true;
      this.error = null;

      try {
        const queryParams = new URLSearchParams();

        if (params.type) queryParams.append('type', params.type);
        if (params.status) queryParams.append('status', params.status);
        if (params.offset !== undefined)
          queryParams.append('offset', params.offset.toString());
        if (params.limit) queryParams.append('limit', params.limit.toString());

        const url = `/api/records?${queryParams.toString()}`;
        const response = await useNuxtApp().$civicApi(url);

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
          const newRecords = data.records || [];

          // Always add or update records to accumulate them in the store
          this.addOrUpdateRecords(newRecords);

          this.pagination = {
            page: data.page || 1,
            limit: data.limit || 20,
            total: data.total || 0,
          };
        }

        this.filters = {
          type: params.type,
          status: params.status,
        };
        this.lastFetchStrategy = 'filtered';

        return response;
      } catch (error: any) {
        this.error = error.message || 'Failed to fetch filtered records';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Search records using the search API
     * Use this when user enters a search query
     */
    async searchRecords(
      query: string,
      params?: {
        type?: string;
        status?: string;
        limit?: number;
        offset?: number;
      }
    ) {
      this.loading = true;
      this.error = null;

      try {
        const queryParams = new URLSearchParams();
        queryParams.append('q', query);

        if (params?.type) queryParams.append('type', params.type);
        if (params?.status) queryParams.append('status', params.status);
        if (params?.limit) queryParams.append('limit', params.limit.toString());
        if (params?.offset)
          queryParams.append('offset', params.offset.toString());

        const url = `/api/search?${queryParams.toString()}`;
        const response = await useNuxtApp().$civicApi(url);

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
          const newRecords = data.results || [];

          // Always add or update records to accumulate them in the store
          this.addOrUpdateRecords(newRecords);

          this.pagination = {
            page: data.page || 1,
            limit: data.limit || 20,
            total: data.total || 0,
          };
        }

        this.filters = {
          type: params?.type,
          status: params?.status,
          search: query,
        };
        this.lastFetchStrategy = 'search';

        return response;
      } catch (error: any) {
        this.error = error.message || 'Failed to search records';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Smart fetch method that chooses the best strategy based on filters
     */
    async fetchRecords(params?: {
      type?: string;
      status?: string;
      search?: string;
      offset?: number;
      limit?: number;
    }) {
      // If there's a search query, use search API
      if (params?.search && params.search.trim()) {
        return await this.searchRecords(params.search, {
          type: params.type,
          status: params.status,
          limit: params.limit,
          offset: params.offset,
        });
      }

      // If there are type or status filters, use filtered fetch
      if (params?.type || params?.status) {
        return await this.fetchFilteredRecords({
          type: params.type,
          status: params.status,
          offset: params.offset,
          limit: params.limit,
        });
      }

      // Otherwise, fetch all records
      return await this.fetchAllRecords({
        offset: params?.offset,
        limit: params?.limit,
      });
    },

    async fetchRecord(id: string) {
      this.loading = true;
      this.error = null;

      try {
        const response = await useNuxtApp().$civicApi(`/api/records/${id}`);

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

        // Add or update the record in the store
        this.addOrUpdateRecords([record]);

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
        const response = await useNuxtApp().$civicApi('/api/records', {
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

        // Add the new record to the store
        this.addOrUpdateRecords([newRecord]);
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
        const response = await useNuxtApp().$civicApi(`/api/records/${id}`, {
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

        // Update the record in the store
        this.addOrUpdateRecords([updatedRecord]);

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
        await useNuxtApp().$civicApi(`/api/records/${id}`, {
          method: 'DELETE',
        });

        // Remove the record from the store
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

    /**
     * Set filters and trigger re-filtering
     */
    setFilters(filters: Partial<RecordsState['filters']>) {
      this.filters = { ...this.filters, ...filters };
    },

    /**
     * Update pagination state
     */
    setPagination(pagination: Partial<RecordsState['pagination']>) {
      this.pagination = { ...this.pagination, ...pagination };
    },

    /**
     * Clear all filters
     */
    clearFilters() {
      this.filters = {};
      this.lastFetchStrategy = null;
    },

    /**
     * Clear all records from the store
     */
    clearRecords() {
      this.records = [];
      this.filters = {};
      this.lastFetchStrategy = null;
      this.pagination = { page: 1, limit: 20, total: 0 };
    },

    setError(error: string) {
      this.error = error;
    },

    clearError() {
      this.error = null;
    },
  },
});
