<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const router = useRouter()

// Auth store for permissions
const authStore = useAuthStore()

// Check if user is admin
const isAdmin = computed(() => {
  return authStore.currentUser?.role === 'admin'
})

// Redirect non-admin users
onMounted(() => {
  if (!isAdmin.value) {
    // Redirect to home page with error message
    useToast().add({
      title: 'Access Denied',
      description: 'Settings page is restricted to administrators only.',
      color: 'error',
      duration: 5000
    })
    navigateTo('/')
  }
})

// Settings navigation items (admin only)
const settingsItems = [
  {
    label: 'Profile',
    icon: 'i-lucide-user',
    to: '/settings/profile',
    description: 'Manage your account settings'
  },
  {
    label: 'Users',
    icon: 'i-lucide-users',
    to: '/settings/users',
    description: 'Manage system users and roles'
  }
] satisfies NavigationMenuItem[]

// Check if current route is active
const isActive = (path: string) => route.path === path

const breadcrumbItems = [
  {
    label: 'Settings',
    to: '/settings'
  }
]
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-lg font-semibold">
            Settings
          </h1>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Admin-only content -->
      <div v-if="isAdmin" class="space-y-6">
        <UBreadcrumb :items="breadcrumbItems" />



        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <UCard v-for="item in settingsItems" :key="item.to"
            class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            :class="{ 'ring-2 ring-primary-500': isActive(item.to) }" @click="navigateTo(item.to)">
            <div class="flex items-center gap-4">
              <div class="flex-shrink-0">
                <UIcon :name="item.icon" class="w-8 h-8 text-primary-600 dark:text-primary-400" />
              </div>
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ item.label }}
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {{ item.description }}
                </p>
              </div>
              <UIcon name="i-lucide-chevron-right" class="w-5 h-5 text-gray-400" />
            </div>
          </UCard>
        </div>
      </div>

      <!-- Loading state for non-admin users (will redirect) -->
      <div v-else class="flex justify-center items-center h-64">
        <div class="text-center">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
          <p class="text-gray-600">Checking permissions...</p>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>