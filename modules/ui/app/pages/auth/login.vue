<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

const authStore = useAuthStore()

const items = [
    {
        label: 'Username & Password',
        description: 'Sign in with your username and password.',
        icon: 'i-lucide-user',
        slot: 'credentials' as const
    },
    {
        label: 'GitHub Token',
        description: 'Sign in with your GitHub Personal Access Token.',
        icon: 'i-lucide-github',
        slot: 'token' as const
    }
] satisfies TabsItem[]

const state = reactive({
    username: '',
    password: '',
    gitToken: ''
})

const loading = ref(false)
const error = ref('')

// Computed properties for form validation
const isCredentialsValid = computed(() => {
    return state.username.trim() !== '' && state.password.trim() !== ''
})

const isTokenValid = computed(() => {
    return state.gitToken.trim() !== ''
})

// Handle form submission
const handleCredentialsLogin = async () => {
    loading.value = true
    error.value = ''

    try {
        await authStore.login(state.username, state.password)
        // Redirect to dashboard on success
        await navigateTo('/')
    } catch (err: any) {
        error.value = err.message || 'Login failed'
    } finally {
        loading.value = false
    }
}

const handleTokenLogin = async () => {
    loading.value = true
    error.value = ''

    try {
        await authStore.loginWithToken(state.gitToken)
        // Redirect to dashboard on success
        await navigateTo('/')
    } catch (err: any) {
        error.value = err.message || 'Login failed'
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
            <UDashboardNavbar title="Login" />
        </template>

        <template #body>
            <div class="flex justify-center items-center h-full">
                <UCard class="w-full max-w-md">
                    <template #default>
                        <UTabs :items="items" variant="link" :ui="{ trigger: 'grow' }" class="gap-4 w-full min-h-80">
                            <template #credentials="{ item }">
                                <p class="text-muted mb-4">
                                    {{ item.description }}
                                </p>

                                <UForm :state="state" class="flex flex-col gap-4" @submit="handleCredentialsLogin">
                                    <UFormField label="Username" name="username" required>
                                        <UInput v-model="state.username" placeholder="Enter your username"
                                            :disabled="loading" autocomplete="username" class="w-full" />
                                    </UFormField>

                                    <UFormField label="Password" name="password" required>
                                        <UInput v-model="state.password" type="password"
                                            placeholder="Enter your password" :disabled="loading"
                                            autocomplete="current-password" class="w-full" />
                                    </UFormField>

                                    <UButton label="Sign in" type="submit" :loading="loading"
                                        :disabled="!isCredentialsValid" variant="soft" class="self-end" />
                                </UForm>
                            </template>



                            <template #token="{ item }">
                                <p class="text-muted mb-4">
                                    {{ item.description }}
                                </p>



                                <UForm :state="state" class="flex flex-col gap-4" @submit="handleTokenLogin">
                                    <UFormField label="GitHub Personal Access Token" name="gitToken" required>
                                        <UInput v-model="state.gitToken" type="password"
                                            placeholder="Enter your GitHub token" :disabled="loading" autocomplete="off"
                                            class="w-full" />
                                    </UFormField>

                                    <UAlert color="primary" variant="soft" title="GitHub Token Required"
                                        description="You need a GitHub Personal Access Token with appropriate permissions to access CivicPress."
                                        icon="i-lucide-info" />

                                    <UButton label="Sign in" type="submit" :loading="loading" :disabled="!isTokenValid"
                                        variant="soft" class="self-end" />
                                </UForm>
                            </template>
                        </UTabs>

                        <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-alert-circle" />
                    </template>

                    <!-- Footer Links -->
                    <template #footer>
                        <div class="text-center space-y-2">
                            <p class="text-sm text-gray-600">
                                Don't have an account?
                                <NuxtLink to="/auth/register" class="text-primary hover:underline">
                                    Create one
                                </NuxtLink>
                            </p>
                            <p class="text-sm text-gray-600">
                                <NuxtLink to="/auth/forgot-password" class="text-primary hover:underline">
                                    Forgot your password?
                                </NuxtLink>
                            </p>
                        </div>
                    </template>
                </UCard>
            </div>
        </template>
    </UDashboardPanel>
</template>