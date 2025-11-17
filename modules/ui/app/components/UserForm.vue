<template>
  <form @submit.prevent="handleSubmit" class="space-y-6">
    <!-- Username Field -->
    <UFormField
      label="Username"
      :description="
        isEditing
          ? 'Username cannot be changed after creation'
          : 'Choose a unique username for this user'
      "
      :hint="isEditing ? 'Read-only field' : 'Must be unique across the system'"
      :help-text="
        isEditing
          ? 'Username is permanent and cannot be modified'
          : 'Use lowercase letters, numbers, and hyphens only'
      "
    >
      <UInput
        v-model="form.username"
        :placeholder="isEditing ? user?.username : 'Enter username'"
        :disabled="isEditing"
        :error="formErrors.username"
        required
      />
      <!-- Validation error display -->
      <div v-if="formErrors.username" class="text-red-500 text-sm mt-1">
        {{ formErrors.username }}
      </div>
    </UFormField>

    <!-- Email Field -->
    <UFormField
      label="Email Address"
      description="Primary contact email for this user"
      hint="Used for login and notifications"
      help-text="Must be a valid email address"
    >
      <UInput
        v-model="form.email"
        type="email"
        placeholder="Enter email address"
        :error="formErrors.email"
        required
      />
      <!-- Validation error display -->
      <div v-if="formErrors.email" class="text-red-500 text-sm mt-1">
        {{ formErrors.email }}
      </div>
    </UFormField>

    <!-- Full Name Field -->
    <UFormField
      label="Full Name"
      description="User's full name (optional)"
      hint="Will use username if not provided"
      help-text="Display name shown throughout the system"
    >
      <UInput
        v-model="form.name"
        placeholder="Enter full name (optional)"
        :error="formErrors.name"
      />
    </UFormField>

    <!-- Role Field -->
    <UFormField
      label="Role"
      description="User's role and permissions"
      hint="Determines access level and capabilities"
      help-text="Role cannot be changed after creation"
    >
      <USelectMenu
        v-model="roleOptionsSelect"
        :items="roleOptions"
        placeholder="Select a role"
        :error="formErrors.role"
        :loading="rolesLoading"
        required
        class="w-full sm:w-48"
      />
      <!-- Validation error display -->
      <div v-if="formErrors.role" class="text-red-500 text-sm mt-1">
        {{ formErrors.role }}
      </div>

      <!-- <USelectMenu v-model="selectedRecordStatuses" :items="recordStatusOptionsComputed" multiple
                :loading="recordStatusesLoading" placeholder="Select Record Statuses" class="w-full sm:w-48"> -->
    </UFormField>

    <!-- External Auth Warning -->
    <div
      v-if="isEditing && !userCanSetPassword"
      class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md"
    >
      <div class="flex">
        <UIcon
          name="i-lucide-info"
          class="w-5 h-5 text-blue-400 flex-shrink-0"
        />
        <div class="ml-3">
          <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200">
            External Authentication
          </h4>
          <p class="text-sm text-blue-700 dark:text-blue-300 mt-1">
            This user is authenticated via {{ userAuthProviderDisplay }}.
            Password management is handled by the external provider.
          </p>
        </div>
      </div>
    </div>

    <!-- Password Fields (only for new users or when changing password, and user can set password) -->
    <template v-if="userCanSetPassword && (!isEditing || showPasswordFields)">
      <UFormField
        label="Password"
        :description="
          isEditing
            ? 'Enter new password to change'
            : 'Create a secure password'
        "
        hint="Minimum 8 characters, include numbers and symbols"
        help-text="Password must be at least 8 characters long"
      >
        <div class="flex space-x-2">
          <UInput
            v-model="form.password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Enter password"
            :error="formErrors.password"
            class="flex-1"
            required
          />
          <UButton
            type="button"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            size="sm"
            @click="generatePassword"
            title="Generate secure password"
          />
          <UButton
            type="button"
            :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            color="neutral"
            variant="outline"
            size="sm"
            @click="showPassword = !showPassword"
            :title="showPassword ? 'Hide password' : 'Show password'"
          />
        </div>
        <!-- Validation error display -->
        <div v-if="formErrors.password" class="text-red-500 text-sm mt-1">
          {{ formErrors.password }}
        </div>
        <!-- Password strength indicator -->
        <template #help>
          <div v-if="form.password" class="space-y-2">
            <div class="flex items-center gap-2">
              <div class="flex gap-1">
                <div
                  v-for="i in 5"
                  :key="i"
                  class="h-1 w-4 rounded"
                  :class="{
                    'bg-gray-300': i > passwordStrength.score,
                    'bg-red-500':
                      i <= passwordStrength.score &&
                      passwordStrength.color === 'red',
                    'bg-orange-500':
                      i <= passwordStrength.score &&
                      passwordStrength.color === 'orange',
                    'bg-yellow-500':
                      i <= passwordStrength.score &&
                      passwordStrength.color === 'yellow',
                    'bg-blue-500':
                      i <= passwordStrength.score &&
                      passwordStrength.color === 'blue',
                    'bg-green-500':
                      i <= passwordStrength.score &&
                      passwordStrength.color === 'green',
                  }"
                ></div>
              </div>
              <span
                class="text-sm"
                :class="{
                  'text-red-500': passwordStrength.color === 'red',
                  'text-orange-500': passwordStrength.color === 'orange',
                  'text-yellow-500': passwordStrength.color === 'yellow',
                  'text-blue-500': passwordStrength.color === 'blue',
                  'text-green-500': passwordStrength.color === 'green',
                }"
              >
                {{ passwordStrength.label }}
              </span>
            </div>
            <div class="text-xs text-gray-500">
              Password must be at least 8 characters with uppercase, lowercase,
              numbers, and special characters
            </div>
          </div>
        </template>
      </UFormField>

      <UFormField
        label="Confirm Password"
        description="Re-enter the password to confirm"
        hint="Must match the password above"
        help-text="Passwords must match exactly"
      >
        <UInput
          v-model="form.confirmPassword"
          :type="showPassword ? 'text' : 'password'"
          placeholder="Confirm password"
          :error="formErrors.confirmPassword"
          required
        />
        <!-- Validation error display -->
        <div
          v-if="formErrors.confirmPassword"
          class="text-red-500 text-sm mt-1"
        >
          {{ formErrors.confirmPassword }}
        </div>
      </UFormField>
    </template>

    <!-- Change Password Button (for editing, only if user can set password) -->
    <div
      v-if="isEditing && !showPasswordFields && userCanSetPassword"
      class="pt-4"
    >
      <UButton
        type="button"
        color="neutral"
        variant="outline"
        icon="i-lucide-key"
        @click="showPasswordFields = true"
      >
        Change Password
      </UButton>
    </div>

    <!-- Action Buttons -->
    <div class="flex justify-between items-center pt-6">
      <!-- Delete Button (only for editing) -->
      <div v-if="isEditing && canDelete" class="flex-1">
        <UModal
          title="Delete User"
          description="Are you sure you want to delete this user? This action cannot be undone."
        >
          <UButton
            type="button"
            color="error"
            variant="outline"
            icon="i-lucide-trash-2"
            @click="showDeleteModal = true"
            :loading="deleting"
          >
            Delete User
          </UButton>

          <template #body>
            <div class="space-y-4">
              <p class="text-gray-700 dark:text-gray-300">
                Are you sure you want to delete
                <strong>{{ user?.name || user?.username }}</strong
                >? This will permanently remove their account and all associated
                data.
              </p>

              <div
                class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
              >
                <div class="flex items-start space-x-3">
                  <UIcon
                    name="i-lucide-alert-circle"
                    class="w-5 h-5 text-red-600 mt-0.5"
                  />
                  <div class="text-sm text-red-700 dark:text-red-300">
                    <p class="font-medium">Warning:</p>
                    <ul class="mt-1 space-y-1">
                      <li>• User will lose access to the system immediately</li>
                      <li>• All user data will be permanently deleted</li>
                      <li>• This action cannot be reversed</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <template #footer="{ close }">
            <div class="flex justify-end space-x-3">
              <UButton color="neutral" variant="outline" @click="close">
                Cancel
              </UButton>
              <UButton color="error" :loading="deleting" @click="confirmDelete">
                Delete User
              </UButton>
            </div>
          </template>
        </UModal>
      </div>

      <!-- Save/Cancel Buttons -->
      <div class="flex space-x-3 ml-auto">
        <UButton
          type="button"
          color="neutral"
          variant="outline"
          @click="$router.back()"
        >
          Cancel
        </UButton>
        <UButton
          type="submit"
          color="primary"
          :loading="saving"
          :disabled="!isFormValid"
        >
          {{ isEditing ? 'Update User' : 'Create User' }}
        </UButton>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->

    <!-- Error Display -->
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      :title="error"
      icon="i-lucide-alert-circle"
    />

    <!-- Loading Overlay -->
    <div
      v-if="saving"
      class="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center z-50"
    >
      <div class="text-center">
        <UIcon
          name="i-lucide-loader-2"
          class="w-8 h-8 animate-spin mx-auto mb-2"
        />
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ isEditing ? 'Updating user...' : 'Creating user...' }}
        </p>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import type { User, Role } from '~/types/user';

interface Props {
  user?: User;
  isEditing?: boolean;
  error?: string;
  saving?: boolean;
  canDelete?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
  saving: false,
  canDelete: false,
});

const emit = defineEmits<{
  submit: [userData: any];
  delete: [];
}>();

const router = useRouter();
const toast = useToast();
const { canUserSetPassword, getAuthProviderDisplayName } = useSecurity();

// Form data
const form = reactive({
  username: '',
  email: '',
  name: '',
  role: '',
  password: '',
  confirmPassword: '',
});

// Form validation errors
const formErrors = reactive({
  username: '',
  email: '',
  name: '',
  role: '',
  password: '',
  confirmPassword: '',
});

// UI state
const showPassword = ref(false);
const showPasswordFields = ref(false);
const deleting = ref(false);
const showDeleteModal = ref(false);

// Get user roles
const { fetchRoles, roles, loading: rolesLoading } = useUserRoles();

// Computed role options for the select menu
const roleOptions = computed(() => {
  return roles.value.map((role) => ({
    label: role.name,
    value: role.key,
    icon: role.icon || 'i-lucide-user',
    description: role.description,
  }));
});

const roleOptionsSelect = ref<any>(null);

// Initialize form with user data if editing
onMounted(async () => {
  // Fetch roles first
  await fetchRoles();

  if (props.isEditing && props.user) {
    form.username = props.user.username;
    form.email = props.user.email;
    form.name = props.user.name || '';
    form.role = props.user.role;

    // Set the selected role for the USelectMenu
    const userRole = roleOptions.value.find(
      (role) => role.value === props.user?.role
    );
    if (userRole) {
      roleOptionsSelect.value = userRole;
    }
  }
});

// Password strength calculation
const passwordStrength = computed(() => {
  const password = form.password;
  if (!password) return { score: 0, label: '', color: 'gray' };

  let score = 0;
  const checks = {
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    numbers: /\d/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  score += checks.length ? 1 : 0;
  score += checks.lowercase ? 1 : 0;
  score += checks.uppercase ? 1 : 0;
  score += checks.numbers ? 1 : 0;
  score += checks.special ? 1 : 0;

  if (score <= 1) return { score, label: 'Very Weak', color: 'red' };
  if (score <= 2) return { score, label: 'Weak', color: 'orange' };
  if (score <= 3) return { score, label: 'Fair', color: 'yellow' };
  if (score <= 4) return { score, label: 'Good', color: 'blue' };
  return { score, label: 'Strong', color: 'green' };
});

// External auth detection
const userCanSetPassword = computed(() => {
  if (!props.user) return true; // New users can always set passwords initially
  return canUserSetPassword(props.user);
});

const userAuthProviderDisplay = computed(() => {
  if (!(props.user as any)?.authProvider) return null;
  return getAuthProviderDisplayName((props.user as any).authProvider);
});

// Form validation
const isFormValid = computed(() => {
  // Check if role is selected (either from form.role or roleOptionsSelect)
  const hasRole = form.role || roleOptionsSelect.value?.value;

  const hasRequiredFields = form.username && form.email && hasRole;

  // For new users (not editing), password is always required
  // For editing users, password is only required if showPasswordFields is true
  const hasValidPassword = props.isEditing
    ? !showPasswordFields.value ||
      (form.password && form.password === form.confirmPassword)
    : form.password && form.password === form.confirmPassword;

  return hasRequiredFields && hasValidPassword;
});

// Validate form and return errors
const validateForm = () => {
  const errors: any = {};

  // Username validation
  if (!form.username) {
    errors.username = 'Username is required';
  } else if (!/^[a-z0-9-]+$/.test(form.username)) {
    errors.username =
      'Username can only contain lowercase letters, numbers, and hyphens';
  }

  // Email validation
  if (!form.email) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Please enter a valid email address';
  }

  // Role validation
  const selectedRole = roleOptionsSelect.value?.value || form.role;
  if (!selectedRole) {
    errors.role = 'Role is required';
  }

  // Password validation (only for new users or when changing password)
  if (!props.isEditing || showPasswordFields.value) {
    if (!form.password) {
      errors.password = 'Password is required';
    } else if (form.password.length < 8) {
      errors.password = 'Password must be at least 8 characters long';
    }

    if (!form.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
  }

  return errors;
};

// Generate secure password
const generatePassword = () => {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  form.password = password;
  form.confirmPassword = password;
  showPassword.value = true;
};

// Handle form submission
const handleSubmit = () => {
  // Clear previous errors
  Object.keys(formErrors).forEach((key) => {
    (formErrors as any)[key] = '';
  });

  // Validate form
  const errors = validateForm();

  if (Object.keys(errors).length > 0) {
    Object.assign(formErrors, errors);
    return;
  }

  // Prepare user data
  const userData = {
    username: form.username,
    email: form.email,
    name: form.name || form.username, // Use username if name is empty
    role: roleOptionsSelect.value?.value || form.role,
    ...(form.password && { password: form.password }),
  };

  emit('submit', userData);

  // Clear password fields after submission for security
  if (!props.isEditing || showPasswordFields.value) {
    form.password = '';
    form.confirmPassword = '';
    showPassword.value = false;
    showPasswordFields.value = false;
  }
};

// Handle delete confirmation
const confirmDelete = async () => {
  deleting.value = true;
  try {
    emit('delete');
    showDeleteModal.value = false;
  } catch (error) {
    console.error('Error deleting user:', error);
    toast.add({
      title: 'Error',
      description: 'Failed to delete user',
      color: 'error',
    });
  } finally {
    deleting.value = false;
  }
};
</script>
