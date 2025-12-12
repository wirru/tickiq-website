/**
 * Public Profile V2 - Vercel Edge Function
 *
 * Server-side renders user profiles with watch collection data.
 * Fetches data from Supabase Edge Function and injects into HTML template.
 *
 * Security: Uses Supabase anon key (safe - RLS policies enforce privacy)
 * Caching: 5min edge cache, 10min stale-while-revalidate
 */

export const runtime = 'edge';

export async function GET(request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');

  // Extract username from path (expecting /u/username)
  const username = pathParts[2];

  if (!username || username.trim() === '') {
    return new Response('Username required', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Validate username format (basic sanitization)
  // tickIQ usernames are alphanumeric, dash, underscore: [a-zA-Z0-9_-]
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    console.log(`[PROFILE-V2] Invalid username format: ${username}`);
    return renderErrorPage(username, url.host, 'invalid');
  }

  try {
    // Get Supabase credentials from environment
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[PROFILE-V2] Missing Supabase environment variables');
      return renderErrorPage(username, url.host, '500');
    }

    // Fetch data from Supabase Edge Function
    const profileUrl = `${supabaseUrl}/functions/v1/get-public-profile-web/${username}`;

    console.log(`[PROFILE-V2] Fetching profile data for @${username}`);

    const response = await fetch(profileUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
    });

    // Handle 404 - Profile not found or private
    if (response.status === 404) {
      console.log(`[PROFILE-V2] Profile not found: @${username}`);
      return renderErrorPage(username, url.host, '404');
    }

    // Handle other errors
    if (!response.ok) {
      console.error(`[PROFILE-V2] Supabase error for @${username}:`, response.status);
      return renderErrorPage(username, url.host, '500');
    }

    // Parse profile data
    const data = await response.json();
    console.log(`[PROFILE-V2] Successfully fetched @${username}: ${data.stats.watch_count} watches`);

    // Render HTML with data
    const html = renderProfileHTML(data, username, url.host);

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Cache at edge for 5 minutes, serve stale for up to 10 minutes while revalidating
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
      },
    });

  } catch (error) {
    console.error('[PROFILE-V2] Unexpected error:', error);
    return renderErrorPage(username, url.host, '500');
  }
}

/**
 * Render profile HTML with data injected
 */
function renderProfileHTML(data, username, domain) {
  // Use the embedded HTML template (will be injected during build)
  let html = PROFILE_V2_HTML_TEMPLATE;

  // Safely escape username for HTML
  const safeUsername = escapeHtml(username);

  // Get OG image from first watch's image (thumbnail preferred for OG size)
  let ogImageUrl = `https://${domain}/assets/images/og-image-profile-landscape.png`; // Default fallback
  if (data.watches && data.watches.length > 0) {
    const firstWatch = data.watches[0];
    const imageToken = firstWatch.thumbnail_url || firstWatch.full_image_url;
    if (imageToken) {
      ogImageUrl = `https://${domain}/api/img/${imageToken}`;
    }
  }

  // Replace meta tag placeholders
  html = html
    .replace(/\{\{USERNAME\}\}/g, safeUsername)
    .replace(/\{\{DOMAIN\}\}/g, domain)
    .replace(/\{\{WATCH_COUNT\}\}/g, data.stats.watch_count.toString())
    .replace(/\{\{OG_IMAGE_URL\}\}/g, ogImageUrl);

  // Inject profile data as JSON for client-side hydration
  const dataScript = `<script>window.__PROFILE_DATA__ = ${JSON.stringify(data)};</script>`;
  html = html.replace('</head>', `${dataScript}</head>`);

  return html;
}

/**
 * Render error page
 */
function renderErrorPage(username, domain, errorType) {
  const safeUsername = escapeHtml(username);

  let title, message, statusCode;

  if (errorType === '404') {
    title = 'Collection Not Found';
    message = "This collection doesn't exist or isn't available.";
    statusCode = 404;
  } else if (errorType === 'invalid') {
    title = 'Invalid Profile';
    message = 'The requested profile URL is invalid.';
    statusCode = 400;
  } else {
    title = 'Error Loading Profile';
    message = 'Something went wrong. Please try again later.';
    statusCode = 500;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex,nofollow">
    <title>${title} - tickIQ</title>

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
            background: linear-gradient(to bottom, #1A1612 0%, #000000 100%);
            color: #FFFFFF;
            min-height: 100vh;
        }

        /* Profile page header - white nav links in expanded state */
        #header:not(.collapsed) .nav-link {
            color: rgba(255, 255, 255, 0.7) !important;
        }

        /* Profile page header - white logo in expanded state */
        #header:not(.collapsed) .header-logo {
            filter: brightness(0) invert(1) !important;
        }

        /* Profile page header - inverted "Get the app" button in expanded state */
        #header:not(.collapsed) .get-app-button {
            background: #FFFFFF !important;
            color: #000000 !important;
            border: 1px solid #FFFFFF !important;
        }

        #header:not(.collapsed) .get-app-button .apple-icon {
            color: #000000 !important;
        }

        /* Profile page header - white hamburger icon in expanded state */
        #header:not(.collapsed) .hamburger,
        #header:not(.collapsed) .menu-icon,
        #header:not(.collapsed) .mobile-menu-toggle,
        #header:not(.collapsed) .hamburger-icon {
            filter: brightness(0) invert(1) !important;
        }

        #header:not(.collapsed) .hamburger span,
        #header:not(.collapsed) .menu-icon span,
        #header:not(.collapsed) .mobile-menu-toggle span,
        #header:not(.collapsed) .hamburger-icon span {
            background: #FFFFFF !important;
        }

        .private-profile-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 12rem 2rem 10rem 2rem;
            text-align: center;
        }

        .private-profile-content {
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

        /* Question Mark Icon - matches iOS .font(.system(size: 64)) */
        .question-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 24px;
            opacity: 0.3;
            display: block;
        }

        /* Inner content wrapper for title + message - matches iOS VStack(spacing: 12) */
        .private-profile-text {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        /* Title - matches iOS .title2 .semibold */
        .private-profile-title {
            font-size: 1.375rem;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.9);
            margin: 0;
        }

        /* Message - matches iOS .body */
        .private-profile-message {
            font-size: 1.0625rem;
            color: rgba(255, 255, 255, 0.6);
            line-height: 1.5;
            padding: 0 40px;
            margin: 0;
        }

        @media (max-width: 768px) {
            .private-profile-container {
                padding: 10rem 1.5rem 8rem 1.5rem;
                min-height: 100vh;
            }

            .private-profile-message {
                padding: 0 20px;
            }
        }
    </style>
</head>
<body>
    <!-- Header will be injected by components.js -->
    <header></header>

    <div class="private-profile-container">
        <div class="private-profile-content">
            <!-- Question Mark Icon (SF Symbols style - questionmark.circle.fill) -->
            <svg class="question-icon" width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                <!-- Circle background -->
                <circle cx="32" cy="32" r="28" fill="white"/>
                <!-- Question mark -->
                <path d="M32 44.5C33.1 44.5 34 43.6 34 42.5C34 41.4 33.1 40.5 32 40.5C30.9 40.5 30 41.4 30 42.5C30 43.6 30.9 44.5 32 44.5Z" fill="#1A1612"/>
                <path d="M32 18C27.05 18 23 22.05 23 27H27C27 24.25 29.25 22 32 22C34.75 22 37 24.25 37 27C37 29.75 34.75 32 32 32C30.9 32 30 32.9 30 34V38H34V35.5C37.95 34.45 41 30.95 41 27C41 22.05 36.95 18 32 18Z" fill="#1A1612"/>
            </svg>

            <div class="private-profile-text">
                <h1 class="private-profile-title">${title}</h1>
                <p class="private-profile-message">${message}</p>
            </div>
        </div>
    </div>

    <!-- Footer will be injected by components.js -->
    <footer></footer>

    <!-- Load shared components -->
    <script src="/js/components.js"></script>
</body>
</html>`;

  return new Response(html, {
    status: statusCode,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

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

// This template will be replaced during build with the actual profile-v2.html content
const PROFILE_V2_HTML_TEMPLATE = `...embedded during build...`;
