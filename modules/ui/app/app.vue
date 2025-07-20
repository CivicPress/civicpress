<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <!-- Header -->
    <UHeader class="bg-white/80 backdrop-blur-sm border-b border-gray-200 shadow-sm">
      <template #left>
        <div class="flex items-center space-x-4">
          <div class="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg">
            <UIcon name="i-heroicons-building-library" class="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 class="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              CivicPress
            </h1>
            <p class="text-sm text-gray-600">Governance Platform</p>
          </div>
        </div>
      </template>
      
      <template #right>
        <div class="flex items-center space-x-3">
          <UButton
            icon="i-heroicons-magnifying-glass"
            color="gray"
            variant="ghost"
            size="sm"
            aria-label="Search"
          />
          <UButton
            icon="i-heroicons-bell"
            color="gray"
            variant="ghost"
            size="sm"
            aria-label="Notifications"
          />
          <UAvatar
            src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
            alt="User"
            size="sm"
          />
        </div>
      </template>
    </UHeader>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8">
      <div class="max-w-6xl mx-auto">
        <!-- Hero Section -->
        <div class="text-center mb-12">
          <h2 class="text-4xl font-bold text-gray-900 mb-4">
            Welcome to <span class="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">CivicPress</span>
          </h2>
          <p class="text-xl text-gray-600 max-w-2xl mx-auto">
            A modern governance platform for managing civic records, policies, and public information with transparency and efficiency.
          </p>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <UCard class="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <div class="flex items-center space-x-4">
              <div class="p-3 bg-blue-100 rounded-lg">
                <UIcon name="i-heroicons-document-text" class="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900">1,247</p>
                <p class="text-sm text-gray-600">Active Records</p>
              </div>
            </div>
          </UCard>
          
          <UCard class="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <div class="flex items-center space-x-4">
              <div class="p-3 bg-green-100 rounded-lg">
                <UIcon name="i-heroicons-user-group" class="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900">89</p>
                <p class="text-sm text-gray-600">Active Users</p>
              </div>
            </div>
          </UCard>
          
          <UCard class="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <div class="flex items-center space-x-4">
              <div class="p-3 bg-purple-100 rounded-lg">
                <UIcon name="i-heroicons-clock" class="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900">24/7</p>
                <p class="text-sm text-gray-600">Uptime</p>
              </div>
            </div>
          </UCard>
          
          <UCard class="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <div class="flex items-center space-x-4">
              <div class="p-3 bg-orange-100 rounded-lg">
                <UIcon name="i-heroicons-shield-check" class="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900">100%</p>
                <p class="text-sm text-gray-600">Secure</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Feature Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <UCard class="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <template #header>
              <div class="flex items-center space-x-3">
                <div class="p-2 bg-blue-100 rounded-lg">
                  <UIcon name="i-heroicons-document-text" class="w-5 h-5 text-blue-600" />
                </div>
                <h3 class="font-semibold text-lg">Records Management</h3>
              </div>
            </template>
            <p class="text-gray-600 mb-4">
              Browse, search, and manage civic records with advanced filtering and categorization.
            </p>
            <div class="space-y-2">
              <div class="flex items-center space-x-2 text-sm text-gray-600">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
                <span>Advanced search</span>
              </div>
              <div class="flex items-center space-x-2 text-sm text-gray-600">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
                <span>Version control</span>
              </div>
              <div class="flex items-center space-x-2 text-sm text-gray-600">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
                <span>Export capabilities</span>
              </div>
            </div>
          </UCard>
          
          <UCard class="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <template #header>
              <div class="flex items-center space-x-3">
                <div class="p-2 bg-green-100 rounded-lg">
                  <UIcon name="i-heroicons-user-group" class="w-5 h-5 text-green-600" />
                </div>
                <h3 class="font-semibold text-lg">User Management</h3>
              </div>
            </template>
            <p class="text-gray-600 mb-4">
              Manage user accounts, roles, and permissions with granular access control.
            </p>
            <div class="space-y-2">
              <div class="flex items-center space-x-2 text-sm text-gray-600">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
                <span>Role-based access</span>
              </div>
              <div class="flex items-center space-x-2 text-sm text-gray-600">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
                <span>Audit trails</span>
              </div>
              <div class="flex items-center space-x-2 text-sm text-gray-600">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
                <span>SSO integration</span>
              </div>
            </div>
          </UCard>
          
          <UCard class="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <template #header>
              <div class="flex items-center space-x-3">
                <div class="p-2 bg-purple-100 rounded-lg">
                  <UIcon name="i-heroicons-cog-6-tooth" class="w-5 h-5 text-purple-600" />
                </div>
                <h3 class="font-semibold text-lg">System Settings</h3>
              </div>
            </template>
            <p class="text-gray-600 mb-4">
              Configure system settings, themes, and integrations with ease.
            </p>
            <div class="space-y-2">
              <div class="flex items-center space-x-2 text-sm text-gray-600">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
                <span>Custom themes</span>
              </div>
              <div class="flex items-center space-x-2 text-sm text-gray-600">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
                <span>API management</span>
              </div>
              <div class="flex items-center space-x-2 text-sm text-gray-600">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
                <span>Backup & restore</span>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Quick Actions -->
        <UCard class="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Quick Actions</h3>
              <UBadge color="blue" variant="soft">New</UBadge>
            </div>
          </template>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <UButton
              icon="i-heroicons-magnifying-glass"
              color="blue"
              variant="soft"
              size="lg"
              block
              class="h-16"
            >
              <div class="text-center">
                <div class="font-medium">Search Records</div>
                <div class="text-xs text-gray-500">Find what you need</div>
              </div>
            </UButton>
            
            <UButton
              icon="i-heroicons-plus-circle"
              color="green"
              variant="soft"
              size="lg"
              block
              class="h-16"
            >
              <div class="text-center">
                <div class="font-medium">Create Record</div>
                <div class="text-xs text-gray-500">Add new content</div>
              </div>
            </UButton>
            
            <UButton
              icon="i-heroicons-user-plus"
              color="purple"
              variant="soft"
              size="lg"
              block
              class="h-16"
            >
              <div class="text-center">
                <div class="font-medium">Add User</div>
                <div class="text-xs text-gray-500">Invite team member</div>
              </div>
            </UButton>
            
            <UButton
              icon="i-heroicons-cog-6-tooth"
              color="gray"
              variant="soft"
              size="lg"
              block
              class="h-16"
            >
              <div class="text-center">
                <div class="font-medium">Settings</div>
                <div class="text-xs text-gray-500">Configure system</div>
              </div>
            </UButton>
          </div>
        </UCard>
      </div>
    </main>

    <!-- Footer -->
    <UFooter class="bg-white/80 backdrop-blur-sm border-t border-gray-200 mt-16">
      <template #left>
        <div class="flex items-center space-x-4">
          <div class="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg">
            <UIcon name="i-heroicons-building-library" class="w-5 h-5 text-white" />
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900">CivicPress</p>
            <p class="text-xs text-gray-500">© 2025 All rights reserved</p>
          </div>
        </div>
      </template>
      
      <template #right>
        <div class="flex items-center space-x-4">
          <UButton
            icon="i-heroicons-question-mark-circle"
            color="gray"
            variant="ghost"
            size="sm"
          >
            Help
          </UButton>
          <UButton
            icon="i-heroicons-information-circle"
            color="gray"
            variant="ghost"
            size="sm"
          >
            About
          </UButton>
          <UButton
            icon="i-heroicons-envelope"
            color="gray"
            variant="ghost"
            size="sm"
          >
            Contact
          </UButton>
        </div>
      </template>
    </UFooter>
  </div>
</template>

<script setup>
// This will be our main app layout
// We'll add more functionality as we build the pages
</script>
