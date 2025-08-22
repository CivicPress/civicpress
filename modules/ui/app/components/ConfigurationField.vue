<template>
    <div class="border rounded-lg p-6 bg-white dark:bg-gray-800">
        <div class="flex items-start justify-between mb-4">
            <div class="flex-1">
                <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-1">
                    {{ fieldLabel }}
                </h4>
                <p v-if="field.description" class="text-sm text-gray-600 dark:text-gray-400">
                    {{ field.description }}
                </p>
            </div>
            <UBadge v-if="field.required" color="error" variant="soft" size="sm">
                Required
            </UBadge>
        </div>

        <!-- Dynamic form field based on type -->
        <div class="space-y-4">
            <!-- String input -->
            <UFormField v-if="fieldType === 'string'" :label="fieldLabel" :description="field.description">
                <UInput :model-value="value" :placeholder="getPlaceholder(field)" :type="getInputType(field)"
                    @update:model-value="updateValue" />
            </UFormField>

            <!-- Textarea -->
            <UFormField v-else-if="fieldType === 'textarea'" :label="fieldLabel" :description="field.description">
                <UTextarea :model-value="value" :placeholder="getPlaceholder(field)" :rows="3"
                    @update:model-value="updateValue" />
            </UFormField>

            <!-- Number input -->
            <UFormField v-else-if="fieldType === 'number'" :label="fieldLabel" :description="field.description">
                <UInput :model-value="value" type="number" :placeholder="getPlaceholder(field)"
                    @update:model-value="updateValue" />
            </UFormField>

            <!-- Boolean checkbox -->
            <UFormField v-else-if="fieldType === 'boolean'" :label="fieldLabel" :description="field.description">
                <UCheckbox :model-value="value" @update:model-value="updateValue" />
            </UFormField>

            <!-- Array/Select -->
            <UFormField v-else-if="fieldType === 'array'" :label="fieldLabel" :description="field.description">
                <USelect :model-value="value" :options="getSelectOptions(field)" :placeholder="getPlaceholder(field)"
                    @update:model-value="updateValue" />
            </UFormField>

            <!-- URL input -->
            <UFormField v-else-if="fieldType === 'url'" :label="fieldLabel" :description="field.description">
                <UInput :model-value="value" type="url" :placeholder="getPlaceholder(field)"
                    @update:model-value="updateValue" />
            </UFormField>

            <!-- Email input -->
            <UFormField v-else-if="fieldType === 'email'" :label="fieldLabel" :description="field.description">
                <UInput :model-value="value" type="email" :placeholder="getPlaceholder(field)"
                    @update:model-value="updateValue" />
            </UFormField>

            <!-- Phone input -->
            <UFormField v-else-if="fieldType === 'phone'" :label="fieldLabel" :description="field.description">
                <UInput :model-value="value" type="tel" :placeholder="getPlaceholder(field)"
                    @update:model-value="updateValue" />
            </UFormField>

            <!-- Default to string input -->
            <UFormField v-else :label="fieldLabel" :description="field.description">
                <UInput :model-value="value" :placeholder="getPlaceholder(field)" @update:model-value="updateValue" />
            </UFormField>
        </div>

        <!-- Field hint -->
        <div v-if="getFieldHint(field)" class="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {{ getFieldHint(field) }}
        </div>
    </div>
</template>

<script setup lang="ts">
interface Props {
    fieldKey: string
    field: any
    value: any
}

const props = defineProps<Props>()
const emit = defineEmits<{
    update: [key: string, value: any]
}>()

// Computed properties
const fieldLabel = computed(() => {
    // Convert snake_case to Title Case
    return props.fieldKey
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
})

const fieldType = computed(() => {
    if (!props.field.type) return 'string'

    const type = props.field.type
    if (type.startsWith('string:')) {
        return type.split(':')[1] // e.g., 'string:textarea' -> 'textarea'
    }

    return type
})

// Helper functions
const getPlaceholder = (field: any) => {
    if (field.placeholder) return field.placeholder

    // Generate placeholder based on field type
    switch (fieldType.value) {
        case 'email':
            return 'Enter email address'
        case 'url':
            return 'https://example.com'
        case 'phone':
            return '+1 (555) 123-4567'
        case 'textarea':
            return 'Enter description...'
        default:
            return `Enter ${fieldLabel.value.toLowerCase()}`
    }
}

const getInputType = (field: any) => {
    if (field.type && field.type.startsWith('string:')) {
        const subtype = field.type.split(':')[1]
        switch (subtype) {
            case 'email':
                return 'email'
            case 'url':
                return 'url'
            case 'phone':
                return 'tel'
            default:
                return 'text'
        }
    }
    return 'text'
}

const getSelectOptions = (field: any) => {
    if (field.options && Array.isArray(field.options)) {
        return field.options.map((option: any) => ({
            label: option.label || option.value,
            value: option.value
        }))
    }
    return []
}

const getFieldHint = (field: any) => {
    if (field.hint) return field.hint

    // Generate hints based on field type
    switch (fieldType.value) {
        case 'url':
            return 'Include https:// for external links'
        case 'email':
            return 'Enter a valid email address'
        case 'phone':
            return 'Include country code if international'
        default:
            return null
    }
}

// Event handlers
const updateValue = (newValue: any) => {
    emit('update', props.fieldKey, newValue)
}
</script>
