#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the profile.html file
const profileHtmlPath = path.join(__dirname, '..', 'profile.html');
const profileHtml = fs.readFileSync(profileHtmlPath, 'utf8');

// Read the edge function template
const edgeFunctionPath = path.join(__dirname, '..', 'api', 'profile.js');
let edgeFunction = fs.readFileSync(edgeFunctionPath, 'utf8');

// Escape the HTML for JavaScript string
const escapedHtml = profileHtml
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$/g, '\\$');

// Replace the placeholder with actual HTML content
edgeFunction = edgeFunction.replace(
  'const PROFILE_HTML_TEMPLATE = `<!-- PROFILE_HTML_CONTENT -->`;',
  `const PROFILE_HTML_TEMPLATE = \`${escapedHtml}\`;`
);

// Write back the edge function with embedded HTML
fs.writeFileSync(edgeFunctionPath, edgeFunction);

console.log('✅ Edge function built successfully with embedded profile.html');