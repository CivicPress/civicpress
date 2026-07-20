/**
 * Templates route: one TemplateService per CivicPress instance, not per request.
 *
 * NOTE ON THE ORIGINAL FRAMING: the backlog describes this as an unbounded
 * fd/listener leak — "TemplateService starts a filesystem watcher, so a new
 * watcher is created per HTTP request and never disposed". That is NOT what
 * happens on this path, and the assertions below pin the real behaviour:
 *
 *   `TemplateCacheAdapter` only constructs its OWN `FileWatcherCache` in the
 *   branch taken when NO cacheManager is supplied. The route always supplies
 *   one (`civicPress.getCacheManager()` resolves a container singleton), so the
 *   adapter borrows the manager's already-watching `templates` /
 *   `templateLists` caches and no watcher was ever created per request.
 *
 * What per-request construction DID cost — and what the singleton removes — is
 * a fresh TemplateEngine + TemplateValidator on every call plus a
 * `setKeyMapper()` write into the SHARED cache object from inside a request
 * handler on every call.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Count TemplateService constructions while keeping the rest of core intact.
const constructed: Array<{ dataDir: string }> = [];

vi.mock('@civicpress/core', async () => {
  const actual =
    await vi.importActual<typeof import('@civicpress/core')>(
      '@civicpress/core'
    );
  class CountingTemplateService {
    dataDir: string;
    constructor(options: { dataDir: string }) {
      this.dataDir = options.dataDir;
      constructed.push({ dataDir: options.dataDir });
    }
    async listTemplates() {
      return { templates: [], total: 0 };
    }
  }
  return { ...actual, TemplateService: CountingTemplateService };
});

/** Minimal CivicPress stand-in: the route only needs these two accessors. */
function fakeCivicPress(dataDir: string) {
  const cacheManager = { name: 'shared-cache-manager' };
  return {
    getDataDir: () => dataDir,
    getCacheManager: () => cacheManager,
  };
}

/** Drive the router's GET / handler with a fake request. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callList(router: any, civicPress: unknown) {
  // express Router stores handlers on `router.stack[].route.stack[].handle`.
  const layer = router.stack.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => l.route?.path === '/' && l.route?.methods?.get
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = layer.route.stack.map((s: any) => s.handle);
  const handler = handlers[handlers.length - 1];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req: any = {
    civicPress,
    query: {},
    params: {},
    body: {},
    headers: {},
    method: 'GET',
    originalUrl: '/api/v1/templates',
    path: '/',
    baseUrl: '/api/v1/templates',
    ip: '127.0.0.1',
    // The api-logger reads the peer address off the socket/connection.
    socket: { remoteAddress: '127.0.0.1' },
    connection: { remoteAddress: '127.0.0.1' },
    get: () => undefined,
    requestId: 'test-request',
    user: { id: 1, username: 'tester', role: 'admin' },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
    setHeader() {
      return this;
    },
  };
  await handler(req, res, () => {});
}

describe('templates route TemplateService reuse', () => {
  beforeEach(() => {
    constructed.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs ONE TemplateService across many requests', async () => {
    const { createTemplatesRouter } = await import('../routes/templates.js');
    const router = createTemplatesRouter();
    const civicPress = fakeCivicPress('/tmp/instance-a');

    for (let i = 0; i < 5; i++) {
      await callList(router, civicPress);
    }

    expect(constructed).toHaveLength(1);
    expect(constructed[0].dataDir).toBe('/tmp/instance-a');
  });

  it('keeps a separate instance per CivicPress instance', async () => {
    const { createTemplatesRouter } = await import('../routes/templates.js');
    const router = createTemplatesRouter();

    // The API test harness builds one CivicPress per test context, so a plain
    // module-level singleton would hand instance B the dataDir of instance A.
    const a = fakeCivicPress('/tmp/instance-b1');
    const b = fakeCivicPress('/tmp/instance-b2');

    await callList(router, a);
    await callList(router, b);
    await callList(router, a);
    await callList(router, b);

    expect(constructed).toHaveLength(2);
    expect(constructed.map((c) => c.dataDir).sort()).toEqual([
      '/tmp/instance-b1',
      '/tmp/instance-b2',
    ]);
  });

  it('shares the instance across separate routers for the same CivicPress', async () => {
    const { createTemplatesRouter } = await import('../routes/templates.js');
    const civicPress = fakeCivicPress('/tmp/instance-c');

    await callList(createTemplatesRouter(), civicPress);
    await callList(createTemplatesRouter(), civicPress);

    // The cache is keyed on the CivicPress object, not on the router closure.
    expect(constructed).toHaveLength(1);
  });
});
