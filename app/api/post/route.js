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

    <!-- Favicons -->
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="16x16" href="/assets/icons/favicon-16x16.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32x32.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/favicon-180x180.png">

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

    <!-- Main site styles -->
    <link rel="stylesheet" href="/css/styles.css">

    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #FFFFFF;
            color: #000000;
            min-height: 100vh;
        }

        .error-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 12rem 2rem 10rem 2rem;
            text-align: center;
        }

        .error-content {
            animation: fadeIn 0.6s ease;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* Icon */
        .error-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 24px;
            opacity: 0.25;
            display: block;
        }

        /* Inner content wrapper */
        .error-text {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        /* Title */
        .error-title {
            font-size: 1.375rem;
            font-weight: 600;
            color: #000000;
            margin: 0;
        }

        /* Message */
        .error-message {
            font-size: 1.0625rem;
            color: #666666;
            line-height: 1.5;
            padding: 0 40px;
            margin: 0;
        }

        @media (max-width: 768px) {
            .error-container {
                padding: 10rem 1.5rem 8rem 1.5rem;
                min-height: 100vh;
            }

            .error-message {
                padding: 0 20px;
            }
        }
    </style>
</head>
<body>
    <!-- Header will be injected by components.js -->
    <header></header>

    <div class="error-container">
        <div class="error-content">
            <!-- Photo slash icon -->
            <svg class="error-icon" width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                <!-- Circle background -->
                <circle cx="32" cy="32" r="28" fill="#000000"/>
                <!-- Photo/image icon -->
                <rect x="20" y="24" width="24" height="18" rx="2" stroke="#FFFFFF" stroke-width="2" fill="none"/>
                <!-- Mountain peaks (photo symbol) -->
                <path d="M20 38L26 32L30 36L38 28L44 34V40C44 41.1 43.1 42 42 42H22C20.9 42 20 41.1 20 40V38Z" fill="#FFFFFF"/>
                <!-- Sun/circle in photo -->
                <circle cx="38" cy="29" r="2.5" fill="#FFFFFF"/>
                <!-- Slash line -->
                <line x1="18" y1="46" x2="46" y2="18" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
            </svg>

            <div class="error-text">
                <h1 class="error-title">Post Not Found</h1>
                <p class="error-message">This post doesn't exist or is no longer available.</p>
            </div>
        </div>
    </div>

    <!-- Footer will be injected by components.js -->
    <footer></footer>

    <!-- Load shared components -->
    <script src="/js/components.js"></script>
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
const POST_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex,nofollow">
    <title>{{OG_TITLE}}</title>
    <meta name="description" content="{{OG_DESCRIPTION}}">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="{{OG_TITLE}}">
    <meta property="og:description" content="{{OG_DESCRIPTION}}">
    <meta property="og:image" content="{{OG_IMAGE_URL}}">
    <meta property="og:image:width" content="600">
    <meta property="og:image:height" content="800">
    <meta property="og:url" content="https://tickiq.app/post">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{{OG_TITLE}}">
    <meta name="twitter:description" content="{{OG_DESCRIPTION}}">
    <meta name="twitter:image" content="{{OG_IMAGE_URL}}">

    <!-- App Links for iOS -->
    <meta property="al:ios:app_name" content="tickIQ">
    <meta property="al:ios:url" content="tickiq://post/">

    <!-- Favicons for all platforms -->
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="16x16" href="/assets/icons/favicon-16x16.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="48x48" href="/assets/icons/favicon-48x48.png">
    <link rel="icon" type="image/png" sizes="64x64" href="/assets/icons/favicon-64x64.png">
    <link rel="icon" type="image/png" sizes="96x96" href="/assets/icons/favicon-96x96.png">
    <link rel="icon" type="image/png" sizes="144x144" href="/assets/icons/favicon-144x144.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/favicon-180x180.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/assets/icons/favicon-192x192.png">
    <link rel="icon" type="image/png" sizes="512x512" href="/assets/icons/favicon-512x512.png">
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">

    <style>
        /* Post-specific styles that extend the main styles.css */
        .post-hero {
            min-height: calc(100vh - 100px);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 2rem;
            margin-top: 100px;
        }

        .post-content {
            text-align: center;
            max-width: 900px;
            width: 100%;
            margin: 0 auto;
        }

        .post-app-icon {
            width: 120px;
            height: 120px;
            border-radius: 27px;
            margin: 0 auto 2rem;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15),
                        0 0 0 1px rgba(0, 0, 0, 0.05);
            animation: fadeInScale 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* iOS-style feed cell preview (sized to match iOS proportions ~393px, 40px corners) */
        .post-image-container {
            position: relative;
            width: 390px;
            aspect-ratio: 3 / 4;
            margin: 0 auto 2rem;
            animation: fadeInScale 0.6s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 40px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15),
                        0 0 0 1px rgba(0, 0, 0, 0.08);
        }

        .post-image-skeleton {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(
                90deg,
                #f0f0f0 0%,
                #e0e0e0 50%,
                #f0f0f0 100%
            );
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite ease-in-out;
        }

        @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }

        .post-image-skeleton.hidden {
            display: none;
        }

        .post-image-preview {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .post-image-preview.loaded {
            opacity: 1;
        }

        /* Bottom gradient overlay (matches iOS: lighter gradient) */
        .post-overlay-gradient {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 55%;
            background: linear-gradient(
                to top,
                rgba(0, 0, 0, 0.55) 0%,
                rgba(0, 0, 0, 0.3) 35%,
                rgba(0, 0, 0, 0) 100%
            );
            pointer-events: none;
        }

        /* Bottom content overlay (matches iOS: 24px left/right, 28px bottom) */
        .post-overlay-content {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 16px 24px 28px 24px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }

        .post-overlay-left {
            flex: 1;
            min-width: 0;
            padding-right: 12px;
            text-align: left;
        }

        /* Caption - bold white text (matches iOS: 20px bold, 5 lines, fluid scaling) */
        .post-caption {
            font-size: clamp(0.9375rem, 4.5vw, 1.25rem);
            font-weight: 700;
            line-height: 1.3;
            color: #fff;
            text-align: left;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            display: -webkit-box;
            -webkit-line-clamp: 5;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        /* Username pill + watch info + timestamp row (matches iOS: all inline, 5px gap) */
        .post-meta-row {
            display: flex;
            align-items: center;
            gap: 5px;
            margin-top: 6px;
            flex-wrap: nowrap;
            overflow: hidden;
        }

        /* Username pill (matches iOS: 24px height, 13px semibold) */
        .post-username-pill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.12);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border-radius: 9999px;
            height: 22px;
            padding: 0 8px;
            flex-shrink: 0;
            max-width: 50%;
        }

        .post-username {
            font-size: clamp(0.625rem, 2.8vw, 0.75rem);
            font-weight: 500;
            color: #fff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1;
        }

        /* Watch name (matches iOS: 10px medium, fluid scaling) */
        .post-watch-name {
            font-size: clamp(0.5rem, 2.2vw, 0.625rem);
            font-weight: 500;
            color: rgba(255, 255, 255, 0.5);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex-shrink: 1;
            min-width: 0;
        }

        /* Timestamp (matches iOS: 10px regular, fluid scaling) */
        .post-timestamp {
            font-size: clamp(0.5rem, 2.2vw, 0.625rem);
            font-weight: 400;
            color: rgba(255, 255, 255, 0.5);
            white-space: nowrap;
            flex-shrink: 0;
        }

        /* Social buttons on right */
        .post-overlay-right {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
        }

        .post-social-button {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            color: #fff;
        }

        .post-social-button svg {
            width: 24px;
            height: 24px;
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
        }

        .post-social-count {
            font-size: clamp(0.5rem, 2.2vw, 0.6875rem);
            font-weight: 500;
            color: #fff;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }

        /* Attribution below image */
        .post-attribution {
            font-size: 0.875rem;
            color: #666;
            margin-bottom: 2rem;
            text-align: center;
        }

        .post-attribution a {
            color: #000;
            text-decoration: none;
            font-weight: 500;
        }

        @keyframes fadeInScale {
            from {
                opacity: 0;
                transform: scale(0.9);
            }
            to {
                opacity: 1;
                transform: scale(1);
            }
        }

        .post-title {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 1rem;
            letter-spacing: -0.02em;
            animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.1s both;
        }

        .post-message {
            font-size: 1.25rem;
            line-height: 1.6;
            color: #666;
            margin-bottom: 3rem;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
            animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.2s both;
        }

        .post-cta-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.3s both;
        }

        .post-cta-button {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 1rem 2rem;
            font-size: 1rem;
            font-weight: 600;
            text-decoration: none;
            border-radius: 980px;
            transition: all 0.2s ease;
            min-width: 280px;
            justify-content: center;
        }

        .post-cta-button.primary {
            background: #000;
            color: #fff;
        }

        .post-cta-button.primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }

        .post-cta-button.secondary {
            background: transparent;
            color: #000;
            border: 1px solid rgba(0, 0, 0, 0.1);
        }

        .post-cta-button.secondary:hover {
            background: rgba(0, 0, 0, 0.05);
        }

        /* Loading state */
        .post-loading {
            display: none;
            text-align: center;
            padding: 2rem;
        }

        .post-loading.active {
            display: block;
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* Mobile responsiveness */
        @media (max-width: 768px) {
            .post-hero {
                min-height: calc(100vh - 80px);
                margin-top: 80px;
                padding: 1rem;
            }

            .post-title {
                font-size: 2rem;
            }

            .post-message {
                font-size: 1.125rem;
            }

            .post-app-icon {
                width: 100px;
                height: 100px;
            }

            .post-image-container {
                width: 100%;
                max-width: 360px;
                border-radius: 32px;
            }

            .post-overlay-content {
                padding: 12px 20px 24px 20px;
            }

            .post-caption {
                -webkit-line-clamp: 4;
            }

            .post-social-button svg {
                width: 20px;
                height: 20px;
            }

            .post-attribution {
                font-size: 0.8rem;
            }

        }

        /* Dev mode indicator */
        .dev-indicator {
            position: fixed;
            top: 120px;
            right: 20px;
            background: #ff3838;
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 100px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            z-index: 100;
            animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        /* QR Code Modal for Desktop */
        .qr-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.2s ease;
        }

        .qr-modal.active {
            display: flex;
        }

        .qr-modal-content {
            background: white;
            border-radius: 20px;
            padding: 2.5rem;
            text-align: center;
            max-width: 400px;
            position: relative;
            animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .qr-modal-close {
            position: absolute;
            top: 1rem;
            right: 1rem;
            width: 32px;
            height: 32px;
            border: none;
            background: transparent;
            cursor: pointer;
            opacity: 0.5;
            transition: opacity 0.2s;
        }

        .qr-modal-close:hover {
            opacity: 1;
        }

        .qr-code-container {
            background: white;
            padding: 1.5rem;
            border-radius: 12px;
            margin: 1.5rem 0;
        }

        .qr-code-container img {
            width: 200px;
            height: 200px;
            display: block;
            margin: 0 auto;
        }

        .qr-modal-title {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
        }

        .qr-modal-subtitle {
            color: #666;
            font-size: 1rem;
            line-height: 1.5;
        }

        /* Desktop-specific button styling */
        @media (min-width: 769px) {
            .post-cta-button.primary.desktop {
                cursor: pointer;
            }

            .post-cta-button.primary.desktop:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            }
        }
    </style>
</head>
<body data-campaign-token="web-post">
    <div class="container">
        <!-- Header will be injected here -->
        <header></header>

        <!-- Post Hero Section -->
        <div class="post-hero">
            <div class="post-content">
                <div class="post-image-container">
                    <div class="post-image-skeleton" id="image-skeleton"></div>
                    <img src="{{POST_IMAGE_URL}}" alt="Watch photo shared on tickIQ" class="post-image-preview" id="post-image" onload="this.classList.add('loaded'); document.getElementById('image-skeleton').classList.add('hidden');">

                    <!-- iOS-style overlay -->
                    <div class="post-overlay-gradient"></div>
                    <div class="post-overlay-content">
                        <div class="post-overlay-left">
                            {{POST_CAPTION_HTML}}
                            <div class="post-meta-row">
                                {{POST_USERNAME_PILL_HTML}}
                                {{POST_WATCH_NAME_HTML}}
                                {{POST_TIMESTAMP_HTML}}
                            </div>
                        </div>
                        <div class="post-overlay-right">
                            <div class="post-social-button">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/>
                                </svg>
                                <span class="post-social-count">{{POST_LIKE_COUNT}}</span>
                            </div>
                            <div class="post-social-button">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"/>
                                </svg>
                                <span class="post-social-count">{{POST_COMMENT_COUNT}}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <p class="post-attribution">
                    {{POST_ENGAGEMENT_TEXT}}
                </p>

                <div class="post-cta-container">
                    <a href="#" id="open-app" class="post-cta-button primary">
                        {{POST_CTA_TEXT}}
                    </a>
                    <a href="https://apps.apple.com/us/app/tickiq-measure-watch-accuracy/id6749871310" class="post-cta-button secondary">
                        Download tickIQ
                    </a>
                </div>
            </div>
        </div>
    </div>

    <!-- Footer will be injected here -->
    <footer></footer>

    <!-- QR Code Modal -->
    <div class="qr-modal" id="qr-modal">
        <div class="qr-modal-content">
            <button class="qr-modal-close" id="qr-modal-close">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
            <div class="qr-modal-title" id="qr-modal-title">Scan to View Post</div>
            <div class="qr-modal-subtitle">Open your iPhone camera and point it at this code to view this post in tickIQ</div>
            <div class="qr-code-container">
                <img id="qr-code-img" src="" alt="QR Code">
            </div>
        </div>
    </div>

    <!-- Load the shared components -->
    <script src="/js/components.js"></script>

    <script>
        // Execute immediately when script loads
        (function() {
            // Parse post ID from URL
            const pathname = window.location.pathname;

            // Check if accessing /post directly (not via /p/postId rewrite)
            if (pathname === '/post' || pathname === '/post.html' || pathname === '/post/') {
                document.title = '404 - Page not found';

                // Replace content immediately when DOM is ready
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', show404);
                } else {
                    show404();
                }

                function show404() {
                    const postHero = document.querySelector('.post-hero');
                    if (postHero) {
                        postHero.innerHTML = \`
                            <div style="text-align: center; padding: 4rem 2rem;">
                                <h1 style="font-size: 6rem; font-weight: 200; margin-bottom: 1rem;">404</h1>
                                <p style="font-size: 1.25rem; color: #666; margin-bottom: 2rem;">Page not found</p>
                                <a href="/" style="color: #000; font-size: 1rem;">Return to homepage</a>
                            </div>
                        \`;
                    }

                    // Hide the QR modal
                    const qrModal = document.getElementById('qr-modal');
                    if (qrModal) qrModal.remove();
                }

                return; // Stop here for 404 page
            }

            // Normal post page logic continues here
            // Extract post ID from /p/postId path
            const pathParts = pathname.split('/');
            const postId = pathParts[2] || 'post';

        // Check for dev parameter
        const urlParams = new URLSearchParams(window.location.search);
        const isDev = urlParams.get('dev') === 'true';

        // Determine which URL scheme to use
        const urlScheme = isDev ? 'tickiq-dev' : 'tickiq';

        // If dev mode, show indicator
        if (isDev) {
            const devBadge = document.createElement('div');
            devBadge.className = 'dev-indicator';
            devBadge.textContent = 'Dev Mode';
            document.body.appendChild(devBadge);
        }

        // Detect if desktop or mobile/tablet
        // Modern iPad detection: iPadOS 13+ reports as MacIntel but has touch support
        const isIPad = /iPad/.test(navigator.userAgent) ||
                       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
        const isIOS = isIPad || isIPhone || /iPhone|iPod/.test(navigator.platform);
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isMobile = isIOS || isAndroid;
        const isDesktop = !isMobile;
        const postUrl = \`https://tickiq.app/p/\${postId}\`;

        // Update Open in App link
        const openAppLink = document.getElementById('open-app');
        const downloadButton = document.querySelector('.post-cta-button.secondary');

        if (isDesktop) {
            // Desktop: Show QR code on click, keep dynamic CTA text as-is
            openAppLink.href = '#';
            openAppLink.classList.add('desktop');

            // Change download button text for desktop
            if (downloadButton) {
                downloadButton.textContent = 'View on App Store';
            }

            // Generate QR code
            const qrCodeUrl = \`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=\${encodeURIComponent(postUrl)}\`;
            document.getElementById('qr-code-img').src = qrCodeUrl;

            // Update modal title
            document.getElementById('qr-modal-title').textContent = 'See this post on iPhone';

            // Handle click to show modal
            openAppLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('qr-modal').classList.add('active');
            });

            // Close modal handlers
            document.getElementById('qr-modal-close').addEventListener('click', () => {
                document.getElementById('qr-modal').classList.remove('active');
            });

            document.getElementById('qr-modal').addEventListener('click', (e) => {
                if (e.target.id === 'qr-modal') {
                    document.getElementById('qr-modal').classList.remove('active');
                }
            });

            // ESC key to close
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    document.getElementById('qr-modal').classList.remove('active');
                }
            });
        } else {
            // Mobile: Deep link to app
            openAppLink.href = \`\${urlScheme}://post/\${postId}\`;
        }

        // Smooth auto-redirect on iOS with better UX
        if (isIOS) {
            // Wait for initial page render
            setTimeout(() => {
                const appUrl = \`\${urlScheme}://post/\${postId}\`;

                // Create invisible iframe to attempt app launch
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = appUrl;
                document.body.appendChild(iframe);

                // Clean up iframe after attempt
                setTimeout(() => {
                    document.body.removeChild(iframe);
                }, 1000);
            }, 800);
        }
        })(); // End of IIFE
    </script>

    <!-- Vercel Analytics -->
    <script>
        window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    </script>
    <script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
`;
