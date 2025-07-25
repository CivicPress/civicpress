<script setup lang="ts">
import type { CivicRecord } from '~/stores/records'

// Store
const recordsStore = useRecordsStore()

// Composables
const { $civicApi } = useNuxtApp()
const { formatDate, getStatusColor, getTypeIcon } = useRecordUtils()

// Reactive state
const organizationInfo = ref<any>(null)
const systemStats = ref<any>(null)
const recentRecords = ref<CivicRecord[]>([])
const loading = ref(true)
const error = ref('')

// Fetch organization info
const fetchOrganizationInfo = async () => {
  try {
    const response = await $civicApi('/info') as any
    if (response.success) {
      organizationInfo.value = response.organization
    }
  } catch (err: any) {
    console.error('Error fetching organization info:', err)
  }
}

// Fetch system statistics
const fetchSystemStats = async () => {
  try {
    const response = await $civicApi('/api/status') as any
    if (response.success) {
      systemStats.value = response.data
    }
  } catch (err: any) {
    console.error('Error fetching system stats:', err)
  }
}

// Fetch recent records
const fetchRecentRecords = async () => {
  try {
    const response = await $civicApi('/api/records?limit=5') as any
    if (response.success) {
      recentRecords.value = response.data.records || []
    }
  } catch (err: any) {
    console.error('Error fetching recent records:', err)
  }
}

// Load all data
const loadDashboardData = async () => {
  loading.value = true
  error.value = ''

  try {
    await Promise.all([
      fetchOrganizationInfo(),
      fetchSystemStats(),
      fetchRecentRecords()
    ])
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

// Load data on mount
onMounted(() => {
  loadDashboardData()
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
      <div v-else class="space-y-6">
        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UCard>
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <UIcon name="i-lucide-files" class="w-8 h-8 text-blue-500" />
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-500">Total Records</p>
                <p class="text-2xl font-bold text-gray-900">
                  {{ systemStats?.records?.totalRecords || 0 }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <UIcon name="i-lucide-git-branch" class="w-8 h-8 text-green-500" />
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-500">Pending Changes</p>
                <p class="text-2xl font-bold text-gray-900">
                  {{ systemStats?.git?.modified?.length || 0 }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <UIcon name="i-lucide-check-circle" class="w-8 h-8 text-green-500" />
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-500">System Status</p>
                <p class="text-2xl font-bold text-gray-900 capitalize">
                  {{ systemStats?.system?.status || 'Unknown' }}
                </p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Quick Actions -->
        <div class="bg-white rounded-lg border p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UButton @click="navigateToRecords" color="primary" variant="soft" class="h-16 text-lg">
              <template #leading>
                <UIcon name="i-lucide-search" class="w-5 h-5" />
              </template>
              Browse Records
            </UButton>

            <UButton @click="navigateToCreate" color="primary" variant="soft" class="h-16 text-lg">
              <template #leading>
                <UIcon name="i-lucide-plus" class="w-5 h-5" />
              </template>
              Create Record
            </UButton>
          </div>
        </div>

        <!-- Recent Records -->
        <div v-if="recentRecords.length > 0" class="bg-white rounded-lg border">
          <div class="border-b px-6 py-4">
            <h2 class="text-lg font-semibold text-gray-900">Recent Records</h2>
          </div>
          <div class="divide-y">
            <div v-for="record in recentRecords" :key="record.id" class="px-6 py-4 hover:bg-gray-50 cursor-pointer"
              @click="navigateTo(`/records/${record.type}/${record.id}`)">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <UIcon :name="getTypeIcon(record.type)" class="w-5 h-5 text-gray-400" />
                  <div>
                    <h3 class="text-sm font-medium text-gray-900">{{ record.title }}</h3>
                    <div class="flex items-center space-x-2 mt-1">
                      <UBadge :color="getStatusColor(record.status) as any" variant="soft" size="sm">
                        {{ record.status }}
                      </UBadge>
                      <UBadge color="neutral" variant="soft" size="sm">
                        {{ record.type }}
                      </UBadge>
                    </div>
                  </div>
                </div>
                <div class="text-right">
                  <p class="text-xs text-gray-500">
                    {{ formatDate(record.created_at) }}
                  </p>
                  <UIcon name="i-lucide-chevron-right" class="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- No Recent Records -->
        <div v-else class="bg-white rounded-lg border p-6 text-center">
          <UIcon name="i-lucide-files" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gray-900 mb-2">No Records Yet</h3>
          <p class="text-gray-600 mb-4">
            Get started by creating your first record or browsing existing ones.
          </p>
          <div class="flex justify-center space-x-4">
            <UButton @click="navigateToRecords" color="primary" variant="soft">
              Browse Records
            </UButton>
            <UButton @click="navigateToCreate" color="primary" variant="soft">
              Create Record
            </UButton>
          </div>
        </div>

        <!-- Organization Info -->
        <div v-if="organizationInfo" class="bg-white rounded-lg border p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Organization Information</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div v-if="organizationInfo.name" class="space-y-1">
              <dt class="text-sm font-medium text-gray-500">Name</dt>
              <dd class="text-sm text-gray-900">{{ organizationInfo.name }}</dd>
            </div>
            <div v-if="organizationInfo.city && organizationInfo.state" class="space-y-1">
              <dt class="text-sm font-medium text-gray-500">Location</dt>
              <dd class="text-sm text-gray-900">{{ organizationInfo.city }}, {{ organizationInfo.state }}</dd>
            </div>
            <div v-if="organizationInfo.country" class="space-y-1">
              <dt class="text-sm font-medium text-gray-500">Country</dt>
              <dd class="text-sm text-gray-900">{{ organizationInfo.country }}</dd>
            </div>
            <div v-if="organizationInfo.timezone" class="space-y-1">
              <dt class="text-sm font-medium text-gray-500">Timezone</dt>
              <dd class="text-sm text-gray-900">{{ organizationInfo.timezone }}</dd>
            </div>
            <div v-if="organizationInfo.website" class="space-y-1">
              <dt class="text-sm font-medium text-gray-500">Website</dt>
              <dd class="text-sm text-gray-900">
                <a :href="organizationInfo.website" target="_blank" class="text-primary-600 hover:underline">
                  {{ organizationInfo.website }}
                </a>
              </dd>
            </div>
            <div v-if="organizationInfo.email" class="space-y-1">
              <dt class="text-sm font-medium text-gray-500">Email</dt>
              <dd class="text-sm text-gray-900">
                <a :href="`mailto:${organizationInfo.email}`" class="text-primary-600 hover:underline">
                  {{ organizationInfo.email }}
                </a>
              </dd>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
