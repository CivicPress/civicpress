<script setup lang="ts">
const router = useRouter();
</script>

<template>
    <div>
        <UButton @click="router.push('/auth/login')">Login</UButton>
    </div>
</template>
