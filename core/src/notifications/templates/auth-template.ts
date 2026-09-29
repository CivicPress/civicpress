import {
  NotificationTemplate,
  TemplateData,
  ProcessedTemplate,
} from '../notification-template.js';

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** `text` as it must be written to appear, unchanged, in an HTML document. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

export class AuthTemplate extends NotificationTemplate {
  private subjectTemplate?: string;

  /**
   * @param subject Optional subject line (may contain {{variables}}). When
   * omitted, ProcessedTemplate carries no subject and the channel applies its
   * own fallback — preserving the pre-existing behaviour of the 2-arg callers.
   */
  constructor(name: string, template: string, subject?: string) {
    super(name, template);
    this.subjectTemplate = subject;
  }

  /**
   * Process auth template with data
   */
  async process(data: TemplateData): Promise<ProcessedTemplate> {
    // Validate required data
    if (!this.validateData(data)) {
      const missingVars = this.getVariables().filter(
        (v) => !v.startsWith('optional_') && data[v] === undefined
      );
      throw new Error(
        `Missing required template variable: ${missingVars.join(', ')}`
      );
    }

    // The message, as text.
    const processedBody = this.replaceVariables(this.template, data);

    return {
      subject: this.subjectTemplate
        ? this.replaceVariables(this.subjectTemplate, data)
        : undefined,
      body: processedBody,
      html: this.createHtmlVersion(processedBody),
      // The text part IS the message. It used to be derived from the HTML
      // part by deleting the tags, which left the contents of <title> and
      // <style> at the top of every email and, with each <br> gone, ran the
      // link into the sentence after it.
      text: processedBody,
    };
  }

  /**
   * The message as an HTML document.
   *
   * `body` is TEXT — a template with its values filled in — so it is encoded
   * on the way into the markup. It used to be dropped in as written, and the
   * values are not the application's: the password-reset email carries the
   * account's username, which registration accepts from anyone. A username of
   * `<a href="https://…">sign in here</a>`, registered against someone else's
   * address, arrived in that person's inbox as a link, in an email from the
   * municipality.
   *
   * The assembled document also went through variable replacement a second
   * time, so a value containing `{{reset_url}}` was expanded — and one
   * containing any other `{{…}}` threw, and no email was sent at all.
   */
  private createHtmlVersion(body: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CivicPress Notification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
          .content { padding: 20px; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
          .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
          .button:hover { background: #0056b3; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>CivicPress</h2>
          </div>
          <div class="content">
            ${escapeHtml(body).replace(/\n/g, '<br>')}
          </div>
          <div class="footer">
            <p>This is an automated message from CivicPress. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
