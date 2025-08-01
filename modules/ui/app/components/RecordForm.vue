<script setup lang="ts">
import type { CivicRecord } from '~/stores/records'

// Types
interface RecordFormData {
  title: string
  type: string
  content: string
  status: string
  tags: string[]
  description: string
  metadata: {
    tags: string[]
    description: string
  }
}

// Props
interface Props {
  record?: CivicRecord | null
  isEditing?: boolean
  error?: string | null
  saving?: boolean
  canDelete?: boolean
  recordType?: string | null // Pre-select type for type-specific creation
}

const props = withDefaults(defineProps<Props>(), {
  record: null,
  isEditing: false,
  error: null,
  saving: false,
  canDelete: false,
  recordType: null
})

// Emits
const emit = defineEmits<{
  submit: [recordData: RecordFormData]
  delete: [recordId: string]
}>()

// Composables
const { getRecordTypeOptions, getRecordTypeLabel } = useRecordTypes()
const { recordStatusOptions, getRecordStatusLabel } = useRecordStatuses()

// Form data
const form = reactive({
  title: '',
  type: '' as string,
  content: '',
  status: '' as string,
  tags: [] as string[],
  description: ''
})

// New tag input
const newTag = ref('')

// Selected options for select menus
const selectedRecordType = ref<any>(null)
const selectedRecordStatus = ref<any>(null)

// Form errors
const formErrors = reactive({
  title: '',
  type: '',
  content: '',
  status: '',
  tags: '',
  description: ''
})

// Computed properties
const isFormValid = computed(() => {
  return form.title && form.type && form.content && form.status
})

const recordTypeOptionsComputed = computed(() => {
  return getRecordTypeOptions().map((option: any) => ({
    label: option.label,
    icon: option.icon,
    value: option.value,
    description: option.description
  }))
})

const recordStatusOptionsComputed = computed(() => {
  return recordStatusOptions().map((option: any) => ({
    label: option.label,
    icon: option.icon,
    value: option.value,
    description: option.description
  }))
})

// Watch for selected options changes
watch(selectedRecordType, (newValue) => {
  if (newValue) {
    form.type = newValue.value
  }
})

watch(selectedRecordStatus, (newValue) => {
  if (newValue) {
    form.status = newValue.value
  }
})

// Initialize form
onMounted(async () => {
  await Promise.all([
    // Fetch record types and statuses
  ])

  if (props.isEditing && props.record) {
    // Populate form with existing record data
    form.title = props.record.title
    form.type = props.record.type
    form.content = props.record.content
    form.status = props.record.status
    form.tags = props.record.metadata?.tags || []
    form.description = (props.record.metadata as any)?.description || ''
    
    // Set selected options
    const typeOption = recordTypeOptionsComputed.value.find(option => option.value === props.record?.type)
    if (typeOption) {
      selectedRecordType.value = typeOption
    }
    
    const statusOption = recordStatusOptionsComputed.value.find(option => option.value === props.record?.status)
    if (statusOption) {
      selectedRecordStatus.value = statusOption
    }
  } else if (props.recordType) {
    // Pre-select record type for type-specific creation
    form.type = props.recordType
    const typeOption = recordTypeOptionsComputed.value.find(option => option.value === props.recordType)
    if (typeOption) {
      selectedRecordType.value = typeOption
    }
  }
})

// Validation
const validateForm = () => {
  const errors: any = {}

  if (!form.title.trim()) {
    errors.title = 'Title is required'
  }

  if (!form.type) {
    errors.type = 'Record type is required'
  }

  if (!form.content.trim()) {
    errors.content = 'Content is required'
  }

  if (!form.status) {
    errors.status = 'Status is required'
  }

  return errors
}

// Handle form submission
const handleSubmit = () => {
  // Clear previous errors
  Object.keys(formErrors).forEach(key => {
    formErrors[key as keyof typeof formErrors] = ''
  })

  // Validate form
  const errors = validateForm()
  if (Object.keys(errors).length > 0) {
    Object.assign(formErrors, errors)
    return
  }

  // Prepare record data
  const recordData: RecordFormData = {
    title: form.title.trim(),
    type: form.type,
    content: form.content.trim(),
    status: form.status,
    tags: form.tags,
    description: form.description.trim(),
    metadata: {
      tags: form.tags,
      description: form.description.trim()
    }
  }

  emit('submit', recordData)
}

// Handle delete
const handleDelete = () => {
  if (props.record?.id) {
    emit('delete', props.record.id)
  }
}

// Add tag
const addTag = (tag: string) => {
  if (tag && !form.tags.includes(tag)) {
    form.tags.push(tag)
  }
}

// Remove tag
const removeTag = (tag: string) => {
  const index = form.tags.indexOf(tag)
  if (index > -1) {
    form.tags.splice(index, 1)
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Form Fields -->
    <div class="grid grid-cols-1 gap-6">
      <!-- Title -->
      <UFormField label="Title" required :error="formErrors.title">
        <UInput 
          v-model="form.title" 
          placeholder="Enter record title"
          :disabled="saving"
        />
      </UFormField>

      <!-- Record Type -->
      <UFormField label="Record Type" required :error="formErrors.type">
        <USelectMenu 
          v-model="selectedRecordType"
          :items="recordTypeOptionsComputed"
          placeholder="Select record type"
          :disabled="saving || (props.recordType !== null)"
          class="w-full"
        />
      </UFormField>

      <!-- Status -->
      <UFormField label="Status" required :error="formErrors.status">
        <USelectMenu 
          v-model="selectedRecordStatus"
          :items="recordStatusOptionsComputed"
          placeholder="Select status"
          :disabled="saving"
          class="w-full"
        />
      </UFormField>

      <!-- Description -->
      <UFormField label="Description" :error="formErrors.description">
        <UTextarea 
          v-model="form.description" 
          placeholder="Enter record description (optional)"
          :disabled="saving"
          :rows="3"
        />
      </UFormField>

      <!-- Tags -->
      <UFormField label="Tags" :error="formErrors.tags">
        <div class="space-y-2">
          <UInput 
            v-model="newTag"
            placeholder="Add a tag and press Enter"
            :disabled="saving"
            @keyup.enter="addTag(newTag); newTag = ''"
          />
          <div v-if="form.tags.length > 0" class="flex flex-wrap gap-2">
            <UBadge 
              v-for="tag in form.tags" 
              :key="tag"
              color="primary"
              variant="soft"
              size="sm"
            >
              {{ tag }}
              <UButton 
                icon="i-lucide-x" 
                color="neutral"
                variant="ghost" 
                size="xs"
                @click="removeTag(tag)"
              />
            </UBadge>
          </div>
        </div>
      </UFormField>

      <!-- Content -->
      <UFormField label="Content" required :error="formErrors.content">
        <UTextarea 
          v-model="form.content" 
          placeholder="Enter record content"
          :disabled="saving"
          :rows="12"
          class="font-mono"
        />
      </UFormField>
    </div>

    <!-- Form Actions -->
    <div class="flex items-center justify-between pt-6 border-t">
      <div class="flex items-center space-x-4">
        <UButton 
          type="submit"
          color="primary"
          :loading="saving"
          :disabled="!isFormValid"
          @click="handleSubmit"
        >
          {{ isEditing ? 'Update Record' : 'Create Record' }}
        </UButton>
        
        <UButton 
          color="neutral"
          variant="outline"
          :disabled="saving"
          @click="$router.back()"
        >
          Cancel
        </UButton>
      </div>

      <!-- Delete Button (only for editing) -->
      <UButton 
        v-if="isEditing && canDelete"
        color="error"
        variant="outline"
        :disabled="saving"
        @click="handleDelete"
      >
        Delete Record
      </UButton>
    </div>

    <!-- Error Display -->
    <UAlert 
      v-if="error" 
      color="error" 
      variant="soft" 
      :title="error"
      icon="i-lucide-alert-circle" 
    />
  </div>
</template> 