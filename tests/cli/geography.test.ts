import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import {
  createCLITestContext,
  cleanupCLITestContext,
} from '../fixtures/test-setup.js';
import fs from 'fs-extra';
import path from 'path';

describe('Geography CLI Commands', () => {
  let context: any;
  let testDir: string;

  beforeEach(async () => {
    context = await createCLITestContext();
    testDir = context.testDir;
  });

  afterEach(async () => {
    await cleanupCLITestContext(context);
  });

  describe('geography:validate', () => {
    it('should validate valid geography data', async () => {
      const testFile = path.join(testDir, 'valid-geography.md');
      const content = `---
id: "ca-qc-montreal/bylaws/2025-123"
title: "Noise Control — Residential Zones"
geography:
  srid: 4326
  zone_ref: "mtl:zone:res-R1"
  bbox:
    minLon: -73.65
    minLat: 45.45
    maxLon: -73.52
    maxLat: 45.55
---
Content here
`;
      await fs.writeFile(testFile, content);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:validate valid-geography.md`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('📍 Geography Validation: valid-geography.md');
      expect(result).toContain('✅ Geography data is valid');
    });

    it('should detect invalid geography data', async () => {
      const testFile = path.join(testDir, 'invalid-geography.md');
      const content = `---
id: "ca-qc-montreal/bylaws/2025-123"
title: "Noise Control — Residential Zones"
geography:
  center:
    lon: 200
    lat: 45.45
---
Content here
`;
      await fs.writeFile(testFile, content);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:validate invalid-geography.md`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('📍 Geography Validation: invalid-geography.md');
      expect(result).toContain('❌ Geography data has validation errors:');
      expect(result).toContain(
        'geography.center.lon must be within [-180, 180]'
      );
    });

    it('should handle files without geography data', async () => {
      const testFile = path.join(testDir, 'no-geography.md');
      const content = `---
id: "ca-qc-montreal/bylaws/2025-123"
title: "Noise Control — Residential Zones"
---
Content here
`;
      await fs.writeFile(testFile, content);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:validate no-geography.md`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('📍 Geography Validation: no-geography.md');
      expect(result).toContain('ℹ️  No geography data found');
    });

    it('should output JSON format', async () => {
      const testFile = path.join(testDir, 'valid-geography.md');
      const content = `---
id: "ca-qc-montreal/bylaws/2025-123"
title: "Noise Control — Residential Zones"
geography:
  zone_ref: "mtl:zone:res-R1"
---
Content here
`;
      await fs.writeFile(testFile, content);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:validate valid-geography.md --json`,
        { encoding: 'utf8' }
      );

      const jsonResult = JSON.parse(result);
      expect(jsonResult.file).toBe('valid-geography.md');
      expect(jsonResult.hasGeography).toBe(true);
      expect(jsonResult.validation.valid).toBe(true);
    });

    it('should show geography summary when requested', async () => {
      const testFile = path.join(testDir, 'valid-geography.md');
      const content = `---
id: "ca-qc-montreal/bylaws/2025-123"
title: "Noise Control — Residential Zones"
geography:
  zone_ref: "mtl:zone:res-R1"
  center:
    lon: -73.65
    lat: 45.45
---
Content here
`;
      await fs.writeFile(testFile, content);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:validate valid-geography.md --summary`,
        { encoding: 'utf8' }
      );

      expect(result).toContain(
        '📋 Summary: Zone: mtl:zone:res-R1 | Center: -73.650000, 45.450000'
      );
    });

    it('should show normalized data when requested', async () => {
      const testFile = path.join(testDir, 'valid-geography.md');
      const content = `---
id: "ca-qc-montreal/bylaws/2025-123"
title: "Noise Control — Residential Zones"
geography:
  zone_ref: "mtl:zone:res-R1"
---
Content here
`;
      await fs.writeFile(testFile, content);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:validate valid-geography.md --normalize`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('🔄 Normalized data:');
      expect(result).toContain('"srid": 4326');
    });

    it('should handle missing file gracefully', () => {
      expect(() => {
        execSync(
          `cd ${testDir} && node ${context.cliPath} geography:validate nonexistent.md`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });
  });

  describe('geography:scan', () => {
    it('should scan directory for files with geography data', async () => {
      // Create files with and without geography
      const file1 = path.join(testDir, 'file1.md');
      const content1 = `---
id: "ca-qc-montreal/bylaws/2025-123"
geography:
  zone_ref: "mtl:zone:res-R1"
---
Content 1
`;
      await fs.writeFile(file1, content1);

      const file2 = path.join(testDir, 'file2.md');
      const content2 = `---
id: "ca-qc-montreal/bylaws/2025-124"
---
Content 2
`;
      await fs.writeFile(file2, content2);

      const file3 = path.join(testDir, 'file3.md');
      const content3 = `---
id: "ca-qc-montreal/bylaws/2025-125"
geography:
  center:
    lon: -79.383
    lat: 43.653
---
Content 3
`;
      await fs.writeFile(file3, content3);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:scan .`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('📍 Geography Scan:');
      expect(result).toContain('📊 Found 2 files with geography data');
      expect(result).toContain('📄 file1.md');
      expect(result).toContain('📄 file3.md');
    });

    it('should output JSON format for scan', async () => {
      const file1 = path.join(testDir, 'file1.md');
      const content1 = `---
id: "ca-qc-montreal/bylaws/2025-123"
geography:
  zone_ref: "mtl:zone:res-R1"
---
Content 1
`;
      await fs.writeFile(file1, content1);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:scan . --json`,
        { encoding: 'utf8' }
      );

      const jsonResult = JSON.parse(result);
      expect(jsonResult.directory).toBeDefined();
      expect(jsonResult.filesWithGeography).toBe(1);
      expect(jsonResult.results).toHaveLength(1);
    });

    it('should show geography summaries when requested', async () => {
      const file1 = path.join(testDir, 'file1.md');
      const content1 = `---
id: "ca-qc-montreal/bylaws/2025-123"
geography:
  zone_ref: "mtl:zone:res-R1"
  center:
    lon: -73.65
    lat: 45.45
---
Content 1
`;
      await fs.writeFile(file1, content1);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:scan . --summary`,
        { encoding: 'utf8' }
      );

      expect(result).toContain(
        '📋 Zone: mtl:zone:res-R1 | Center: -73.650000, 45.450000'
      );
    });

    it('should handle empty directory', async () => {
      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:scan .`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('📍 Geography Scan:');
      expect(result).toContain('📊 Found 0 files with geography data');
      expect(result).toContain('ℹ️  No files with geography data found');
    });

    it('should handle non-existent directory gracefully', () => {
      expect(() => {
        execSync(
          `cd ${testDir} && node ${context.cliPath} geography:scan nonexistent`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });
  });

  describe('geography:normalize', () => {
    it('should normalize geography data', async () => {
      const testFile = path.join(testDir, 'valid-geography.md');
      const content = `---
id: "ca-qc-montreal/bylaws/2025-123"
title: "Noise Control — Residential Zones"
geography:
  zone_ref: "mtl:zone:res-R1"
---
Content here
`;
      await fs.writeFile(testFile, content);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:normalize valid-geography.md`,
        { encoding: 'utf8' }
      );

      expect(result).toContain(
        '📍 Geography Normalization: valid-geography.md'
      );
      expect(result).toContain('🔄 Normalized data:');
      expect(result).toContain('"srid": 4326');
    });

    it('should write normalized data back to file when requested', async () => {
      const testFile = path.join(testDir, 'valid-geography.md');
      const content = `---
id: "ca-qc-montreal/bylaws/2025-123"
title: "Noise Control — Residential Zones"
geography:
  zone_ref: "mtl:zone:res-R1"
---
Content here
`;
      await fs.writeFile(testFile, content);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:normalize valid-geography.md --write`,
        { encoding: 'utf8' }
      );

      expect(result).toContain(
        '💾 File updated with normalized geography data'
      );

      // Verify the file was actually updated
      const updatedContent = await fs.readFile(testFile, 'utf-8');
      expect(updatedContent).toContain('srid: 4326');
    });

    it('should output JSON format for normalization', async () => {
      const testFile = path.join(testDir, 'valid-geography.md');
      const content = `---
id: "ca-qc-montreal/bylaws/2025-123"
title: "Noise Control — Residential Zones"
geography:
  zone_ref: "mtl:zone:res-R1"
---
Content here
`;
      await fs.writeFile(testFile, content);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:normalize valid-geography.md --json`,
        { encoding: 'utf8' }
      );

      const jsonResult = JSON.parse(result);
      expect(jsonResult.file).toBe('valid-geography.md');
      expect(jsonResult.hasGeography).toBe(true);
      expect(jsonResult.normalized.srid).toBe(4326);
    });

    it('should handle files without geography data', async () => {
      const testFile = path.join(testDir, 'no-geography.md');
      const content = `---
id: "ca-qc-montreal/bylaws/2025-123"
title: "Noise Control — Residential Zones"
---
Content here
`;
      await fs.writeFile(testFile, content);

      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:normalize no-geography.md`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('📍 Geography Normalization: no-geography.md');
      expect(result).toContain('ℹ️  No geography data found');
    });

    it('should handle missing file gracefully', () => {
      expect(() => {
        execSync(
          `cd ${testDir} && node ${context.cliPath} geography:normalize nonexistent.md`,
          { encoding: 'utf8' }
        );
      }).toThrow();
    });
  });

  describe('Command help and options', () => {
    it('should show help for geography commands', () => {
      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:validate --help`,
        { encoding: 'utf8' }
      );
      expect(result).toContain('Usage:');
      expect(result).toContain('Options:');
    });

    it('should show help for scan command', () => {
      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:scan --help`,
        { encoding: 'utf8' }
      );
      expect(result).toContain('Usage:');
      expect(result).toContain('Options:');
    });

    it('should show help for normalize command', () => {
      const result = execSync(
        `cd ${testDir} && node ${context.cliPath} geography:normalize --help`,
        { encoding: 'utf8' }
      );
      expect(result).toContain('Usage:');
      expect(result).toContain('Options:');
    });
  });
});
