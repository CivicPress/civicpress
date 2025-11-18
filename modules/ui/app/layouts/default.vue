<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';
import { useAppStore } from '~/stores/app';

const route = useRoute();
const toast = useToast();
const appStore = useAppStore();
const authStore = useAuthStore(); // ⬅️ add this
const { t } = useI18n();

const collapsed = ref(true);

const links = computed<NavigationMenuItem[][]>(() => {
  const primary: NavigationMenuItem[] = [
    {
      label: t('common.home'),
      icon: 'i-lucide-house',
      to: '/',
    },
    {
      label: t('common.records'),
      to: '/records',
      icon: 'i-lucide-scale',
    },
    {
      label: t('geography.title'),
      to: '/geography',
      icon: 'i-lucide-map',
    },
  ];

  const secondary: NavigationMenuItem[] = [];

  if (authStore.isLoggedIn) {
    secondary.push({
      label: t('common.settings'),
      to: '/settings',
      icon: 'i-lucide-settings',
    });
  }

  return [primary, secondary];
});

onMounted(async () => {
  const cookie = useCookie('cookie-consent');
  if (cookie.value === 'accepted') {
    return;
  }

  toast.add({
    title:
      'We use first-party cookies to enhance your experience on our website.',
    duration: 0,
    close: false,
    actions: [
      {
        label: 'Accept',
        color: 'neutral',
        variant: 'outline',
        onClick: () => {
          cookie.value = 'accepted';
        },
      },
      {
        label: 'Opt out',
        color: 'neutral',
        variant: 'ghost',
      },
    ],
  });
});
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      id="default"
      v-model:open="appStore.sidebarOpen"
      v-model:collapsed="appStore.sidebarCollapsed"
      collapsible
      resizable
      class="bg-elevated/25"
      :toggle="{
        color: 'primary',
        variant: 'subtle',
        class: 'rounded-full',
      }"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 px-3 py-3">
          <Logo :size="collapsed ? 'sm' : 'md'" :show-text="!collapsed" />
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[1]"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <!-- <UDashboardSidebarCollapse /> -->
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
