<script setup lang="ts">
import type { CivicRecord } from '~/stores/records'

// Store
const recordsStore = useRecordsStore()
const authStore = useAuthStore()

// Composables
const { $civicApi } = useNuxtApp()
const { formatDate, getStatusColor, getTypeIcon } = useRecordUtils()

// Reactive state
const organizationInfo = ref<any>(null)
const systemStats = ref<any>(null)
const recentRecords = ref<CivicRecord[]>([])
const loading = ref(true)
const error = ref('')
const isAuthenticated = computed(() => authStore.isAuthenticated)

// Computed properties
const defaultDescription = computed(() => 'A modern civic technology platform for transparent, accessible, and accountable local government.')

// Fetch organization info (public endpoint)
const fetchOrganizationInfo = async () => {
  try {
    const response = await $civicApi('/info') as any
    if (response.success) {
      organizationInfo.value = response.organization
    }
  } catch (err: any) {
    console.error('Error fetching organization info:', err)
    // Don't set error for organization info - it's not critical
  }
}

// Fetch system statistics (requires authentication)
const fetchSystemStats = async () => {
  if (!isAuthenticated.value) {
    return
  }

  try {
    const response = await $civicApi('/api/status') as any
    if (response.success) {
      systemStats.value = response.data
    }
  } catch (err: any) {
    console.error('Error fetching system stats:', err)
    // Don't set error for system stats - it's not critical
  }
}

// Fetch recent records (requires authentication)
const fetchRecentRecords = async () => {
  if (!isAuthenticated.value) {
    return
  }

  try {
    const response = await $civicApi('/api/records?limit=5') as any
    if (response.success) {
      recentRecords.value = response.data.records || []
    }
  } catch (err: any) {
    console.error('Error fetching recent records:', err)
    // Don't set error for recent records - it's not critical
  }
}

// Load all data
const loadDashboardData = async () => {
  loading.value = true
  error.value = ''

  try {
    // Always fetch organization info (public)
    await fetchOrganizationInfo()

    // Only fetch authenticated data if user is logged in
    if (isAuthenticated.value) {
      await Promise.all([
        fetchSystemStats(),
        fetchRecentRecords()
      ])
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to load dashboard data'
    console.error('Error loading dashboard data:', err)
  } finally {
    loading.value = false
  }
}

// Quick actions
const navigateToRecords = () => {
  navigateTo('/records')
}

const navigateToCreate = () => {
  navigateTo('/records/create')
}

const navigateToLogin = () => {
  navigateTo('/auth/login')
}

// Load data on mount
onMounted(() => {
  loadDashboardData()
})

// Watch for authentication changes
watch(isAuthenticated, (newValue) => {
  if (newValue) {
    // User just logged in, reload authenticated data
    loadDashboardData()
  }
})
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #center>
          <div class="text-center">
            <h1 class="text-2xl font-bold text-gray-900">
              Welcome to {{ organizationInfo?.name || 'CivicPress' }}
            </h1>
            <p v-if="organizationInfo?.city && organizationInfo?.state" class="text-gray-600 mt-1">
              {{ organizationInfo.city }}, {{ organizationInfo.state }}
            </p>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="text-center">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
          <p class="text-gray-600">Loading dashboard...</p>
        </div>
      </div>

      <!-- Error State -->
      <UAlert v-else-if="error" color="error" variant="soft" :title="error" icon="i-lucide-alert-circle" class="mb-4">
        <template #footer>
          <UButton color="error" variant="soft" @click="loadDashboardData">
            Try Again
          </UButton>
        </template>
      </UAlert>

      <!-- Dashboard Content -->
      <div v-else class="space-y-8">
        <!-- Welcome Section -->
        <div class="text-center py-8">
          <UIcon name="i-lucide-building-2" class="w-16 h-16 text-primary-500 mx-auto mb-4" />
          <h2 class="text-3xl font-bold text-gray-900 mb-2">
            {{ organizationInfo?.name || 'CivicPress' }}
          </h2>
          <p class="text-gray-600 max-w-2xl mx-auto">
            {{ organizationInfo?.description || defaultDescription }}
          </p>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <UCard class="text-center hover:shadow-lg transition-shadow cursor-pointer" @click="navigateToRecords">
            <UIcon name="i-lucide-file-text" class="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Browse Records</h3>
            <p class="text-gray-600">View and search through civic records, bylaws, and policies.</p>
          </UCard>

          <UCard v-if="isAuthenticated" class="text-center hover:shadow-lg transition-shadow cursor-pointer"
            @click="navigateToCreate">
            <UIcon name="i-lucide-plus-circle" class="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Create Record</h3>
            <p class="text-gray-600">Create new civic records, bylaws, or policies.</p>
          </UCard>

          <UCard v-if="!isAuthenticated" class="text-center hover:shadow-lg transition-shadow cursor-pointer"
            @click="navigateToLogin">
            <UIcon name="i-lucide-log-in" class="w-12 h-12 text-purple-500 mx-auto mb-4" />
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Sign In</h3>
            <p class="text-gray-600">Access administrative features and create records.</p>
          </UCard>
        </div>

        <!-- Recent Records (if authenticated) -->
        <div v-if="isAuthenticated && recentRecords.length > 0" class="space-y-4">
          <h3 class="text-xl font-semibold text-gray-900">Recent Records</h3>
          <div class="grid gap-4">
            <UCard v-for="record in recentRecords" :key="record.id"
              class="hover:shadow-md transition-shadow cursor-pointer"
              @click="navigateTo(`/records/${record.type}/${record.id}`)">
              <div class="flex items-start space-x-4">
                <UIcon name="i-heroicons-document-text" class="w-8 h-8 text-gray-500 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <h4 class="text-sm font-medium text-gray-900 truncate">{{ record.title }}</h4>
                  <p class="text-sm text-gray-500">{{ formatDate(record.created_at) }}</p>
                  <UBadge :color="getStatusColor(record.status) as any" variant="soft" size="sm">
                    {{ record.status }}
                  </UBadge>
                </div>
              </div>
            </UCard>
          </div>
        </div>

        <!-- System Stats (if authenticated) -->
        <div v-if="isAuthenticated && systemStats" class="space-y-4">
          <h3 class="text-xl font-semibold text-gray-900">System Overview</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UCard>
              <div class="text-center">
                <div class="text-2xl font-bold text-blue-600">{{ systemStats.totalRecords || 0 }}</div>
                <div class="text-sm text-gray-600">Total Records</div>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <div class="text-2xl font-bold text-green-600">{{ systemStats.activeRecords || 0 }}</div>
                <div class="text-sm text-gray-600">Active Records</div>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <div class="text-2xl font-bold text-purple-600">{{ systemStats.recentUpdates || 0 }}</div>
                <div class="text-sm text-gray-600">Recent Updates</div>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Public Information -->
        <div v-if="organizationInfo" class="space-y-4">
          <h3 class="text-xl font-semibold text-gray-900">About {{ organizationInfo.name }}</h3>
          <UCard>
            <div class="space-y-2">
              <div v-if="organizationInfo.city && organizationInfo.state" class="flex items-center space-x-2">
                <UIcon name="i-lucide-map-pin" class="w-4 h-4 text-gray-500" />
                <span class="text-gray-700">{{ organizationInfo.city }}, {{ organizationInfo.state }}</span>
              </div>
              <div v-if="organizationInfo.country" class="flex items-center space-x-2">
                <UIcon name="i-lucide-globe" class="w-4 h-4 text-gray-500" />
                <span class="text-gray-700">{{ organizationInfo.country }}</span>
              </div>
              <div v-if="organizationInfo.timezone" class="flex items-center space-x-2">
                <UIcon name="i-lucide-clock" class="w-4 h-4 text-gray-500" />
                <span class="text-gray-700">{{ organizationInfo.timezone }}</span>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
