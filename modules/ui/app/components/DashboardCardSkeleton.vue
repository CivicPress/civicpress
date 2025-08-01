<template>
    <UCard class="animate-pulse">
        <template #header>
            <div class="flex items-center gap-2">
                <div class="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
            </div>
        </template>

        <div class="space-y-3">
            <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
        </div>
    </UCard>
</template>

<script setup lang="ts">
// No props needed for skeleton component
</script>