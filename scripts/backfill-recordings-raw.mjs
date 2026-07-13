#!/usr/bin/env node
/**
 * FA-BB-002 Commit F — one-shot backfill runner.
 *
 * Re-homes every pre-redaction raw recording out of the PUBLIC `recordings`
 * storage folder into the private `recordings_raw`, re-latching each
 * referencing session to redaction_status:'pending' (the redaction worker
 * then publishes a verified blanked variant). Files that are a session's
 * `capture.public_file` (worker-published redacted variants) are kept.
 *
 * Run from the repo root: node scripts/backfill-recordings-raw.mjs [--dry-run]
 */

import { CivicPress } from '../core/dist/index.js';
import { CentralConfigManager } from '../core/dist/config/central-config.js';
import { initializeStorageService } from '../modules/storage/dist/index.js';
import { backfillPublicRaws } from '../modules/broadcast-box/dist/index.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const dataDir = CentralConfigManager.getDataDir();
  const dbConfig = CentralConfigManager.getDatabaseConfig();
  console.log(`Backfill: dataDir=${dataDir} dryRun=${dryRun}`);

  const civic = new CivicPress({ dataDir, database: dbConfig });
  await civic.initialize();
  try {
    const records = civic.getRecordManager();
    const storage = civic.getService('storage');
    await initializeStorageService(storage);

    if (dryRun) {
      // Report what WOULD move: everything in `recordings` that is not a
      // session's capture.public_file.
      const publicFileIds = new Set();
      const avRefs = new Map();
      const { records: ids } = await records.listRecords({ type: 'session' });
      for (const { id } of ids) {
        const rec = await records.getRecord(id);
        const capture = rec?.metadata?.capture ?? rec?.capture ?? {};
        if (capture.public_file) publicFileIds.add(String(capture.public_file));
        if (capture.av_file) avRefs.set(String(capture.av_file), id);
      }
      const files = await storage.listFiles('recordings');
      for (const f of files) {
        const verdict = publicFileIds.has(f.id)
          ? 'KEEP (worker-published redacted variant)'
          : `MOVE → recordings_raw${avRefs.has(f.id) ? ` (raw of session ${avRefs.get(f.id)})` : ' (orphan raw)'}`;
        console.log(`  ${f.id}  ${f.original_name}  ${f.size}B  ${verdict}`);
      }
      console.log(`${files.length} file(s) in 'recordings'.`);
      return;
    }

    const summary = await backfillPublicRaws({
      records,
      storage,
      logger: console,
    });
    console.log('\nBackfill summary:');
    for (const d of summary.details) {
      console.log(
        `  ${d.outcome.toUpperCase()}  ${d.oldId}` +
          (d.newId ? ` → ${d.newId}` : '') +
          (d.recordId ? `  (session ${d.recordId})` : '') +
          (d.error ? `  ERROR: ${d.error}` : '')
      );
    }
    console.log(
      `moved=${summary.moved} keptRedacted=${summary.keptRedacted} errors=${summary.errors}`
    );
    if (summary.errors > 0) process.exitCode = 1;
  } finally {
    await civic.shutdown().catch(() => {});
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
