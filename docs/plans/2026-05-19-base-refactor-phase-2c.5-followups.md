# Phase 2c.5 Foundation Cleanup Follow-ups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the trivial items left dangling by Phase 2c's structural cleanup so the foundation-layer truth-restoration spine reaches every audit-named cleanup site.

**Architecture:** Apply the patterns Phase 2c established — canonical `EmailChannel` everywhere, unified `AuditChannel` everywhere, no vestigial plumbing — to the 4 remaining sites the Phase 2c closure report's §"Surfaced, not fixed" flagged as cheap. The 5th surfaced item (pre-existing storage test breakage, 28 failures across 10 files) is explicitly **out of scope** for a 1-day sub-session; document it here and defer to Phase 2d intake.

**Tech Stack:** TypeScript (Node ESM), Vitest, pnpm workspaces. Patterns to reuse: `RecordManager.writeAudit` helper (`core/src/records/record-manager.ts:130-165`); `AuditChannel.record` (`core/src/audit/audit-channel.ts:61-107`); canonical `EmailChannel` (`core/src/notifications/channels/email-channel.ts`).

**Branch:** `refactor/phase-2c.5-followups` (already cut off `dev`'s tip `9e89a42`). **No push** per the master refactor branch policy.

**Scope rationale (1-day fit):**
- T1 (4th EmailChannel migration) — bounded, ~50 LoC in 1 file, has a precedent in T6 of Phase 2c. **Fits.**
- T2 (2 `db.logAuditEvent` callers in core/auth) — pattern established by T9; cascades into `AuthService` + `EmailValidationService` constructor signatures and one DI wiring change. ~80 LoC across 3 files. **Fits.**
- T3 (vestigial `secretsManager?` in `NotificationSecurity`) — removes one field + one initializer in 2 classes + 1 DI call. Closure report called it "cascades across 3 files — defer"; on re-inspection, the cascade is just 3 references in 3 files and **NotificationService's own `secretsManager` field is also now unused** (only consumer was `security.initializeSecrets`). ~30 LoC. **Fits.**
- T4 (orphan `SagaRecoveryError` class) — 20-LoC class with zero imports. **Fits.**
- T5 (storage test breakage) — 28 failures across 10 files: `lifecycle-manager`, `orphaned-file-cleaner`, `batch-operations`, `streaming-operations`, `circuit-breaker`, `retry`, `health-checker`, `timeout-utils`, `usage-reporter`, plus 1 more. **Out of scope.** Documented in T6 (closure note) but not fixed.

---

## File Structure

**Modified (4):**
- `modules/api/src/routes/notifications.ts` — replace inline ad-hoc EmailChannel with canonical `EmailChannel` from `@civicpress/core`.
- `core/src/auth/auth-service.ts` — add optional `auditChannel?: AuditChannel` constructor arg + private `writeAudit` helper; route the `db.logAuditEvent` call at line 717 through it; pass channel into `EmailValidationService`.
- `core/src/auth/email-validation-service.ts` — same pattern: optional `auditChannel`, `writeAudit` helper, route call at line 545 through it.
- `core/src/notifications/notification-security.ts` — remove `secretsManager?` field + `initializeSecrets` method (both vestigial after T7 deleted webhook signature code).
- `core/src/notifications/notification-service.ts` — remove `secretsManager?` field + `initializeSecrets` method (only consumer was `security.initializeSecrets`).
- `core/src/civic-core-services.ts` — inject `auditChannel` into `AuthService`; remove the `notificationService.initializeSecrets(secretsManager)` call (no longer needed).
- `core/src/saga/errors.ts` — delete the `SagaRecoveryError` class (orphan after T3 deleted `saga-recovery.ts`).

**Deleted (0):** none — `errors.ts` keeps its other 5 classes.

**New tests (3):**
- `tests/core/auth/auth-service-audit-channel.test.ts` — pin the `logAuthEvent → writeAudit → AuditChannel.record` wire.
- `tests/core/auth/email-validation-audit-channel.test.ts` — same, for the email-change completion audit at line 545.
- Add cases to `tests/core/audit/audit-channel.test.ts`? No — the channel itself doesn't change. The wire tests above are the new contract; the channel tests already pin its behavior.

**No test changes (1):**
- `modules/api/tests` (if any) — T1's surface is an admin `/test` endpoint that hits live SMTP/SendGrid; existing tests (if present) cover the route shape, not the transport. No new tests needed for T1; manual sanity check via type-check + build is sufficient since the canonical `EmailChannel` is already tested in `tests/core/notifications/email-channel.test.ts`.

---

## Task Execution Order

T4 → T3 → T1 → T2 → T6 (note), in that order, because:
1. T4 (delete `SagaRecoveryError`) is the trivial isolation case; clears mental space.
2. T3 (vestigial secretsManager) touches the same files T1 will touch (notification-service.ts is imported by api routes). Doing it first avoids a re-edit.
3. T1 (EmailChannel migration) is bounded to one file.
4. T2 (AuditChannel for core/auth) is the most complex — DI cascading. Do it once T3 has cleaned the DI surface.
5. T6 is a documentation note only.

---

## Task 1: Delete the orphan SagaRecoveryError class

**Files:**
- Modify: `core/src/saga/errors.ts:147-166`

- [ ] **Step 1: Confirm zero imports**

Run: `grep -rn "SagaRecoveryError" --include="*.ts" .`
Expected: only matches in `core/src/saga/errors.ts` itself; no imports anywhere.

- [ ] **Step 2: Delete the class + the `InternalError` import if it becomes unused**

Edit `core/src/saga/errors.ts`. Remove lines 147-166 (the `SagaRecoveryError` class block including the leading docstring). Then check whether `InternalError` is still imported from `../errors/index.js` for any other use in the file — if it was only used by `SagaRecoveryError`, remove the import.

- [ ] **Step 3: Verify the file still type-checks**

Run: `pnpm -C core typecheck` (or `pnpm -C core build`)
Expected: clean. No unresolved symbols, no unused imports.

- [ ] **Step 4: Verify nothing else broke**

Run: `pnpm -C core test --run`
Expected: same pass count as before this task (the deleted class had no tests; nothing imported it).

- [ ] **Step 5: Commit**

```bash
git add core/src/saga/errors.ts
git commit -m "refactor(2c.5 T1): delete orphan SagaRecoveryError class

Phase 2c Task 3 deleted core/src/saga/saga-recovery.ts but left
the SagaRecoveryError class in core/src/saga/errors.ts behind to
keep the parallel-subagent scope tight. Grep confirms zero imports.
Surfaced as item 4 in the Phase 2c closure report.

Closes the Phase 2c.5 surfaced-item-4 follow-up.
"
```

---

## Task 2: Remove vestigial `secretsManager?` plumbing in NotificationSecurity + NotificationService

**Why:** Phase 2c Task 7 (`2700e8d`) deleted `validateWebhookSignature` + `generateWebhookSignature` — the only consumers of `secretsManager` inside `NotificationSecurity`. The field, the `initializeSecrets` method, and the `initializeSecrets` call chain through `NotificationService` and `civic-core-services.ts` are now all dead.

**Files:**
- Modify: `core/src/notifications/notification-security.ts:1, 9-10, 18-23` — drop the field, the import, and the init method.
- Modify: `core/src/notifications/notification-service.ts:10, 41-43, 48-51, 58-64` — drop `SecretsManager` import, field, the init call in the constructor, and the public `initializeSecrets` method.
- Modify: `core/src/civic-core-services.ts:248-251` — drop the `notificationService.initializeSecrets(secretsManager)` call.

- [ ] **Step 1: Sanity-check no other consumer in either class**

Run: `grep -n "secretsManager" core/src/notifications/notification-security.ts core/src/notifications/notification-service.ts`
Expected: matches only at the lines being removed (security: 10, 21-22; service: 41, 48-50, 62-63).

- [ ] **Step 2: Edit notification-security.ts**

Remove the import + field + method. The diff (using Edit tool):

Old:
```ts
import { SecretsManager } from '../security/secrets.js';

export interface SecurityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class NotificationSecurity {
  private secretsManager?: SecretsManager;
  private piiPatterns: RegExp[] = [
```

New:
```ts
export interface SecurityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class NotificationSecurity {
  private piiPatterns: RegExp[] = [
```

Then remove the `initializeSecrets` method block (lines 18-23):

Old:
```ts
  /**
   * Initialize with secrets manager for webhook signature validation
   */
  initializeSecrets(secretsManager: SecretsManager): void {
    this.secretsManager = secretsManager;
  }

  /**
   * Validate notification request
   */
```

New:
```ts
  /**
   * Validate notification request
   */
```

- [ ] **Step 3: Edit notification-service.ts**

Remove the `SecretsManager` import + the field + the constructor init block + the public `initializeSecrets` method.

Old (around line 10):
```ts
import { SecretsManager } from '../security/secrets.js';
```

New: delete the line.

Old (around lines 41-51):
```ts
  private logger: NotificationLogger;
  private secretsManager?: SecretsManager;

  constructor(config: NotificationConfig, secretsManager?: SecretsManager) {
    this.config = config;
    this.audit = new NotificationAudit();
    this.queue = new NotificationQueue();
    this.security = new NotificationSecurity();
    this.secretsManager = secretsManager;
    if (secretsManager) {
      this.security.initializeSecrets(secretsManager);
    }
    this.rateLimiter = new NotificationRateLimiter(
```

New:
```ts
  private logger: NotificationLogger;

  constructor(config: NotificationConfig) {
    this.config = config;
    this.audit = new NotificationAudit();
    this.queue = new NotificationQueue();
    this.security = new NotificationSecurity();
    this.rateLimiter = new NotificationRateLimiter(
```

Old (around lines 58-64, the public method):
```ts
  /**
   * Initialize secrets manager for webhook signature validation
   */
  initializeSecrets(secretsManager: SecretsManager): void {
    this.secretsManager = secretsManager;
    this.security.initializeSecrets(secretsManager);
  }

  /**
   * Register a notification channel
   */
```

New:
```ts
  /**
   * Register a notification channel
   */
```

- [ ] **Step 4: Edit civic-core-services.ts**

Remove the now-dead `notificationService.initializeSecrets` call.

Old (around lines 248-251):
```ts
  // Initialize secrets in notification service
  const notificationService =
    container.resolve<NotificationService>('notification');
  notificationService.initializeSecrets(secretsManager);
```

New: delete those 4 lines. (The `notificationService` resolution is the only use of that variable; nothing else.)

- [ ] **Step 5: Confirm no other caller of the now-deleted methods**

Run: `grep -rn "notificationService.initializeSecrets\|\.security\.initializeSecrets\|NotificationSecurity.*initializeSecrets" --include="*.ts" .`
Expected: zero matches.

- [ ] **Step 6: Run core tests + build**

Run: `pnpm -C core test --run && pnpm -C core build`
Expected: pass count unchanged (existing notification tests don't exercise the removed init path; the email-validation-service still calls `notificationService.initializeSecrets` — wait, check this!).

**Check:** Does `core/src/auth/email-validation-service.ts:83` still call `this.notificationService.initializeSecrets(secretsManager)`? If yes, that call also needs removal.

- [ ] **Step 7: Edit email-validation-service.ts to drop the now-removed call**

Old (around lines 80-84):
```ts
  initializeSecrets(secretsManager: SecretsManager): void {
    this.secretsManager = secretsManager;
    // Also initialize secrets in notification service used by email validation
    this.notificationService.initializeSecrets(secretsManager);
  }
```

New:
```ts
  initializeSecrets(secretsManager: SecretsManager): void {
    this.secretsManager = secretsManager;
  }
```

- [ ] **Step 8: Re-run tests + build**

Run: `pnpm -C core test --run && pnpm -C core build`
Expected: clean.

- [ ] **Step 9: Full repo test**

Run: `pnpm test --run 2>&1 | tail -30`
Expected: same pass count as Phase 2c closure (1191 / 1 / 19). No new regressions.

- [ ] **Step 10: Commit**

```bash
git add core/src/notifications/notification-security.ts core/src/notifications/notification-service.ts core/src/civic-core-services.ts core/src/auth/email-validation-service.ts
git commit -m "refactor(2c.5 T2): drop vestigial secretsManager plumbing in NotificationSecurity

Phase 2c Task 7 (commit 2700e8d) deleted validateWebhookSignature
and generateWebhookSignature from NotificationSecurity — the only
consumers of its secretsManager field. The field, its initializeSecrets
method, and the dependent chain through NotificationService and
civic-core-services.ts were all dead afterward.

Removed:
- NotificationSecurity: secretsManager? field, initializeSecrets method,
  SecretsManager import
- NotificationService: secretsManager? field, constructor arg,
  initializeSecrets method, SecretsManager import
- civic-core-services.ts: notificationService.initializeSecrets call
- EmailValidationService.initializeSecrets: dropped the now-orphan
  notificationService.initializeSecrets relay

Auth services that legitimately use SecretsManager (auth-service.ts,
email-validation-service.ts own field for token signing) are unaffected.

Closes the Phase 2c.5 surfaced-item-3 follow-up.
"
```

---

## Task 3: Migrate the 4th ad-hoc EmailChannel in modules/api/src/routes/notifications.ts

**Why:** Phase 2c Task 6 consolidated 3 ad-hoc EmailChannel implementations into one canonical `EmailChannel` (`core/src/notifications/channels/email-channel.ts`). Recon at plan time missed a 4th at `modules/api/src/routes/notifications.ts:64-116`. Migrate it.

**Files:**
- Modify: `modules/api/src/routes/notifications.ts` — replace the inline channel with `EmailChannel` from `@civicpress/core`.

**Note on the dynamic import pattern:** the existing code does `await import('nodemailer')` and `await import('@sendgrid/mail')` inside the route handler. Since `EmailChannel` already does its own static imports of nodemailer, and the SendGrid path in `EmailChannel` uses nodemailer's `service: 'SendGrid'` shortcut (not `@sendgrid/mail`), we can remove the dynamic imports here too. **This drops the standalone `@sendgrid/mail` code path** — verify the canonical `EmailChannel` SendGrid behavior is equivalent for this admin test endpoint's needs.

- [ ] **Step 1: Verify canonical EmailChannel exports**

Run: `grep -n "export " core/src/notifications/channels/email-channel.ts`
Expected: `EmailChannel` class is exported; types `EmailChannelOptions`, `SmtpOptions`, `SendGridOptions`, `EmailMessage` are exported.

- [ ] **Step 2: Confirm @civicpress/core re-exports EmailChannel**

Run: `grep -rn "EmailChannel" core/src/index.ts core/src/notifications/index.ts 2>/dev/null`
Expected: `EmailChannel` is re-exported from the core public surface.

If NOT exported, add to `core/src/notifications/index.ts`:
```ts
export { EmailChannel, type EmailChannelOptions, type EmailMessage } from './channels/email-channel.js';
```
And ensure `core/src/index.ts` re-exports from `notifications/index.js` (it should already).

- [ ] **Step 3: Rewrite the inline channel in notifications.ts**

Old (`modules/api/src/routes/notifications.ts`, lines 1-8 imports + 58-116 the inline channel):
```ts
import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import {
  AuditLogger,
  NotificationService,
  NotificationConfig,
  AuthTemplate,
} from '@civicpress/core';
```

New imports:
```ts
import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import {
  AuditLogger,
  NotificationService,
  NotificationConfig,
  AuthTemplate,
  EmailChannel,
} from '@civicpress/core';
```

Then replace lines 58-116 (the `effectiveProvider` block + the inline `emailChannel` object + the `service.registerChannel('email', emailChannel as any)` call) with:

```ts
    // Build the canonical EmailChannel for this test send.
    const effectiveProvider = provider || emailConfig.provider || 'sendgrid';
    const rawCreds =
      (emailConfig as any)[effectiveProvider] || (emailConfig as any).sendgrid;
    const credentials = normalizeMetadata<any>(rawCreds);

    let channel: EmailChannel;
    if (effectiveProvider === 'smtp' || effectiveProvider === 'nodemailer') {
      channel = new EmailChannel({
        smtp: {
          host: String(credentials.host || ''),
          port: Number(credentials.port ?? 587),
          secure: Boolean(credentials.secure),
          auth: credentials.auth,
          tls: credentials.tls || { rejectUnauthorized: false },
        },
        defaultFrom: credentials.from,
      });
    } else {
      channel = new EmailChannel({
        sendgrid: { apiKey: credentials.apiKey },
        defaultFrom: credentials.from,
      });
    }

    // Wrap the EmailChannel in a NotificationChannel-shaped object so the
    // existing NotificationService.registerChannel + sendNotification flow
    // can reuse it. (The canonical EmailChannel has a simpler `send(message)`
    // surface; NotificationService expects send(request).)
    const notificationChannel = {
      getName() {
        return 'email';
      },
      isEnabled() {
        return true;
      },
      async send(request: any) {
        const subj =
          request?.content?.subject || subject || 'CivicPress Notification';
        const bodyText =
          request?.content?.text || request?.content?.body || message || '';
        const bodyHtml = request?.content?.html || undefined;
        const result = await channel.send({
          to,
          subject: subj,
          text: bodyText,
          html: bodyHtml,
        });
        return { success: true, messageId: result.messageId };
      },
    };

    const service = new NotificationService(config);
    service.registerChannel('email', notificationChannel as any);
```

(The rest of the route — `registerTemplate`, `sendNotification`, audit logging — stays unchanged.)

- [ ] **Step 4: Type-check + build**

Run: `pnpm -C modules/api build`
Expected: clean.

- [ ] **Step 5: Run any existing api notifications tests**

Run: `find modules/api -name "*notifications*test*" -o -name "*notifications*spec*" 2>/dev/null`
If tests exist, run them: `pnpm -C modules/api test --run`
Expected: pass.

If no tests exist for this route, document it: the canonical `EmailChannel` is already tested in `tests/core/notifications/email-channel.test.ts` (Phase 2c T6). The route's wire-through to it is a typed connection that the type-check covers.

- [ ] **Step 6: Full repo test**

Run: `pnpm test --run 2>&1 | tail -10`
Expected: pass count unchanged from T2 (1191 / 1 / 19).

- [ ] **Step 7: Commit**

```bash
git add modules/api/src/routes/notifications.ts
git add core/src/notifications/index.ts  # only if step 2 needed the re-export
git commit -m "refactor(2c.5 T3): migrate 4th ad-hoc EmailChannel to canonical impl

Phase 2c Task 6 (commit 7b783af) consolidated 3 ad-hoc EmailChannel
implementations into core/src/notifications/channels/email-channel.ts.
Recon at plan time missed this 4th: an inline nodemailer.createTransport
+ @sendgrid/mail dual-path channel inside the POST /notifications/test
admin route.

This commit replaces the inline channel with the canonical EmailChannel,
wrapped in a thin NotificationChannel-shaped adapter so the existing
NotificationService.registerChannel + sendNotification flow keeps working.

The standalone @sendgrid/mail code path is dropped — the canonical
EmailChannel uses nodemailer's service: 'SendGrid' shortcut, which is
sufficient for this admin test endpoint. If/when richer SendGrid features
are needed (sandbox mode, templates), they get added to EmailChannel
once, not duplicated here.

Closes the Phase 2c.5 surfaced-item-1 follow-up. Now ONE canonical
EmailChannel; the 'consolidation but missed one' caveat in the Phase 2c
closure is gone.
"
```

---

## Task 4: Migrate the 2 direct db.logAuditEvent callers in core/auth via AuditChannel

**Why:** Phase 2c Task 9 (`79e1033`) introduced the unified `AuditChannel` and migrated `RecordManager` + `SagaExecutor` through it. 2 direct `db.logAuditEvent` callers in core/auth remain. They bypass the unified channel — meaning auth events (login, logout, email-change) appear in the DB but NOT in the file-JSONL resilient log. Migrate to the same `writeAudit`-helper pattern.

**Files:**
- Modify: `core/src/auth/auth-service.ts` — add optional `auditChannel?: AuditChannel` constructor arg, add private `writeAudit` helper, route `logAuthEvent`'s `db.logAuditEvent` call (line 717) through it, pass the channel into the `EmailValidationService` constructor.
- Modify: `core/src/auth/email-validation-service.ts` — add optional `auditChannel?: AuditChannel` constructor arg, add private `writeAudit` helper, route `completeEmailChange`'s `db.logAuditEvent` call (line 545) through it.
- Modify: `core/src/civic-core-services.ts` — inject `auditChannel` into `AuthService` factory.

**Subtlety on resource type:** The current `auth-service.ts:720` call uses `resourceType: 'auth'`. The current `email-validation-service.ts:548` uses `resourceType: 'user_management'`. `AuditChannel.AuditEvent` accepts arbitrary strings, so both are preserved. The `userId?: number` typing in the channel matches both call sites (auth-service passes `userId: number | undefined`; email-validation passes `userId: verification.user_id` where `user_id` is `number`).

**Subtlety on DI ordering:** `AuthService` is registered at step 4 of `civic-core-services.ts`; `auditChannel` at step 10.5. Both are lazy singletons — actual resolution only happens during `completeServiceInitialization` or first explicit `resolve('auth')` call. Confirm no early `resolve('auth')` happens between step 4 and step 10.5.

- [ ] **Step 1: Write the failing test for AuthService → AuditChannel wire**

Create `tests/core/auth/auth-service-audit-channel.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../core/src/auth/auth-service.js';
import { AuditChannel } from '../../../core/src/audit/audit-channel.js';
import type { DatabaseService } from '../../../core/src/database/database-service.js';
import type { AuditLogger } from '../../../core/src/audit/audit-logger.js';

describe('AuthService → AuditChannel wire', () => {
  it('routes logAuthEvent through the unified AuditChannel when injected', async () => {
    const dbLogSpy = vi.fn().mockResolvedValue(undefined);
    const fileLogSpy = vi.fn().mockResolvedValue(undefined);

    const mockDb = {
      logAuditEvent: dbLogSpy,
      // Minimum surface the constructor touches
    } as unknown as DatabaseService;
    const mockFileLogger = {
      log: fileLogSpy,
    } as unknown as AuditLogger;

    const channel = new AuditChannel(mockDb, mockFileLogger);
    const channelSpy = vi.spyOn(channel, 'record');

    const auth = new AuthService(mockDb, '/tmp/civic-test', channel);
    await auth.logAuthEvent(42, 'login_success', 'User logged in', '1.2.3.4');

    expect(channelSpy).toHaveBeenCalledTimes(1);
    expect(channelSpy.mock.calls[0][0]).toMatchObject({
      action: 'login_success',
      resourceType: 'auth',
      userId: 42,
      source: 'auth',
    });
    expect(fileLogSpy).toHaveBeenCalled();
    expect(dbLogSpy).toHaveBeenCalled();
  });

  it('falls back to db.logAuditEvent when no channel is injected (transitional safety)', async () => {
    const dbLogSpy = vi.fn().mockResolvedValue(undefined);
    const mockDb = { logAuditEvent: dbLogSpy } as unknown as DatabaseService;

    const auth = new AuthService(mockDb, '/tmp/civic-test');
    await auth.logAuthEvent(99, 'logout', 'User logged out');

    expect(dbLogSpy).toHaveBeenCalledWith({
      userId: 99,
      action: 'logout',
      resourceType: 'auth',
      details: 'User logged out',
      ipAddress: undefined,
    });
  });
});
```

- [ ] **Step 2: Run it — expect compile failure**

Run: `pnpm vitest run tests/core/auth/auth-service-audit-channel.test.ts`
Expected: FAIL — `AuthService` constructor doesn't take a 3rd `auditChannel` argument yet.

- [ ] **Step 3: Add the AuditChannel surface to AuthService**

In `core/src/auth/auth-service.ts`:

Add import (near other imports, around line 12):
```ts
import { AuditChannel } from '../audit/audit-channel.js';
```

Add field + constructor arg + writeAudit helper. The current constructor is at lines 54-59:

Old:
```ts
  private secretsManager?: SecretsManager;

  constructor(db: DatabaseService, dataDir: string) {
    this.db = db;
    this.oauthManager = new OAuthProviderManager();
    this.roleManager = new RoleManager(dataDir);
    this.emailValidationService = new EmailValidationService(db);
  }
```

New:
```ts
  private secretsManager?: SecretsManager;
  private auditChannel?: AuditChannel;

  constructor(db: DatabaseService, dataDir: string, auditChannel?: AuditChannel) {
    this.db = db;
    this.oauthManager = new OAuthProviderManager();
    this.roleManager = new RoleManager(dataDir);
    this.emailValidationService = new EmailValidationService(db, auditChannel);
    this.auditChannel = auditChannel;
  }

  /**
   * Write an auth audit entry through the unified AuditChannel if available,
   * otherwise fall back to the legacy direct `db.logAuditEvent` call.
   *
   * Phase 2c.5 (Task 4) — closes the 2 remaining direct callers flagged in
   * the Phase 2c closure report's §"Surfaced, not fixed".
   */
  private async writeAudit(event: {
    userId: number | undefined;
    action: string;
    details?: string;
    ipAddress?: string;
  }): Promise<void> {
    if (this.auditChannel) {
      await this.auditChannel.record({
        action: event.action,
        resourceType: 'auth',
        userId: event.userId,
        source: 'auth',
        outcome: 'success',
        message: event.details,
        details: event.ipAddress ? { ipAddress: event.ipAddress } : undefined,
      });
      return;
    }
    await this.db.logAuditEvent({
      userId: event.userId,
      action: event.action,
      resourceType: 'auth',
      details: event.details,
      ipAddress: event.ipAddress,
    });
  }
```

Then replace the body of `logAuthEvent` (lines 710-727):

Old:
```ts
  async logAuthEvent(
    userId: number | undefined,
    action: string,
    details?: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      await this.db.logAuditEvent({
        userId,
        action,
        resourceType: 'auth',
        details,
        ipAddress,
      });
    } catch (error) {
      logger.error('Failed to log auth event:', error);
    }
  }
```

New:
```ts
  async logAuthEvent(
    userId: number | undefined,
    action: string,
    details?: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      await this.writeAudit({ userId, action, details, ipAddress });
    } catch (error) {
      logger.error('Failed to log auth event:', error);
    }
  }
```

- [ ] **Step 4: Run the AuthService test — expect FAIL on EmailValidationService still**

Run: `pnpm vitest run tests/core/auth/auth-service-audit-channel.test.ts`
Expected: compile FAIL because `new EmailValidationService(db, auditChannel)` doesn't accept the 2nd arg yet.

- [ ] **Step 5: Add the AuditChannel surface to EmailValidationService**

In `core/src/auth/email-validation-service.ts`:

Add import (near other imports, around line 11):
```ts
import { AuditChannel } from '../audit/audit-channel.js';
```

Add field + constructor arg + writeAudit helper. Current constructor is at lines 67-75:

Old:
```ts
export class EmailValidationService {
  private db: DatabaseService;
  private tokenExpiryHours: number = 24; // 24 hours for email verification
  private notificationService: NotificationService;
  private secretsManager?: SecretsManager;

  constructor(db: DatabaseService) {
    this.db = db;
    // Initialize notification service
    const notificationConfig = new NotificationConfig();
    this.notificationService = new NotificationService(notificationConfig);
    // Register email channel and templates
    this.registerEmailChannel();
    this.registerEmailTemplates();
  }
```

New:
```ts
export class EmailValidationService {
  private db: DatabaseService;
  private tokenExpiryHours: number = 24; // 24 hours for email verification
  private notificationService: NotificationService;
  private secretsManager?: SecretsManager;
  private auditChannel?: AuditChannel;

  constructor(db: DatabaseService, auditChannel?: AuditChannel) {
    this.db = db;
    this.auditChannel = auditChannel;
    // Initialize notification service
    const notificationConfig = new NotificationConfig();
    this.notificationService = new NotificationService(notificationConfig);
    // Register email channel and templates
    this.registerEmailChannel();
    this.registerEmailTemplates();
  }

  /**
   * Write an email-validation audit entry through the unified AuditChannel
   * if available, otherwise fall back to the legacy direct db call.
   *
   * Phase 2c.5 (Task 4) — same pattern as AuthService.writeAudit.
   */
  private async writeAudit(event: {
    userId: number | undefined;
    action: string;
    resourceType: string;
    resourceId?: string;
    details?: string;
  }): Promise<void> {
    if (this.auditChannel) {
      await this.auditChannel.record({
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        userId: event.userId,
        source: 'auth',
        outcome: 'success',
        message: event.details,
      });
      return;
    }
    await this.db.logAuditEvent({
      userId: event.userId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      details: event.details,
    });
  }
```

Then replace the `db.logAuditEvent` call at line 545:

Old:
```ts
      // Log the successful email change
      await this.db.logAuditEvent({
        userId: verification.user_id,
        action: 'email_changed',
        resourceType: 'user_management',
        resourceId: verification.user_id.toString(),
        details: `Email changed from ${user.email} to ${verification.email}`,
      });
```

New:
```ts
      // Log the successful email change (routed through unified AuditChannel)
      await this.writeAudit({
        userId: verification.user_id,
        action: 'email_changed',
        resourceType: 'user_management',
        resourceId: verification.user_id.toString(),
        details: `Email changed from ${user.email} to ${verification.email}`,
      });
```

- [ ] **Step 6: Run the AuthService test — expect PASS**

Run: `pnpm vitest run tests/core/auth/auth-service-audit-channel.test.ts`
Expected: 2/2 pass.

- [ ] **Step 7: Write the failing test for EmailValidationService → AuditChannel wire**

Create `tests/core/auth/email-validation-audit-channel.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { EmailValidationService } from '../../../core/src/auth/email-validation-service.js';
import { AuditChannel } from '../../../core/src/audit/audit-channel.js';
import type { DatabaseService } from '../../../core/src/database/database-service.js';
import type { AuditLogger } from '../../../core/src/audit/audit-logger.js';

describe('EmailValidationService → AuditChannel wire', () => {
  it('exposes writeAudit through the channel when injected', async () => {
    const dbLogSpy = vi.fn().mockResolvedValue(undefined);
    const fileLogSpy = vi.fn().mockResolvedValue(undefined);

    const mockDb = {
      logAuditEvent: dbLogSpy,
    } as unknown as DatabaseService;
    const mockFileLogger = {
      log: fileLogSpy,
    } as unknown as AuditLogger;

    const channel = new AuditChannel(mockDb, mockFileLogger);
    const channelSpy = vi.spyOn(channel, 'record');

    // We test the wire via a public method that uses writeAudit — but
    // completeEmailChange is too heavy to mock end-to-end here. The simpler
    // contract: when constructed with a channel, the channel is the path.
    // Exercise it directly through a thin probe:
    const svc = new EmailValidationService(mockDb, channel);
    // Access writeAudit via the prototype (TS access workaround):
    await (svc as any).writeAudit({
      userId: 7,
      action: 'email_changed',
      resourceType: 'user_management',
      resourceId: '7',
      details: 'Email changed from a@b.c to x@y.z',
    });

    expect(channelSpy).toHaveBeenCalledTimes(1);
    expect(channelSpy.mock.calls[0][0]).toMatchObject({
      action: 'email_changed',
      resourceType: 'user_management',
      resourceId: '7',
      userId: 7,
      source: 'auth',
    });
    expect(fileLogSpy).toHaveBeenCalled();
    expect(dbLogSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run it — expect PASS**

Run: `pnpm vitest run tests/core/auth/email-validation-audit-channel.test.ts`
Expected: 1/1 pass.

- [ ] **Step 9: Wire AuditChannel into AuthService at DI**

In `core/src/civic-core-services.ts`, change the `'auth'` factory (currently at lines 105-109):

Old:
```ts
  // Step 4: Register auth service (depends on: database, config)
  container.singleton('auth', (c) => {
    const db = c.resolve<DatabaseService>('database');
    const config = c.resolve<CivicPressConfig>('config');
    return new AuthService(db, config.dataDir);
  });
```

New:
```ts
  // Step 4: Register auth service (depends on: database, config, auditChannel)
  // Note: auditChannel is registered at Step 10.5 but resolution is lazy —
  // 'auth' is only resolved during completeServiceInitialization (or first
  // explicit resolve), by which point auditChannel is registered.
  container.singleton('auth', (c) => {
    const db = c.resolve<DatabaseService>('database');
    const config = c.resolve<CivicPressConfig>('config');
    const auditChannel = c.resolve<AuditChannel>('auditChannel');
    return new AuthService(db, config.dataDir, auditChannel);
  });
```

- [ ] **Step 10: Full core test**

Run: `pnpm -C core test --run 2>&1 | tail -20`
Expected: pass count is (previous + 3 new test cases).

- [ ] **Step 11: Full repo test**

Run: `pnpm test --run 2>&1 | tail -20`
Expected: pass count is (previous + 3). Still 1 known §9.1 session-mgmt flake. 19 skipped (unchanged). NO new failures.

If a previously-passing auth or email-validation test broke: investigate. The wire is a no-op in the absence-of-channel branch (preserves the existing db-only behavior); if tests construct services with just `(db)` they hit that branch and should be unchanged.

- [ ] **Step 12: Commit**

```bash
git add tests/core/auth/auth-service-audit-channel.test.ts tests/core/auth/email-validation-audit-channel.test.ts
git add core/src/auth/auth-service.ts core/src/auth/email-validation-service.ts core/src/civic-core-services.ts
git commit -m "refactor(2c.5 T4): route core/auth audit through unified AuditChannel

Phase 2c Task 9 introduced AuditChannel and migrated RecordManager
(3 call sites) + SagaExecutor (4 sagas) through it. 2 direct
db.logAuditEvent callers in core/auth remained — flagged in the
Phase 2c closure report as Phase 2c.5 follow-up.

This commit applies the same RecordManager.writeAudit pattern:
- AuthService: optional auditChannel? constructor arg, private
  writeAudit helper, logAuthEvent routed through it. 10 internal
  callers (login_success, logout, password_change, etc.) inherit
  the new path for free.
- EmailValidationService: same shape; completeEmailChange's audit
  call now routes through the channel.
- DI: civic-core-services.ts injects the channel into AuthService.
  AuthService passes it down to EmailValidationService.

Both classes keep their fall-back to db.logAuditEvent if no channel
is injected — transitional safety, same pattern as RecordManager.
Once all tests construct via DI, the fallbacks can be tightened.

2 new test files pin the wire:
- tests/core/auth/auth-service-audit-channel.test.ts (2 cases)
- tests/core/auth/email-validation-audit-channel.test.ts (1 case)

Auth events now write file-JSONL first (resilient archival) + DB
second (queryable) — same contract as record events.

Closes the Phase 2c.5 surfaced-item-2 follow-up.
"
```

---

## Task 5 (no-op): Document storage test breakage as deferred

**Why:** Phase 2c T5 added a module-local vitest config to `modules/storage` which uncovered 28 pre-existing test failures across 10 files. This is well beyond a 1-day sub-session — it's Phase 2d-sized work (per-file investigation, possibly schema/migration fixes, possibly stale-test deletion). Document explicitly so it doesn't get forgotten.

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md` — add a row in the Phase-2c.5 / 2d follow-up section documenting this deferral.
- Modify: this plan's closure-note section below.

- [ ] **Step 1: Capture current storage test failure inventory**

Run: `cd /Users/stakabo/Work/repos/civicpress/civicpress && pnpm -C modules/storage test 2>&1 | grep -E "^(FAIL|PASS) " | sort -u`
Expected: a list of 10 failing test files. Capture the output for the closure report.

- [ ] **Step 2: Append the deferral note to the closure report (final task, after all others commit)**

This belongs in T6 below — the consolidated closure note for the session. Do not commit anything separate here.

---

## Task 6: Phase 2c.5 closure note

**Why:** Document what got closed, what was deferred, where the test count moved.

**Files:**
- Create: `docs/audits/phase-2c.5-closure-note.md` — short note (not a full closure report; this is a 1-day sub-session, not a phase).
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md` — bump the closure count + add the 4 closure rows.

- [ ] **Step 1: Run final verification**

Run: `pnpm test --run 2>&1 | tail -5 && pnpm -r build 2>&1 | tail -5 && make audit-truth-check 2>&1 | tail -10`
Expected: tests pass (+3 from new tests, same flake unchanged); build clean; truth-check still PASS.

- [ ] **Step 2: Compose the closure note**

Create `docs/audits/phase-2c.5-closure-note.md`. Content template:

```markdown
# Phase 2c.5 Foundation Cleanup Follow-ups — Closure Note

**Sub-phase:** 2c.5 (Foundation Cleanup follow-ups) of the post-audit base refactor
**Branch:** `refactor/phase-2c.5-followups` (cut off `dev` post-Phase-2c-merge `9e89a42`)
**Period:** 2026-05-19 (1-day sub-session)
**Parent closure:** `docs/audits/phase-2c-closure-report.md`
**Plan:** `docs/plans/2026-05-19-base-refactor-phase-2c.5-followups.md`

## What got closed (4 of 5 surfaced items)

| # | Item | Task | Commit |
|---|---|---|---|
| 1 | 4th ad-hoc EmailChannel at modules/api/src/routes/notifications.ts:64 | T3 | <SHA> |
| 2 | 2 direct db.logAuditEvent callers in core/auth (email-validation:545, auth-service:717) | T4 | <SHA> |
| 3 | Vestigial secretsManager? plumbing in NotificationSecurity + NotificationService | T2 | <SHA> |
| 4 | Orphan SagaRecoveryError class in core/src/saga/errors.ts | T1 | <SHA> |

## What was deferred (1 of 5 surfaced items)

**Pre-existing storage test breakage** — Phase 2c T5 added the module-local vitest
config which executed `modules/storage/src/__tests__/` for the first time. The
breakage is 28 failures across 10 test files (not the 4 the closure report named —
that count was based on the smaller list T5 surfaced before full execution).

Failing test files: lifecycle-manager, orphaned-file-cleaner, batch-operations,
streaming-operations, circuit-breaker, retry, health-checker, timeout-utils,
usage-reporter, plus 1 more.

Scope: well beyond a 1-day sub-session — per-file investigation, possibly
schema/migration drift, possibly stale-test deletion. **Rolling forward to
Phase 2d intake.** Master plan §5 Phase 2d already covers storage module
work (storage-006 / storage-007); add this to that scope.

## Numbers

- Findings actionably addressed (cumulative): 51 → 55 (4 new closures)
- Test count: 1191 → 1194 passing (3 new wire tests); 1 / 19 failed/skipped unchanged
- Build: clean
- `make audit-truth-check`: PASS

## Sign-off

Phase 2c.5 is **complete and ready to merge to `dev`** when the user signs off.
No push (per refactor branch policy until all 7 phases done).
```

- [ ] **Step 3: Update findings registry**

In `docs/audits/2026-05-16-manifesto-fit-findings.md`, add 4 new rows to the
Phase-2c.5 closure section (or whichever section the registry uses for sub-phase
closures — match Phase 2c's convention). Each row: ID (e.g., `phase-2c.5-followup-N`),
severity (cleanup), task #, commit SHA, how (one-line description).

- [ ] **Step 4: Commit the closure note + registry update**

```bash
git add docs/audits/phase-2c.5-closure-note.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit -m "refactor(2c.5): closure note + registry update

4 of 5 surfaced items closed; storage test breakage deferred to
Phase 2d intake. Test count +3 (1191 → 1194). 1 known §9.1
session-mgmt flake unchanged.

Phase 2c.5 sub-session COMPLETE.
"
```

- [ ] **Step 5: Final verification**

Run: `git log --oneline dev..refactor/phase-2c.5-followups`
Expected: 5 commits in the right order:
1. refactor(2c.5 T1): delete orphan SagaRecoveryError class
2. refactor(2c.5 T2): drop vestigial secretsManager plumbing
3. refactor(2c.5 T3): migrate 4th ad-hoc EmailChannel
4. refactor(2c.5 T4): route core/auth audit through unified AuditChannel
5. refactor(2c.5): closure note + registry update

Run: `make audit-truth-check`
Expected: PASS.

No push. Branch stays local until the user signs off on a merge to `dev`.

---

## Self-review

**Spec coverage:**
- 4th EmailChannel migration → T3 ✓
- 2 db.logAuditEvent callers in core/auth → T4 ✓
- Vestigial secretsManager → T2 ✓
- Orphan SagaRecoveryError → T1 ✓
- Storage test breakage → T5 explicitly deferred + documented in T6 ✓

**Placeholder scan:** No "TBD" / "implement later" / "fill in details". All code blocks contain full code.

**Type consistency:**
- `AuditChannel` import path is consistent (`../audit/audit-channel.js`) across both auth files.
- `writeAudit` private method signature is similar but NOT identical between AuthService (auth-shaped event: userId/action/details/ipAddress) and EmailValidationService (broader: userId/action/resourceType/resourceId/details) — intentional, each matches its only caller.
- `auditChannel?: AuditChannel` field name consistent across both classes and matches `RecordManager` precedent.

**Risk notes:**
- T2 step 7 has a "Check" sub-step that may discover one more cascade in `email-validation-service.ts:83`. Already pre-baked into the plan.
- T3 step 2 + 3 may discover `EmailChannel` isn't re-exported from `@civicpress/core`'s public surface yet — already pre-baked.
- T4 step 11: existing auth/email-validation tests may construct `AuthService(db, dataDir)` directly (without channel). Those should hit the fallback branch — safe. If a test broke, it would indicate the fallback drifted from the original behavior; double-check.
