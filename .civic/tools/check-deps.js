#!/usr/bin/env node

/**
 * CivicPress Dependency Checker
 *
 * Checks that all referenced specs exist and have compatible versions.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SPECS_DIR = path.join(__dirname, '../specs');

function extractDependencies(content) {
  const dependencies = [];

  // Remove code blocks to avoid false positives
  const contentWithoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');

  // Look for dependency patterns like:
  // - `auth.md: >=1.2.0`
  // - `permissions.md: >=1.1.0`
  const depRegex = /`([^`]+\.md):\s*([^`]+)`/g;
  let match;

  while ((match = depRegex.exec(contentWithoutCodeBlocks)) !== null) {
    dependencies.push({
      spec: match[1],
      constraint: match[2].trim(),
    });
  }

  return dependencies;
}

function extractVersion(content) {
  const versionMatch = content.match(/\*\*Version:\*\*\s*`([^`]+)`/);
  return versionMatch ? versionMatch[1] : null;
}

function checkDependency(dep, specFiles, specVersions) {
  const { spec, constraint } = dep;

  // Check if spec exists
  if (!specFiles.includes(spec)) {
    return { error: `Referenced spec '${spec}' does not exist` };
  }

  // Check if we have version info
  const actualVersion = specVersions[spec];
  if (!actualVersion) {
    return { warning: `No version info found for '${spec}'` };
  }

  // Parse constraint (simple version comparison for MVP)
  const constraintMatch = constraint.match(/([<>=]+)\s*([\d.]+)/);
  if (!constraintMatch) {
    return { warning: `Invalid version constraint format: '${constraint}'` };
  }

  const [, operator, requiredVersion] = constraintMatch;

  // Simple version comparison (for MVP)
  const actual = actualVersion.split('.').map(Number);
  const required = requiredVersion.split('.').map(Number);

  let compatible = false;

  switch (operator) {
    case '>=':
      compatible =
        actual[0] > required[0] ||
        (actual[0] === required[0] && actual[1] >= required[1]);
      break;
    case '>':
      compatible =
        actual[0] > required[0] ||
        (actual[0] === required[0] && actual[1] > required[1]);
      break;
    case '=':
    case '==':
      compatible = actualVersion === requiredVersion;
      break;
    default:
      return { warning: `Unsupported operator: '${operator}'` };
  }

  if (!compatible) {
    return {
      error: `Version mismatch: '${spec}' is ${actualVersion}, but ${constraint} is required`,
    };
  }

  return { success: true };
}

function main() {
  console.log('🔗 CivicPress Dependency Checker\n');

  const specFiles = fs
    .readdirSync(SPECS_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => file);

  // Build version map
  const specVersions = {};
  specFiles.forEach((filename) => {
    const filePath = path.join(SPECS_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    const version = extractVersion(content);
    if (version) {
      specVersions[filename] = version;
    }
  });

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalDependencies = 0;
  const results = [];

  // Check dependencies for each spec
  specFiles.forEach((filename) => {
    const filePath = path.join(SPECS_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    const dependencies = extractDependencies(content);

    totalDependencies += dependencies.length;

    if (dependencies.length === 0) {
      return; // No dependencies to check
    }

    const errors = [];
    const warnings = [];

    dependencies.forEach((dep) => {
      const result = checkDependency(dep, specFiles, specVersions);

      if (result.error) {
        errors.push(`${dep.spec}: ${result.error}`);
      } else if (result.warning) {
        warnings.push(`${dep.spec}: ${result.warning}`);
      }
    });

    if (errors.length > 0 || warnings.length > 0) {
      results.push({ filename, errors, warnings });
      totalErrors += errors.length;
      totalWarnings += warnings.length;
    }
  });

  // Report results
  if (results.length > 0) {
    results.forEach(({ filename, errors, warnings }) => {
      console.log(`📄 ${filename}`);

      if (errors.length > 0) {
        errors.forEach((error) => console.log(`  ❌ ${error}`));
      }

      if (warnings.length > 0) {
        warnings.forEach((warning) => console.log(`  ⚠️  ${warning}`));
      }

      console.log('');
    });
  }

  // Summary with enhanced status messages
  console.log('📊 Summary:');
  console.log(`  Specs checked: ${specFiles.length}`);
  console.log(`  Dependencies found: ${totalDependencies}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log(`  Warnings: ${totalWarnings}`);

  if (totalErrors === 0 && totalWarnings === 0) {
    console.log('\n✅ All dependencies are valid!');
    console.log(
      `   Status: ${specFiles.length} specs checked, ${totalDependencies} dependencies validated`
    );
    console.log(
      '   All cross-references are properly linked and version-compatible'
    );
    process.exit(0);
  } else if (totalErrors === 0) {
    console.log('\n⚠️  Dependencies have warnings but no errors.');
    console.log(
      `   Status: ${specFiles.length} specs checked, ${totalDependencies} dependencies found`
    );
    console.log(
      '   Some cross-references may need attention but are not blocking'
    );
    process.exit(0);
  } else {
    console.log('\n❌ Dependencies have errors that need to be fixed.');
    console.log(
      `   Status: ${specFiles.length} specs checked, ${totalDependencies} dependencies found`
    );
    console.log('   Some cross-references are broken and must be resolved');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { extractDependencies, checkDependency };
