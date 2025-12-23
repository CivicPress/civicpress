#!/usr/bin/env node
/**
 * Cleanup Test Caches Script
 * 
 * Removes all test-related caches and build artifacts to free up disk space
 * and resolve potential cache-related test issues.
 * 
 * Usage: node scripts/cleanup-test-caches.mjs
 * Or: pnpm run cleanup
 */

import { rm, readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { existsSync } from 'fs';

const ROOT_DIR = resolve(process.cwd());

/**
 * Remove directory if it exists
 */
async function removeDir(path) {
  try {
    if (existsSync(path)) {
      const stats = await stat(path);
      if (stats.isDirectory()) {
        await rm(path, { recursive: true, force: true });
        console.log(`✅ Removed: ${path}`);
        return true;
      }
    }
  } catch (error) {
    console.warn(`⚠️  Could not remove ${path}: ${error.message}`);
  }
  return false;
}

/**
 * Remove TypeScript build info files recursively
 */
async function removeTsBuildInfoFiles() {
  const { readdir } = await import('fs/promises');
  const { join } = await import('path');
  
  let removedCount = 0;
  
  async function walkDir(dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        // Skip node_modules and .git
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }
        
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.name.endsWith('.tsbuildinfo')) {
          try {
            await rm(fullPath, { force: true });
            console.log(`✅ Removed: ${fullPath}`);
            removedCount++;
          } catch (error) {
            // Ignore errors
          }
        }
      }
    } catch (error) {
      // Ignore permission errors
    }
  }
  
  // Check common directories
  const dirsToCheck = [
    join(ROOT_DIR, 'core'),
    join(ROOT_DIR, 'cli'),
    join(ROOT_DIR, 'modules'),
    join(ROOT_DIR, 'tests'),
  ];
  
  for (const dir of dirsToCheck) {
    if (existsSync(dir)) {
      await walkDir(dir);
    }
  }
  
  return removedCount;
}

/**
 * Main cleanup function
 */
async function cleanup() {
  console.log('🧹 Cleaning up test caches and build artifacts...\n');

  let totalRemoved = 0;

  // 1. Remove Vitest/Vite caches
  console.log('📦 Removing Vitest/Vite caches...');
  totalRemoved += await removeDir(join(ROOT_DIR, 'node_modules', '.vite'));
  totalRemoved += await removeDir(join(ROOT_DIR, '.vitest'));

  // 2. Remove coverage directories
  console.log('\n📊 Removing coverage reports...');
  totalRemoved += await removeDir(join(ROOT_DIR, 'coverage'));
  
  // Check module-level coverage directories
  const modules = ['core', 'cli', 'modules/api', 'modules/ui', 'modules/realtime', 'modules/storage'];
  for (const module of modules) {
    const modulePath = join(ROOT_DIR, module);
    if (existsSync(modulePath)) {
      totalRemoved += await removeDir(join(modulePath, 'coverage'));
    }
  }

  // 3. Remove TypeScript build info files
  console.log('\n🔧 Removing TypeScript build cache...');
  const tsBuildInfoCount = await removeTsBuildInfoFiles();
  if (tsBuildInfoCount > 0) {
    console.log(`✅ Removed ${tsBuildInfoCount} TypeScript build info files`);
  }
  totalRemoved += tsBuildInfoCount;

  // 4. Remove .nyc_output (coverage cache)
  console.log('\n📈 Removing coverage cache...');
  totalRemoved += await removeDir(join(ROOT_DIR, '.nyc_output'));

  // 5. Remove .vitest-attachments (test attachments)
  console.log('\n📎 Removing test attachments...');
  totalRemoved += await removeDir(join(ROOT_DIR, '.vitest-attachments'));

  // Summary
  console.log('\n✨ Cleanup complete!');
  if (totalRemoved > 0) {
    console.log(`   Removed ${totalRemoved} cache directories/files`);
  } else {
    console.log('   No caches found to remove');
  }
  console.log('\n💡 Tip: Run "pnpm install" if you need to restore dependencies');
}

// Run cleanup
cleanup().catch((error) => {
  console.error('❌ Cleanup failed:', error);
  process.exit(1);
});

