# Nuxt 4 Upgrade Status & Migration Plan

**Date**: 2025-11-17  
**Current Nuxt Version**: 4.0.0 (installed)  
**Target Version**: 4.2.1 (latest stable)

## Executive Summary

✅ **Good News**: Nuxt 4.0.0 is already installed and the project structure is compatible with Nuxt 4 (`app/` directory structure).

⚠️ **Issues Found**: 
- TypeScript errors that need resolution
- Some dependencies need updating for full Nuxt 4 compatibility
- Configuration needs minor adjustments

## Current Status

### ✅ What's Working

1. **Directory Structure**: Already using Nuxt 4 structure
   - `app/` directory is the primary source (Nuxt 4 standard)
   - `public/` directory exists (correct for Nuxt 4)
   - No `static/` directory (correctly migrated)

2. **Core Dependencies**:
   - `nuxt: 4.0.0` ✅ Installed
   - `vue: 3.5.17` ✅ Compatible
   - `pinia: 3.0.3` ✅ Compatible
   - `@pinia/nuxt: 0.11.2` ✅ Compatible

3. **Nuxt Features in Use** (200+ occurrences):
   - `useFetch`, `useRuntimeConfig`, `navigateTo` - All compatible
   - `defineNuxtPlugin`, `defineNuxtRouteMiddleware` - All compatible
   - `useNuxtApp`, `useRoute`, `useRouter` - All compatible

### ⚠️ Issues Requiring Attention

#### 1. TypeScript Errors (12 errors found)

**Location**: `modules/ui/app/`

**Errors**:
- `app/pages/settings/profile.vue`: Color type mismatches (`"green"`, `"red"` not assignable)
- `app/pages/settings/profile.vue`: Type assertions needed for `response` object
- `app/pages/settings/profile.vue`: Property `avatar` doesn't exist (should use `avatar_url`)
- `app/pages/settings/profile.vue`: Property `email_verified` should be `emailVerified`
- `app/plugins/01-civicApi.ts`: Headers type issue
- `app/stores/auth.ts`: Type assertions needed for `response` object
- `app/utils/api-response.ts`: Generic type constraint issue
- `app/utils/geography-colors.ts`: Undefined type issue
- `nuxt.config.ts`: `rewrite` property doesn't exist in Nuxt 4 proxy config

#### 2. Dependency Updates Needed

**Critical Updates**:
- `nuxt: 4.0.0` → `4.2.1` (latest stable)
- `@nuxt/ui-pro: 3.2.0` → `3.3.7` (latest, Nuxt 4 compatible)
- `@nuxt/test-utils: 3.19.2` → `3.20.1` (or check for Nuxt 4 version)

**Recommended Updates**:
- `@nuxt/eslint: 1.6.0` → `1.10.0`
- `@nuxt/scripts: 0.11.10` → `0.13.0`
- `@pinia/nuxt: 0.11.2` → `0.11.3`
- `pinia: 3.0.3` → `3.0.4`
- `vue: 3.5.17` → `3.5.24`
- `vue-router: 4.5.1` → `4.6.3`
- `@vueuse/core: 13.5.0` → `14.0.0` (major version - check breaking changes)
- `pinia-plugin-persistedstate: 4.4.1` → `4.7.1`
- `vue-tsc: 2.2.12` → `3.1.4` (major version - check breaking changes)

#### 3. Configuration Issues

**`nuxt.config.ts`**:
- `nitro.devProxy.rewrite` property doesn't exist in Nuxt 4
- Should use `pathRewrite` or remove if not needed

## Migration Plan

### Phase 1: Fix TypeScript Errors (Priority: High)

**Estimated Time**: 1-2 hours

1. **Fix `app/pages/settings/profile.vue`**:
   - Replace `"green"` and `"red"` with valid color values (`"primary"`, `"error"`)
   - Add type assertions for `response` objects
   - Replace `avatar` with `avatar_url`
   - Replace `email_verified` with `emailVerified`

2. **Fix `app/plugins/01-civicApi.ts`**:
   - Fix Headers type handling (use proper type guards)

3. **Fix `app/stores/auth.ts`**:
   - Add type assertions for `response` objects

4. **Fix `app/utils/api-response.ts`**:
   - Add proper generic type constraints

5. **Fix `app/utils/geography-colors.ts`**:
   - Handle undefined values properly

6. **Fix `nuxt.config.ts`**:
   - Remove or replace `rewrite` property in `nitro.devProxy`

### Phase 2: Update Dependencies (Priority: High)

**Estimated Time**: 30 minutes + testing

1. **Update Core Dependencies**:
   ```bash
   cd modules/ui
   pnpm update nuxt@latest @nuxt/ui-pro@latest @pinia/nuxt@latest
   ```

2. **Update Supporting Dependencies**:
   ```bash
   pnpm update pinia vue vue-router @nuxt/eslint @nuxt/scripts
   ```

3. **Update Major Versions (with caution)**:
   ```bash
   # Check breaking changes first
   pnpm update @vueuse/core@latest vue-tsc@latest
   ```

4. **Check `@nuxt/test-utils`**:
   - Verify if version 3.20.1 works with Nuxt 4
   - Or check for Nuxt 4-specific version

### Phase 3: Run Automated Migration Tools (Priority: Medium)

**Estimated Time**: 15 minutes

1. **Run Nuxt 4 Codemod**:
   ```bash
   cd modules/ui
   npx codemod@latest nuxt/4/migration-recipe
   ```

2. **Review changes** and commit if acceptable

### Phase 4: Testing & Validation (Priority: High)

**Estimated Time**: 2-3 hours

1. **Type Checking**:
   ```bash
   pnpm run typecheck
   ```
   - Should pass with 0 errors

2. **Development Server**:
   ```bash
   pnpm run dev
   ```
   - Verify all pages load correctly
   - Test authentication flow
   - Test API integration

3. **Build Test**:
   ```bash
   pnpm run build
   ```
   - Verify production build succeeds

4. **Functional Testing**:
   - Test all major features:
     - Authentication (login, logout, register)
     - Record management (CRUD operations)
     - Geography features
     - User management
     - Settings pages
     - File uploads/downloads

### Phase 5: Documentation Update (Priority: Low)

**Estimated Time**: 30 minutes

1. Update `modules/ui/README.md` if needed
2. Update any migration notes
3. Document any breaking changes encountered

## Risk Assessment

### Low Risk
- ✅ Directory structure already compatible
- ✅ Core Nuxt APIs in use are compatible
- ✅ Most dependencies have compatible versions

### Medium Risk
- ⚠️ TypeScript errors need fixing (could hide runtime issues)
- ⚠️ `@vueuse/core` major version update (13 → 14) may have breaking changes
- ⚠️ `vue-tsc` major version update (2 → 3) may have breaking changes

### High Risk
- ⚠️ `@nuxt/test-utils` version 3.x may not be fully compatible with Nuxt 4
- ⚠️ Configuration changes in `nuxt.config.ts` need testing

## Breaking Changes to Watch For

### Nuxt 4 Specific
1. **Directory Structure**: ✅ Already migrated
2. **Import Paths**: May need `#app` → `#imports` changes (check codemod output)
3. **Nitro Proxy**: `rewrite` → `pathRewrite` or different API

### Dependency-Specific
1. **@vueuse/core v14**: Check changelog for breaking changes
2. **vue-tsc v3**: May have stricter type checking

## Recommended Approach

1. **Start with Phase 1** (Fix TypeScript errors) - This is blocking
2. **Then Phase 2** (Update dependencies) - Get latest compatible versions
3. **Run Phase 3** (Codemod) - Automated fixes
4. **Thorough Phase 4** (Testing) - Ensure everything works
5. **Complete Phase 5** (Documentation) - Update docs

## Success Criteria

- ✅ All TypeScript errors resolved
- ✅ All dependencies updated to Nuxt 4 compatible versions
- ✅ Development server runs without errors
- ✅ Production build succeeds
- ✅ All major features tested and working
- ✅ No runtime errors in browser console

## Timeline Estimate

- **Phase 1**: 1-2 hours
- **Phase 2**: 30 minutes + testing
- **Phase 3**: 15 minutes
- **Phase 4**: 2-3 hours
- **Phase 5**: 30 minutes

**Total Estimated Time**: 4-6 hours

## Next Steps

1. Review this plan
2. Start with Phase 1 (TypeScript fixes)
3. Proceed systematically through each phase
4. Test thoroughly after each phase
5. Document any issues encountered

