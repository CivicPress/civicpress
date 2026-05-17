# Device Page Redesign - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Redesign the broadcast-box device detail page for fleet-admin UX:
health at the top, preview always visible, redundant cards removed, admin
details collapsed.

**Architecture:** Rewrite the `[id]/index.vue` template layout. The parent page
owns the layout; child components stay mostly unchanged. DevicePreview gets an
offline placeholder. The inline Capabilities card, Active Sources card, and
separate Enrollment Code card are removed and consolidated.

**Tech Stack:** Vue 3 + Nuxt 4, Nuxt UI Pro components (`UCard`, `UProgress`,
`UBadge`, `UAccordion`, `UIcon`), existing broadcast-box composables.

---

## Task 1: Add Health & Status Row to page

**Files:**

- Modify: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

### Step 1: Add health status row template

Replace the current `<!-- Device Info Card -->` section (the first `<UCard>` at
line 752) with a new compact health row card. Insert this as the first element
inside `<template v-else-if="device">`:

```vue
<!-- Health & Status Row -->
<UCard>
  <div class="flex flex-wrap items-center gap-4">
    <!-- Device Name + Connection Status -->
    <div class="flex items-center gap-2 mr-auto">
      <h2 class="text-lg font-semibold">{{ device.name }}</h2>
      <ConnectionStatusIndicator
        :connected="isDeviceConnected"
        :last-seen-at="connectionStatus.lastSeenAt || device.lastSeenAt"
        :show-label="true"
      />
    </div>

    <!-- Health Score -->
    <div v-if="realtimeHealth?.score !== undefined" class="flex items-center gap-1.5">
      <span class="text-xs text-gray-500">{{ t('broadcastBox.healthScore') }}</span>
      <UBadge
        :color="realtimeHealth.score >= 80 ? 'success' : realtimeHealth.score >= 50 ? 'warning' : 'error'"
        variant="soft"
        size="sm"
      >
        {{ realtimeHealth.score }}%
      </UBadge>
    </div>

    <!-- CPU -->
    <div v-if="realtimeHealth?.metrics" class="flex items-center gap-1.5 min-w-[100px]">
      <span class="text-xs text-gray-500 w-8">CPU</span>
      <UProgress :value="realtimeHealth.metrics.cpuPercent || 0" size="xs" class="flex-1" />
      <span class="text-xs font-mono w-8 text-right">{{ realtimeHealth.metrics.cpuPercent || 0 }}%</span>
    </div>

    <!-- Memory -->
    <div v-if="realtimeHealth?.metrics" class="flex items-center gap-1.5 min-w-[100px]">
      <span class="text-xs text-gray-500 w-8">Mem</span>
      <UProgress :value="realtimeHealth.metrics.memoryPercent || 0" size="xs" class="flex-1" />
      <span class="text-xs font-mono w-8 text-right">{{ realtimeHealth.metrics.memoryPercent || 0 }}%</span>
    </div>

    <!-- Disk -->
    <div v-if="realtimeHealth?.metrics" class="flex items-center gap-1.5 min-w-[100px]">
      <span class="text-xs text-gray-500 w-8">Disk</span>
      <UProgress :value="realtimeHealth.metrics.diskPercent || 0" size="xs" class="flex-1" />
      <span class="text-xs font-mono w-8 text-right">{{ realtimeHealth.metrics.diskPercent || 0 }}%</span>
    </div>

    <!-- Network -->
    <UIcon
      v-if="connectionStatus.health?.networkConnected !== undefined"
      :name="connectionStatus.health.networkConnected ? 'i-lucide-wifi' : 'i-lucide-wifi-off'"
      :class="connectionStatus.health.networkConnected ? 'text-green-600 w-5 h-5' : 'text-red-600 w-5 h-5'"
    />

    <!-- Device State Badge -->
    <UBadge
      :color="deviceState === 'recording' ? 'error' : deviceState === 'encoding' || deviceState === 'uploading' ? 'primary' : 'neutral'"
      variant="soft"
      size="sm"
    >
      <UIcon
        :name="deviceState === 'recording' ? 'i-lucide-circle-dot' : deviceState === 'encoding' ? 'i-lucide-cog' : deviceState === 'uploading' ? 'i-lucide-upload' : 'i-lucide-pause'"
        class="w-3 h-3 mr-1"
      />
      {{ t(`broadcastBox.state.${deviceState}`) }}
    </UBadge>

    <!-- Actions -->
    <div class="flex items-center gap-1">
      <UButton variant="ghost" size="sm" icon="i-lucide-settings" @click="showConfigForm = true" />
      <UButton v-if="device.status !== 'revoked'" color="error" variant="ghost" size="sm" icon="i-lucide-ban" @click="handleRevoke" />
    </div>
  </div>

  <!-- Fallback when no health data -->
  <div v-if="!realtimeHealth?.metrics && !realtimeHealth?.score" class="mt-2">
    <span class="text-xs text-gray-400">{{ t('broadcastBox.noHealthData') || 'No health data available' }}</span>
  </div>
</UCard>
```

### Step 2: Add `deviceState` computed to the page script

Add this computed property after `realtimeHealth` (around line 330):

```typescript
const deviceState = computed(() => {
  return connectionStatus.value.state || 'idle';
});
```

### Step 3: Remove the old Device Info Card

Delete the entire `<!-- Device Info Card -->` `<UCard>` block (lines 752-870 in
the current template). The device name, connection status, and configure/revoke
buttons are now in the health row.

### Step 4: Remove the old Device Health Card

Delete the entire `<!-- Device Health -->` `<UCard v-if="realtimeHealth">` block
(lines 1266-1380). Health metrics are now in the compact row.

### Step 5: Remove the DeviceStatusControl component

Delete the `<DeviceStatusControl>` usage (lines 1258-1263). The device state
badge is now in the health row. The auto-refresh and refresh button
functionality is handled by the existing composables.

### Step 6: Verify the page loads

Run: Visit `http://localhost:3030/settings/broadcast-box/<device-id>` and verify
the health row renders at the top with the device name, connection status, and
action buttons.

### Step 7: Commit

```bash
git add modules/ui/app/pages/settings/broadcast-box/\[id\]/index.vue
git commit -m "feat(ui): add compact health & status row to device page"
```

---

## Task 2: Make DevicePreview always visible

**Files:**

- Modify: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

### Step 1: Change DevicePreview from conditional to always rendered

In the page template, change:

```vue
<DevicePreview
  v-if="device && isDeviceConnected"
```

to:

```vue
<DevicePreview
  v-if="device"
```

The DevicePreview component already handles the offline state internally (shows
"Offline" badge, disables controls). The only gate was at the parent level with
`v-if="isDeviceConnected"`, which caused the layout jump.

### Step 2: Verify

Visit the device page when device is offline. The preview card should appear
with a "Device Offline" badge and greyed-out controls. No layout jump when
device connects/disconnects.

### Step 3: Commit

```bash
git add modules/ui/app/pages/settings/broadcast-box/\[id\]/index.vue
git commit -m "feat(ui): always show device preview (greyed out when offline)"
```

---

## Task 3: Remove Capabilities and Active Sources cards

**Files:**

- Modify: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

### Step 1: Remove Device Capabilities card

Delete the entire `<!-- Device Capabilities -->` `<UCard v-if="device">` block
(lines 1064-1199 in the original). This listed video/audio sources, max
resolution, and PiP support — all redundant with DeviceSourceControl dropdowns.

### Step 2: Remove Active Sources card

Delete the entire `<!-- Active Sources -->` `<UCard>` block (lines 1382-1529 in
the original). The active source is already shown as the selected value in the
DeviceSourceControl dropdowns.

### Step 3: Remove unused helper functions

Delete these helper functions from `<script setup>` since they were only used by
the removed sections:

- `formatPipPosition` (lines 25-33)
- `formatPipSizeDisplay` (lines 36-42)

### Step 4: Verify

Check the page loads without errors. The source control dropdowns should still
work and show active sources.

### Step 5: Commit

```bash
git add modules/ui/app/pages/settings/broadcast-box/\[id\]/index.vue
git commit -m "refactor(ui): remove redundant Capabilities and Active Sources cards"
```

---

## Task 4: Consolidate Recordings and Sessions into one card

**Files:**

- Modify: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

### Step 1: Replace the two separate cards with one combined card

Delete the current `<!-- Recent Sessions -->` card (lines 1544-1601) and
`<!-- Device Recordings -->` card (lines 1604-1689). Replace with a single card:

```vue
<!-- Recordings & Sessions -->
<UCard v-if="device">
  <template #header>
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">
        {{ t('broadcastBox.recordingsAndSessions') || 'Recordings & Sessions' }}
      </h2>
      <UButton
        variant="ghost"
        size="xs"
        icon="i-lucide-refresh-cw"
        :loading="manualRecordingRef?.isLoadingRecordings"
        :disabled="!isDeviceConnected"
        @click="manualRecordingRef?.loadRecordings()"
      >
        {{ t('common.refresh') }}
      </UButton>
    </div>
  </template>

  <!-- Recordings Section -->
  <div>
    <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">
      {{ t('broadcastBox.recordingsList') }}
    </h3>

    <UAlert
      v-if="!manualRecordingRef?.recordings?.length"
      color="neutral"
      variant="soft"
      :title="t('broadcastBox.noRecordings')"
      :description="t('broadcastBox.noRecordingsDesc')"
      icon="i-lucide-info"
    />

    <div v-else class="space-y-2">
      <div
        v-for="recording in manualRecordingRef.recordings"
        :key="recording.recording_id"
        class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-sm font-medium">
              {{ formatDate(recording.started_at) }}
            </span>
            <UBadge
              v-if="!recording.stopped_at"
              color="error"
              variant="soft"
              size="xs"
            >
              {{ t('broadcastBox.recording') }}
            </UBadge>
          </div>
          <div class="text-xs text-gray-500 space-y-1">
            <div>
              {{ t('broadcastBox.duration') }}:
              {{ manualRecordingRef.formatDuration(recording.duration_seconds) }}
            </div>
            <div>
              {{ t('broadcastBox.fileSize') }}:
              {{ manualRecordingRef.formatFileSize(recording.file_size_bytes) }}
            </div>
            <div v-if="recording.quality" class="capitalize">
              {{ t('broadcastBox.quality') }}: {{ recording.quality }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Divider -->
  <USeparator class="my-6" />

  <!-- Sessions Section -->
  <div>
    <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">
      {{ t('broadcastBox.recentSessions') }}
    </h3>

    <div
      v-if="sessions.length === 0"
      class="text-center py-4 text-gray-500 text-sm"
    >
      {{ t('broadcastBox.noSessions') }}
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="session in sessions"
        :key="session.id"
        class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <SessionStatusBadge :status="session.status" />
            <span class="text-sm font-medium">{{ session.id }}</span>
          </div>
          <div v-if="session.startedAt" class="text-xs text-gray-500">
            {{ t('broadcastBox.startedAt') }}:
            {{ formatDate(session.startedAt) }}
          </div>
        </div>
        <div class="flex items-center gap-1">
          <UButton
            variant="ghost"
            size="xs"
            icon="i-lucide-arrow-right"
            @click="navigateTo(`/records/session/${session.civicpressSessionId}`)"
          >
            {{ t('broadcastBox.viewSession') }}
          </UButton>
          <UButton
            variant="ghost"
            size="xs"
            color="error"
            icon="i-lucide-trash-2"
            :loading="removingSessionId === session.id"
            :disabled="removingSessionId !== null"
            @click="handleRemoveSession(session.id)"
          >
            {{ t('broadcastBox.removeSession') }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</UCard>
```

### Step 2: Verify

Confirm recordings and sessions render in the combined card with a separator
between them.

### Step 3: Commit

```bash
git add modules/ui/app/pages/settings/broadcast-box/\[id\]/index.vue
git commit -m "feat(ui): consolidate recordings and sessions into single card"
```

---

## Task 5: Add collapsible Device Details accordion

**Files:**

- Modify: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

### Step 1: Add accordion items config to script

Add after the `deviceState` computed:

```typescript
const detailsAccordionItems = [
  {
    label: t('broadcastBox.deviceInformation'),
    slot: 'device-info',
    defaultOpen: false,
  },
  {
    label: t('broadcastBox.enrollmentCode'),
    slot: 'enrollment',
    defaultOpen: false,
  },
];
```

### Step 2: Add QR code generation logic to script

Add the import and reactive state for QR code (reused from
DeviceRegistrationForm):

```typescript
import QRCode from 'qrcode';

const enrollmentQrDataUrl = ref('');

// Generate QR code when enrollment code is regenerated
watch(
  () => enrollmentCode.value?.code,
  async (code) => {
    if (code && device.value) {
      const payload = {
        type: 'civicpress-enrollment',
        url: window.location.origin + '/api/v1/broadcast-box/devices',
        code: code,
        v: 1,
      };
      enrollmentQrDataUrl.value = await QRCode.toDataURL(
        JSON.stringify(payload),
        { width: 256, margin: 2 }
      );
    } else {
      enrollmentQrDataUrl.value = '';
    }
  },
  { immediate: true }
);
```

### Step 3: Add the accordion template

Place this after the Recordings & Sessions card, before `<SystemFooter>`:

```vue
<!-- Device Details (Collapsible) -->
<UAccordion :items="detailsAccordionItems" class="mt-2">
  <template #device-info>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      <div>
        <label class="text-sm font-medium text-gray-600 dark:text-gray-400">
          {{ t('broadcastBox.deviceId') }}
        </label>
        <div class="flex items-center gap-2">
          <p class="text-sm font-mono text-gray-900 dark:text-gray-100 flex-1">
            {{ device.id }}
          </p>
          <UButton
            :icon="deviceIdCopied ? 'i-lucide-check' : 'i-lucide-copy'"
            size="xs"
            variant="ghost"
            :color="deviceIdCopied ? 'primary' : 'neutral'"
            @click="copyToClipboard(device.id, 'deviceId')"
          />
        </div>
      </div>

      <div>
        <label class="text-sm font-medium text-gray-600 dark:text-gray-400">
          {{ t('broadcastBox.deviceUuid') }}
        </label>
        <div class="flex items-center gap-2">
          <p class="text-sm font-mono text-gray-900 dark:text-gray-100 flex-1">
            {{ device.deviceUuid }}
          </p>
          <UButton
            :icon="uuidCopied ? 'i-lucide-check' : 'i-lucide-copy'"
            size="xs"
            variant="ghost"
            :color="uuidCopied ? 'primary' : 'neutral'"
            @click="copyToClipboard(device.deviceUuid, 'uuid')"
          />
        </div>
      </div>

      <div v-if="device.roomLocation">
        <label class="text-sm font-medium text-gray-600 dark:text-gray-400">
          {{ t('broadcastBox.roomLocation') }}
        </label>
        <p class="text-sm text-gray-900 dark:text-gray-100">
          {{ device.roomLocation }}
        </p>
      </div>

      <div>
        <label class="text-sm font-medium text-gray-600 dark:text-gray-400">
          {{ t('broadcastBox.createdAt') }}
        </label>
        <p class="text-sm text-gray-900 dark:text-gray-100">
          {{ formatDate(device.createdAt) }}
        </p>
      </div>

      <div v-if="device.lastSeenAt">
        <label class="text-sm font-medium text-gray-600 dark:text-gray-400">
          {{ t('broadcastBox.lastSeen') }}
        </label>
        <p class="text-sm text-gray-900 dark:text-gray-100">
          {{ formatDate(device.lastSeenAt) }}
        </p>
      </div>

      <div>
        <label class="text-sm font-medium text-gray-600 dark:text-gray-400">
          {{ t('broadcastBox.status') || 'Status' }}
        </label>
        <DeviceStatusBadge :status="device.status" />
      </div>
    </div>
  </template>

  <template #enrollment>
    <div class="p-4 space-y-4">
      <!-- QR Code (shown after regeneration) -->
      <div
        v-if="enrollmentCode && enrollmentQrDataUrl"
        class="flex flex-col items-center gap-3 p-4 bg-primary/5 rounded-lg border border-primary/20"
      >
        <p class="text-sm font-medium">
          {{ t('broadcastBox.scanQrCode') }}
        </p>
        <img :src="enrollmentQrDataUrl" alt="Enrollment QR Code" class="w-48 h-48" />
        <p class="text-xs text-muted text-center max-w-xs">
          {{ t('broadcastBox.scanQrCodeDesc') }}
        </p>
      </div>

      <!-- Enrollment code value (when freshly generated) -->
      <div v-if="enrollmentCode">
        <label class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block">
          {{ t('broadcastBox.enrollmentCode') }}
        </label>
        <div class="flex items-center gap-2">
          <p class="text-lg font-mono font-semibold text-gray-900 dark:text-gray-100 flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            {{ enrollmentCode.code }}
          </p>
          <UButton
            :icon="codeCopied ? 'i-lucide-check' : 'i-lucide-copy'"
            size="sm"
            variant="ghost"
            color="primary"
            @click="copyToClipboard(enrollmentCode.code, 'code')"
          >
            {{ codeCopied ? t('broadcastBox.copied') : t('broadcastBox.copy') }}
          </UButton>
        </div>
      </div>

      <!-- Enrollment status (when code already exists but value is hashed) -->
      <div v-else-if="enrollmentCodeStatus?.exists">
        <div class="flex items-center gap-2 mb-2">
          <UBadge
            :color="enrollmentCodeStatus.isUsed ? 'neutral' : enrollmentCodeStatus.isExpired ? 'error' : 'primary'"
            variant="soft"
          >
            {{ enrollmentCodeStatus.isUsed ? t('broadcastBox.enrollmentCodeUsed') : enrollmentCodeStatus.isExpired ? t('broadcastBox.enrollmentCodeExpired') : t('broadcastBox.enrollmentCodeActive') }}
          </UBadge>
          <span v-if="enrollmentCodeStatus.expiresAt" class="text-sm text-gray-500">
            {{ formatDate(enrollmentCodeStatus.expiresAt) }}
          </span>
        </div>
      </div>

      <!-- No enrollment code -->
      <div v-else class="text-sm text-gray-500">
        {{ t('broadcastBox.noEnrollmentCode') }}
      </div>

      <!-- Regenerate button -->
      <UButton
        color="primary"
        variant="soft"
        size="sm"
        icon="i-lucide-refresh-cw"
        :loading="regenerating"
        :disabled="regenerating"
        @click="handleRegenerateEnrollmentCode"
      >
        {{ t('broadcastBox.regenerateEnrollmentCode') }}
      </UButton>
    </div>
  </template>
</UAccordion>
```

### Step 4: Remove the old Enrollment Code card

Delete the entire `<!-- Enrollment Code Section -->` `<UCard>` block (lines
872-1062 in the original).

### Step 5: Verify

Check the accordion renders collapsed at the bottom. Expand each section to
verify device info and enrollment display correctly.

### Step 6: Commit

```bash
git add modules/ui/app/pages/settings/broadcast-box/\[id\]/index.vue
git commit -m "feat(ui): move device details and enrollment into collapsible accordion"
```

---

## Task 6: Clean up unused imports and verify

**Files:**

- Modify: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

### Step 1: Remove unused component imports

If `DeviceStatusControl` is no longer used in the template, remove its import:

```typescript
// Remove this line:
import DeviceStatusControl from '~/components/broadcast-box/DeviceStatusControl.vue';
```

### Step 2: Update the navbar header

The navbar header still shows the device name but now the health row also shows
it. Simplify the navbar to just show the breadcrumb context:

```vue
<template #header>
  <UDashboardNavbar>
    <template #title>
      <h1 class="text-2xl font-semibold">
        {{ t('broadcastBox.deviceDetails') }}
      </h1>
    </template>
  </UDashboardNavbar>
</template>
```

### Step 3: Run type checking

Run: `cd modules/ui && pnpm vue-tsc --noEmit 2>&1 | head -50`

Fix any TypeScript errors.

### Step 4: Visual verification

Visit the device page and verify:

- Health row shows at top with device name + metrics
- Preview always visible (greyed out when offline)
- Controls grid renders correctly
- Recordings & Sessions combined card works
- Collapsible accordion at bottom expands/collapses
- No duplicate information on the page

### Step 5: Commit

```bash
git add modules/ui/app/pages/settings/broadcast-box/\[id\]/index.vue
git commit -m "refactor(ui): clean up imports and finalize device page redesign"
```
