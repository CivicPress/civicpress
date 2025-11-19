// Utility to normalize configuration field shapes across legacy and metadata formats
// - Legacy: key: value
// - Metadata: key: { value, type, description, required }

export type LegacyOrMeta<T = unknown> = any;

export function getFieldValue<T = unknown>(
  field: LegacyOrMeta<T>
): T | undefined {
  if (field == null) return undefined as any;
  if (typeof field === 'object' && 'value' in field) {
    return (field as any).value as T;
  }
  return field as T;
}

export function getFieldMeta(field: LegacyOrMeta): {
  type?: string;
  description?: string;
  required?: boolean;
} {
  if (field && typeof field === 'object' && 'value' in field) {
    const { type, description, required } = field as any;
    return { type, description, required };
  }
  return {};
}

export function isMetadataField(field: LegacyOrMeta): boolean {
  return !!(field && typeof field === 'object' && 'value' in field);
}
