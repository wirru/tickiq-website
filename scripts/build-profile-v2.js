#!/usr/bin/env node

/**
 * Build Script for Profile V2
 *
 * Embeds profile-v2.html content into api/profile-v2.js as a template literal.
 * This allows the Edge Function to serve the HTML without filesystem access.
 */

const fs = require('fs');
const path = require('path');

// Helper function to escape HTML for JavaScript template literal
function escapeHtml(html) {
  return html
    .replace(/\\/g, '\\\\')  // Escape backslashes
    .replace(/`/g, '\\`')    // Escape backticks
    .replace(/\$/g, '\\$');  // Escape dollar signs
}

console.log('🔨 Building profile-v2 edge function...');

// Read the HTML template
const htmlPath = path.join(__dirname, '..', 'profile-v2.html');

if (!fs.existsSync(htmlPath)) {
  console.error('❌ Error: profile-v2.html not found at', htmlPath);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
console.log('📄 Read profile-v2.html (' + html.length + ' bytes)');

// Read the edge function
const edgeFunctionPath = path.join(__dirname, '..', 'api', 'profile-v2.js');

if (!fs.existsSync(edgeFunctionPath)) {
  console.error('❌ Error: api/profile-v2.js not found at', edgeFunctionPath);
  process.exit(1);
}

let edgeFunction = fs.readFileSync(edgeFunctionPath, 'utf8');
console.log('📄 Read api/profile-v2.js');

// Escape HTML for template literal
const escapedHtml = escapeHtml(html);

// Replace the placeholder with actual HTML
const placeholder = 'const PROFILE_V2_HTML_TEMPLATE = `...embedded during build...`;';

if (!edgeFunction.includes(placeholder)) {
  console.error('❌ Error: Could not find placeholder in api/profile-v2.js');
  console.error('Expected to find:', placeholder);
  process.exit(1);
}

edgeFunction = edgeFunction.replace(
  placeholder,
  `const PROFILE_V2_HTML_TEMPLATE = \`${escapedHtml}\`;`
);

// Write back to the edge function file
fs.writeFileSync(edgeFunctionPath, edgeFunction);

console.log('✅ Profile V2 edge function built successfully');
console.log('   - Embedded HTML: ' + html.length + ' bytes');
console.log('   - Output file: api/profile-v2.js');
