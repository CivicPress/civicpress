<template>
  <UAvatar v-if="user.avatar_url && isValidAvatarUrl(user.avatar_url)" :src="user.avatar_url"
    :alt="user.name || user.username" :size="size" />
  <UAvatar v-else :alt="user.name || user.username" :size="size"
    class="bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400">
    {{ getUserInitials() }}
  </UAvatar>
</template>

<script setup lang="ts">
import type { User } from '~/types/user';

interface Props {
  user: User;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md'
});

const isValidAvatarUrl = (url: string): boolean => {
  return url.startsWith('http://') || url.startsWith('https://');
};

const getUserInitials = (): string => {
  const name = props.user.name || props.user.username;
  if (!name) return '?';

  const parts = name.split(' ');
  if (parts.length >= 2) {
    const firstPart = parts[0];
    const lastPart = parts[parts.length - 1];
    if (firstPart && lastPart && firstPart[0] && lastPart[0]) {
      return (firstPart[0] + lastPart[0]).toUpperCase();
    }
  }
  return name.substring(0, 2).toUpperCase();
};
</script>