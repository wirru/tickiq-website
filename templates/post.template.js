/**
 * Post Sharing - Vercel Edge Function
 *
 * Renders post sharing pages with dynamic OG images for social previews.
 * Fetches post data from Supabase to get the actual post image.
 *
 * Caching: 10min edge cache, 15min stale-while-revalidate
 */

export const runtime = 'edge';

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const map = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[<>&"']/g, (char) => map[char]);
}

/**
 * Format timestamp as relative time (e.g., "2h ago", "3d ago")
 */
function formatRelativeTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  // iOS shows "Xmo ago" for months, but we use absolute date for clarity on web
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format count with K/M suffix for large numbers
 */
function formatCount(count) {
  if (count >= 1000000) return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (count >= 1000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(count);
}

export async function GET(request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');

  // Extract post ID from path (expecting /p/postId)
  const postId = pathParts[2] || 'post';

  // Get the current domain for absolute URLs
  const currentDomain = `${url.protocol}//${url.host}`;

  // Escape post ID for safe HTML insertion
  const safePostId = escapeHtml(postId);

  // Default values (fallbacks)
  let ogImageUrl = `${currentDomain}/assets/images/og-image-post-landscape.png`;
  let ogTitle = 'Post on tickIQ';
  let ogDescription = 'Shared on tickIQ';

  // Landing page content (visible on the web page itself - iOS feed cell style)
  let postImageUrl = `${currentDomain}/assets/images/og-image-post-landscape.png`;
  let postCaptionHtml = '';
  let postUsernamePillHtml = '';
  let postWatchNameHtml = '';
  let postTimestampHtml = '';
  let postLikeCount = '0';
  let postCommentCount = '0';

  // Dynamic CTA content
  let postCtaText = 'View Full Post';
  let postEngagementText = 'Shared from the tickIQ community';
  let rawCommentCount = 0;

  // Track if post was found
  let postFound = false;

  // Try to fetch post data from Supabase for the real image and caption
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey && postId !== 'post') {
      const postApiUrl = `${supabaseUrl}/functions/v1/get-public-post-web/${postId}`;

      console.log(`[POST] Fetching post data for: ${postId}`);

      const response = await fetch(postApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        postFound = true;
        const data = await response.json();

        // Use real image if available
        if (data.image_token) {
          const imageUrl = `${currentDomain}/api/img/${data.image_token}`;
          // OG image uses the styled endpoint with overlays
          ogImageUrl = `${currentDomain}/api/og/post/${postId}`;
          // Landing page uses the raw image
          postImageUrl = imageUrl;
          console.log(`[POST] Using OG image endpoint for post: ${postId}`);
        }

        // Build OG title for iMessage visibility (iMessage only shows og:title, not og:description)
        if (data.caption) {
          // Format: From the tickIQ community: caption...
          const prefix = 'From the tickIQ community: ';
          const maxCaptionLength = 70 - prefix.length;
          const captionChars = Array.from(data.caption);
          if (captionChars.length > maxCaptionLength) {
            ogTitle = prefix + escapeHtml(captionChars.slice(0, maxCaptionLength).join('')) + '...';
          } else {
            ogTitle = prefix + escapeHtml(data.caption);
          }
          console.log(`[POST] Built title with caption: ${ogTitle}`);
        } else {
          // No caption - simple branded message
          ogTitle = 'From the tickIQ community';
          console.log(`[POST] No caption found, using default title`);
        }

        // OG description - don't repeat caption (it's in og:title)
        // Use Reddit-style "See more from @user" format
        if (data.author_username) {
          ogDescription = `See more from @${escapeHtml(data.author_username)} on tickIQ`;
        } else {
          ogDescription = 'See this post and more on the tickIQ app';
        }

        // Landing page content (iOS feed cell style)

        // Caption overlay - no truncation, let CSS line-clamp handle it (like iOS numberOfLines)
        if (data.caption) {
          postCaptionHtml = `<p class="post-caption">${escapeHtml(data.caption)}</p>`;
        }

        // Username pill
        if (data.author_username) {
          postUsernamePillHtml = `<div class="post-username-pill"><span class="post-username">@${escapeHtml(data.author_username)}</span></div>`;
        }

        // Watch name (with dot separator like iOS)
        if (data.watch_display_name) {
          postWatchNameHtml = `<span class="post-watch-name">· ${escapeHtml(data.watch_display_name)}</span>`;
        }

        // Timestamp (always with dot separator like iOS)
        if (data.created_at) {
          const timestamp = formatRelativeTime(data.created_at);
          postTimestampHtml = `<span class="post-timestamp">· ${timestamp}</span>`;
        }

        // Social counts
        postLikeCount = formatCount(data.like_count || 0);
        postCommentCount = formatCount(data.comment_count || 0);
        rawCommentCount = data.comment_count || 0;

        // Dynamic CTA based on engagement
        if (rawCommentCount > 0) {
          postCtaText = rawCommentCount === 1 ? 'See 1 Comment' : `See ${rawCommentCount} Comments`;
          postEngagementText = rawCommentCount === 1
            ? '1 person commented on this post'
            : `${rawCommentCount} people commented on this post`;
        } else {
          postCtaText = 'View Full Post';
          postEngagementText = 'Shared from the tickIQ community';
        }
      } else {
        console.log(`[POST] Post not found or not accessible: ${postId} (status: ${response.status})`);
      }
    }
  } catch (error) {
    console.error('[POST] Failed to fetch post data:', error);
    // Fall back to defaults - don't break the page
  }

  // Return 404 if post was not found
  if (!postFound) {
    console.log(`[POST] Returning 404 for post: ${postId}`);
    return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex,nofollow">
    <title>Post Not Found - tickIQ</title>
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        .error-container {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 2rem;
        }
        .error-code { font-size: 6rem; font-weight: 200; margin-bottom: 1rem; color: #000; }
        .error-message { font-size: 1.25rem; color: #666; margin-bottom: 2rem; }
        .error-link { color: #000; text-decoration: none; font-weight: 500; }
        .error-link:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-code">404</div>
        <p class="error-message">This post doesn't exist or is no longer available.</p>
        <a href="/" class="error-link">Return to homepage</a>
    </div>
</body>
</html>
    `, {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Use the embedded HTML template
  let html = POST_HTML_TEMPLATE;

  // Replace meta tags with dynamic values
  html = html
    // Update Open Graph URL
    .replace(
      '<meta property="og:url" content="https://tickiq.app/post">',
      `<meta property="og:url" content="${currentDomain}/p/${safePostId}">`
    )
    // Update OG image URLs (both og:image and twitter:image)
    // Use function replacement to prevent $ being interpreted as backreference
    .replace(/\{\{OG_IMAGE_URL\}\}/g, () => ogImageUrl)
    // Update OG title (title, og:title, twitter:title)
    // Use function replacement for consistency
    .replace(/\{\{OG_TITLE\}\}/g, () => ogTitle)
    // Update OG description (both og:description and twitter:description)
    // Use function replacement to prevent $ in captions being interpreted as backreference
    .replace(/\{\{OG_DESCRIPTION\}\}/g, () => ogDescription)
    // Update iOS app link
    .replace(
      '<meta property="al:ios:url" content="tickiq://post/">',
      `<meta property="al:ios:url" content="tickiq://post/${safePostId}">`
    )
    // Landing page content (iOS feed cell style)
    .replace(/\{\{POST_IMAGE_URL\}\}/g, () => postImageUrl)
    .replace(/\{\{POST_CAPTION_HTML\}\}/g, () => postCaptionHtml)
    .replace(/\{\{POST_USERNAME_PILL_HTML\}\}/g, () => postUsernamePillHtml)
    .replace(/\{\{POST_WATCH_NAME_HTML\}\}/g, () => postWatchNameHtml)
    .replace(/\{\{POST_TIMESTAMP_HTML\}\}/g, () => postTimestampHtml)
    .replace(/\{\{POST_LIKE_COUNT\}\}/g, () => postLikeCount)
    .replace(/\{\{POST_COMMENT_COUNT\}\}/g, () => postCommentCount)
    .replace(/\{\{POST_CTA_TEXT\}\}/g, () => postCtaText)
    .replace(/\{\{POST_ENGAGEMENT_TEXT\}\}/g, () => postEngagementText);

  // Return the modified HTML
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Cache at edge for 10 minutes, serve stale for up to 15 minutes while revalidating
      'Cache-Control': 's-maxage=600, stale-while-revalidate=900',
    },
  });
}


// This will be replaced during build with the actual post.html content
const POST_HTML_TEMPLATE = `...embedded during build...`;
