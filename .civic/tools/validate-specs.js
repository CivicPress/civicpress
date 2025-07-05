#!/usr/bin/env node

/**
 * CivicPress Spec Validator
 *
 * Validates that all specs in .civic/specs/ have:
 * - Version headers (YAML frontmatter or inline)
 * - Required sections
 * - Proper formatting
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Configuration
const SPECS_DIR = path.join(__dirname, '../specs');
const REQUIRED_SECTIONS = [
  '## 📛 Name',
  '## 🎯 Purpose',
  '## 🧩 Scope & Responsibilities',
];

const REQUIRED_HEADER_FIELDS = [
  'version',
  'status',
  'created',
  'updated',
  'authors',
  'reviewers',
];

function extractYamlFrontmatter(content) {
  // Match YAML frontmatter at the very top of the file
  const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (yamlMatch) {
    try {
      const metadata = yaml.load(yamlMatch[1]);
      return metadata;
    } catch (e) {
      return null;
    }
  } else {
    // Try matching YAML frontmatter not at the very top (fallback)
    const fallbackMatch = content.match(/---\s*\n([\s\S]*?)\n---/);
    if (fallbackMatch) {
      try {
        const metadata = yaml.load(fallbackMatch[1]);
        return metadata;
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

function validateSpec(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);
  const errors = [];
  const warnings = [];

  // Check for YAML frontmatter first
  const yamlMetadata = extractYamlFrontmatter(content);
  
  if (yamlMetadata) {
    // Validate YAML frontmatter
    if (!yamlMetadata.version) {
      errors.push(`Missing version in YAML frontmatter`);
    }
    
    // Check for required fields in YAML
    REQUIRED_HEADER_FIELDS.forEach((field) => {
      if (!yamlMetadata[field]) {
        warnings.push(`Missing ${field} field in YAML frontmatter`);
      }
    });
  } else {
    // Fall back to inline metadata validation
    if (!content.includes('**Version:**')) {
      errors.push(`Missing version header (neither YAML frontmatter nor inline format found)`);
    }

    // Check for required header fields in inline format
    REQUIRED_HEADER_FIELDS.forEach((field) => {
      const fieldWithColon = field.charAt(0).toUpperCase() + field.slice(1) + ':';
      if (!content.includes(fieldWithColon)) {
        warnings.push(`Missing ${field} field`);
      }
    });
  }

  // Check for required sections
  REQUIRED_SECTIONS.forEach((section) => {
    if (!content.includes(section)) {
      warnings.push(`Missing section: ${section}`);
    }
  });

  // Check for proper emoji in title
  const titleMatch = content.match(/^#\s*[^\s]+\s+CivicPress Spec:/);
  if (!titleMatch) {
    warnings.push('Missing emoji in title');
  }

  // Check for History section
  if (!content.includes('## 📅 History')) {
    warnings.push('Missing History section');
  }

  return { filename, errors, warnings };
}

function main() {
  console.log('🔍 CivicPress Spec Validator\n');

  const specFiles = fs
    .readdirSync(SPECS_DIR)
    .filter((file) => file.endsWith('.md') && file !== 'spec-validation-report.md')
    .map((file) => path.join(SPECS_DIR, file));

  let totalErrors = 0;
  let totalWarnings = 0;
  const results = [];

  // Validate each spec
  specFiles.forEach((filePath) => {
    const result = validateSpec(filePath);
    results.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  });

  // Report results
  const filesWithIssues = results.filter(
    (r) => r.errors.length > 0 || r.warnings.length > 0
  );

  if (filesWithIssues.length > 0) {
    filesWithIssues.forEach(({ filename, errors, warnings }) => {
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
  console.log(`  Errors: ${totalErrors}`);
  console.log(`  Warnings: ${totalWarnings}`);

  if (totalErrors === 0 && totalWarnings === 0) {
    console.log('\n✅ All specs are valid!');
    console.log(`   Status: ${specFiles.length} specs validated successfully`);
    console.log(
      '   All specs have proper formatting, headers, and required sections'
    );
    process.exit(0);
  } else if (totalErrors === 0) {
    console.log('\n⚠️  Specs have warnings but no errors.');
    console.log(
      `   Status: ${specFiles.length} specs checked, ${totalWarnings} warnings found`
    );
    console.log('   Some specs may need minor formatting improvements');
    process.exit(0);
  } else {
    console.log('\n❌ Specs have errors that need to be fixed.');
    console.log(
      `   Status: ${specFiles.length} specs checked, ${totalErrors} errors found`
    );
    console.log(
      '   Some specs are missing critical elements and must be fixed'
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateSpec };
