# Priority Analysis - What to Implement Next

**Date**: 2025-12-15  
**Current Phase**: API Enhancement Phase (v1.3.0)

---

## Top Priority Recommendations

### 1. **UI Pagination Bug Fix** 🔴 **HIGH PRIORITY**

**Why First:**

- **Priority**: High - affects core UI functionality
- **Impact**: Users can't navigate records properly
- **User-facing**: Directly impacts daily usage
- **Blocking**: May prevent users from accessing all records

**Details:**

- **Location**: `modules/ui/app/pages/records/index.vue`
- **Issue**: Mixing client-side and server-side pagination logic
- **Status**: Server-side pagination works, client-side needs fixing
- **Effort**: Medium (investigation + fix)

**Decision**: **Implement First** - Critical UX issue that affects core
functionality

---

### 2. **Templates API Implementation** 🟡 **MEDIUM PRIORITY**

**Why Second:**

- **Priority**: Medium - affects template functionality
- **Impact**: Templates feature is partially broken (stubbed endpoints)
- **User-facing**: Templates UI exists but doesn't work properly
- **Dependencies**: Template engine already exists, just needs API integration

**Details:**

- **Location**: `modules/api/src/routes/templates.ts` (stubbed)
- **Current Status**: Returns empty arrays/mock data
- **Effort**: Medium (API implementation + UI integration)
- **Benefit**: Completes a feature that's partially implemented

**Decision**: **Good Next Step** - Completes a partially implemented feature

---

### 3. **Document Number Generator** 🟡 **MEDIUM PRIORITY**

**Why Third:**

- **Priority**: Medium - affects document numbering accuracy
- **Impact**: Document numbers may not be sequential/correct
- **Data Integrity**: Important for record organization
- **Effort**: Low-Medium (database query implementation)

**Details:**

- **Location**: `core/src/utils/document-number-generator.ts` (line 183)
- **Current Status**: Returns placeholder (always 1)
- **Effort**: Medium (database schema + query logic)
- **Benefit**: Ensures proper document sequencing

**Decision**: **Good Follow-up** - Important for data integrity

---

## Comparison with Roadmap

### Roadmap Alignment

**Current Phase (v0.2.x)**: Core Maturity and Stability

- ✅ Search improvements - **DONE** (Search V2 implemented)
- ✅ Indexing improvements - **DONE**
- 🔄 UI polish and navigation - **IN PROGRESS** (pagination bug)

**Next Phase (v0.3.x)**: Editor, Attachments, and Civic UX

- Templates would fit here (editor/template improvements)

---

## Recommended Implementation Order

### Immediate (This Week)

1. **UI Pagination Bug Fix** 🔴
   - **Rationale**: Critical UX issue, high priority
   - **Impact**: High - users can't navigate records
   - **Effort**: Medium

### Next (1-2 weeks)

2. **Templates API Implementation** 🟡
   - **Rationale**: Completes partially implemented feature
   - **Impact**: Medium - enables template functionality
   - **Effort**: Medium

### Follow-up (2-4 weeks)

3. **Document Number Generator** 🟡
   - **Rationale**: Important for data integrity
   - **Impact**: Medium - affects document organization
   - **Effort**: Medium

---

## Alternative: Bulk Operations (Strategic)

**Consideration**: Bulk Operations API might be strategically important for:

- Large-scale data imports
- Municipal migrations
- Efficiency for clerks

**Trade-off**: Higher effort, but enables important workflows

**Recommendation**: **Defer** until after pagination fix (if pagination is
blocking users)

---

## Summary

**Recommended Next Task**: **UI Pagination Bug Fix**

**Reasons**:

1. ✅ Highest priority (High vs Medium)
2. ✅ Most user-facing impact
3. ✅ Core functionality issue
4. ✅ Aligns with v0.2.x "UI polish" goal
5. ✅ May be blocking users from accessing records

**Estimated Effort**: 2-4 hours (investigation + fix + testing)

---

## Questions to Consider

1. **Is pagination currently blocking users?** (If yes, definitely fix first)
2. **Are templates being used in demos?** (If yes, prioritize templates)
3. **How critical is document numbering?** (If critical, bump up priority)
