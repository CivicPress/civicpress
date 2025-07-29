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
  loadingMessage: string;
  error: string | null;
  filters: {
    type?: string;
    status?: string;
    search?: string;
  };
  // Cursor-based pagination
  nextCursor: string | null;
  hasMore: boolean;
  // Configurable page size
  pageSize: number;
}

export const useRecordsStore = defineStore('records', {
  state: (): RecordsState => ({
    records: [],
    loading: false,
    loadingMessage: '',
    error: null,
    filters: {},
    nextCursor: null,
    hasMore: true,
    pageSize: 300, // Default page size - large for better UX
  }),

  getters: {
    /**
     * Get filtered records (client-side filtering)
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

      return filtered;
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
    totalRecords: (state) => state.records.length,
    totalFilteredRecords: (state) => {
      // Use the filteredRecords getter to get the count
      const store = useRecordsStore();
      return store.filteredRecords.length;
    },

    /**
     * Check if we have more records to load
     */
    hasMoreRecords: (state) => {
      return state.hasMore;
    },
  },

  actions: {
    /**
     * Replace all records (for fresh loads)
     */
    replaceRecords(newRecords: CivicRecord[]) {
      this.records = [...newRecords];
    },

    /**
     * Add records to existing ones (for loading more)
     */
    addRecords(newRecords: CivicRecord[]) {
      this.records.push(...newRecords);
    },

    /**
     * Load initial records (first batch)
     */
    async loadInitialRecords(params?: { type?: string; status?: string }) {
      this.loading = true;
      this.loadingMessage = 'Loading records...';
      this.error = null;

      try {
        const queryParams = new URLSearchParams();
        queryParams.append('limit', this.pageSize.toString());

        if (params?.type) queryParams.append('type', params.type);
        if (params?.status) queryParams.append('status', params.status);

        const url = `/api/records?${queryParams.toString()}`;
        const response = await useNuxtApp().$civicApi(url);

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

          // Replace records with initial batch
          this.replaceRecords(newRecords);

          // Update cursor and hasMore
          this.nextCursor = data.nextCursor || null;
          this.hasMore = data.hasMore || false;
        }
      } catch (error: any) {
        console.error('Error loading initial records:', error);
        this.error = error.message || 'Failed to load records';
        throw error;
      } finally {
        this.loading = false;
        this.loadingMessage = '';
      }
    },

    /**
     * Load more records (next batch)
     */
    async loadMoreRecords(params?: { type?: string; status?: string }) {
      if (!this.hasMore || !this.nextCursor) {
        return;
      }

      this.loading = true;
      this.loadingMessage = 'Loading more records...';
      this.error = null;

      try {
        const queryParams = new URLSearchParams();
        queryParams.append('cursor', this.nextCursor);
        queryParams.append('limit', this.pageSize.toString());

        if (params?.type) queryParams.append('type', params.type);
        if (params?.status) queryParams.append('status', params.status);

        const url = `/api/records?${queryParams.toString()}`;
        const response = await useNuxtApp().$civicApi(url);

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

          // Add new records to existing ones
          this.addRecords(newRecords);

          // Update cursor and hasMore
          this.nextCursor = data.nextCursor || null;
          this.hasMore = data.hasMore || false;
        }
      } catch (error: any) {
        console.error('Error loading more records:', error);
        this.error = error.message || 'Failed to load more records';
        throw error;
      } finally {
        this.loading = false;
        this.loadingMessage = '';
      }
    },

    /**
     * Search records using API
     */
    async searchRecords(
      query: string,
      params?: { type?: string; status?: string }
    ) {
      this.loading = true;
      this.loadingMessage = `Searching for "${query}"...`;
      this.error = null;

      try {
        const queryParams = new URLSearchParams();
        queryParams.append('q', query);
        queryParams.append('limit', this.pageSize.toString());

        if (params?.type) queryParams.append('type', params.type);
        if (params?.status) queryParams.append('status', params.status);

        const url = `/api/search?${queryParams.toString()}`;
        const response = await useNuxtApp().$civicApi(url);

        if (
          typeof response === 'object' &&
          response !== null &&
          'success' in response &&
          (response as any).success &&
          'data' in response &&
          (response as any).data
        ) {
          const data = (response as any).data;
          const apiResults = data.results || [];

          // Replace records with search results
          this.replaceRecords(apiResults);

          // Update cursor and hasMore
          this.nextCursor = data.nextCursor || null;
          this.hasMore = data.hasMore || false;
        }

        // Update filters
        this.filters = {
          type: params?.type,
          status: params?.status,
          search: query,
        };
      } catch (error: any) {
        console.error('Error searching API:', error);
        this.error = error.message || 'Failed to search records';
        throw error;
      } finally {
        this.loading = false;
        this.loadingMessage = '';
      }
    },

    /**
     * Fetch a single record by ID
     */
    async fetchRecord(id: string): Promise<CivicRecord | null> {
      try {
        const response = await useNuxtApp().$civicApi(`/api/records/${id}`);

        if (
          typeof response === 'object' &&
          response !== null &&
          'success' in response &&
          (response as any).success &&
          'data' in response &&
          (response as any).data
        ) {
          const apiRecord = (response as any).data;

          // Transform API response to match CivicRecord interface
          const civicRecord: CivicRecord = {
            id: apiRecord.id,
            title: apiRecord.title,
            type: apiRecord.type,
            content: apiRecord.content || '',
            status: apiRecord.status,
            path: apiRecord.path,
            author: apiRecord.author,
            created_at: apiRecord.created || apiRecord.created_at,
            updated_at: apiRecord.updated || apiRecord.updated_at,
            metadata: apiRecord.metadata || {},
          };

          return civicRecord;
        }

        return null;
      } catch (error: any) {
        console.error('Error fetching record:', error);
        this.error = error.message || 'Failed to fetch record';
        throw error;
      }
    },

    /**
     * Set loading state with message
     */
    setLoading(loading: boolean, message: string = '') {
      this.loading = loading;
      this.loadingMessage = message;
    },

    /**
     * Set filters
     */
    setFilters(filters: Partial<RecordsState['filters']>) {
      this.filters = { ...this.filters, ...filters };
    },

    /**
     * Clear all filters
     */
    clearFilters() {
      this.filters = {};
    },

    /**
     * Clear all records from the store
     */
    clearRecords() {
      this.records = [];
      this.filters = {};
      this.nextCursor = null;
      this.hasMore = true;
    },

    /**
     * Set error
     */
    setError(error: string) {
      this.error = error;
    },

    /**
     * Clear error
     */
    clearError() {
      this.error = null;
    },

    /**
     * Update page size for pagination
     */
    setPageSize(size: number) {
      this.pageSize = size;
    },

    /**
     * Get current page size
     */
    getPageSize() {
      return this.pageSize;
    },
  },
});
