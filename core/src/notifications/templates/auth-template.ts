import {
  NotificationTemplate,
  TemplateData,
  ProcessedTemplate,
} from '../notification-template.js';

export class AuthTemplate extends NotificationTemplate {
  constructor(name: string, template: string) {
    super(name, template);
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

    // Process the template
    const processedBody = this.replaceVariables(this.template, data);

    // Create HTML version if needed
    const htmlBody = this.createHtmlVersion(processedBody, data);

    return {
      body: processedBody,
      html: htmlBody,
      text: this.htmlToText(htmlBody),
    };
  }

  /**
   * Create HTML version of the template
   */
  private createHtmlVersion(body: string, data: TemplateData): string {
    const htmlTemplate = `
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
            ${body.replace(/\n/g, '<br>')}
          </div>
          <div class="footer">
            <p>This is an automated message from CivicPress. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.replaceVariables(htmlTemplate, data);
  }
}
