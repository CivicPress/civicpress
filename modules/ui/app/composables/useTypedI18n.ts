import { useI18n } from 'vue-i18n';

/**
 * Thin wrapper over vue-i18n that adds a typed plural helper.
 *
 * The base `t` from `useI18n()` does not expose an overload for
 * `(key, count, named-args)` plural form under this project's typed
 * config, so direct callers cast to `any`. Centralising the cast in
 * one composable lets the rule actually fire everywhere else.
 */
export function useTypedI18n() {
  const i18n = useI18n();

  function tPlural(key: string, count: number): string {
    // The only `as any` newly introduced by followup #2.
    // Reason: vue-i18n typed-t lacks an overload for the
    // (key, count) plural form used by these messages. The plural index
    // is set from `count`; messages reference {count} which is back-filled
    // by vue-i18n's createMessageContext from options.pluralIndex.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (i18n.t as any)(key, count);
  }

  return { ...i18n, tPlural };
}
