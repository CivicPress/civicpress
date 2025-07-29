<script setup lang="ts">
// Performance monitoring component
const props = defineProps<{
    enabled?: boolean
}>()

const metrics = ref({
    renderTime: 0,
    memoryUsage: 0,
    recordCount: 0,
    filterCount: 0
})

const isVisible = ref(false)

// Track render performance
const trackRenderTime = () => {
    const start = performance.now()

    nextTick(() => {
        const end = performance.now()
        metrics.value.renderTime = end - start
    })
}

// Track memory usage (if available)
const trackMemoryUsage = () => {
    if ('memory' in performance) {
        const memory = (performance as any).memory
        metrics.value.memoryUsage = memory.usedJSHeapSize / 1024 / 1024 // MB
    }
}

// Expose metrics for parent components
defineExpose({
    metrics,
    trackRenderTime,
    trackMemoryUsage
})

// Auto-track on mount if enabled
onMounted(() => {
    if (props.enabled) {
        isVisible.value = true
        trackRenderTime()
        trackMemoryUsage()
    }
})

// Watch for enabled prop changes
watch(() => props.enabled, (newValue) => {
    isVisible.value = newValue || false
})
</script>

<template>
    <div v-if="enabled && isVisible" class="fixed bottom-4 right-4 bg-gray-900 text-white p-3 rounded-lg text-xs z-50">
        <div class="space-y-1">
            <div>Render: {{ metrics.renderTime.toFixed(2) }}ms</div>
            <div v-if="metrics.memoryUsage > 0">Memory: {{ metrics.memoryUsage.toFixed(1) }}MB</div>
            <div>Records: {{ metrics.recordCount }}</div>
            <div>Filters: {{ metrics.filterCount }}</div>
        </div>
    </div>
</template>