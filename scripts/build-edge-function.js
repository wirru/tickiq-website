#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Helper function to escape HTML for JavaScript string
function escapeHtml(html) {
  return html
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

// Build profile edge function
const profileHtmlPath = path.join(__dirname, '..', 'profile.html');
const profileHtml = fs.readFileSync(profileHtmlPath, 'utf8');

const profileEdgeFunctionPath = path.join(__dirname, '..', 'api', 'profile.js');
let profileEdgeFunction = fs.readFileSync(profileEdgeFunctionPath, 'utf8');

const escapedProfileHtml = escapeHtml(profileHtml);

profileEdgeFunction = profileEdgeFunction.replace(
  'const PROFILE_HTML_TEMPLATE = `<!-- PROFILE_HTML_CONTENT -->`;',
  `const PROFILE_HTML_TEMPLATE = \`${escapedProfileHtml}\`;`
);

fs.writeFileSync(profileEdgeFunctionPath, profileEdgeFunction);
console.log('✅ Profile edge function built successfully with embedded profile.html');

// Build post edge function
const postHtmlPath = path.join(__dirname, '..', 'post.html');
const postHtml = fs.readFileSync(postHtmlPath, 'utf8');

const postEdgeFunctionPath = path.join(__dirname, '..', 'api', 'post.js');
let postEdgeFunction = fs.readFileSync(postEdgeFunctionPath, 'utf8');

const escapedPostHtml = escapeHtml(postHtml);

postEdgeFunction = postEdgeFunction.replace(
  'const POST_HTML_TEMPLATE = `<!-- POST_HTML_CONTENT -->`;',
  `const POST_HTML_TEMPLATE = \`${escapedPostHtml}\`;`
);

fs.writeFileSync(postEdgeFunctionPath, postEdgeFunction);
console.log('✅ Post edge function built successfully with embedded post.html');

// Build profile-v2 edge function
const profileV2HtmlPath = path.join(__dirname, '..', 'profile-v2.html');
const profileV2Html = fs.readFileSync(profileV2HtmlPath, 'utf8');

const profileV2EdgeFunctionPath = path.join(__dirname, '..', 'api', 'profile-v2.js');
let profileV2EdgeFunction = fs.readFileSync(profileV2EdgeFunctionPath, 'utf8');

const escapedProfileV2Html = escapeHtml(profileV2Html);

profileV2EdgeFunction = profileV2EdgeFunction.replace(
  'const PROFILE_V2_HTML_TEMPLATE = `...embedded during build...`;',
  `const PROFILE_V2_HTML_TEMPLATE = \`${escapedProfileV2Html}\`;`
);

fs.writeFileSync(profileV2EdgeFunctionPath, profileV2EdgeFunction);
console.log('✅ Profile V2 edge function built successfully with embedded profile-v2.html');