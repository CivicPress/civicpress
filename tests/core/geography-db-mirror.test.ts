import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CivicPress } from '../../core/src/civic-core.js';
import { GeographyManager } from '../../core/src/geography/geography-manager.js';
import type { AuthUser } from '../../core/src/auth/auth-service.js';
import {
  createTestDirectory,
  createRolesConfig,
  cleanupTestDirectory,
} from '../fixtures/test-setup';

// FA-CORE-011: geography create/update/delete must mirror into the DB so
// DB-backed consumers can see geography rows (the DB write used to be a TODO).
describe('GeographyManager DB mirror (FA-CORE-011)', () => {
  let testConfig: any;
  let civicPress: CivicPress;
  let manager: GeographyManager;

  const user: AuthUser = {
    id: 1,
    username: 'admin',
    role: 'admin',
    email: 'admin@example.com',
    name: 'Admin',
  };

  const geoJson = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-73.5673, 45.5017] },
        properties: { name: 'Test Point' },
      },
    ],
  });

  beforeEach(async () => {
    testConfig = createTestDirectory('geo-db-mirror-test');
    createRolesConfig(testConfig);
    civicPress = new CivicPress({ dataDir: testConfig.dataDir });
    await civicPress.initialize();
    manager = new GeographyManager(
      testConfig.dataDir,
      civicPress.getDatabaseService()
    );
  });

  afterEach(async () => {
    await cleanupTestDirectory(testConfig);
  });

  it('mirrors a created geography file into geography_files', async () => {
    const file = await manager.createGeographyFile(
      {
        name: 'Ward 1',
        type: 'geojson',
        category: 'boundary',
        description: 'Ward 1 boundary',
        content: geoJson,
      },
      user
    );

    const db = civicPress.getDatabaseService();
    const row = await db.getGeographyFileRow(file.id);
    expect(row).not.toBeNull();
    expect(row?.name).toBe('Ward 1');
    expect(row?.category).toBe('boundary');
    expect(row?.file_path).toBe(file.file_path);
  });

  it('removes the mirror row on delete', async () => {
    const file = await manager.createGeographyFile(
      {
        name: 'Ward 2',
        type: 'geojson',
        category: 'boundary',
        description: 'Ward 2 boundary',
        content: geoJson,
      },
      user
    );

    const db = civicPress.getDatabaseService();
    expect(await db.getGeographyFileRow(file.id)).not.toBeNull();

    await manager.deleteGeographyFile(file.id);
    expect(await db.getGeographyFileRow(file.id)).toBeNull();
  });
});
