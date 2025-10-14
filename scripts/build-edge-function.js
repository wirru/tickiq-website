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
  /const POST_HTML_TEMPLATE = `<!DOCTYPE html>[\s\S]*<\/html>`;/,
  `const POST_HTML_TEMPLATE = \`${escapedPostHtml}\`;`
);

fs.writeFileSync(postEdgeFunctionPath, postEdgeFunction);
console.log('✅ Post edge function built successfully with embedded post.html');