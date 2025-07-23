<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useAuthStore } from '~/stores'

interface Props {
    collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    collapsed: false
})

const authStore = useAuthStore()
const colorMode = useColorMode()

const generateAvatar = () => {

    if (authStore.currentUser?.avatar) {
        if (authStore.currentUser.avatar.includes('https://')) {
            return {
                src: authStore.currentUser.avatar,
                alt: authStore.currentUser.name
            }
        } else {
            return {
                alt: authStore.currentUser.name
            }
        }
    } else {
        if (authStore.currentUser?.name) {
            return {
                alt: authStore.currentUser.name
            }
        } else {
            return {
                alt: 'Guest'
            }
        }
    }
}

const items = computed<DropdownMenuItem[][]>(() => {
    const menuItems: DropdownMenuItem[][] = []

    // User info section (only if logged in)
    if (authStore.isLoggedIn && authStore.currentUser) {

        menuItems.push([{
            type: 'label',
            label: authStore.currentUser.name,
            avatar: generateAvatar()
        }])

        // Profile option (only if logged in)
        menuItems.push([{
            label: 'Profile',
            icon: 'i-lucide-user'
        }])
    }

    // Appearance section (always available)
    menuItems.push([{
        label: 'Appearance',
        icon: 'i-lucide-sun-moon',
        children: [{
            label: 'Light',
            icon: 'i-lucide-sun',
            type: 'checkbox',
            checked: colorMode.value === 'light',
            onSelect(e: Event) {
                e.preventDefault()
                colorMode.preference = 'light'
            }
        }, {
            label: 'Dark',
            icon: 'i-lucide-moon',
            type: 'checkbox',
            checked: colorMode.value === 'dark',
            onUpdateChecked(checked: boolean) {
                if (checked) {
                    colorMode.preference = 'dark'
                }
            },
            onSelect(e: Event) {
                e.preventDefault()
            }
        }]
    }])

    // Login/Logout options based on auth state
    if (authStore.isLoggedIn) {
        menuItems.push([{
            label: 'Log out',
            icon: 'i-lucide-log-out',
            onClick: () => navigateTo('/auth/logout')
        }])
    } else {
        menuItems.push([{
            label: 'Log in',
            icon: 'i-lucide-log-in',
            onClick: () => {
                navigateTo('/auth/login')
            }
        }])
    }

    return menuItems
})

</script>

<template>
    <UDropdownMenu :items="items" :content="{ align: 'center', collisionPadding: 12 }"
        :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }">
        <UButton v-bind="{
            label: collapsed ? undefined : authStore.currentUser?.name || 'Guest',
            avatar: generateAvatar(),
            trailingIcon: collapsed ? undefined : 'i-lucide-chevrons-up-down'
        }" color="neutral" variant="ghost" block :square="collapsed" class="data-[state=open]:bg-elevated" :ui="{
            trailingIcon: 'text-dimmed'
        }" />

        <!-- <template #chip-leading="{ item }">
            <span :style="{
                '--chip-light': `var(--color-${(item as any).chip}-500)`,
                '--chip-dark': `var(--color-${(item as any).chip}-400)`
            }" class="ms-0.5 size-2 rounded-full bg-(--chip-light) dark:bg-(--chip-dark)" />
        </template> -->
    </UDropdownMenu>
</template>