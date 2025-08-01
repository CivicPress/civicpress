<script setup lang="ts">
const authStore = useAuthStore()

const setMockUser = () => {
    authStore.setMockUser()
    navigateTo('/records')
}

const clearAuth = () => {
    authStore.clearAuth()
}
</script>

<template>
    <UDashboardPanel>
        <template #header>
            <UDashboardNavbar title="Development Setup" />
        </template>

        <template #body>
            <div class="space-y-6">
                <UCard>
                    <template #header>
                        <h3 class="text-lg font-semibold">Development Authentication</h3>
                    </template>

                    <template #body>
                        <div class="space-y-4">
                            <p class="text-gray-600">
                                This page helps set up authentication for development. Use these buttons to manage your
                                auth state.
                            </p>

                            <div class="flex gap-4">
                                <UButton @click="setMockUser" color="primary">
                                    Set Mock User (Admin)
                                </UButton>

                                <UButton @click="clearAuth" color="neutral" variant="outline">
                                    Clear Auth
                                </UButton>
                            </div>

                            <div class="mt-4 p-4 bg-gray-50 rounded-lg">
                                <h4 class="font-semibold mb-2">Current Auth State:</h4>
                                <pre class="text-sm">{{ authStore.$state }}</pre>
                            </div>
                        </div>
                    </template>
                </UCard>
            </div>
        </template>
    </UDashboardPanel>
</template>