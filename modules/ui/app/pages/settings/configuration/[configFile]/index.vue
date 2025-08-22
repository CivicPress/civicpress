<template>
    <div>
        <h1>Configuration</h1>
        <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
                <h2 class="text-lg font-bold">Configuration File</h2>
                <p class="text-sm text-gray-500">{{ configurationFile }}</p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
const configurationFile = route.params.configurationFile as string
</script>