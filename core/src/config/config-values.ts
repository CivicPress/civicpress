/**
 * Reading a setting out of an editable configuration file.
 *
 * Editable configuration is written in a "field" shape, where a leaf is not
 * the value but a description of it:
 *
 *     email_per_hour:
 *       value: 100
 *       type: 'number'
 *       description: 'Maximum emails per hour'
 *       required: true
 *
 * The settings UI renders its form from those attributes, so every writer the
 * project owns produces this shape: the shipped defaults that `civic init`
 * copies into a new instance, `ConfigurationService.saveConfiguration()` behind
 * the config editor, reset-to-defaults, and the notifications migration.
 *
 * Code that READS a setting wants `100`. A reader that casts the parsed file to
 * its typed shape without unwrapping gets an object wherever it declared a
 * scalar, and nothing fails: the object is truthy, so a switch that is off
 * reads as on, and arithmetic on it yields NaN. `unwrapConfigValues` turns
 * either shape into the plain one, so a reader can do it once, at load.
 */

/** The attributes a field carries beside its `value`. */
const FIELD_ATTRIBUTES = ['type', 'description', 'required', 'options'];

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/**
 * Is `input` a field — `{ value, type?, description?, required?, options? }` —
 * rather than a group of settings that happens to contain a key named `value`?
 *
 * It is a field if `value` is its only key, or if it sits beside at least one
 * field attribute. `{ value: 1, unit: 'ms' }` is therefore left alone: that is
 * somebody's data, not a description of a setting.
 */
export function isConfigField(input: unknown): input is { value: unknown } {
  if (
    !isPlainObject(input) ||
    !Object.prototype.hasOwnProperty.call(input, 'value')
  ) {
    return false;
  }
  const others = Object.keys(input).filter((key) => key !== 'value');
  return (
    others.length === 0 || others.some((key) => FIELD_ATTRIBUTES.includes(key))
  );
}

/**
 * Return `input` with every field replaced by its value, at any depth. Values
 * already in the plain shape come back unchanged, so this is safe to apply to
 * a file of either shape — or of both, which is what a hand-edited file is.
 */
export function unwrapConfigValues<T = unknown>(input: unknown): T {
  if (Array.isArray(input)) {
    return input.map((item) => unwrapConfigValues(item)) as T;
  }
  if (isConfigField(input)) {
    return unwrapConfigValues<T>(input.value);
  }
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      out[key] = unwrapConfigValues(value);
    }
    return out as T;
  }
  return input as T;
}
