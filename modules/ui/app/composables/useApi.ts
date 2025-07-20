export const useApi = () => {
  const config = useRuntimeConfig();
  const baseURL = config.public.apiBase;

  // API client with error handling
  const api = $fetch.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
    onResponseError({ response }) {
      // Handle API errors
      console.error('API Error:', response._data);
    },
  });

  // Health check
  const checkHealth = async () => {
    try {
      const response = await api('/health');
      return response;
    } catch (error) {
      console.error('Health check failed:', error);
      return null;
    }
  };

  // Get records
  const getRecords = async (params?: {
    type?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    try {
      const response = await api('/public/records', {
        params,
      });
      return response;
    } catch (error) {
      console.error('Failed to fetch records:', error);
      return null;
    }
  };

  // Get system info
  const getSystemInfo = async () => {
    try {
      const response = await api('/info');
      return response;
    } catch (error) {
      console.error('Failed to fetch system info:', error);
      return null;
    }
  };

  return {
    api,
    checkHealth,
    getRecords,
    getSystemInfo,
  };
};
