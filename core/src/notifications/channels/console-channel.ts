/**
 * Console notification channel — a user-facing delivery sink that needs no
 * external service, so the email-shaped flows (password reset, verification)
 * are runnable out of the box in development, demos, and CI.
 *
 * It is the local stand-in for a real transport: it prints the rendered message
 * (including any reset link) to the operator console and appends it to a file
 * outbox under the system-data dir, the way Django's console email backend or
 * Rails' letter_opener do. It is emphatically NOT a production channel — the
 * "recipient" is whoever can read the server's stdout/outbox, not the account
 * owner — so it defaults to OFF in production (see isConsoleChannelEnabled).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  NotificationChannel,
  type ChannelRequest,
  type ChannelResponse,
  type ChannelConfig,
} from '../notification-channel.js';
import { coreInfo, coreRaw } from '../../utils/core-output.js';

export interface ConsoleChannelOptions {
  /** Directory the outbox file is written under. When unset, no file is written. */
  outboxDir?: string;
  /** Whether to also echo to the operator console (default true). */
  echo?: boolean;
}

/**
 * Decide whether the console channel should be registered/enabled.
 *
 * On by default in development and test; OFF in production unless the operator
 * explicitly opts in with CIVIC_CONSOLE_NOTIFICATIONS=true. Printing a
 * password-reset link to server stdout in production is a credential-in-logs
 * hazard, so the default there is to fall through to the operator inbox
 * instead. An unset NODE_ENV is treated as production (fail safe).
 */
export function isConsoleChannelEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.CIVIC_CONSOLE_NOTIFICATIONS === 'true') return true;
  if (env.CIVIC_CONSOLE_NOTIFICATIONS === 'false') return false;
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}

export class ConsoleChannel extends NotificationChannel {
  private outboxDir?: string;
  private echo: boolean;

  constructor(options: ConsoleChannelOptions = {}, config?: ChannelConfig) {
    super('console', config ?? { enabled: true, credentials: {}, settings: {} });
    this.outboxDir = options.outboxDir;
    this.echo = options.echo ?? true;
  }

  async send(request: ChannelRequest): Promise<ChannelResponse> {
    const subject = request.content?.subject ?? '(no subject)';
    const text =
      request.content?.text ||
      request.content?.body ||
      request.content?.html ||
      '';

    const rendered = [
      '──────────────────────────────────────────────',
      '📨  CivicPress notification (console channel)',
      `    To:      ${request.to}`,
      `    Subject: ${subject}`,
      '    ---',
      indent(text),
      '──────────────────────────────────────────────',
    ].join('\n');

    if (this.echo) {
      coreRaw(rendered);
      coreInfo('Notification delivered to the console channel (dev sink)', {
        operation: 'notification:console',
        to: request.to,
      });
    }

    let messageId = `console_${nowStamp()}`;
    if (this.outboxDir) {
      try {
        messageId = this.writeOutbox(request.to, rendered);
      } catch {
        // A non-writable outbox must not fail delivery — the console echo is
        // the primary sink; the file is a convenience.
      }
    }

    return { success: true, messageId };
  }

  private writeOutbox(to: string, rendered: string): string {
    fs.mkdirSync(this.outboxDir!, { recursive: true });
    const safeTo = to.replace(/[^a-zA-Z0-9._@-]/g, '_');
    const filename = `${nowStamp()}-${safeTo}.txt`;
    const filePath = path.join(this.outboxDir!, filename);
    fs.writeFileSync(filePath, `${rendered}\n`, 'utf8');
    return filePath;
  }

  async test(): Promise<boolean> {
    return true;
  }

  async validateConfig(): Promise<boolean> {
    return true;
  }

  getCapabilities() {
    return {
      supportsHtml: false,
      supportsAttachments: false,
      supportsTemplates: true,
    };
  }
}

/**
 * Timestamp string usable in filenames. Not using Date.now()-only so files
 * sort readably; colons are stripped so the name is filesystem-safe.
 */
function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}
