#!/usr/bin/env node

/**
 * Search V2 Manual Test Script
 *
 * Tests the new FTS5-based search functionality
 * Run with: node scripts/test-search-v2.mjs
 */

import { CivicPress } from '../core/src/civic-core.js';
import * as path from 'path';
import * as fs from 'fs';

async function testSearchV2() {
  console.log('🧪 Testing Search V2 Implementation\n');

  // Create test directory
  const testDir = path.join(process.cwd(), '.test-search-v2');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  try {
    // Initialize CivicPress
    const civic = new CivicPress({
      dataDir: testDir,
      database: {
        type: 'sqlite',
        sqlite: {
          file: path.join(testDir, 'test.db'),
        },
      },
    });

    await civic.initialize();
    console.log('✅ CivicPress initialized\n');

    const dbService = civic.getDatabaseService();
    const recordManager = civic.getRecordManager();
    const searchService = dbService.getSearchService();

    if (!searchService) {
      console.error('❌ Search service not available');
      process.exit(1);
    }

    console.log('📝 Creating test records...\n');

    // Create test records
    const testRecords = [
      {
        id: 'test-budget-2024',
        type: 'bylaw',
        title: 'Budget 2024',
        content: 'This is the municipal budget for fiscal year 2024. It includes allocations for parks, roads, and public safety.',
        tags: 'budget,finance,2024',
        status: 'published',
      },
      {
        id: 'test-noise-ordinance',
        type: 'bylaw',
        title: 'Noise Ordinance',
        content: 'Regulations governing noise levels in residential and commercial areas during specified hours.',
        tags: 'noise,safety,residential',
        status: 'published',
      },
      {
        id: 'test-budget-2025',
        type: 'article',
        title: 'Budget 2025 Preliminary',
        content: 'Preliminary budget estimates for fiscal year 2025. Subject to city council approval.',
        tags: 'budget,finance,2025',
        status: 'draft',
      },
      {
        id: 'test-parks',
        type: 'resolution',
        title: 'Parks Improvement Resolution',
        content: 'Resolution to improve city parks with new playground equipment and landscaping.',
        tags: 'parks,recreation,improvements',
        status: 'approved',
      },
    ];

    // Create and index records
    for (const recordData of testRecords) {
      await dbService.createRecord({
        id: recordData.id,
        type: recordData.type,
        title: recordData.title,
        status: recordData.status,
        content: recordData.content,
        metadata: JSON.stringify({ tags: recordData.tags }),
        author: 'test-user',
      });

      // Index for search
      await dbService.indexRecord({
        recordId: recordData.id,
        recordType: recordData.type,
        title: recordData.title,
        content: recordData.content,
        tags: recordData.tags,
        metadata: recordData.tags,
      });
    }

    console.log(`✅ Created ${testRecords.length} test records\n`);

    // Test 1: Basic Search
    console.log('🔍 Test 1: Basic Search');
    console.log('────────────────────────────────────────');
    const basicResults = await recordManager.searchRecords('budget', { limit: 10 });
    console.log(`Query: "budget"`);
    console.log(`Results: ${basicResults.records.length}`);
    basicResults.records.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title} (${r.type}) - Score: ${r._search?.relevance_score?.toFixed(3) || 'N/A'}`);
    });
    console.log();

    // Test 2: Multi-word Search
    console.log('🔍 Test 2: Multi-word Search');
    console.log('────────────────────────────────────────');
    const multiWordResults = await recordManager.searchRecords('budget 2024', { limit: 10 });
    console.log(`Query: "budget 2024"`);
    console.log(`Results: ${multiWordResults.records.length}`);
    multiWordResults.records.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title} (${r.type})`);
    });
    console.log();

    // Test 3: Phrase Search
    console.log('🔍 Test 3: Phrase Search');
    console.log('────────────────────────────────────────');
    const phraseResults = await recordManager.searchRecords('"noise ordinance"', { limit: 10 });
    console.log(`Query: "noise ordinance"`);
    console.log(`Results: ${phraseResults.records.length}`);
    phraseResults.records.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title}`);
    });
    console.log();

    // Test 4: Suggestions with Typo Tolerance
    console.log('🔍 Test 4: Suggestions with Typo Tolerance');
    console.log('────────────────────────────────────────');
    const suggestions = await recordManager.getSearchSuggestions('budjet', { limit: 5 });
    console.log(`Query: "budjet" (typo for "budget")`);
    console.log(`Suggestions: ${suggestions.length}`);
    suggestions.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s}`);
    });
    console.log();

    // Test 5: Type Filtering
    console.log('🔍 Test 5: Type Filtering');
    console.log('────────────────────────────────────────');
    const filteredResults = await recordManager.searchRecords('budget', {
      type: 'bylaw',
      limit: 10,
    });
    console.log(`Query: "budget" (type: bylaw)`);
    console.log(`Results: ${filteredResults.records.length}`);
    filteredResults.records.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title} (${r.type})`);
    });
    console.log();

    // Test 6: Facets
    console.log('🔍 Test 6: Search Facets');
    console.log('────────────────────────────────────────');
    const facets = await searchService.getFacets('budget');
    console.log('Type Facets:');
    facets.types.forEach((f) => {
      console.log(`  - ${f.value}: ${f.count}`);
    });
    console.log('Status Facets:');
    facets.statuses.forEach((f) => {
      console.log(`  - ${f.value}: ${f.count}`);
    });
    console.log();

    // Test 7: Performance Test
    console.log('⏱️  Test 7: Performance Test');
    console.log('────────────────────────────────────────');
    const iterations = 10;
    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      await recordManager.searchRecords('budget', { limit: 10 });
    }
    const elapsed = Date.now() - start;
    const avgTime = elapsed / iterations;
    console.log(`Average search time (${iterations} iterations): ${avgTime.toFixed(2)}ms`);
    console.log(`Total time: ${elapsed}ms`);
    console.log();

    // Test 8: Cache Test
    console.log('💾 Test 8: Cache Test');
    console.log('────────────────────────────────────────');
    const cacheTestStart = Date.now();
    await recordManager.searchRecords('budget', { limit: 10 }); // First call
    const firstCall = Date.now() - cacheTestStart;

    const cacheTestStart2 = Date.now();
    await recordManager.searchRecords('budget', { limit: 10 }); // Cached call
    const secondCall = Date.now() - cacheTestStart2;

    console.log(`First call: ${firstCall}ms`);
    console.log(`Cached call: ${secondCall}ms`);
    console.log(`Speedup: ${(firstCall / secondCall).toFixed(2)}x`);
    console.log();

    console.log('✅ All tests completed successfully!\n');

    // Cleanup
    await civic.close();
    console.log('🧹 Cleaned up test database');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

testSearchV2().catch(console.error);
