/**
 * PasswordRecoveryService — orchestrates the forgot-password flow across the
 * channel taxonomy, so it works out of the box with zero comms configuration.
 *
 * The pipeline:
 *   1. resolve a reset-eligible account (no token minted yet)
 *   2. pick the delivery channel by AUDIENCE:
 *        - a user-facing channel that can reach the account owner
 *          (email if configured + the user has an address; else the console
 *          dev sink) → mint a single-use token and deliver a self-service link
 *        - otherwise → file an actionable task in the operator notification
 *          center (no token minted) for an admin to fulfill via set-password
 *
 * A token is minted ONLY when a channel can actually deliver it — an
 * undeliverable token is never created. Every branch returns to the caller a
 * bare outcome for telemetry; the caller MUST send an identical, generic
 * response to the requester regardless (anti-enumeration).
 */

import * as path from 'path';
import { NotificationService } from './notification-service.js';
import { NotificationConfig } from './notification-config.js';
import { registerEmailChannelOn } from '../auth/email-validation-service/email-channel-setup.js';
import { AuthTemplate } from './templates/auth-template.js';
import {
  ConsoleChannel,
  isConsoleChannelEnabled,
} from './channels/console-channel.js';
import type { OperatorNotifier } from './operator-notifier.js';
import type { Logger } from '../utils/logger.js';

/** The subset of AuthService this service needs — decouples the wiring. */
export interface ResetTokenIssuer {
  findResetEligibleUser(identifier: string): Promise<{
    userId: number;
    username: string;
    email?: string;
    name?: string;
  } | null>;
  mintResetTokenForUser(userId: number, ipAddress?: string): Promise<string>;
}

export type PasswordResetChannel = 'email' | 'console' | 'operator';

export interface PasswordResetOutcome {
  /**
   * - delivered: a reset link was sent to the user (channel says which).
   * - operator-task: no user-facing channel; an admin task was filed.
   * - no-eligible-user: nothing matched. NEVER surface this difference to
   *   the requester.
   */
  outcome: 'delivered' | 'operator-task' | 'no-eligible-user';
  channel?: PasswordResetChannel;
}

export interface PasswordRecoveryDeps {
  issuer: ResetTokenIssuer;
  operatorNotifier: OperatorNotifier;
  /** Directory for the console channel's file outbox (dev). */
  outboxDir?: string;
  logger?: Logger;
  /**
   * Test/advanced seam: supply a pre-built config + service (e.g. one carrying
   * a fake email transport, or a shared instance). When either is omitted a
   * default is built; the real email channel is registered from
   * notifications.yml ONLY when the service is built here (an injected service
   * is used exactly as given).
   */
  notificationConfig?: NotificationConfig;
  notificationService?: NotificationService;
}

const RESET_TEMPLATE_BODY =
  'A password reset was requested for your CivicPress account "{{username}}".\n\n' +
  'Reset your password here:\n{{reset_url}}\n\n' +
  'This link can be used once and expires in 1 hour. If you did not request ' +
  'this, you can safely ignore this message — your password will not change.';

const RESET_TEMPLATE_SUBJECT = 'Reset your CivicPress password';

export class PasswordRecoveryService {
  private issuer: ResetTokenIssuer;
  private operatorNotifier: OperatorNotifier;
  private logger?: Logger;
  private notificationConfig: NotificationConfig;
  private notificationService: NotificationService;
  private resetTemplate: AuthTemplate;
  private consoleChannel?: ConsoleChannel;

  constructor(deps: PasswordRecoveryDeps) {
    this.issuer = deps.issuer;
    this.operatorNotifier = deps.operatorNotifier;
    this.logger = deps.logger;

    // Own NotificationService for the email path — mirrors the proven
    // email-verification setup (its own config + registered email channel).
    this.notificationConfig = deps.notificationConfig ?? new NotificationConfig();
    const injectedService = !!deps.notificationService;
    this.notificationService =
      deps.notificationService ??
      new NotificationService(this.notificationConfig);
    // Register the real email channel only when we built the service; an
    // injected service already carries whatever channels the caller wants.
    if (!injectedService && deps.logger) {
      registerEmailChannelOn(this.notificationService, deps.logger);
    }

    this.resetTemplate = new AuthTemplate(
      'password_reset',
      RESET_TEMPLATE_BODY,
      RESET_TEMPLATE_SUBJECT
    );
    this.notificationService.registerTemplate(
      'password_reset',
      this.resetTemplate
    );

    // Console dev sink — invoked directly (it is not a config-declared channel,
    // so it does not route through NotificationService's enabled-channel gate).
    if (isConsoleChannelEnabled()) {
      this.consoleChannel = new ConsoleChannel({ outboxDir: deps.outboxDir });
    }
  }

  /**
   * Handle a forgot-password request for `identifier` (username or email).
   * `resetUrlBase` is the front-end reset page URL the token is appended to,
   * e.g. "https://host/auth/reset-password".
   */
  async requestReset(
    identifier: string,
    opts: { resetUrlBase: string; ipAddress?: string }
  ): Promise<PasswordResetOutcome> {
    const user = await this.issuer.findResetEligibleUser(identifier);
    if (!user) {
      return { outcome: 'no-eligible-user' };
    }

    const emailReady =
      this.notificationConfig.isChannelEnabled('email') && !!user.email;
    const consoleReady = !!this.consoleChannel;

    // No user-facing channel → operator-mediated task, no token minted.
    if (!emailReady && !consoleReady) {
      await this.operatorNotifier.passwordResetRequested(user);
      return { outcome: 'operator-task', channel: 'operator' };
    }

    // A channel can reach the user → mint + deliver a self-service link.
    const token = await this.issuer.mintResetTokenForUser(
      user.userId,
      opts.ipAddress
    );
    const resetUrl = buildResetUrl(opts.resetUrlBase, token);
    const data = { reset_url: resetUrl, username: user.username };

    if (emailReady && (await this.deliverEmail(user.email as string, data))) {
      return { outcome: 'delivered', channel: 'email' };
    }
    if (
      consoleReady &&
      (await this.deliverConsole(user.email || user.username, data))
    ) {
      return { outcome: 'delivered', channel: 'console' };
    }

    // A channel was available but delivery failed — fall back to the operator
    // task so the request is never silently dropped.
    await this.operatorNotifier.passwordResetRequested(user);
    return { outcome: 'operator-task', channel: 'operator' };
  }

  private async deliverEmail(
    to: string,
    data: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const res = await this.notificationService.sendNotification({
        email: to,
        channels: ['email'],
        template: 'password_reset',
        data,
        priority: 'high',
      });
      return res.success;
    } catch (error) {
      this.logger?.warn?.('Password reset email delivery failed', error);
      return false;
    }
  }

  private async deliverConsole(
    to: string,
    data: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.consoleChannel) return false;
    try {
      const content = await this.resetTemplate.process(data);
      const res = await this.consoleChannel.send({
        to,
        content: {
          subject: content.subject,
          body: content.body,
          html: content.html,
          text: content.text,
        },
        data,
        priority: 'high',
      });
      return res.success;
    } catch (error) {
      this.logger?.warn?.('Password reset console delivery failed', error);
      return false;
    }
  }
}

/** Append `token` as a query param, respecting any existing query string. */
function buildResetUrl(base: string, token: string): string {
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}

/** Default console outbox directory under the system-data dir. */
export function defaultOutboxDir(systemDataDir: string): string {
  return path.join(systemDataDir, 'outbox');
}
