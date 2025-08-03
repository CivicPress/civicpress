<script setup lang="ts">
/**
 * HeaderActions Component
 * 
 * A responsive component that displays action buttons in page headers.
 * Shows buttons on desktop and a dropdown menu on mobile.
 * 
 * Usage Examples:
 * 
 * // Single action
 * <HeaderActions :actions="[
 *   { label: 'Create Record', icon: 'i-lucide-plus', to: '/records/new', color: 'primary' }
 * ]" />
 * 
 * // Multiple actions with conditions
 * <HeaderActions :actions="[
 *   { label: 'Add User', icon: 'i-lucide-plus', to: '/settings/users/new', color: 'primary', show: canManageUsers },
 *   { label: 'Export', icon: 'i-lucide-download', onClick: () => exportData(), color: 'neutral' }
 * ]" />
 */

interface ActionItem {
    label: string
    icon: string
    to?: string
    onClick?: () => void
    color?: 'primary' | 'neutral' | 'error'
    variant?: 'solid' | 'outline' | 'ghost' | 'soft'
    disabled?: boolean
    show?: boolean
}

interface Props {
    actions: ActionItem[]
    loading?: boolean
    disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    loading: false,
    disabled: false
})

// Filter and process actions
const processedActions = computed(() => {
    return props.actions
        .filter(action => action.show !== false) // Show by default unless explicitly false
        .map(action => ({
            ...action,
            disabled: action.disabled || props.loading || props.disabled,
            color: action.color || 'neutral',
            variant: action.variant || 'outline'
        }))
})

// Convert actions to dropdown format
const dropdownItems = computed(() => {
    return processedActions.value.map(action => ({
        label: action.label,
        icon: action.icon,
        onClick: action.onClick || (action.to ? () => navigateTo(action.to!) : undefined),
        disabled: action.disabled
    }))
})
</script>

<template>
    <!-- Desktop: Side-by-side buttons -->
    <div class="hidden md:flex gap-2">
        <UButton v-for="action in processedActions" :key="action.label" :color="action.color" :variant="action.variant"
            :icon="action.icon" :to="action.to" :disabled="action.disabled" @click="action.onClick">
            {{ action.label }}
        </UButton>
    </div>

    <!-- Mobile: Dropdown menu -->
    <div class="md:hidden">
        <UDropdownMenu :items="dropdownItems" :disabled="loading || disabled">
            <UButton color="neutral" variant="ghost" icon="i-lucide-more-vertical" />
        </UDropdownMenu>
    </div>
</template>