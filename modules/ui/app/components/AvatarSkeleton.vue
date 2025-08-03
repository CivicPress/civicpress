<template>
    <div :class="[
        'animate-pulse rounded-full bg-gray-200 dark:bg-gray-700',
        sizeClasses[size] || 'w-8 h-8'
    ]">
    </div>
</template>

<script setup lang="ts">
interface Props {
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const props = withDefaults(defineProps<Props>(), {
    size: 'md'
});

const sizeClasses = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
};
</script>