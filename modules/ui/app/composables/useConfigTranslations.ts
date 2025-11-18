/**
 * Composable for translating configuration-driven values
 *
 * This composable provides a centralized way to translate values that come
 * from configuration files (record types, statuses, roles, etc.) without
 * modifying the config keys themselves.
 *
 * @example
 * ```ts
 * const { translateRecordType, translateStatus } = useConfigTranslations();
 * const label = translateRecordType('bylaw', 'Bylaw'); // Returns translated or 'Bylaw'
 * ```
 */
export function useConfigTranslations() {
  const { t } = useI18n();

  /**
   * Generic function to translate a config value
   * @param category - Translation category (e.g., 'recordTypes', 'statuses')
   * @param key - The config key to translate
   * @param fallback - Fallback value if translation not found
   * @returns Translated string or fallback
   */
  const translateConfigValue = (
    category: string,
    key: string,
    fallback?: string
  ): string => {
    if (!key) return fallback || key;

    // Ensure we have a fallback
    const safeFallback = fallback || key;

    const translationKey = `${category}.${key}`;

    try {
      const translated = t(translationKey);

      // If translation exists and is different from the key (meaning it was found)
      // and is not empty, use it
      if (
        translated &&
        translated !== translationKey &&
        translated.trim() !== ''
      ) {
        return translated;
      }
    } catch (e) {
      // If translation fails, use fallback
    }

    // Fallback to provided value or key
    return safeFallback;
  };

  /**
   * Translate a record type key
   * @param key - Record type key (e.g., 'bylaw', 'policy')
   * @param fallback - Fallback label from API/config
   * @returns Translated record type label
   */
  const translateRecordType = (key: string, fallback?: string): string => {
    return translateConfigValue('recordTypes', key, fallback);
  };

  /**
   * Translate a record status key
   * @param key - Status key (e.g., 'draft', 'approved')
   * @param fallback - Fallback label from API/config
   * @returns Translated status label
   */
  const translateStatus = (key: string, fallback?: string): string => {
    return translateConfigValue('statuses', key, fallback);
  };

  return {
    translateConfigValue,
    translateRecordType,
    translateStatus,
  };
}
