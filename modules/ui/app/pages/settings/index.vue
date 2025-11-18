<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';
import { ref, onMounted, computed } from 'vue';
import SystemFooter from '~/components/SystemFooter.vue';

const route = useRoute();
const router = useRouter();
const { $civicApi } = useNuxtApp();
const { t } = useI18n();

// Auth store for permissions
const authStore = useAuthStore();

// Settings navigation items filtered by permissions
const settingsItems = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = [
    {
      label: t('settings.profile'),
      icon: 'i-lucide-user',
      to: '/settings/profile',
      description: t('settings.profileDescription'),
    },
  ];

  if (authStore.hasPermission('users:manage')) {
    items.push({
      label: t('settings.usersNav'),
      icon: 'i-lucide-users',
      to: '/settings/users',
      description: t('settings.usersDescription'),
    });
  }

  if (authStore.hasPermission('config:manage')) {
    items.push({
      label: t('settings.configurations'),
      icon: 'i-lucide-settings',
      to: '/settings/configuration',
      description: t('settings.configurationsDescription'),
    });
  }

  if (authStore.hasPermission('storage:manage')) {
    items.push({
      label: t('settings.storageNav'),
      icon: 'i-lucide-hard-drive',
      to: '/settings/storage',
      description: t('settings.storageDescription'),
    });
  }

  if (authStore.hasPermission('system:admin')) {
    items.push({
      label: t('settings.activityLog'),
      icon: 'i-lucide-activity',
      to: '/settings/activity',
      description: t('settings.activityLogDescription'),
    });
    items.push({
      label: t('settings.notificationsNav'),
      icon: 'i-lucide-mail',
      to: '/settings/notifications',
      description: t('settings.notificationsDescription'),
    });
  }

  return items;
});

// Helpers for routes
const toPath = (to: any): string => {
  if (typeof to === 'string') return to;
  if (to && typeof to === 'object') {
    // Prefer path if present; fallback to string
    // @ts-ignore
    return to.path ?? String(to);
  }
  return String(to ?? '');
};

// Check if current route is active
const isActive = (to: any) => route.path === toPath(to);

// Navigation helper
const navigateTo = (path: string) => {
  router.push(path);
};

const breadcrumbItems = computed(() => [
  {
    label: t('common.home'),
    to: '/',
  },
  {
    label: t('settings.title'),
    to: '/settings',
  },
]);

// Setup banner: show when any config is not a user file (missing or default-only)
const configStatus = ref<Record<string, 'default' | 'user' | 'missing'> | null>(
  null
);
const needsSetup = computed(() => {
  if (!configStatus.value) return false;
  return Object.values(configStatus.value).some((s) => s !== 'user');
});

async function loadConfigStatus() {
  if (!authStore.hasPermission('system:admin')) return;
  try {
    const res: any = await $civicApi('/api/v1/config/status');
    if (res?.success) {
      configStatus.value = res.data || {};
    }
  } catch (e) {
    // Non-blocking
  }
}

onMounted(() => {
  loadConfigStatus();
});
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">{{ t('settings.title') }}</h1>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Authenticated content; cards filtered by permissions -->
      <div class="space-y-6">
        <UBreadcrumb :items="breadcrumbItems" />

        <!-- Admin-only setup banner when configs need initialization -->
        <UAlert
          v-if="authStore.hasPermission('system:admin') && needsSetup"
          color="primary"
          variant="subtle"
          icon="i-lucide-wrench"
          :title="t('settings.setupRecommended')"
          :description="t('settings.setupRecommendedDescription')"
        >
          <template #actions>
            <UButton
              color="primary"
              variant="outline"
              icon="i-lucide-play-circle"
              @click="navigateTo('/settings/setup')"
              >{{ t('settings.openSetup') }}</UButton
            >
          </template>
        </UAlert>

        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <UCard
            v-for="item in settingsItems"
            :key="toPath(item.to)"
            class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            :class="{ 'ring-2 ring-primary-500': isActive(item.to) }"
            @click="navigateTo(toPath(item.to))"
          >
            <div class="flex items-center gap-4">
              <div class="flex-shrink-0">
                <UIcon
                  :name="item.icon || 'i-lucide-circle'"
                  class="w-8 h-8 text-blue-600 dark:text-blue-400"
                />
              </div>
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ item.label }}
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {{ item.description }}
                </p>
              </div>
              <UIcon
                name="i-lucide-chevron-right"
                class="w-5 h-5 text-gray-400"
              />
            </div>
          </UCard>
        </div>

        <!-- Footer -->
        <SystemFooter />
      </div>
    </template>
  </UDashboardPanel>
</template>
