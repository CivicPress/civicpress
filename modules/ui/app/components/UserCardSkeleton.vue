<template>
    <UCard class="animate-pulse">
        <div class="flex items-center gap-4">
            <!-- Avatar skeleton -->
            <div class="flex-shrink-0">
                <div class="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700"></div>
            </div>

            <!-- Content skeleton -->
            <div class="flex-1 min-w-0">
                <!-- Name skeleton -->
                <div class="flex items-center gap-2 mb-1">
                    <div class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                    <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                </div>

                <!-- Email skeleton -->
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-2"></div>

                <!-- Role and date skeleton -->
                <div class="flex items-center gap-2">
                    <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                    <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                </div>
            </div>

            <!-- Actions skeleton -->
            <div class="flex-shrink-0">
                <div class="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
        </div>
    </UCard>
</template>

<script setup lang="ts">
// No props needed for skeleton component
</script>