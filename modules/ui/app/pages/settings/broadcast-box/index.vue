<script setup lang="ts">
import type { BroadcastDevice } from '~/composables/useBroadcastBox';
import { useBroadcastBox } from '~/composables/useBroadcastBox';
import DeviceList from '~/components/broadcast-box/DeviceList.vue';
import DeviceRegistrationForm from '~/components/broadcast-box/DeviceRegistrationForm.vue';
import DeviceConfigurationForm from '~/components/broadcast-box/DeviceConfigurationForm.vue';

definePageMeta({
  middleware: ['require-auth'],
});

const { t } = useI18n();
const { listDevices } = useBroadcastBox();
const authStore = useAuthStore();

const devices = ref<BroadcastDevice[]>([]);
const loading = ref(false);
const error = ref('');
const showRegisterForm = ref(false);
const showConfigForm = ref(false);
const selectedDevice = ref<BroadcastDevice | null>(null);
const statusFilter = ref<string>('');

const statusFilterOptions = [
  { label: t('broadcastBox.allStatuses'), value: '' },
  { label: t('broadcastBox.enrolled'), value: 'enrolled' },
  { label: t('broadcastBox.active'), value: 'active' },
  { label: t('broadcastBox.suspended'), value: 'suspended' },
  { label: t('broadcastBox.revoked'), value: 'revoked' },
];

const selectedStatusFilter = computed({
  get: () =>
    statusFilterOptions.find((opt) => opt.value === statusFilter.value) ||
    statusFilterOptions[0],
  set: (value: { label: string; value: string } | null) => {
    statusFilter.value = value?.value || '';
  },
});

const canManageDevices = computed(() => {
  return authStore.hasPermission('broadcast-box:admin');
});

const filteredDevices = computed(() => {
  if (!statusFilter.value) {
    return devices.value;
  }
  return devices.value.filter((d) => d.status === statusFilter.value);
});

const loadDevices = async () => {
  loading.value = true;
  error.value = '';

  try {
    devices.value = await listDevices({
      status: statusFilter.value || undefined,
    });
  } catch (err: any) {
    error.value = err.message || t('broadcastBox.errors.loadFailed');
  } finally {
    loading.value = false;
  }
};

const handleDeviceClick = (device: BroadcastDevice) => {
  navigateTo(`/settings/broadcast-box/${device.id}`);
};

const handleRegister = () => {
  showRegisterForm.value = true;
};

const handleRegisterSuccess = () => {
  showRegisterForm.value = false;
  loadDevices();
};

const handleRegisterCancel = () => {
  showRegisterForm.value = false;
};

const handleConfigure = (device: BroadcastDevice) => {
  selectedDevice.value = device;
  showConfigForm.value = true;
};

const handleConfigSuccess = () => {
  showConfigForm.value = false;
  selectedDevice.value = null;
  loadDevices();
};

const handleConfigClose = () => {
  showConfigForm.value = false;
  selectedDevice.value = null;
};

const breadcrumbItems = computed(() => [
  {
    label: t('common.home'),
    to: '/',
  },
  {
    label: t('settings.title'),
    to: '/settings',
  },
  {
    label: t('broadcastBox.deviceManagement'),
  },
]);

onMounted(() => {
  if (canManageDevices.value) {
    loadDevices();
  }
});

watch(
  () => selectedStatusFilter.value?.value,
  (newValue) => {
    statusFilter.value = newValue || '';
    loadDevices();
  }
);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ t('broadcastBox.deviceManagement') }}
          </h1>
        </template>
        <template #description>
          {{ t('broadcastBox.deviceManagementDesc') }}
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col h-full">
        <div class="flex-shrink-0 mb-6">
          <UBreadcrumb :items="breadcrumbItems" />
        </div>

        <!-- Access Control -->
        <UAlert
          v-if="!canManageDevices"
          color="error"
          variant="soft"
          :title="t('broadcastBox.accessDenied')"
          :description="t('broadcastBox.noPermissionToManage')"
          icon="i-lucide-alert-circle"
          class="mb-6"
        />

        <!-- Device Management -->
        <div v-else class="flex-1 min-h-0 space-y-6">
          <!-- Header Actions -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <USelectMenu
                v-model="selectedStatusFilter"
                :items="statusFilterOptions"
                :placeholder="t('broadcastBox.filterByStatus')"
                class="w-48"
              />
            </div>
            <UButton
              color="primary"
              icon="i-lucide-plus"
              @click="handleRegister"
            >
              {{ t('broadcastBox.registerDevice') }}
            </UButton>
          </div>

          <!-- Device List -->
          <DeviceList
            :devices="filteredDevices"
            :loading="loading"
            :error="error"
            @device-click="handleDeviceClick"
            @register="handleRegister"
            @configure="handleConfigure"
          />

          <!-- Registration Form Modal -->
          <UModal
            v-model:open="showRegisterForm"
            :title="t('broadcastBox.registerDevice')"
            :description="t('broadcastBox.deviceManagementDesc')"
          >
            <template #body>
              <DeviceRegistrationForm
                @success="handleRegisterSuccess"
                @cancel="handleRegisterCancel"
              />
            </template>
          </UModal>

          <!-- Configuration Form Modal -->
          <UModal
            v-model:open="showConfigForm"
            :title="t('broadcastBox.configureDevice')"
            :description="t('broadcastBox.deviceManagementDesc')"
          >
            <template #body>
              <DeviceConfigurationForm
                v-if="selectedDevice"
                :device="selectedDevice"
                @success="handleConfigSuccess"
                @close="handleConfigClose"
              />
            </template>
          </UModal>
        </div>

        <!-- Footer -->
        <SystemFooter />
      </div>
    </template>
  </UDashboardPanel>
</template>
