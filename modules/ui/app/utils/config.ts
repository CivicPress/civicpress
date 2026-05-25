// Utility to normalize configuration field shapes across legacy and metadata formats
// - Legacy: key: value
// - Metadata: key: { value, type, description, required }

/**
 * A configuration field that may be either a bare value (legacy) or a
 * metadata-wrapped object (`{ value, type, description, required }`).
 */
export type LegacyOrMeta<T = unknown> =
  | T
  | { value: T; type?: string; description?: string; required?: boolean };

/** Metadata-wrapped shape narrow guard. */
interface MetadataField<T = unknown> {
  value: T;
  type?: string;
  description?: string;
  required?: boolean;
}

function isMetadataShape<T>(field: unknown): field is MetadataField<T> {
  return !!field && typeof field === 'object' && 'value' in field;
}

export function getFieldValue<T = unknown>(
  field: LegacyOrMeta<T>
): T | undefined {
  if (field == null) return undefined;
  if (isMetadataShape<T>(field)) {
    return field.value;
  }
  return field as T;
}

export function getFieldMeta(field: LegacyOrMeta): {
  type?: string;
  description?: string;
  required?: boolean;
} {
  if (isMetadataShape(field)) {
    const { type, description, required } = field;
    return { type, description, required };
  }
  return {};
}

export function isMetadataField(field: LegacyOrMeta): boolean {
  return isMetadataShape(field);
}
