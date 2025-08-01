<script setup lang="ts">
import type { CivicRecord } from '~/stores/records'

// Store
const recordsStore = useRecordsStore()

// Reactive state
const saving = ref(false)
const error = ref('')

// Toast notifications
const { toast } = useToast()

// Handle form submission
const handleSubmit = async (recordData: any) => {
  saving.value = true
  error.value = ''

  try {
    // Create record via API
    const response = await useNuxtApp().$civicApi('/api/records', {
      method: 'POST',
      body: recordData
    })

    if (response && response.success) {
      toast.add({
        title: 'Record Created',
        description: `Successfully created "${recordData.title}"`,
        color: 'green'
      })

      // Navigate to the new record
      navigateTo(`/records/${recordData.type}/${response.data.id}`)
    } else {
      throw new Error('Failed to create record')
    }
  } catch (err: any) {
    const errorMessage = err.message || 'Failed to create record'
    error.value = errorMessage
    toast.add({
      title: 'Error',
      description: errorMessage,
      color: 'red'
    })
  } finally {
    saving.value = false
  }
}

// Handle delete (not applicable for new records)
const handleDelete = () => {
  // Not applicable for new records
}

// Check if user can create records
const authStore = useAuthStore()
const canCreateRecords = computed(() => {
  const userRole = authStore.currentUser?.role
  return userRole === 'admin' || userRole === 'clerk'
})

const breadcrumbItems = [
  {
    label: 'Records',
    to: '/records'
  },
  {
    label: 'New Record'
  }
]
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-lg font-semibold">
            Create New Record
          </h1>
        </template>
        <template #description>
          Create a new record with the required information
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UBreadcrumb :items="breadcrumbItems" />
        
        <!-- Access Control -->
        <UAlert 
          v-if="!canCreateRecords" 
          color="error" 
          variant="soft" 
          title="Access Denied"
          description="You don't have permission to create records."
          icon="i-lucide-alert-circle" 
        />
        
        <!-- Record Form -->
        <div v-else>
          <RecordForm 
            :saving="saving"
            :error="error"
            @submit="handleSubmit"
            @delete="handleDelete"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template> 