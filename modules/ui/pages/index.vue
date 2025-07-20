<template>
  <div class="space-y-8">
    <!-- API Status -->
    <UCard class="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="p-2 bg-blue-100 rounded-lg">
              <UIcon name="i-heroicons-server" class="w-5 h-5 text-blue-600" />
            </div>
            <h2 class="text-lg font-semibold">API Status</h2>
          </div>
          <UButton
            icon="i-heroicons-arrow-path"
            color="blue"
            variant="ghost"
            size="sm"
            :loading="loading"
            @click="checkApiHealth"
          >
            Refresh
          </UButton>
        </div>
      </template>
      
      <div class="space-y-4">
        <div v-if="healthStatus" class="space-y-3">
          <div class="flex items-center space-x-3">
            <UIcon
              :name="healthStatus.status === 'healthy' ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
              :class="healthStatus.status === 'healthy' ? 'text-green-500' : 'text-red-500'"
              class="w-5 h-5"
            />
            <span class="font-medium">Status: {{ healthStatus.status }}</span>
            <UBadge :color="healthStatus.status === 'healthy' ? 'green' : 'red'" variant="soft">
              {{ healthStatus.status === 'healthy' ? 'Online' : 'Offline' }}
            </UBadge>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-sm font-medium text-gray-600">Uptime</p>
              <p class="text-lg font-semibold">{{ formatUptime(healthStatus.uptime) }}</p>
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-sm font-medium text-gray-600">Environment</p>
              <p class="text-lg font-semibold">{{ healthStatus.environment }}</p>
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-sm font-medium text-gray-600">Memory</p>
              <p class="text-lg font-semibold">{{ formatBytes(healthStatus.memory?.heapUsed || 0) }}</p>
            </div>
          </div>
        </div>
        
        <div v-else-if="error" class="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div class="flex items-center space-x-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-500" />
            <span class="text-red-700">{{ error }}</span>
          </div>
        </div>
        
        <div v-else class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p>Click refresh to check API status</p>
        </div>
      </div>
    </UCard>

    <!-- System Info -->
    <UCard v-if="systemInfo" class="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
      <template #header>
        <div class="flex items-center space-x-3">
          <div class="p-2 bg-purple-100 rounded-lg">
            <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-purple-600" />
          </div>
          <h2 class="text-lg font-semibold">System Information</h2>
        </div>
      </template>
      
      <div class="space-y-4">
        <div v-if="systemInfo.organization" class="space-y-4">
          <h3 class="font-medium text-gray-900">Organization</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="p-3 bg-gray-50 rounded-lg">
              <label class="text-sm font-medium text-gray-500">Name</label>
              <p class="text-lg font-semibold">{{ systemInfo.organization.name }}</p>
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
              <label class="text-sm font-medium text-gray-500">Location</label>
              <p class="text-lg font-semibold">{{ systemInfo.organization.location }}</p>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Records Preview -->
    <UCard class="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="p-2 bg-green-100 rounded-lg">
              <UIcon name="i-heroicons-document-text" class="w-5 h-5 text-green-600" />
            </div>
            <h2 class="text-lg font-semibold">Records Preview</h2>
          </div>
          <UButton
            icon="i-heroicons-arrow-path"
            color="blue"
            variant="ghost"
            size="sm"
            :loading="recordsLoading"
            @click="loadRecords"
          >
            Load Records
          </UButton>
        </div>
      </template>
      
      <div class="space-y-4">
        <div v-if="records" class="space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-sm text-gray-600">
              Found {{ records.records?.length || 0 }} records
            </p>
            <UBadge color="blue" variant="soft">
              {{ records.records?.length || 0 }} items
            </UBadge>
          </div>
          
          <div v-if="records.records?.length" class="space-y-3">
            <div
              v-for="record in records.records.slice(0, 3)"
              :key="record.id"
              class="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-200"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <h4 class="font-medium text-gray-900">{{ record.title }}</h4>
                  <p class="text-sm text-gray-600">{{ record.type }} • {{ record.status }}</p>
                  <p v-if="record.content" class="text-sm text-gray-500 mt-1 line-clamp-2">
                    {{ record.content }}
                  </p>
                </div>
                <div class="flex items-center space-x-2 ml-4">
                  <UBadge :color="getStatusColor(record.status)" variant="soft">
                    {{ record.status }}
                  </UBadge>
                  <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div v-else-if="recordsError" class="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div class="flex items-center space-x-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-500" />
            <span class="text-red-700">{{ recordsError }}</span>
          </div>
        </div>
        
        <div v-else class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-document-text" class="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p>Click "Load Records" to fetch sample data</p>
        </div>
      </div>
    </UCard>

    <!-- UI Components Test -->
    <UCard class="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
      <template #header>
        <div class="flex items-center space-x-3">
          <div class="p-2 bg-orange-100 rounded-lg">
            <UIcon name="i-heroicons-puzzle-piece" class="w-5 h-5 text-orange-600" />
          </div>
          <h2 class="text-lg font-semibold">UI Components Test</h2>
        </div>
      </template>
      
      <div class="space-y-6">
        <div>
          <h3 class="text-sm font-medium text-gray-700 mb-3">Notifications</h3>
          <div class="flex flex-wrap gap-2">
            <UButton
              color="green"
              variant="soft"
              @click="showNotification('success', 'Success notification!')"
            >
              Success
            </UButton>
            <UButton
              color="red"
              variant="soft"
              @click="showNotification('error', 'Error notification!')"
            >
              Error
            </UButton>
            <UButton
              color="yellow"
              variant="soft"
              @click="showNotification('warning', 'Warning notification!')"
            >
              Warning
            </UButton>
            <UButton
              color="blue"
              variant="soft"
              @click="showNotification('info', 'Info notification!')"
            >
              Info
            </UButton>
          </div>
        </div>
        
        <div>
          <h3 class="text-sm font-medium text-gray-700 mb-3">Progress Bar</h3>
          <div class="space-y-3">
            <UProgress :value="progress" :max="100" />
            <div class="flex items-center space-x-2">
              <UButton
                size="sm"
                variant="soft"
                @click="progress = Math.max(progress - 10, 0)"
              >
                Decrease
              </UButton>
              <span class="text-sm font-medium">{{ progress }}%</span>
              <UButton
                size="sm"
                variant="soft"
                @click="progress = Math.min(progress + 10, 100)"
              >
                Increase
              </UButton>
            </div>
          </div>
        </div>

        <div>
          <h3 class="text-sm font-medium text-gray-700 mb-3">Form Elements</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormGroup label="Name">
              <UInput placeholder="Enter your name" />
            </UFormGroup>
            <UFormGroup label="Email">
              <UInput type="email" placeholder="Enter your email" />
            </UFormGroup>
            <UFormGroup label="Role">
              <USelect
                :options="[
                  { label: 'Admin', value: 'admin' },
                  { label: 'User', value: 'user' },
                  { label: 'Guest', value: 'guest' }
                ]"
                placeholder="Select role"
              />
            </UFormGroup>
            <UFormGroup label="Status">
              <UCheckbox label="Active" />
            </UFormGroup>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup>
// API composable (auto-imported by Nuxt)
const { checkHealth, getRecords, getSystemInfo } = useApi()

// Reactive state
const healthStatus = ref(null)
const systemInfo = ref(null)
const records = ref(null)
const loading = ref(false)
const recordsLoading = ref(false)
const error = ref('')
const recordsError = ref('')
const progress = ref(30)

// Format uptime
const formatUptime = (uptime) => {
  const hours = Math.floor(uptime / 3600)
  const minutes = Math.floor((uptime % 3600) / 60)
  const seconds = Math.floor(uptime % 60)
  return `${hours}h ${minutes}m ${seconds}s`
}

// Format bytes
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Get status color
const getStatusColor = (status) => {
  switch (status) {
    case 'approved':
    case 'active':
      return 'green'
    case 'draft':
      return 'yellow'
    case 'archived':
      return 'gray'
    default:
      return 'blue'
  }
}

// Check API health
const checkApiHealth = async () => {
  loading.value = true
  error.value = ''
  
  try {
    const response = await checkHealth()
    if (response) {
      healthStatus.value = response
    } else {
      error.value = 'Failed to connect to API'
    }
  } catch (err) {
    error.value = 'API connection failed'
  } finally {
    loading.value = false
  }
}

// Load records
const loadRecords = async () => {
  recordsLoading.value = true
  recordsError.value = ''
  
  try {
    const response = await getRecords({ limit: 10 })
    if (response) {
      records.value = response
    } else {
      recordsError.value = 'Failed to load records'
    }
  } catch (err) {
    recordsError.value = 'Failed to load records'
  } finally {
    recordsLoading.value = false
  }
}

// Show notification
const showNotification = (type, message) => {
  const toast = useToast()
  toast.add({
    title: message,
    color: type === 'success' ? 'green' : type === 'error' ? 'red' : type === 'warning' ? 'yellow' : 'blue'
  })
}

// Load initial data
onMounted(() => {
  checkApiHealth()
  loadRecords()
})
</script> 