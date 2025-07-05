#!/usr/bin/env node

/**
 * CivicPress Spec Lister
 *
 * Lists all specs with their versions, status, and dependencies
 * in a nice table format.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SPECS_DIR = path.join(__dirname, '../specs');

function extractMetadata(content) {
  const metadata = {};

  // Extract version
  const versionMatch = content.match(/\*\*Version:\*\*\s*`([^`]+)`/);
  metadata.version = versionMatch ? versionMatch[1] : 'N/A';

  // Extract status
  const statusMatch = content.match(/\*\*Status:\*\*\s*`([^`]+)`/);
  metadata.status = statusMatch ? statusMatch[1] : 'N/A';

  // Extract updated date
  const updatedMatch = content.match(/\*\*Updated:\*\*\s*`([^`]+)`/);
  metadata.updated = updatedMatch ? updatedMatch[1] : 'N/A';

  // Extract dependencies
  const dependencies = [];
  const depRegex = /`([^`]+\.md):\s*([^`]+)`/g;
  let match;

  while ((match = depRegex.exec(content)) !== null) {
    dependencies.push(`${match[1]} ${match[2]}`);
  }

  metadata.dependencies = dependencies;

  // Extract name
  const nameMatch = content.match(/## 📛 Name\s*\n\s*\n`([^`]+)`/);
  metadata.name = nameMatch ? nameMatch[1] : 'N/A';

  return metadata;
}

function formatTable(data) {
  // Find max lengths for each column
  const maxLengths = {
    filename: Math.max(...data.map((row) => row.filename.length)),
    name: Math.max(...data.map((row) => row.name.length)),
    version: Math.max(...data.map((row) => row.version.length)),
    status: Math.max(...data.map((row) => row.status.length)),
    updated: Math.max(...data.map((row) => row.updated.length)),
    deps: Math.max(...data.map((row) => row.deps.length)),
  };

  // Create header
  const header = [
    'Filename'.padEnd(maxLengths.filename),
    'Name'.padEnd(maxLengths.name),
    'Version'.padEnd(maxLengths.version),
    'Status'.padEnd(maxLengths.status),
    'Updated'.padEnd(maxLengths.updated),
    'Dependencies'.padEnd(maxLengths.deps),
  ].join(' | ');

  // Create separator
  const separator = '-'.repeat(header.length);

  // Create rows
  const rows = data.map((row) =>
    [
      row.filename.padEnd(maxLengths.filename),
      row.name.padEnd(maxLengths.name),
      row.version.padEnd(maxLengths.version),
      row.status.padEnd(maxLengths.status),
      row.updated.padEnd(maxLengths.updated),
      row.deps.padEnd(maxLengths.deps),
    ].join(' | ')
  );

  return [header, separator, ...rows].join('\n');
}

function main() {
  console.log('📋 CivicPress Spec Lister\n');

  const specFiles = fs
    .readdirSync(SPECS_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort();

  const specs = [];

  // Extract metadata from each spec
  specFiles.forEach((filename) => {
    const filePath = path.join(SPECS_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    const metadata = extractMetadata(content);

    specs.push({
      filename,
      name: metadata.name,
      version: metadata.version,
      status: metadata.status,
      updated: metadata.updated,
      deps:
        metadata.dependencies.length > 0
          ? metadata.dependencies.join(', ')
          : 'None',
    });
  });

  // Display table
  console.log(formatTable(specs));

  // Summary with enhanced status messages
  console.log(`\n📊 Summary:`);
  console.log(`  Total specs: ${specs.length}`);
  console.log(
    `  Stable specs: ${specs.filter((s) => s.status === 'stable').length}`
  );
  console.log(
    `  Draft specs: ${specs.filter((s) => s.status === 'draft').length}`
  );

  // Version distribution
  const versions = specs.reduce((acc, spec) => {
    acc[spec.version] = (acc[spec.version] || 0) + 1;
    return acc;
  }, {});

  console.log(`\n📈 Version Distribution:`);
  Object.entries(versions)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([version, count]) => {
      console.log(`  ${version}: ${count} specs`);
    });

  // Dependencies summary
  const totalDeps = specs.reduce((total, spec) => {
    return total + (spec.deps === 'None' ? 0 : spec.deps.split(', ').length);
  }, 0);

  console.log(`\n🔗 Dependencies:`);
  console.log(`  Total dependencies: ${totalDeps}`);
  console.log(
    `  Average deps per spec: ${(totalDeps / specs.length).toFixed(1)}`
  );

  // Success message
  console.log('\n✅ Spec listing completed successfully!');
  console.log(`   Status: ${specs.length} specs cataloged and analyzed`);
  console.log('   All spec metadata has been extracted and formatted');
}

if (require.main === module) {
  main();
}

module.exports = { extractMetadata, formatTable };
