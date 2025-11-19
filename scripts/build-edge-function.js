#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Build profile edge function
const profileHtmlPath = path.join(__dirname, '..', 'profile.html');
const profileHtml = fs.readFileSync(profileHtmlPath, 'utf8');

const profileEdgeFunctionPath = path.join(__dirname, '..', 'api', 'profile.js');
const profileTemplatePath = path.join(__dirname, '..', 'templates', 'profile.template.js');

// Always read from the template (with placeholder), never from the built file
let profileEdgeFunction = fs.readFileSync(profileTemplatePath, 'utf8');

// Escape for template literal: escape backslashes, backticks, and $
const escapedProfileHtml = profileHtml
  .replace(/\\/g, '\\\\')    // Escape backslashes FIRST
  .replace(/`/g, '\\`')      // Then escape backticks
  .replace(/\$/g, '\\$');    // Then escape ALL dollar signs

// Replace the placeholder
profileEdgeFunction = profileEdgeFunction.replace(
  'const PROFILE_HTML_TEMPLATE = `...embedded during build...`;',
  `const PROFILE_HTML_TEMPLATE = \`${escapedProfileHtml}\`;`
);

fs.writeFileSync(profileEdgeFunctionPath, profileEdgeFunction);
console.log('✅ Profile edge function built successfully with embedded profile.html');

// Build post edge function
const postHtmlPath = path.join(__dirname, '..', 'post.html');
const postHtml = fs.readFileSync(postHtmlPath, 'utf8');

const postEdgeFunctionPath = path.join(__dirname, '..', 'api', 'post.js');
const postTemplatePath = path.join(__dirname, '..', 'templates', 'post.template.js');

// Always read from the template (with placeholder), never from the built file
let postEdgeFunction = fs.readFileSync(postTemplatePath, 'utf8');

// Escape for template literal: escape backslashes, backticks, and $
const escapedPostHtml = postHtml
  .replace(/\\/g, '\\\\')    // Escape backslashes FIRST
  .replace(/`/g, '\\`')      // Then escape backticks
  .replace(/\$/g, '\\$');    // Then escape ALL dollar signs

// Replace the placeholder
postEdgeFunction = postEdgeFunction.replace(
  'const POST_HTML_TEMPLATE = `...embedded during build...`;',
  `const POST_HTML_TEMPLATE = \`${escapedPostHtml}\`;`
);

fs.writeFileSync(postEdgeFunctionPath, postEdgeFunction);
console.log('✅ Post edge function built successfully with embedded post.html');

// Build profile-v2 edge function
const profileV2HtmlPath = path.join(__dirname, '..', 'profile-v2.html');
const profileV2Html = fs.readFileSync(profileV2HtmlPath, 'utf8');

const profileV2EdgeFunctionPath = path.join(__dirname, '..', 'api', 'profile-v2.js');
const profileV2TemplatePath = path.join(__dirname, '..', 'templates', 'profile-v2.template.js');

// Always read from the template (with placeholder), never from the built file
let profileV2EdgeFunction = fs.readFileSync(profileV2TemplatePath, 'utf8');

// Escape for template literal: escape backslashes, backticks, and $
const escapedProfileV2Html = profileV2Html
  .replace(/\\/g, '\\\\')    // Escape backslashes FIRST
  .replace(/`/g, '\\`')      // Then escape backticks
  .replace(/\$/g, '\\$');    // Then escape ALL dollar signs

// Replace the placeholder
profileV2EdgeFunction = profileV2EdgeFunction.replace(
  'const PROFILE_V2_HTML_TEMPLATE = `...embedded during build...`;',
  `const PROFILE_V2_HTML_TEMPLATE = \`${escapedProfileV2Html}\`;`
);

fs.writeFileSync(profileV2EdgeFunctionPath, profileV2EdgeFunction);
console.log('✅ Profile V2 edge function built successfully with embedded profile-v2.html');