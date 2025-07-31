<template>
    <UCard>
        <template #header>
            <h3 class="text-lg font-semibold">{{ isEditing ? 'Edit User Information' : 'New User Information' }}</h3>
        </template>

        <form @submit.prevent="handleSubmit" class="space-y-6">
            <!-- Error message -->
            <UAlert v-if="error" :title="error" color="error" variant="soft" />

            <!-- Username -->
            <UFormField label="Username" description="Enter a unique username" :hint="isEditing ? '' : 'Required'"
                help="Username must be unique and cannot be changed after creation." size="xl"
                :error="formErrors.username">
                <UInput v-model="form.username" placeholder="Enter username" :error="formErrors.username"
                    :disabled="isEditing" />
            </UFormField>

            <!-- Email -->
            <UFormField label="Email" description="Enter the user's email address" hint="Required"
                help="Email is used for login and notifications." size="xl" :error="formErrors.email">
                <UInput v-model="form.email" type="email" placeholder="user@example.com" :error="formErrors.email" />
            </UFormField>

            <!-- Name -->
            <UFormField label="Full Name" description="Enter the user's full name" hint="Optional"
                help="If left empty, the username will be used as the display name." size="xl" :error="formErrors.name">
                <UInput v-model="form.name" placeholder="Full Name" :error="formErrors.name" />
            </UFormField>

            <!-- Role -->
            <UFormField label="Role" description="Select a role" hint="Required"
                help="The role will define the user's permissions and access to the system." size="xl"
                :error="formErrors.role">
                <USelectMenu v-model="selectedRole" :items="roleOptions" placeholder="Select a role"
                    :loading="rolesLoading" :error="formErrors.role" class="w-full sm:w-48" />
            </UFormField>


            <!-- Password (optional for editing) -->
            <USeparator />


            <UFormField :label="isEditing ? 'Change your password' : 'Password'"
                :description="isEditing ? 'Enter a new password or leave blank to keep current' : 'Enter a secure password'"
                :hint="isEditing ? '' : 'Required'" help="Password must be at least 8 characters long." size="xl"
                :error="formErrors.password">
                <div class="flex gap-2">
                    <UInput v-model="form.password" :type="showPassword ? 'text' : 'password'"
                        :placeholder="isEditing ? 'Leave blank to keep current password' : 'Enter password'"
                        :error="formErrors.password" class="flex-1" :ui="{ trailing: 'pe-1' }">
                        <template #trailing>
                            <UButton color="neutral" variant="link" size="sm"
                                :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                                :aria-label="showPassword ? 'Hide password' : 'Show password'"
                                :aria-pressed="showPassword" aria-controls="password"
                                @click="showPassword = !showPassword" />
                        </template>
                    </UInput>
                    <UButton @click="generatePassword" icon="i-lucide-refresh-cw" variant="outline" size="sm"
                        :disabled="saving">
                        Generate
                    </UButton>
                </div>
            </UFormField>

            <UFormField :label="isEditing ? 'Confirm New Password' : 'Confirm Password'"
                :description="isEditing ? 'Confirm the new password' : 'Confirm your password'"
                help="Please confirm your password to ensure it's entered correctly."
                :error="formErrors.confirmPassword">
                <UInput v-model="form.confirmPassword" :type="showPassword ? 'text' : 'password'"
                    :placeholder="isEditing ? 'Confirm new password' : 'Confirm password'"
                    :error="formErrors.confirmPassword" />
            </UFormField>


            <!-- Submit button -->
            <div class="flex justify-between gap-3 pt-6 border-t">
                <div>


                    <!-- Delete Confirmation Modal -->
                    <UModal v-model="showDeleteModal" :title="'Delete User'"
                        :description="'Are you sure you want to delete this user? This action cannot be undone.'">

                        <UButton v-if="canDelete" icon="i-lucide-trash-2" color="error" variant="outline"
                            :loading="saving" :disabled="!canManageUsers">
                            Delete User
                        </UButton>

                        <template #footer="{ close }">
                            <div class="flex gap-2">
                                <UButton color="neutral" label="Cancel" @click="close" />
                                <UButton color="error" label="Delete User" @click="handleDelete" />
                            </div>
                        </template>
                    </UModal>

                </div>
                <div class="flex gap-3">
                    <UButton to="/settings/users" variant="outline">
                        Cancel
                    </UButton>
                    <UButton type="submit" color="primary" :loading="saving" :disabled="!canManageUsers">
                        {{ isEditing ? 'Update User' : 'Create User' }}
                    </UButton>
                </div>
            </div>
        </form>
    </UCard>
</template>

<script setup lang="ts">
import type { User } from '~/types/user'

// Props
interface Props {
    user?: User | null
    isEditing?: boolean
    error?: string
    saving?: boolean
    canDelete?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    user: null,
    isEditing: false,
    error: '',
    saving: false,
    canDelete: false
})

// Emits
const emit = defineEmits<{
    submit: [formData: any]
    delete: []
}>()

// Composables
const { $civicApi } = useNuxtApp()
const authStore = useAuthStore()

// User roles composable
const {
    roles,
    loading: rolesLoading,
    fetchRoles,
    getRoleDisplayName,
    roleOptions
} = useUserRoles()

// Reactive state
const formErrors = ref<Record<string, string>>({})
const showPassword = ref(false)
const showDeleteModal = ref(false)

// Form data
const form = ref({
    username: '',
    email: '',
    name: '',
    role: '',
    password: '',
    confirmPassword: ''
})

// Selected role for USelectMenu
const selectedRole = computed({
    get: () => roleOptions.value.find(role => role.value === form.value.role),
    set: (role) => {
        if (role) {
            form.value.role = role.value
        }
    }
})

// Computed properties
const canManageUsers = computed(() => {
    return authStore.currentUser?.role === 'admin'
})

// Validate form
const validateForm = () => {
    formErrors.value = {}

    // Required fields for new users
    if (!props.isEditing) {
        if (!form.value.username.trim()) {
            formErrors.value.username = 'Username is required'
        }

        if (!form.value.role) {
            formErrors.value.role = 'Role is required'
        }

        if (!form.value.password) {
            formErrors.value.password = 'Password is required'
        }
    }

    // Email validation (required for all users)
    if (!form.value.email.trim()) {
        formErrors.value.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) {
        formErrors.value.email = 'Please enter a valid email address'
    }

    // Password validation if provided
    if (form.value.password) {
        if (form.value.password.length < 8) {
            formErrors.value.password = 'Password must be at least 8 characters'
        }

        if (!form.value.confirmPassword) {
            formErrors.value.confirmPassword = 'Please confirm your password'
        } else if (form.value.password !== form.value.confirmPassword) {
            formErrors.value.confirmPassword = 'Passwords do not match'
        }
    }

    return Object.keys(formErrors.value).length === 0
}

// Handle form submission
const handleSubmit = () => {
    // Clear previous form errors
    formErrors.value = {}

    // Validate form
    if (!validateForm()) {
        return
    }

    // Prepare form data
    const formData: any = {
        email: form.value.email,
        name: form.value.name,
        role: form.value.role
    }

    // Only include password if provided
    if (form.value.password) {
        formData.password = form.value.password
    }

    // Include username for new users
    if (!props.isEditing) {
        formData.username = form.value.username
    }

    // Emit the form data
    emit('submit', formData)
}

// Handle delete confirmation
const handleDelete = () => {
    emit('delete')
    showDeleteModal.value = false
}

// Generate random strong password
const generatePassword = () => {
    const length = 16
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let password = ''

    // Ensure at least one of each character type
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)] // uppercase
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)] // lowercase
    password += '0123456789'[Math.floor(Math.random() * 10)] // number
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)] // special char

    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
        password += charset[Math.floor(Math.random() * charset.length)]
    }

    // Shuffle the password
    password = password.split('').sort(() => Math.random() - 0.5).join('')

    form.value.password = password
    form.value.confirmPassword = password
}

// Initialize form with user data
const initializeForm = () => {
    if (props.user) {
        form.value = {
            username: props.user.username,
            email: props.user.email || '',
            name: props.user.name || '',
            role: props.user.role,
            password: '',
            confirmPassword: ''
        }
    }
}

// Watch for user changes
watch(() => props.user, initializeForm, { immediate: true })

// On mounted
onMounted(async () => {
    await fetchRoles()
})
</script>