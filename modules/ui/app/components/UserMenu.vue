<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';

interface Props {
  collapsed?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false,
});

const authStore = useAuthStore();
const colorMode = useColorMode();

const generateAvatar = () => {
  if (authStore.currentUser?.avatar_url) {
    if (authStore.currentUser.avatar_url.includes('https://')) {
      return {
        src: authStore.currentUser.avatar_url,
        alt: authStore.currentUser.name,
      };
    } else {
      return {
        src: authStore.currentUser.avatar_url,
        alt: authStore.currentUser.name,
      };
    }
  } else {
    return {
      src: undefined,
      alt: authStore.currentUser?.name || 'User',
    };
  }
};

const items = computed<DropdownMenuItem[][]>(() => {
  const menuItems: DropdownMenuItem[][] = [];

  // User info section (only if logged in)
  if (authStore.isLoggedIn && authStore.currentUser) {
    menuItems.push([
      {
        type: 'label',
        label: authStore.currentUser.name,
        avatar: generateAvatar(),
      },
    ]);

    // Settings section (only if logged in)
    menuItems.push([
      {
        label: 'Settings',
        icon: 'i-lucide-settings',
        children: [
          {
            label: 'Overview',
            icon: 'i-lucide-home',
            onClick: () => navigateTo('/settings'),
          },
          {
            label: 'Profile',
            icon: 'i-lucide-user',
            onClick: () => navigateTo('/settings/profile'),
          },
          // Show Users when user has users:manage permission
          ...(authStore.hasPermission('users:manage')
            ? [
                {
                  label: 'Users',
                  icon: 'i-lucide-users',
                  onClick: () => navigateTo('/settings/users'),
                },
              ]
            : []),
          // Show Configuration when user has config:manage permission
          ...(authStore.hasPermission('config:manage')
            ? [
                {
                  label: 'Configurations',
                  icon: 'i-lucide-sliders-vertical',
                  onClick: () => navigateTo('/settings/configuration'),
                },
              ]
            : []),
          // Show Storage when user has storage:manage permission
          ...(authStore.hasPermission('storage:manage')
            ? [
                {
                  label: 'Storage',
                  icon: 'i-lucide-folder',
                  onClick: () => navigateTo('/settings/storage'),
                },
              ]
            : []),
          // Show Activity when user has system:admin permission
          ...(authStore.hasPermission('system:admin')
            ? [
                {
                  label: 'Activity Log',
                  icon: 'i-lucide-activity',
                  onClick: () => navigateTo('/settings/activity'),
                },
                {
                  label: 'Notifications',
                  icon: 'i-lucide-mail',
                  onClick: () => navigateTo('/settings/notifications'),
                },
              ]
            : []),
        ],
      },
    ]);
  }

  // Appearance section (always available)
  menuItems.push([
    {
      label: 'Appearance',
      icon: 'i-lucide-sun-moon',
      children: [
        {
          label: 'Light',
          icon: 'i-lucide-sun',
          type: 'checkbox',
          checked: colorMode.value === 'light',
          onSelect(e: Event) {
            e.preventDefault();
            colorMode.preference = 'light';
          },
        },
        {
          label: 'Dark',
          icon: 'i-lucide-moon',
          type: 'checkbox',
          checked: colorMode.value === 'dark',
          onUpdateChecked(checked: boolean) {
            if (checked) {
              colorMode.preference = 'dark';
            }
          },
          onSelect(e: Event) {
            e.preventDefault();
          },
        },
      ],
    },
  ]);

  // Login/Logout options based on auth state
  if (authStore.isLoggedIn) {
    menuItems.push([
      {
        label: 'Log out',
        icon: 'i-lucide-log-out',
        onClick: () => navigateTo('/auth/logout'),
      },
    ]);
  } else {
    menuItems.push([
      {
        label: 'Log in',
        icon: 'i-lucide-log-in',
        onClick: () => {
          navigateTo('/auth/login');
        },
      },
    ]);
  }

  return menuItems;
});
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{
      content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)',
    }"
  >
    <UButton
      v-bind="{
        label: collapsed ? undefined : authStore.currentUser?.name || 'Guest',
        avatar: generateAvatar(),
        trailingIcon: collapsed ? undefined : 'i-lucide-chevrons-up-down',
      }"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{
        trailingIcon: 'text-dimmed',
      }"
    />

    <!-- <template #chip-leading="{ item }">
            <span :style="{
                '--chip-light': `var(--color-${(item as any).chip}-500)`,
                '--chip-dark': `var(--color-${(item as any).chip}-400)`
            }" class="ms-0.5 size-2 rounded-full bg-(--chip-light) dark:bg-(--chip-dark)" />
        </template> -->
  </UDropdownMenu>
</template>
