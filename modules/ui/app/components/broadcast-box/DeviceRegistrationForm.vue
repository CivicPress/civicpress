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

    <!-- Generate Credentials Button (shown before UUID/Code fields) -->
    <div
      v-if="!form.deviceUuid"
      class="flex items-center gap-2 p-4 bg-primary/10 rounded-lg border border-primary/20"
    >
      <div class="flex-1">
        <p class="text-sm font-medium">
          {{ t('broadcastBox.generateCredentials') }}
        </p>
        <p class="text-xs text-muted">
          {{ t('broadcastBox.generateCredentialsDesc') }}
        </p>
      </div>
      <UButton
        variant="outline"
        icon="i-lucide-sparkles"
        @click="handleEnroll"
        :loading="enrolling"
        :disabled="!form.name.trim() || enrolling"
      >
        {{ t('broadcastBox.generate') }}
      </UButton>
    </div>

    <!-- Device UUID -->
    <UFormField
      :label="t('broadcastBox.deviceUuid')"
      :description="t('broadcastBox.deviceUuidDesc')"
      required
    >
      <div class="flex gap-2">
        <UInput
          v-model="form.deviceUuid"
          :placeholder="t('broadcastBox.enterDeviceUuid')"
          :error="formErrors.deviceUuid"
          :disabled="!!form.deviceUuid"
          required
          class="font-mono flex-1"
        />
        <UButton
          v-if="form.deviceUuid"
          variant="ghost"
          :icon="uuidCopied ? 'i-lucide-check' : 'i-lucide-copy'"
          :color="uuidCopied ? 'primary' : 'neutral'"
          size="sm"
          @click="copyToClipboard(form.deviceUuid, 'uuid')"
          :disabled="submitting"
        />
        <UButton
          v-if="form.deviceUuid"
          variant="ghost"
          icon="i-lucide-x"
          @click="
            form.deviceUuid = '';
            form.enrollmentCode = '';
          "
          :disabled="submitting"
        >
          {{ t('common.clear') }}
        </UButton>
      </div>
      <div v-if="formErrors.deviceUuid" class="text-red-500 text-sm mt-1">
        {{ formErrors.deviceUuid }}
      </div>
    </UFormField>

    <!-- Enrollment Code -->
    <UFormField
      :label="t('broadcastBox.enrollmentCode')"
      :description="t('broadcastBox.enrollmentCodeDesc')"
      required
    >
      <div class="flex gap-2">
        <UInput
          v-model="form.enrollmentCode"
          :placeholder="t('broadcastBox.enterEnrollmentCode')"
          :error="formErrors.enrollmentCode"
          :disabled="!!form.enrollmentCode"
          required
          class="font-mono uppercase flex-1"
        />
        <UButton
          v-if="form.enrollmentCode"
          variant="ghost"
          :icon="codeCopied ? 'i-lucide-check' : 'i-lucide-copy'"
          :color="codeCopied ? 'primary' : 'neutral'"
          size="sm"
          @click="copyToClipboard(form.enrollmentCode, 'code')"
          :disabled="submitting"
        />
      </div>
      <div v-if="formErrors.enrollmentCode" class="text-red-500 text-sm mt-1">
        {{ formErrors.enrollmentCode }}
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

    <!-- Capabilities (Advanced) -->
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
      :title="t('broadcastBox.errors.registrationFailed')"
      :description="submitError"
      icon="i-lucide-alert-circle"
    />

    <!-- Success Display -->
    <UAlert
      v-if="registrationSuccess"
      color="primary"
      variant="soft"
      :title="t('broadcastBox.success.deviceRegistered')"
      :description="t('broadcastBox.success.deviceRegisteredDesc')"
      icon="i-lucide-check-circle"
    >
      <template #actions>
        <UButton
          variant="ghost"
          size="xs"
          @click="copyToken"
          icon="i-lucide-copy"
        >
          {{ t('broadcastBox.copyToken') }}
        </UButton>
      </template>
    </UAlert>

    <!-- Form Actions -->
    <div class="flex justify-end gap-3 pt-4">
      <UButton
        variant="ghost"
        color="neutral"
        @click="$emit('cancel')"
        :disabled="submitting"
      >
        {{ t('common.cancel') }}
      </UButton>
      <UButton
        type="submit"
        color="primary"
        :loading="submitting"
        :disabled="submitting || registrationSuccess"
      >
        {{ t('broadcastBox.register') }}
      </UButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import type { CreateDeviceRequest } from '~/composables/useBroadcastBox';
import { useBroadcastBox } from '~/composables/useBroadcastBox';

const emit = defineEmits<{
  success: [device: any];
  cancel: [];
}>();

const { t } = useI18n();
const toast = useToast();
const { enrollDevice, registerDevice } = useBroadcastBox();

const form = reactive<
  CreateDeviceRequest & {
    capabilities: { maxResolution: string; pipSupported: boolean };
  }
>({
  deviceUuid: '',
  enrollmentCode: '',
  name: '',
  roomLocation: '',
  capabilities: {
    maxResolution: '1080p',
    pipSupported: false,
  },
});

const formErrors = reactive<Record<string, string>>({});
const submitError = ref('');
const submitting = ref(false);
const enrolling = ref(false);
const registrationSuccess = ref(false);
const registrationToken = ref('');
const uuidCopied = ref(false);
const codeCopied = ref(false);

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
  formErrors.deviceUuid = '';
  formErrors.enrollmentCode = '';

  if (!form.name.trim()) {
    formErrors.name = t('broadcastBox.errors.deviceNameRequired');
    return false;
  }

  // Validate UUID format (if provided manually)
  if (form.deviceUuid.trim()) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(form.deviceUuid)) {
      formErrors.deviceUuid = t('broadcastBox.errors.invalidUuid');
      return false;
    }
  } else {
    formErrors.deviceUuid = t('broadcastBox.errors.deviceUuidRequired');
    return false;
  }

  if (!form.enrollmentCode.trim()) {
    formErrors.enrollmentCode = t('broadcastBox.errors.enrollmentCodeRequired');
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
  registrationSuccess.value = false;

  try {
    const result = await registerDevice({
      deviceUuid: form.deviceUuid,
      enrollmentCode: form.enrollmentCode,
      name: form.name,
      roomLocation: form.roomLocation || undefined,
      capabilities: {
        videoSources: [],
        audioSources: [],
        pipSupported: form.capabilities.pipSupported,
        maxResolution: form.capabilities.maxResolution,
      },
    });

    registrationSuccess.value = true;
    registrationToken.value = result.credentials.token;

    emit('success', result.device);
  } catch (error: any) {
    submitError.value =
      error.message || t('broadcastBox.errors.registrationFailed');
  } finally {
    submitting.value = false;
  }
};

const handleEnroll = async () => {
  if (!form.name.trim()) {
    formErrors.name = t('broadcastBox.errors.deviceNameRequired');
    return;
  }

  enrolling.value = true;
  formErrors.deviceUuid = '';
  formErrors.enrollmentCode = '';

  try {
    const enrollment = await enrollDevice({
      name: form.name,
      roomLocation: form.roomLocation || undefined,
    });

    form.deviceUuid = enrollment.deviceUuid;
    form.enrollmentCode = enrollment.enrollmentCode;
  } catch (error: any) {
    formErrors.deviceUuid =
      error.message || t('broadcastBox.errors.enrollFailed');
  } finally {
    enrolling.value = false;
  }
};

const copyToken = async () => {
  if (registrationToken.value) {
    await navigator.clipboard.writeText(registrationToken.value);
    toast.add({
      title: t('broadcastBox.tokenCopied'),
      color: 'primary',
    });
  }
};

const copyToClipboard = async (text: string, type: 'uuid' | 'code') => {
  try {
    await navigator.clipboard.writeText(text);
    if (type === 'uuid') {
      uuidCopied.value = true;
      setTimeout(() => {
        uuidCopied.value = false;
      }, 2000);
    } else {
      codeCopied.value = true;
      setTimeout(() => {
        codeCopied.value = false;
      }, 2000);
    }
    toast.add({
      title: t('broadcastBox.copiedToClipboard'),
      color: 'primary',
    });
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    toast.add({
      title: t('broadcastBox.copyFailed'),
      color: 'error',
    });
  }
};
</script>
