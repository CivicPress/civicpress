/**
 * Validating a parameter that is a NAME.
 *
 * A record type, a template type, a config type: each ends up as one segment
 * of a filesystem path. The core functions that build those paths confine them
 * now (`core/src/utils/path-containment.ts`), so this is not what stops a
 * traversal. It is what makes the request answer `400 — not a valid type`
 * instead of `200 — no such records`, and what rejects a parameter sent twice
 * before it arrives somewhere as an array.
 */
import type { ValidationChain } from 'express-validator';

/** Letters, digits, `_` and `-`: what every shipped type name is made of. */
export const NAME_PATTERN = /^[a-z0-9_-]+$/i;

/**
 * `chain` must be a single string that is a name. `bail()` after `isString()`
 * matters: the later validators run per element on an array, so without it
 * `?type=a&type=b` passes them all.
 */
export function isName(chain: ValidationChain, label: string): ValidationChain {
  return chain
    .isString()
    .withMessage(`${label} must be a string`)
    .bail()
    .isLength({ min: 1, max: 100 })
    .withMessage(`${label} must be between 1 and 100 characters`)
    .matches(NAME_PATTERN)
    .withMessage(`${label} may contain only letters, digits, "_" and "-"`);
}
