<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { useAppStore } from '~/stores/app'

const route = useRoute()
const toast = useToast()
const appStore = useAppStore()

const collapsed = ref(true);

const links = [[{
  label: 'Home',
  icon: 'i-lucide-house',
  to: '/',
  onSelect: () => {
    appStore.setSidebarOpen(true)
  }
}, {
  label: 'Records',
  to: '/records',
  icon: 'i-lucide-scale',
  defaultOpen: true,
  type: 'trigger',
  children: [{
    label: 'Bylaws',
    to: '/records?type=bylaws',
    exact: true,
    onSelect: () => {
      appStore.setSidebarOpen(false)
    }
  }, {
    label: 'Minutes',
    to: '/records?type=minutes',
    onSelect: () => {
      appStore.setSidebarOpen(false)
    }
  }, {
    label: 'Resolutions',
    to: '/records?type=resolutions',
    onSelect: () => {
      appStore.setSidebarOpen(false)
    }
  }]
}], [{
  label: 'Feedback',
  icon: 'i-lucide-message-circle',
  to: 'https://github.com/nuxt-ui-pro/dashboard',
  target: '_blank'
}, {
  label: 'Help & Support',
  icon: 'i-lucide-info',
  to: 'https://github.com/nuxt/ui-pro',
  target: '_blank'
}]] satisfies NavigationMenuItem[][]

onMounted(async () => {
  const cookie = useCookie('cookie-consent')
  if (cookie.value === 'accepted') {
    return
  }

  toast.add({
    title: 'We use first-party cookies to enhance your experience on our website.',
    duration: 0,
    close: false,
    actions: [{
      label: 'Accept',
      color: 'neutral',
      variant: 'outline',
      onClick: () => {
        cookie.value = 'accepted'
      }
    }, {
      label: 'Opt out',
      color: 'neutral',
      variant: 'ghost'
    }]
  })
})

</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar id="default" v-model:open="appStore.sidebarOpen" v-model:collapsed="appStore.sidebarCollapsed"
      collapsible resizable class="bg-elevated/25" :toggle="{
        color: 'primary',
        variant: 'subtle',
        class: 'rounded-full'
      }" :ui="{ footer: 'lg:border-t lg:border-default' }">
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 px-3 py-3 font-bold">
          <UIcon name="i-lucide-badge-check" size="2xl" />
          <span v-if="!collapsed" class="font-bold tracking-wide">CivicPress</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="links[0]" orientation="vertical" tooltip popover />
        <UNavigationMenu :collapsed="collapsed" :items="links[1]" orientation="vertical" tooltip class="mt-auto" />
      </template>

      <template #footer="{ collapsed }">
        <!-- <UDashboardSidebarCollapse /> -->
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />

  </UDashboardGroup>
</template>