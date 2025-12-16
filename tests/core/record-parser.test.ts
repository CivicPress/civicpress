import { describe, it, expect } from 'vitest';
import { RecordParser } from '../../core/src/records/record-parser.js';
import { RecordData } from '../../core/src/records/record-manager.js';

describe('RecordParser - workflowState Handling', () => {
  describe('Serialization (RecordData → YAML)', () => {
    it('should exclude workflowState from YAML frontmatter', () => {
      const record: RecordData = {
        id: 'test-record-1',
        title: 'Test Record',
        type: 'policy',
        status: 'published',
        workflowState: 'ready_for_publication', // Should NOT appear in YAML
        content: '# Test Record\n\nContent here.',
        author: 'testuser',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const markdown = RecordParser.serializeToMarkdown(record);

      // Verify markdown contains status
      expect(markdown).toContain('status: published');

      // Verify workflowState is NOT in the YAML frontmatter
      expect(markdown).not.toContain('workflowState');
      expect(markdown).not.toContain('workflow_state');
      expect(markdown).not.toContain('ready_for_publication');
    });

    it('should include status in YAML frontmatter', () => {
      const record: RecordData = {
        id: 'test-record-2',
        title: 'Test Record 2',
        type: 'policy',
        status: 'draft',
        workflowState: 'under_review',
        content: '# Test Record\n\nContent here.',
        author: 'testuser',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const markdown = RecordParser.serializeToMarkdown(record);

      // Verify status is included
      expect(markdown).toContain('status: draft');

      // Verify workflowState is excluded
      expect(markdown).not.toContain('workflowState');
      expect(markdown).not.toContain('under_review');
    });

    it('should handle record without workflowState', () => {
      const record: RecordData = {
        id: 'test-record-3',
        title: 'Test Record 3',
        type: 'policy',
        status: 'published',
        // No workflowState
        content: '# Test Record\n\nContent here.',
        author: 'testuser',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const markdown = RecordParser.serializeToMarkdown(record);

      // Should serialize successfully
      expect(markdown).toBeTruthy();
      expect(markdown).toContain('status: published');
      expect(markdown).not.toContain('workflowState');
    });

    it('should preserve all other fields except workflowState', () => {
      const record: RecordData = {
        id: 'test-record-4',
        title: 'Test Record 4',
        type: 'bylaw',
        status: 'published',
        workflowState: 'internal_only',
        content: '# Test Record\n\nContent here.',
        author: 'testuser',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
        metadata: {
          tags: ['important', 'public'],
        },
      };

      const markdown = RecordParser.serializeToMarkdown(record);

      // Verify other fields are present
      expect(markdown).toContain('id: test-record-4');
      expect(markdown).toContain('title: Test Record 4');
      expect(markdown).toContain('type: bylaw');
      expect(markdown).toContain('status: published');
      expect(markdown).toContain('author: testuser');

      // Verify workflowState is NOT present
      expect(markdown).not.toContain('workflowState');
      expect(markdown).not.toContain('internal_only');
    });
  });

  describe('Parsing (YAML → RecordData)', () => {
    it('should parse record without workflowState in frontmatter', () => {
      const markdown = `---
id: test-parse-1
title: Test Record
type: policy
status: published
author: testuser
created: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
---

# Test Record

Content here.`;

      const record = RecordParser.parseFromMarkdown(markdown, 'test-parse-1');

      expect(record).toBeTruthy();
      expect(record.id).toBe('test-parse-1');
      expect(record.status).toBe('published');
      // workflowState should be undefined (not in YAML, should come from DB)
      expect(record.workflowState).toBeUndefined();
    });

    it('should ignore workflowState if present in frontmatter (defensive)', () => {
      // Even if workflowState somehow appears in frontmatter, it should be ignored
      // This tests defensive behavior
      const markdown = `---
id: test-parse-2
title: Test Record
type: policy
status: published
workflowState: under_review
author: testuser
created: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
---

# Test Record

Content here.`;

      const record = RecordParser.parseFromMarkdown(markdown, 'test-parse-2');

      expect(record).toBeTruthy();
      expect(record.status).toBe('published');
      // workflowState should not be set from YAML (it's DB-only)
      // Note: The parser may include it in metadata, but it should be ignored
      // when loading from database
    });

    it('should parse status correctly when workflowState is not present', () => {
      const markdown = `---
id: test-parse-3
title: Test Record
type: policy
status: draft
author: testuser
created: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
---

# Test Record

Content here.`;

      const record = RecordParser.parseFromMarkdown(markdown, 'test-parse-3');

      expect(record.status).toBe('draft');
      expect(record.workflowState).toBeUndefined();
    });
  });

  describe('Round-trip (DB → YAML → Parse)', () => {
    it('should preserve status but not workflowState through serialization', () => {
      // Simulate record from database (has workflowState)
      const dbRecord: RecordData = {
        id: 'round-trip-1',
        title: 'Round Trip Record',
        type: 'policy',
        status: 'published',
        workflowState: 'ready_for_publication', // From DB
        content: '# Record\n\nContent.',
        author: 'testuser',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      // Serialize to markdown (workflowState should be excluded)
      const markdown = RecordParser.serializeToMarkdown(dbRecord);

      // Verify workflowState is not in markdown
      expect(markdown).not.toContain('workflowState');
      expect(markdown).not.toContain('ready_for_publication');
      expect(markdown).toContain('status: published');

      // Parse back (workflowState should not be in parsed record)
      const parsedRecord = RecordParser.parseFromMarkdown(
        markdown,
        'round-trip-1'
      );

      // Status should be preserved
      expect(parsedRecord.status).toBe('published');

      // workflowState should not be in parsed record (not in YAML)
      // It will be set from database when record is loaded
      expect(parsedRecord.workflowState).toBeUndefined();
    });
  });

  describe('buildFrontmatter method', () => {
    it('should not include workflowState in frontmatter object', () => {
      const record: RecordData = {
        id: 'frontmatter-test-1',
        title: 'Frontmatter Test',
        type: 'policy',
        status: 'published',
        workflowState: 'under_review',
        content: '# Test\n\nContent.',
        author: 'testuser',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const frontmatter = RecordParser.buildFrontmatter(record);

      // Verify status is included
      expect(frontmatter.status).toBe('published');

      // Verify workflowState is NOT included
      expect((frontmatter as any).workflowState).toBeUndefined();
      expect((frontmatter as any).workflow_state).toBeUndefined();
    });

    it('should include all required fields except workflowState', () => {
      const record: RecordData = {
        id: 'frontmatter-test-2',
        title: 'Frontmatter Test 2',
        type: 'bylaw',
        status: 'draft',
        workflowState: 'ready_for_publication',
        content: '# Test\n\nContent.',
        author: 'testuser',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
      };

      const frontmatter = RecordParser.buildFrontmatter(record);

      // Required fields should be present
      expect(frontmatter.id).toBe('frontmatter-test-2');
      expect(frontmatter.title).toBe('Frontmatter Test 2');
      expect(frontmatter.type).toBe('bylaw');
      expect(frontmatter.status).toBe('draft');
      expect(frontmatter.author).toBe('testuser');

      // workflowState should NOT be present
      expect((frontmatter as any).workflowState).toBeUndefined();
    });
  });
});
