<template>
  <form @submit.prevent="handleSubmit" class="space-y-6">
    <!-- Device Name -->
    <UFormField
      :label="t('broadcastBox.deviceName')"
      :description="t('broadcastBox.deviceNameDesc')"
      required
    >
      <UInput
        v-model="form.name"
        :placeholder="t('broadcastBox.enterDeviceName')"
        :error="formErrors.name"
        required
      />
      <div v-if="formErrors.name" class="text-red-500 text-sm mt-1">
        {{ formErrors.name }}
      </div>
    </UFormField>

    <!-- Room Location -->
    <UFormField
      :label="t('broadcastBox.roomLocation')"
      :description="t('broadcastBox.roomLocationDesc')"
    >
      <UInput
        v-model="form.roomLocation"
        :placeholder="t('broadcastBox.enterRoomLocation')"
        :error="formErrors.roomLocation"
      />
    </UFormField>

    <!-- Capabilities -->
    <UAccordion :items="capabilitiesAccordionItems" class="mt-6">
      <template #capabilities>
        <div class="space-y-4 pt-4">
          <!-- Max Resolution -->
          <UFormField
            :label="t('broadcastBox.maxResolution')"
            :description="t('broadcastBox.maxResolutionDesc')"
          >
            <USelectMenu
              v-model="selectedResolution"
              :items="resolutionOptions"
              :placeholder="t('broadcastBox.selectResolution')"
            />
          </UFormField>

          <!-- PiP Support -->
          <UFormField
            :label="t('broadcastBox.pipSupport')"
            :description="t('broadcastBox.pipSupportDesc')"
          >
            <USwitch v-model="form.capabilities.pipSupported" />
          </UFormField>
        </div>
      </template>
    </UAccordion>

    <!-- Error Display -->
    <UAlert
      v-if="submitError"
      color="error"
      variant="soft"
      :title="t('broadcastBox.errors.updateFailed')"
      :description="submitError"
      icon="i-lucide-alert-circle"
    />

    <!-- Form Actions -->
    <div class="flex justify-end gap-3 pt-4">
      <UButton
        variant="ghost"
        color="neutral"
        @click="$emit('close')"
        :disabled="submitting"
      >
        {{ t('common.cancel') }}
      </UButton>
      <UButton type="submit" color="primary" :loading="submitting">
        {{ t('common.save') }}
      </UButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import type {
  BroadcastDevice,
  UpdateDeviceRequest,
} from '~/composables/useBroadcastBox';
import { useBroadcastBox } from '~/composables/useBroadcastBox';

const props = defineProps<{
  device: BroadcastDevice;
}>();

const emit = defineEmits<{
  success: [device: BroadcastDevice];
  close: [];
}>();

const { t } = useI18n();
const { updateDevice } = useBroadcastBox();

const form = reactive<{
  name: string;
  roomLocation?: string;
  capabilities: {
    maxResolution: string;
    pipSupported: boolean;
  };
}>({
  name: props.device.name,
  roomLocation: props.device.roomLocation,
  capabilities: {
    maxResolution: props.device.capabilities.maxResolution || '1080p',
    pipSupported: props.device.capabilities.pipSupported || false,
  },
});

const formErrors = reactive<Record<string, string>>({});
const submitError = ref('');
const submitting = ref(false);

const resolutionOptions = [
  { label: '720p', value: '720p' },
  { label: '1080p', value: '1080p' },
  { label: '4K', value: '4K' },
];

const selectedResolution = computed({
  get: () =>
    resolutionOptions.find(
      (opt) => opt.value === form.capabilities.maxResolution
    ) || resolutionOptions[1],
  set: (value: { label: string; value: string } | null) => {
    if (value) {
      form.capabilities.maxResolution = value.value;
    }
  },
});

const capabilitiesAccordionItems = [
  {
    label: t('broadcastBox.advancedCapabilities'),
    slot: 'capabilities',
    defaultOpen: false,
  },
];

const validateForm = (): boolean => {
  formErrors.name = '';

  if (!form.name.trim()) {
    formErrors.name = t('broadcastBox.errors.deviceNameRequired');
    return false;
  }

  return true;
};

const handleSubmit = async () => {
  if (!validateForm()) {
    return;
  }

  submitting.value = true;
  submitError.value = '';

  try {
    const updateData: UpdateDeviceRequest = {
      name: form.name,
      roomLocation: form.roomLocation || undefined,
      capabilities: {
        ...props.device.capabilities,
        maxResolution: form.capabilities.maxResolution,
        pipSupported: form.capabilities.pipSupported,
      },
    };

    const updatedDevice = await updateDevice(props.device.id, updateData);
    emit('success', updatedDevice);
  } catch (error: any) {
    submitError.value = error.message || t('broadcastBox.errors.updateFailed');
  } finally {
    submitting.value = false;
  }
};
</script>
