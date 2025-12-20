<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ t('settings.diagnostics.title') }}
          </h1>
        </template>
        <template #description>{{
          t('settings.diagnostics.description')
        }}</template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="min-h-0 overflow-visible">
        <UBreadcrumb
          :items="[
            { label: t('common.home'), to: '/' },
            { label: t('settings.title'), to: '/settings' },
            { label: t('settings.diagnostics.title') },
          ]"
        />

        <!-- Overall Status Card -->
        <UCard class="mt-6 overflow-visible">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-medium">
                  {{ t('settings.diagnostics.overallStatus') }}
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{
                    lastRun
                      ? t('settings.diagnostics.lastRun', {
                          time: formatTime(lastRun),
                        })
                      : t('settings.diagnostics.notRun')
                  }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  :loading="loading"
                  :disabled="fixing"
                  icon="i-lucide-refresh-cw"
                  @click="refreshDiagnostics"
                >
                  {{ t('settings.diagnostics.runDiagnostics') }}
                </UButton>
                <UButton
                  v-if="hasFixableIssues"
                  :loading="fixing"
                  :disabled="loading"
                  color="primary"
                  icon="i-lucide-wrench"
                  @click="handleAutoFix"
                >
                  {{ t('settings.diagnostics.autoFix') }}
                </UButton>
              </div>
            </div>
          </template>

          <div v-if="loading" class="py-8 text-center">
            <UIcon
              name="i-lucide-loader-2"
              class="w-8 h-8 animate-spin mx-auto"
            />
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {{ t('settings.diagnostics.running') }}
            </p>
          </div>

          <div v-else-if="error" class="py-8">
            <UAlert color="error" variant="soft" :title="error" />
          </div>

          <div v-else-if="report" class="space-y-6 overflow-visible pb-6">
            <!-- Overall Status Summary -->
            <div
              class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div class="flex items-center gap-4">
                <div>
                  <UBadge
                    :color="getStatusColor(report.overallStatus)"
                    variant="soft"
                    size="lg"
                    class="text-base"
                  >
                    <UIcon
                      :name="getStatusIcon(report.overallStatus)"
                      class="w-5 h-5 mr-2"
                    />
                    {{
                      t(`settings.diagnostics.status.${report.overallStatus}`, {
                        default: report.overallStatus,
                      })
                    }}
                  </UBadge>
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  <div class="font-medium text-gray-900 dark:text-white">
                    {{ t('settings.diagnostics.summary', report.summary) }}
                  </div>
                  <div class="mt-1">
                    {{
                      t('settings.diagnostics.duration', {
                        ms: report.duration,
                      })
                    }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Component Cards Grid -->
            <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <UCard
                v-for="component in report.components"
                :key="component.component"
                class="relative h-full flex flex-col"
                :class="{
                  'ring-2 ring-primary-500': component.status === 'healthy',
                  'ring-2 ring-orange-500': component.status === 'warning',
                  'ring-2 ring-red-500': component.status === 'error',
                }"
              >
                <template #header>
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <h3
                        class="text-base font-semibold text-gray-900 dark:text-white mb-1"
                      >
                        {{
                          t(
                            `settings.diagnostics.components.${component.component}`,
                            {
                              default: component.component,
                            }
                          )
                        }}
                      </h3>
                      <div class="flex items-center gap-2 mt-1">
                        <UBadge
                          :color="getStatusColor(component.status)"
                          variant="soft"
                          size="sm"
                        >
                          <UIcon
                            :name="getStatusIcon(component.status)"
                            class="w-3 h-3 mr-1"
                          />
                          {{
                            t(
                              `settings.diagnostics.status.${component.status}`,
                              {
                                default: component.status,
                              }
                            )
                          }}
                        </UBadge>
                        <span class="text-xs text-gray-500 dark:text-gray-400">
                          {{
                            t('settings.diagnostics.duration', {
                              ms: component.duration,
                            })
                          }}
                        </span>
                      </div>
                    </div>
                  </div>
                </template>

                <div class="space-y-4 flex-1 min-h-0">
                  <!-- Checks Section -->
                  <div
                    v-if="component.checks && component.checks.length > 0"
                    class="space-y-2"
                  >
                    <h4
                      class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                    >
                      {{ t('settings.diagnostics.checks') }}
                    </h4>
                    <div class="space-y-2">
                      <div
                        v-for="check in component.checks"
                        :key="check.name"
                        class="flex items-center gap-2 text-sm py-1"
                      >
                        <UIcon
                          :name="getCheckIcon(check.status)"
                          class="w-4 h-4 flex-shrink-0"
                          :class="`text-${getCheckColor(check.status)}-500`"
                        />
                        <span class="flex-1 text-gray-700 dark:text-gray-300">{{
                          check.name
                        }}</span>
                        <UBadge
                          :color="getCheckColor(check.status)"
                          variant="soft"
                          size="xs"
                        >
                          {{ check.status }}
                        </UBadge>
                      </div>
                    </div>
                  </div>

                  <!-- Issues Section -->
                  <div
                    v-if="component.issues && component.issues.length > 0"
                    class="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700"
                  >
                    <h4
                      class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                    >
                      {{
                        t('settings.diagnostics.issues', {
                          count: component.issues.length,
                        })
                      }}
                    </h4>
                    <div class="space-y-2">
                      <div
                        v-for="issue in component.issues"
                        :key="issue.id"
                        class="flex items-start gap-2 text-sm p-2 rounded-md bg-gray-50 dark:bg-gray-800/50"
                      >
                        <UBadge
                          :color="getSeverityColor(issue.severity)"
                          variant="soft"
                          size="xs"
                          class="flex-shrink-0 mt-0.5"
                        >
                          {{ issue.severity }}
                        </UBadge>
                        <span class="flex-1 text-gray-700 dark:text-gray-300">{{
                          issue.message
                        }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Recommendations Section -->
                  <div
                    v-if="
                      component.recommendations &&
                      component.recommendations.length > 0
                    "
                    class="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700"
                  >
                    <h4
                      class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                    >
                      {{ t('settings.diagnostics.recommendations') }}
                    </h4>
                    <ul
                      class="text-sm text-gray-600 dark:text-gray-400 space-y-1"
                    >
                      <li
                        v-for="(rec, idx) in component.recommendations"
                        :key="idx"
                        class="flex items-start gap-2"
                      >
                        <UIcon
                          name="i-lucide-arrow-right"
                          class="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400"
                        />
                        <span>{{ rec }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- Empty State -->
                  <div
                    v-if="
                      (!component.checks || component.checks.length === 0) &&
                      (!component.issues || component.issues.length === 0) &&
                      (!component.recommendations ||
                        component.recommendations.length === 0)
                    "
                    class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
                  >
                    {{ t('settings.diagnostics.noComponentData') }}
                  </div>
                </div>
              </UCard>
            </div>

            <!-- All Issues Summary (if any) -->
            <div v-if="report.issues.length > 0" class="space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{
                    t('settings.diagnostics.issues', {
                      count: report.issues.length,
                    })
                  }}
                </h3>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <UCard
                  v-for="issue in report.issues"
                  :key="issue.id"
                  class="border-l-4 transition-all hover:shadow-md"
                  :class="{
                    'border-red-500':
                      issue.severity === 'critical' ||
                      issue.severity === 'high',
                    'border-orange-500': issue.severity === 'medium',
                    'border-yellow-500': issue.severity === 'low',
                  }"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex-1 space-y-2">
                      <div class="flex items-center gap-2">
                        <UBadge
                          :color="getSeverityColor(issue.severity)"
                          variant="soft"
                          size="sm"
                        >
                          {{ issue.severity }}
                        </UBadge>
                        <span
                          class="text-sm font-semibold text-gray-900 dark:text-white"
                          >{{ issue.message }}</span
                        >
                      </div>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        <UIcon
                          name="i-lucide-box"
                          class="w-3 h-3 inline mr-1"
                        />
                        {{ t('settings.diagnostics.component') }}:
                        {{ issue.component }}
                      </p>
                      <div
                        v-if="issue.fix"
                        class="mt-3 p-2 bg-primary-50 dark:bg-primary-900/20 rounded-md"
                      >
                        <p
                          class="text-xs font-semibold text-primary-700 dark:text-primary-300 mb-1"
                        >
                          {{ t('settings.diagnostics.fix') }}
                        </p>
                        <p class="text-sm text-gray-700 dark:text-gray-300">
                          {{ issue.fix.description }}
                        </p>
                        <p
                          v-if="issue.fix.command"
                          class="text-xs text-gray-600 dark:text-gray-400 mt-2 font-mono bg-gray-100 dark:bg-gray-800 p-1.5 rounded"
                        >
                          {{ issue.fix.command }}
                        </p>
                      </div>
                      <div
                        v-if="issue.recommendations?.length"
                        class="mt-2 space-y-1"
                      >
                        <p
                          class="text-xs font-semibold text-gray-600 dark:text-gray-400"
                        >
                          {{ t('settings.diagnostics.recommendations') }}
                        </p>
                        <ul
                          class="text-xs text-gray-600 dark:text-gray-400 space-y-1"
                        >
                          <li
                            v-for="(rec, idx) in issue.recommendations"
                            :key="idx"
                            class="flex items-start gap-1.5"
                          >
                            <UIcon
                              name="i-lucide-info"
                              class="w-3 h-3 mt-0.5 flex-shrink-0"
                            />
                            <span>{{ rec }}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                    <UBadge
                      v-if="issue.autoFixable"
                      color="primary"
                      variant="soft"
                      size="sm"
                      class="flex-shrink-0"
                    >
                      <UIcon name="i-lucide-wrench" class="w-3 h-3 mr-1" />
                      {{ t('settings.diagnostics.autoFixable') }}
                    </UBadge>
                  </div>
                </UCard>
              </div>
            </div>
          </div>

          <div v-else class="py-8 text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ t('settings.diagnostics.noData') }}
            </p>
            <UButton
              class="mt-4"
              icon="i-lucide-play"
              @click="refreshDiagnostics"
            >
              {{ t('settings.diagnostics.runDiagnostics') }}
            </UButton>
          </div>
        </UCard>

        <!-- Footer -->
        <SystemFooter />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import SystemFooter from '~/components/SystemFooter.vue';
import type { DiagnosticIssue } from '~/composables/useDiagnostics';

definePageMeta({
  requiresAuth: true,
  layout: 'default',
  middleware: ['require-auth', 'require-admin'],
});

const { t } = useI18n();
const {
  report,
  loading,
  fixing,
  error,
  lastRun,
  runAll,
  autoFix,
  getSeverityColor,
  getStatusColor,
  getStatusIcon,
  getCheckIcon,
  getCheckColor,
} = useDiagnostics();

const hasFixableIssues = computed(() => {
  return report.value?.issues.some((issue) => issue.autoFixable) ?? false;
});

const formatTime = (date: Date) => {
  return new Date(date).toLocaleString();
};

const refreshDiagnostics = async () => {
  try {
    await runAll();
  } catch (err) {
    // Error is handled by composable
  }
};

const handleAutoFix = async () => {
  if (!report.value) return;

  const fixableIssues: DiagnosticIssue[] = report.value.issues
    .filter((i) => i.autoFixable)
    .map((issue) => {
      const mutableIssue: DiagnosticIssue = {
        id: issue.id,
        component: issue.component,
        severity: issue.severity,
        message: issue.message,
        autoFixable: issue.autoFixable,
        fix: issue.fix
          ? {
              description: issue.fix.description,
              command: issue.fix.command,
              estimatedDuration: issue.fix.estimatedDuration,
            }
          : undefined,
        recommendations: issue.recommendations
          ? Array.from(issue.recommendations)
          : undefined,
        details: issue.details,
      };
      return mutableIssue;
    });
  const confirmed = confirm(
    t('settings.diagnostics.confirmFix', {
      count: fixableIssues.length,
    })
  );

  if (!confirmed) return;

  try {
    await autoFix(fixableIssues);
    // Report will be refreshed automatically
  } catch (err) {
    // Error is handled by composable
  }
};

onMounted(() => {
  refreshDiagnostics();
});
</script>
