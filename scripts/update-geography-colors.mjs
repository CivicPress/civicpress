#!/usr/bin/env node
/**
 * Update geography file with color mapping
 */

import fs from 'fs';
import matter from 'gray-matter';
import { stringify } from 'yaml';

const filePath = process.argv[2] || 'data/geography/geojson/zone/grandes-affectations-du-territoire-1763321502869.md';

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const { data: frontmatter, content: markdownContent } = matter(content);

// Extract GeoJSON from code block
const geoJsonMatch = markdownContent.match(/```json\s*\n([\s\S]*?)\n```/);
if (!geoJsonMatch) {
  console.error('No JSON code block found');
  process.exit(1);
}

const geoJson = JSON.parse(geoJsonMatch[1]);

// Get unique LETTRE values
const lettres = new Set();
geoJson.features.forEach((f) => {
  if (f.properties && f.properties.LETTRE) {
    const lettre = String(f.properties.LETTRE).trim();
    if (lettre) {
      lettres.add(lettre);
    }
  }
});

console.log('Unique LETTRE values:', Array.from(lettres).sort());

// Assign colors based on zone type
const colorMap = {
  IND: '#64748b', // slate-500 (Industrial - neutral gray)
  A: '#10b981', // green-500 (Agricultural - green)
  RF: '#059669', // emerald-600 (Recreational-Forestry - forest green)
  PU: '#f59e0b', // amber-500 (Urbanization Perimeter - amber/orange)
  AFD: '#84cc16', // lime-500 (Dynamic Agro-Forestry - light green)
  AF: '#22c55e', // emerald-500 (Agro-Forestry - medium green)
};

// Build color mapping
const colors = {};
Array.from(lettres)
  .sort()
  .forEach((lettre) => {
    colors[lettre] = colorMap[lettre] || '#6b7280'; // default gray if not found
  });

// Add color_mapping to metadata (not top-level to avoid YAML anchor issues)
if (!frontmatter.metadata) {
  frontmatter.metadata = {};
}
frontmatter.metadata.color_mapping = {
  property: 'LETTRE',
  type: 'property',
  colors: colors,
  default_color: '#6b7280',
};
frontmatter.metadata.updated = new Date().toISOString();
frontmatter.updated_at = new Date().toISOString();

// Remove top-level color_mapping if it exists (we only want it in metadata)
delete frontmatter.color_mapping;
delete frontmatter.icon_mapping;

// Reconstruct the file
const yamlContent = stringify(frontmatter, {
  lineWidth: 0,
  noRefs: true,
  sortKeys: false,
});

const newContent = `---
${yamlContent}---

\`\`\`json
${JSON.stringify(geoJson, null, 2)}
\`\`\`
`;

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('✅ Updated geography file with color mapping');
console.log('Color assignments:', colors);

