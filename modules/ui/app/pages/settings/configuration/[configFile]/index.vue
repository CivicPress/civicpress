<template>
    <div class="py-12 text-center">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-600 mx-auto mb-3" />
        <p class="text-sm text-gray-600 dark:text-gray-400">Loading configuration editor…</p>
    </div>
</template>

<script setup lang="ts">
const route = useRoute()
const router = useRouter()

const configFile = route.params.configFile as string

onMounted(() => {
    // Redirect bare config route to the edit page
    router.replace(`/settings/configuration/${configFile}/edit`)
})
</script>