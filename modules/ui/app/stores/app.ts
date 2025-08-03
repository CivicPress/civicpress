import { defineStore } from 'pinia';

export interface AppState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark' | 'system';
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message?: string;
    duration?: number;
  }>;
}

export const useAppStore = defineStore('app', {
  state: (): AppState => {
    // Try to restore state from localStorage on initialization
    let initialState: AppState = {
      sidebarOpen: true,
      sidebarCollapsed: false,
      theme: 'system',
      notifications: [],
    };

    if (process.client) {
      try {
        const storedAppState = localStorage.getItem('civic_app_state');

        if (storedAppState) {
          const parsedState = JSON.parse(storedAppState);

          // Only restore persistent fields (not notifications)
          initialState = {
            ...initialState,
            sidebarOpen: parsedState.sidebarOpen ?? true,
            sidebarCollapsed: parsedState.sidebarCollapsed ?? false,
            theme: parsedState.theme ?? 'system',
            notifications: [], // Always start with empty notifications
          };
        }
      } catch (error) {
        console.warn('Failed to restore app state from localStorage:', error);
        // Clear corrupted localStorage
        localStorage.removeItem('civic_app_state');
      }
    }

    return initialState;
  },

  getters: {
    isSidebarOpen: (state) => state.sidebarOpen,
    isSidebarCollapsed: (state) => state.sidebarCollapsed,
    currentTheme: (state) => state.theme,
    activeNotifications: (state) => state.notifications,
  },

  actions: {
    // Private method to save app state to localStorage
    saveAppState() {
      if (process.client) {
        try {
          const stateToSave = {
            sidebarOpen: this.sidebarOpen,
            sidebarCollapsed: this.sidebarCollapsed,
            theme: this.theme,
            // Don't save notifications - they're temporary
          };
          localStorage.setItem('civic_app_state', JSON.stringify(stateToSave));
        } catch (error) {
          console.warn('Failed to save app state to localStorage:', error);
        }
      }
    },

    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen;
      this.saveAppState();
    },

    setSidebarOpen(open: boolean) {
      this.sidebarOpen = open;
      this.saveAppState();
    },

    toggleSidebarCollapsed() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      this.saveAppState();
    },

    setSidebarCollapsed(collapsed: boolean) {
      this.sidebarCollapsed = collapsed;
      this.saveAppState();
    },

    setTheme(theme: 'light' | 'dark' | 'system') {
      this.theme = theme;
      this.saveAppState();

      // Apply theme to document
      if (process.client) {
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else if (theme === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          // System theme - remove class and let CSS handle it
          document.documentElement.classList.remove('dark');
        }
      }
    },

    addNotification(notification: Omit<AppState['notifications'][0], 'id'>) {
      const id = Date.now().toString();
      const newNotification = { ...notification, id };
      this.notifications.push(newNotification);

      // Auto-remove notification after duration (default: 5000ms)
      if (notification.duration !== 0) {
        setTimeout(() => {
          this.removeNotification(id);
        }, notification.duration || 5000);
      }
    },

    removeNotification(id: string) {
      const index = this.notifications.findIndex((n) => n.id === id);
      if (index > -1) {
        this.notifications.splice(index, 1);
      }
    },

    clearNotifications() {
      this.notifications = [];
    },

    // Clear all app state (useful for logout)
    clearAppState() {
      this.sidebarOpen = true;
      this.sidebarCollapsed = false;
      this.theme = 'system';
      this.notifications = [];

      if (process.client) {
        localStorage.removeItem('civic_app_state');
      }
    },
  },
});
