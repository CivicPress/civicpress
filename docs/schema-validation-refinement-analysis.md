# Schema Validation Refinement Analysis

**Date**: 2025-12-19  
**Version**: v0.2.0  
**Status**: Analysis for Roadmap Item

## Overview

This document analyzes the current schema validation implementation and
identifies potential refinements for v0.2.0. The schema validation system is
already well-implemented, but there are opportunities to enhance it further.

## Current State

### ✅ What's Already Implemented

1. **JSON Schema Validation** (`RecordSchemaValidator`)
   - Full JSON Schema (draft-07) support using AJV
   - Dynamic schema building from base + type + module + plugin extensions
   - Schema caching for performance
   - Clear error messages with suggestions
   - Format validation (date-time, email, uri)

2. **Business Rule Validation** (`RecordValidator`)
   - Multi-layer validation (schema → business rules → compliance)
   - Type-specific field validation
   - Complex field validation (authors, linked records, attachments, geography)
   - Compliance metadata validation
   - Comprehensive validation result reporting

3. **Documentation**
   - Complete schema validation guide (`docs/schema-validation-guide.md`)
   - API documentation for validation endpoints
   - CLI validation command with detailed output

## Potential Refinements

### 1. Enhanced Business Rule Validations

**Current State**: Basic business rules exist in `validateBusinessRules()` but
are minimal:

- Empty authors array warning
- Created > updated timestamp warning

**Potential Enhancements**:

- **Cross-field validation**: More sophisticated relationships between fields
  - If `status === 'published'`, ensure `updated_at` is set
  - If `type === 'geography'`, ensure `coordinates` or `geojson` is present
  - Validate `linked_records` reference existing records
- **Conditional required fields**: Fields required based on record type or
  status
- **Value range validation**: Numeric fields with min/max constraints
- **String length validation**: Title, description max lengths
- **Date validation**: Ensure dates are reasonable (not too far in past/future)

**Priority**: Medium  
**Effort**: Medium (2-4 hours)

### 2. Improved Error Messages and Suggestions

**Current State**: Error messages are good but could be more contextual

**Potential Enhancements**:

- **Context-aware suggestions**: Suggest fixes based on record type
- **Field value examples**: Show example valid values for enum fields
- **Path-specific errors**: Better handling of nested field errors (e.g.,
  `metadata.custom_field`)
- **Aggregated errors**: Group related errors together (e.g., all date format
  errors)

**Priority**: Low  
**Effort**: Low (1-2 hours)

### 3. Validation Performance Optimization

**Current State**: Schema caching exists, but could be improved

**Potential Enhancements**:

- **Compiled schema caching**: Cache compiled AJV validators, not just schemas
- **Incremental validation**: Validate only changed fields when updating records
- **Parallel validation**: Validate multiple records concurrently
- **Validation profiling**: Add metrics to identify slow validations

**Priority**: Low (performance is already good)  
**Effort**: Medium (3-5 hours)

### 4. Strict Mode Enhancements

**Current State**: `strict` option exists but only affects warnings

**Potential Enhancements**:

- **Additional properties validation**: Validate unknown fields in strict mode
- **Type coercion warnings**: Warn when types are coerced (e.g., string → number
  in YAML)
- **Format strictness**: Reject dates that are valid but not ideal formats

**Priority**: Low  
**Effort**: Low (1-2 hours)

### 5. Validation Coverage Expansion

**Current State**: Core validation is comprehensive, but some edge cases may
exist

**Potential Enhancements**:

- **Template variable validation**: Validate template variables in frontmatter
- **Markdown content validation**: Validate markdown structure (headings, links,
  etc.)
- **File reference validation**: Ensure attached file UUIDs exist
- **Geography data validation**: Validate GeoJSON structure for geography
  records

**Priority**: Medium  
**Effort**: Medium (3-4 hours)

### 6. Better Integration with CLI/API

**Current State**: Validation is integrated, but could provide better UX

**Potential Enhancements**:

- **Validation summary**: Better aggregation of validation results in CLI output
- **Fix suggestions**: Auto-suggest fixes for common validation errors
- **Bulk validation**: Optimize `civic validate --all` for large datasets
- **Validation reports**: Generate HTML/PDF reports of validation results

**Priority**: Low  
**Effort**: Medium (2-3 hours)

### 7. Test Coverage for Edge Cases

**Current State**: No dedicated test file for schema validation found

**Potential Enhancements**:

- **Edge case tests**: Test unusual but valid data formats
- **Error message tests**: Ensure error messages are helpful
- **Performance tests**: Ensure validation remains fast with large records
- **Schema composition tests**: Test complex schema merging scenarios

**Priority**: High (if tests are missing)  
**Effort**: Medium (4-6 hours)

## Recommended Approach for v0.2.0

Given that schema validation is already well-implemented, the "refine" task for
v0.2.0 should focus on:

### Option A: Enhancement (Recommended)

Focus on **Enhanced Business Rule Validations** (#1) and **Validation Coverage
Expansion** (#5):

- Add 5-10 additional business rule validations
- Expand validation for type-specific fields
- Improve cross-field validation

**Estimated Effort**: 4-6 hours  
**Impact**: High - improves data quality and catches more issues

### Option B: Polish

Focus on **Improved Error Messages** (#2) and **Better Integration** (#6):

- Enhance error messages with better suggestions
- Improve CLI validation output
- Add validation summaries

**Estimated Effort**: 3-4 hours  
**Impact**: Medium - improves developer experience

### Option C: Testing

Focus on **Test Coverage** (#7):

- Add comprehensive test suite for validation
- Test edge cases and error scenarios
- Ensure robust validation behavior

**Estimated Effort**: 4-6 hours  
**Impact**: High - ensures reliability

## Conclusion

The schema validation system is already production-ready. For v0.2.0, "refine"
should mean:

1. **Add more business rule validations** (most valuable)
2. **Expand validation coverage** for edge cases
3. **Improve error messages** for better UX

If the system is working well in practice, this item could also be marked as
complete with a note that refinements can be done as needed based on real-world
usage.
