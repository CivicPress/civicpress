/**
 * PasswordRecoveryService — the forgot-password delivery decision:
 *
 *   channel can reach the user  → mint token + deliver a self-service link
 *   no channel                  → file an operator task, NO token minted
 *   no eligible account         → no-op (caller still responds uniformly)
 *
 * Uses fakes for the token issuer and operator notifier so the branching is
 * deterministic; the console sink is toggled via CIVIC_CONSOLE_NOTIFICATIONS.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PasswordRecoveryService,
  type ResetTokenIssuer,
} from '../password-recovery-service.js';
import { NotificationService } from '../notification-service.js';
import { NotificationConfig } from '../notification-config.js';
import type {
  ChannelRequest,
  NotificationChannel,
} from '../notification-channel.js';

function fakeIssuer(user: {
  userId: number;
  username: string;
  email?: string;
} | null) {
  return {
    findResetEligibleUser: vi.fn(async () => user),
    mintResetTokenForUser: vi.fn(async () => 'plaintext-token-xyz'),
  } satisfies ResetTokenIssuer;
}

function fakeOperatorNotifier() {
  return {
    passwordResetRequested: vi.fn(async () => 1),
  };
}

/** A NotificationChannel-shaped fake that records every send (no SMTP). */
function fakeEmailChannel(sink: ChannelRequest[]): NotificationChannel {
  return {
    getName: () => 'email',
    isEnabled: () => true,
    async send(request: ChannelRequest) {
      sink.push(request);
      return { success: true, messageId: 'fake-smtp' };
    },
  } as unknown as NotificationChannel;
}

/** A NotificationService whose email channel is the recording fake + enabled. */
function serviceWithFakeEmail(sink: ChannelRequest[]): {
  service: NotificationService;
  config: NotificationConfig;
} {
  const config = new NotificationConfig();
  config.updateChannelConfig('email', {
    enabled: true,
    provider: 'smtp',
    smtp: {
      host: 'smtp.test',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 'p' },
      from: 'noreply@test',
    },
  });
  const service = new NotificationService(config);
  service.registerChannel('email', fakeEmailChannel(sink));
  return { service, config };
}

const OPTS = { resetUrlBase: 'https://civic.example/auth/reset-password' };

describe('PasswordRecoveryService', () => {
  const savedConsole = process.env.CIVIC_CONSOLE_NOTIFICATIONS;

  beforeEach(() => {
    // Email is off by default (no notifications.yml email channel in test).
    delete process.env.CIVIC_CONSOLE_NOTIFICATIONS;
  });

  afterEach(() => {
    if (savedConsole === undefined) delete process.env.CIVIC_CONSOLE_NOTIFICATIONS;
    else process.env.CIVIC_CONSOLE_NOTIFICATIONS = savedConsole;
    vi.restoreAllMocks();
  });

  it('no eligible account → no-op, no token minted, no operator task', async () => {
    const issuer = fakeIssuer(null);
    const op = fakeOperatorNotifier();
    const svc = new PasswordRecoveryService({
      issuer,
      operatorNotifier: op as never,
    });

    const outcome = await svc.requestReset('ghost', OPTS);

    expect(outcome).toEqual({ outcome: 'no-eligible-user' });
    expect(issuer.mintResetTokenForUser).not.toHaveBeenCalled();
    expect(op.passwordResetRequested).not.toHaveBeenCalled();
  });

  it('no user-facing channel → operator task, NO token minted', async () => {
    process.env.CIVIC_CONSOLE_NOTIFICATIONS = 'false'; // console off, email off
    const issuer = fakeIssuer({ userId: 4, username: 'jo', email: 'jo@x.org' });
    const op = fakeOperatorNotifier();
    const svc = new PasswordRecoveryService({
      issuer,
      operatorNotifier: op as never,
    });

    const outcome = await svc.requestReset('jo', OPTS);

    expect(outcome).toEqual({ outcome: 'operator-task', channel: 'operator' });
    expect(issuer.mintResetTokenForUser).not.toHaveBeenCalled();
    expect(op.passwordResetRequested).toHaveBeenCalledWith({
      userId: 4,
      username: 'jo',
      email: 'jo@x.org',
    });
  });

  it('console sink available → mint token + deliver, no operator task', async () => {
    process.env.CIVIC_CONSOLE_NOTIFICATIONS = 'true';
    const issuer = fakeIssuer({ userId: 9, username: 'sam', email: 'sam@x.org' });
    const op = fakeOperatorNotifier();
    const svc = new PasswordRecoveryService({
      issuer,
      operatorNotifier: op as never,
      // echo path prints; no outboxDir keeps the test filesystem clean
    });

    const outcome = await svc.requestReset('sam', OPTS);

    expect(outcome).toEqual({ outcome: 'delivered', channel: 'console' });
    expect(issuer.mintResetTokenForUser).toHaveBeenCalledWith(9, undefined);
    expect(op.passwordResetRequested).not.toHaveBeenCalled();
  });

  it('email channel configured → delivers the reset LINK via email (SMTP-mock)', async () => {
    // Console off so email is the chosen channel, not just the fallback.
    process.env.CIVIC_CONSOLE_NOTIFICATIONS = 'false';
    const sink: ChannelRequest[] = [];
    const { service, config } = serviceWithFakeEmail(sink);
    const issuer = fakeIssuer({ userId: 3, username: 'sam', email: 'sam@x.org' });
    const op = fakeOperatorNotifier();

    const svc = new PasswordRecoveryService({
      issuer,
      operatorNotifier: op as never,
      notificationConfig: config,
      notificationService: service,
    });

    const outcome = await svc.requestReset('sam', OPTS);

    expect(outcome).toEqual({ outcome: 'delivered', channel: 'email' });
    expect(issuer.mintResetTokenForUser).toHaveBeenCalledWith(3, undefined);
    expect(op.passwordResetRequested).not.toHaveBeenCalled();

    // The rendered message went to the user's address and carries the token link.
    expect(sink).toHaveLength(1);
    expect(sink[0].to).toBe('sam@x.org');
    const rendered = `${sink[0].content.body ?? ''}${sink[0].content.text ?? ''}`;
    expect(rendered).toContain('token=plaintext-token-xyz');
    expect(rendered).toContain(OPTS.resetUrlBase);
  });

  it('email configured but user has no address → falls through (operator task)', async () => {
    process.env.CIVIC_CONSOLE_NOTIFICATIONS = 'false';
    const sink: ChannelRequest[] = [];
    const { service, config } = serviceWithFakeEmail(sink);
    const issuer = fakeIssuer({ userId: 5, username: 'noaddr' }); // no email
    const op = fakeOperatorNotifier();

    const svc = new PasswordRecoveryService({
      issuer,
      operatorNotifier: op as never,
      notificationConfig: config,
      notificationService: service,
    });

    const outcome = await svc.requestReset('noaddr', OPTS);

    expect(outcome).toEqual({ outcome: 'operator-task', channel: 'operator' });
    expect(sink).toHaveLength(0); // nothing emailed
    expect(issuer.mintResetTokenForUser).not.toHaveBeenCalled();
    expect(op.passwordResetRequested).toHaveBeenCalled();
  });

  it('matches by whatever identifier the caller passes through to the issuer', async () => {
    process.env.CIVIC_CONSOLE_NOTIFICATIONS = 'false';
    const issuer = fakeIssuer({ userId: 1, username: 'x' });
    const op = fakeOperatorNotifier();
    const svc = new PasswordRecoveryService({
      issuer,
      operatorNotifier: op as never,
    });

    await svc.requestReset('some@email.org', OPTS);
    expect(issuer.findResetEligibleUser).toHaveBeenCalledWith('some@email.org');
  });
});
