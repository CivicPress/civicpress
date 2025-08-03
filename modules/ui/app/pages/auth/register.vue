<script setup lang="ts">
const authStore = useAuthStore()

const state = reactive({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    name: ''
})

const loading = ref(false)
const error = ref('')
const success = ref('')

// Password strength calculation
const passwordStrength = computed(() => {
    const password = state.password
    if (!password) return { score: 0, label: '', color: 'gray' }

    let score = 0
    const checks = {
        length: password.length >= 8,
        lowercase: /[a-z]/.test(password),
        uppercase: /[A-Z]/.test(password),
        numbers: /\d/.test(password),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    }

    score += checks.length ? 1 : 0
    score += checks.lowercase ? 1 : 0
    score += checks.uppercase ? 1 : 0
    score += checks.numbers ? 1 : 0
    score += checks.special ? 1 : 0

    if (score <= 1) return { score, label: 'Very Weak', color: 'red' }
    if (score <= 2) return { score, label: 'Weak', color: 'orange' }
    if (score <= 3) return { score, label: 'Fair', color: 'yellow' }
    if (score <= 4) return { score, label: 'Good', color: 'blue' }
    return { score, label: 'Strong', color: 'green' }
})

// Computed properties for form validation
const isFormValid = computed(() => {
    return (
        state.username.trim() !== '' &&
        state.password.trim() !== '' &&
        state.confirmPassword.trim() !== '' &&
        state.email.trim() !== '' &&
        state.password === state.confirmPassword &&
        passwordStrength.value.score >= 3 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)
    )
})

const isEmailValid = computed(() => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)
})

const doPasswordsMatch = computed(() => {
    return state.password === state.confirmPassword
})

// Handle form submission
const handleRegister = async () => {
    loading.value = true
    error.value = ''
    success.value = ''

    try {
        // Call the registration API
        const config = useRuntimeConfig()
        const response = await $fetch(`${config.public.civicApiUrl}/api/users/register`, {
            method: 'POST',
            body: {
                username: state.username,
                password: state.password,
                email: state.email,
                name: state.name || undefined
            }
        })

        if (response.success) {
            success.value = 'Registration successful! You can now sign in with your credentials.'
            // Clear form
            state.username = ''
            state.password = ''
            state.confirmPassword = ''
            state.email = ''
            state.name = ''

            // Redirect to login after a short delay
            setTimeout(() => {
                navigateTo('/auth/login')
            }, 2000)
        }
    } catch (err: any) {
        error.value = err.data?.error?.message || err.message || 'Registration failed'
    } finally {
        loading.value = false
    }
}

// Watch for auth errors
watch(() => authStore.authError, (newError) => {
    if (newError) {
        error.value = newError
    }
})
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar title="Register" />
        </template>

        <template #body>
            <div class="flex justify-center items-center h-full">
                <UCard class="w-full max-w-md">
                    <template #default>
                        <div class="space-y-6">
                            <div class="text-center">
                                <h2 class="text-2xl font-bold">Create Account</h2>
                                <p class="text-muted mt-2">
                                    Join CivicPress to manage your records and workflows.
                                </p>
                            </div>

                            <UForm :state="state" class="flex flex-col gap-4" @submit="handleRegister">
                                <UFormField label="Username" name="username" required>
                                    <UInput v-model="state.username" placeholder="Enter your username"
                                        :disabled="loading" autocomplete="username" class="w-full" />
                                </UFormField>

                                <UFormField label="Email" name="email" required>
                                    <UInput v-model="state.email" type="email" placeholder="Enter your email"
                                        :disabled="loading" autocomplete="email" class="w-full"
                                        :class="{ 'border-red-500': state.email && !isEmailValid }" />
                                    <template #help>
                                        <span v-if="state.email && !isEmailValid" class="text-red-500 text-sm">
                                            Please enter a valid email address
                                        </span>
                                    </template>
                                </UFormField>

                                <UFormField label="Full Name" name="name">
                                    <UInput v-model="state.name" placeholder="Enter your full name (optional)"
                                        :disabled="loading" autocomplete="name" class="w-full" />
                                </UFormField>

                                <UFormField label="Password" name="password" required>
                                    <UInput v-model="state.password" type="password" placeholder="Enter your password"
                                        :disabled="loading" autocomplete="new-password" class="w-full" />
                                    <!-- Password strength indicator -->
                                    <template #help>
                                        <div v-if="state.password" class="space-y-2">
                                            <div class="flex items-center gap-2">
                                                <div class="flex gap-1">
                                                    <div v-for="i in 5" :key="i" class="h-1 w-4 rounded" :class="{
                                                        'bg-gray-300': i > passwordStrength.score,
                                                        'bg-red-500': i <= passwordStrength.score && passwordStrength.color === 'red',
                                                        'bg-orange-500': i <= passwordStrength.score && passwordStrength.color === 'orange',
                                                        'bg-yellow-500': i <= passwordStrength.score && passwordStrength.color === 'yellow',
                                                        'bg-blue-500': i <= passwordStrength.score && passwordStrength.color === 'blue',
                                                        'bg-green-500': i <= passwordStrength.score && passwordStrength.color === 'green'
                                                    }"></div>
                                                </div>
                                                <span class="text-sm" :class="{
                                                    'text-red-500': passwordStrength.color === 'red',
                                                    'text-orange-500': passwordStrength.color === 'orange',
                                                    'text-yellow-500': passwordStrength.color === 'yellow',
                                                    'text-blue-500': passwordStrength.color === 'blue',
                                                    'text-green-500': passwordStrength.color === 'green'
                                                }">
                                                    {{ passwordStrength.label }}
                                                </span>
                                            </div>
                                            <div class="text-xs text-gray-500">
                                                Password must be at least 8 characters with uppercase, lowercase,
                                                numbers, and special characters
                                            </div>
                                        </div>
                                    </template>
                                </UFormField>

                                <UFormField label="Confirm Password" name="confirmPassword" required>
                                    <UInput v-model="state.confirmPassword" type="password"
                                        placeholder="Confirm your password" :disabled="loading"
                                        autocomplete="new-password" class="w-full"
                                        :class="{ 'border-red-500': state.confirmPassword && !doPasswordsMatch }" />
                                    <template #help>
                                        <span v-if="state.confirmPassword && !doPasswordsMatch"
                                            class="text-red-500 text-sm">
                                            Passwords do not match
                                        </span>
                                    </template>
                                </UFormField>

                                <UButton label="Create Account" type="submit" :loading="loading"
                                    :disabled="!isFormValid" variant="soft" class="self-end" />
                            </UForm>

                            <UAlert v-if="error" color="error" variant="soft" :title="error"
                                icon="i-lucide-alert-circle" />
                            <UAlert v-if="success" color="green" variant="soft" :title="success"
                                icon="i-lucide-check-circle" />
                        </div>
                    </template>

                    <!-- Footer Links -->
                    <template #footer>
                        <div class="text-center space-y-2">
                            <p class="text-sm text-gray-600">
                                Already have an account?
                                <NuxtLink to="/auth/login" class="text-primary hover:underline">
                                    Sign in
                                </NuxtLink>
                            </p>
                        </div>
                    </template>
                </UCard>
            </div>
        </template>
    </UDashboardPanel>
</template>