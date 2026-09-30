import { describe, it, expect } from 'vitest';
import { AuthTemplate } from '../templates/auth-template.js';
import { NotificationSecurity } from '../notification-security.js';

const RESET =
  'A password reset was requested for your CivicPress account "{{username}}".\n\n' +
  'Reset your password here:\n{{reset_url}}\n\n' +
  'This link can be used once.';

const reset = () =>
  new AuthTemplate('password_reset', RESET, 'Reset for {{username}}');

const URL = 'https://civic.example/auth/reset-password?token=abc&lang=fr';

describe('AuthTemplate', () => {
  it('fills in the message', async () => {
    const out = await reset().process({ username: 'jo', reset_url: URL });

    expect(out.subject).toBe('Reset for jo');
    expect(out.body).toBe(
      'A password reset was requested for your CivicPress account "jo".\n\n' +
        `Reset your password here:\n${URL}\n\n` +
        'This link can be used once.'
    );
  });

  describe('the HTML part', () => {
    it('shows a value as text, whatever it contains', async () => {
      // Registration accepts a username from anyone, and the reset email
      // carries it. This one arrived as a working link, in an email from the
      // municipality, in the inbox of whoever's address it was registered to.
      const username = '<a href="https://evil.example/login">sign in here</a>';

      const { html } = await reset().process({ username, reset_url: URL });

      expect(html).not.toContain('<a href');
      expect(html).toContain(
        '&lt;a href=&quot;https://evil.example/login&quot;&gt;sign in here&lt;/a&gt;'
      );
    });

    it.each([
      ['a script', '<script>alert(1)</script>'],
      ['an image with a handler', '<img src=x onerror=alert(1)>'],
      ['a closing tag that would end the container', '</div></div><h1>x</h1>'],
      ['an attribute break', '" onmouseover="alert(1)'],
      ['a single-quoted attribute break', "' onmouseover='alert(1)"],
    ])('does not let a value be %s', async (_label, username) => {
      const { html } = await reset().process({ username, reset_url: URL });

      // Whatever the value was, it added no markup.
      const withoutValue = (
        await reset().process({ username: 'jo', reset_url: URL })
      ).html;
      const tags = (document: string) =>
        (document.match(/<[a-zA-Z/!][^>]*>/g) ?? []).join('');
      expect(tags(html!)).toBe(tags(withoutValue!));
    });

    it('encodes the template text too, and an ampersand in a link', async () => {
      const { html } = await new AuthTemplate(
        'notice',
        'Terms & conditions <apply>: {{link}}'
      ).process({ link: URL });

      expect(html).toContain('Terms &amp; conditions &lt;apply&gt;');
      expect(html).toContain('token=abc&amp;lang=fr');
    });

    it('turns line breaks into <br>', async () => {
      const { html } = await reset().process({
        username: 'jo',
        reset_url: URL,
      });

      expect(html).toContain(
        `Reset your password here:<br>${URL.replaceAll('&', '&amp;')}<br>`
      );
    });

    it('does not expand a placeholder that arrives inside a value', async () => {
      // The assembled document went through replacement a second time.
      const { html, body } = await reset().process({
        username: 'see {{reset_url}}',
        reset_url: URL,
      });

      expect(body).toContain('account "see {{reset_url}}"');
      expect(html).toContain('account &quot;see {{reset_url}}&quot;');
    });

    it('does not fail on a value that looks like a missing placeholder', async () => {
      // `{{nope}}` in a username threw "Missing required template variable",
      // and no email was sent at all.
      await expect(
        reset().process({ username: '{{nope}}', reset_url: URL })
      ).resolves.toMatchObject({
        body: expect.stringContaining('account "{{nope}}"'),
      });
    });
  });

  describe('the text part', () => {
    it('is the message', async () => {
      const out = await reset().process({ username: 'jo', reset_url: URL });

      expect(out.text).toBe(out.body);
    });

    it('does not begin with the stylesheet', async () => {
      // It was derived from the HTML by deleting the tags, which leaves the
      // contents of <title> and <style>.
      const { text } = await reset().process({
        username: 'jo',
        reset_url: URL,
      });

      expect(text).not.toContain('font-family');
      expect(text).not.toContain('CivicPress Notification');
      expect(text!.startsWith('A password reset was requested')).toBe(true);
    });

    it('keeps the link on a line of its own', async () => {
      // With each <br> deleted, the link ran into the sentence after it.
      const { text } = await reset().process({
        username: 'jo',
        reset_url: URL,
      });

      expect(text!.split('\n')).toContain(URL);
    });
  });

  it('still refuses a message with a value missing', async () => {
    await expect(reset().process({ username: 'jo' })).rejects.toThrow(
      /Missing required template variable: reset_url/
    );
  });
});

describe('NotificationSecurity.validateRequest', () => {
  const security = new NotificationSecurity();
  const request = (data: unknown) => ({
    channels: ['email'],
    template: 'password_reset',
    data,
  });

  it('accepts an ordinary request', async () => {
    const result = await security.validateRequest(request({ username: 'jo' }));

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('refuses a request with no data, rather than throwing', async () => {
    // JSON.stringify(undefined) is undefined, and `.length` of that threw.
    const result = await security.validateRequest(request(undefined));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Data object is required');
  });

  it('still warns about a suspicious value', async () => {
    const result = await security.validateRequest(
      request({ username: '<script>alert(1)</script>' })
    );

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  it('refuses data over 10 KB without reading it', async () => {
    // The scan ran before the size check, on data of any size, and one of
    // its patterns is quadratic: 1.7 s for 100 KB of this.
    const started = Date.now();

    const result = await security.validateRequest(
      request({ username: 'on'.repeat(500_000) })
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Request data too large (max 10KB)');
    expect(result.warnings).toEqual([]);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
