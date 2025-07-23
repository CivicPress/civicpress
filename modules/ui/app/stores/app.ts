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
  state: (): AppState => ({
    sidebarOpen: true,
    sidebarCollapsed: false,
    theme: 'system',
    notifications: [],
  }),

  getters: {
    isSidebarOpen: (state) => state.sidebarOpen,
    isSidebarCollapsed: (state) => state.sidebarCollapsed,
    currentTheme: (state) => state.theme,
    activeNotifications: (state) => state.notifications,
  },

  actions: {
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen;
    },

    setSidebarOpen(open: boolean) {
      this.sidebarOpen = open;
    },

    toggleSidebarCollapsed() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    },

    setSidebarCollapsed(collapsed: boolean) {
      this.sidebarCollapsed = collapsed;
    },

    setTheme(theme: 'light' | 'dark' | 'system') {
      // this.theme = theme;
      // // Apply theme to document
      // if (process.client) {
      //   if (theme === 'dark') {
      //     document.documentElement.classList.add('dark');
      //   } else if (theme === 'light') {
      //     document.documentElement.classList.remove('dark');
      //   } else {
      //     // System theme - remove class and let CSS handle it
      //     document.documentElement.classList.remove('dark');
      //   }
      // }
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
  },
});
