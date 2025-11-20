/**
 * Public Profile V2 - Vercel Edge Function
 *
 * Server-side renders user profiles with watch collection data.
 * Fetches data from Supabase Edge Function and injects into HTML template.
 *
 * Security: Uses Supabase anon key (safe - RLS policies enforce privacy)
 * Caching: 5min edge cache, 10min stale-while-revalidate
 */

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
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

  // Replace meta tag placeholders
  html = html
    .replace(/\{\{USERNAME\}\}/g, safeUsername)
    .replace(/\{\{DOMAIN\}\}/g, domain)
    .replace(/\{\{WATCH_COUNT\}\}/g, data.stats.watch_count.toString());

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
    title = 'Profile Not Found';
    message = `The profile @${safeUsername} is private or doesn't exist.`;
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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #ffffff;
            color: #000000;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 2rem;
            text-align: center;
        }
        .error-container {
            max-width: 500px;
        }
        h1 {
            font-size: 3rem;
            font-weight: 700;
            margin-bottom: 1rem;
            letter-spacing: -0.02em;
        }
        p {
            font-size: 1.25rem;
            color: #666;
            margin-bottom: 2rem;
            line-height: 1.6;
        }
        a {
            display: inline-block;
            background: #000;
            color: #fff;
            padding: 1rem 2rem;
            text-decoration: none;
            border-radius: 980px;
            font-weight: 600;
            transition: transform 0.2s ease;
        }
        a:hover {
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="https://${domain}">Go to tickIQ</a>
    </div>
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
const PROFILE_V2_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- SEO: Do not index (focus on social sharing, not search discovery) -->
    <meta name="robots" content="noindex,nofollow">

    <!-- Dynamic Meta Tags (replaced by Edge Function) -->
    <title>@{{USERNAME}}'s Watch Collection - tickIQ</title>
    <meta name="description" content="Explore @{{USERNAME}}'s watch collection with real accuracy data from tickIQ. See timing measurements and discover their watches.">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="@{{USERNAME}}'s Watch Collection on tickIQ">
    <meta property="og:description" content="Explore this curated collection with real accuracy data. See grail pieces and discover how each watch performs.">
    <meta property="og:image" content="{{OG_IMAGE_URL}}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="https://{{DOMAIN}}/u/{{USERNAME}}">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="@{{USERNAME}}'s Watch Collection on tickIQ">
    <meta name="twitter:description" content="Explore this curated collection with real accuracy data. See timing measurements and watch performance.">
    <meta name="twitter:image" content="{{OG_IMAGE_URL}}">

    <!-- App Links for iOS -->
    <meta property="al:ios:app_name" content="tickIQ">
    <meta property="al:ios:url" content="tickiq://profile/{{USERNAME}}">

    <!-- Favicons -->
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="16x16" href="/assets/icons/favicon-16x16.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32x32.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/favicon-180x180.png">

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">

    <!-- Main site styles (includes header/footer) -->
    <link rel="stylesheet" href="/css/styles.css">

    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html {
            scroll-behavior: smooth;
        }

        /* Override body styles from styles.css */
        body {
            display: block !important;
            min-height: auto !important;
            background: linear-gradient(to bottom, #2B2318 0%, #1C160D 50%, #120D06 100%) !important;
            color: #FFFFFF !important;
        }

        /* Profile page header - muted nav links in expanded state */
        #header:not(.collapsed) .nav-link {
            color: rgba(255, 255, 255, 0.3) !important;
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

        /* Override main styles from styles.css */
        main {
            flex: none !important;
            padding-top: 0 !important;
            min-height: auto !important;
        }

        /* Main Container */
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
        }

        /* Profile Header - Hero Section */
        .profile-header {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 12rem 2rem 10rem 2rem;
            text-align: center;
            background: linear-gradient(to bottom, #130D0A, #41331F);
            min-height: 100vh;
            position: relative;
        }

        .profile-username {
            font-size: 6rem;
            font-weight: 700;
            letter-spacing: -0.04em;
            line-height: 1.15;
            color: #FFFFFF;
            margin-bottom: 1rem;
            padding-bottom: 0.1em;
        }

        .profile-username .apostrophe {
            font-weight: 300;
            color: rgba(255, 255, 255, 0.35);
        }

        .profile-tagline {
            font-size: 2.75rem;
            font-weight: 500;
            color: #FFFFFF;
            letter-spacing: -0.02em;
            line-height: 1.2;
            margin-bottom: 2rem;
        }

        .profile-join-date {
            font-size: 0.75rem;
            font-weight: 400;
            color: rgba(255, 255, 255, 0.3);
            text-transform: uppercase;
            letter-spacing: 0.2em;
            text-align: center;
            margin-bottom: 3.5rem;
        }

        /* Scroll Indicator */
        .scroll-indicator {
            position: absolute;
            bottom: 3rem;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.75rem;
        }

        .scroll-indicator-text {
            font-size: 0.6875rem;
            font-weight: 400;
            color: rgba(255, 255, 255, 0.3);
            text-transform: uppercase;
            letter-spacing: 0.15em;
        }

        .scroll-indicator-arrow {
            width: 10px;
            height: 10px;
            border-right: 1px solid rgba(255, 255, 255, 0.3);
            border-bottom: 1px solid rgba(255, 255, 255, 0.3);
            transform: rotate(45deg);
            animation: scrollPulse 2s ease-in-out infinite;
            margin-left: auto;
            margin-right: auto;
        }

        @keyframes scrollPulse {
            0%, 100% {
                opacity: 0.3;
                transform: translate(0, 0) rotate(45deg);
            }
            50% {
                opacity: 1;
                transform: translate(0, 6px) rotate(45deg);
            }
        }

        /* Stats Card */
        .profile-stats-card {
            background: rgba(255, 255, 255, 0.04);
            border-radius: 24px;
            padding: 1.25rem 2rem;
            max-width: 550px;
            position: relative;
        }


        /* Stats */
        .profile-stats {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            align-items: center;
            width: 100%;
            gap: 2rem;
        }

        .stat {
            text-align: center;
            position: relative;
        }


        .stat-value {
            display: block;
            font-size: 1.75rem;
            font-weight: 500;
            color: #FFFFFF;
            line-height: 1;
            margin-bottom: 0.5rem;
        }

        .stat-label {
            display: block;
            font-size: 0.75rem;
            font-weight: 400;
            color: rgba(255, 255, 255, 0.5);
            text-transform: capitalize;
            letter-spacing: 0;
            white-space: nowrap;
        }

        /* Journey Line - Visual Continuity */
        .journey-line {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            width: 2px;
            background: linear-gradient(
                to bottom,
                transparent 0%,
                rgba(255, 255, 255, 0.06) 10%,
                rgba(255, 255, 255, 0.06) 90%,
                transparent 100%
            );
            z-index: 0;
            pointer-events: none;
        }

        .journey-node {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.08);
            border: 2px solid #1C160D;
            z-index: 1;
            pointer-events: none;
        }

        /* Birds Eye View Section */
        .birds-eye-view-section {
            position: relative;
            padding: 8rem 2rem 6rem 2rem;
            background: linear-gradient(to bottom, #1F1A15, #0D0A07);
        }

        .birds-eye-card {
            position: relative;
            max-width: 1000px;
            margin: 0 auto;
            padding: 0 2rem;
            z-index: 2;
        }


        .birds-eye-title {
            text-align: center;
            font-size: 1rem;
            font-weight: 300;
            color: rgba(255, 255, 255, 0.55);
            letter-spacing: 0.2em;
            text-transform: uppercase;
            margin-bottom: 3.5rem;
            position: relative;
            padding-bottom: 1.5rem;
        }

        .birds-eye-title::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 40px;
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
        }

        .scrollytelling-title {
            text-align: center;
            font-size: 1rem;
            font-weight: 300;
            color: rgba(255, 255, 255, 0.55);
            letter-spacing: 0.2em;
            text-transform: uppercase;
            position: absolute;
            top: 6rem;
            left: 0;
            right: 0;
            z-index: 10;
            padding-bottom: 1.5rem;
        }

        .scrollytelling-title::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 40px;
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
        }

        #watch-collection {
            padding-top: 12rem;
        }

        .watch-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 2.5rem;
            width: 100%;
        }

        .watch-grid-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-decoration: none;
            transition: transform 0.3s ease, background 0.3s ease, opacity 1.2s ease;
            cursor: pointer;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 16px;
            padding: 0.75rem 0.5rem 1.25rem 0.5rem;
            position: relative;
            opacity: 0;
        }

        .watch-grid-item.animate-in {
            opacity: 1;
        }

        .watch-grid-item.animate-in:hover {
            transform: translateY(-4px);
            background: rgba(255, 255, 255, 0.04);
        }

        .watch-grid-rank {
            font-size: 0.8125rem;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.6);
            text-align: center;
            margin-bottom: 0.5rem;
        }

        .watch-grid-thumbnail {
            width: 100%;
            aspect-ratio: 1;
            border-radius: 12px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.03);
            margin-bottom: 1rem;
        }

        .watch-grid-thumbnail img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .watch-grid-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 3rem;
            opacity: 0.3;
        }

        .watch-grid-name {
            font-size: 0.75rem;
            font-weight: 400;
            color: rgba(255, 255, 255, 0.7);
            text-align: center;
            line-height: 1.4;
            letter-spacing: -0.01em;
        }

        /* Watch Collection - Apple Scrollytelling Style */
        .watch-collection-container {
            background: linear-gradient(to bottom, #1A1612, #000000);
            position: relative;
            padding-top: 0;
        }


        .watch-section {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 6rem 4rem;
            scroll-snap-align: start;
            opacity: 0;
            transform: translateY(40px);
            transition: opacity 0.8s ease, transform 0.8s ease;
            position: relative;
        }

        .watch-section::before {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.08);
            border: 2px solid #1C160D;
            z-index: 0;
            opacity: 0;
            transition: opacity 0.8s ease 0.4s;
        }

        .watch-section.visible {
            opacity: 1;
            transform: translateY(0);
        }

        .watch-section.visible::before {
            opacity: 1;
        }

        .watch-section-inner {
            display: flex;
            align-items: center;
            gap: 8rem;
            max-width: 1400px;
            width: 100%;
        }

        .watch-image-side {
            flex: 0 0 55%;
            max-width: 700px;
        }

        .watch-image-container {
            aspect-ratio: 1;
            border-radius: 32px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.02);
        }

        .watch-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .watch-image-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.02);
            font-size: 4rem;
            color: rgba(255, 255, 255, 0.1);
        }

        .watch-details-side {
            flex: 1;
            min-width: 0;
        }

        .watch-rank {
            font-size: 0.875rem;
            color: rgba(255, 255, 255, 0.3);
            text-transform: uppercase;
            letter-spacing: 0.15em;
            font-weight: 500;
            margin-bottom: 1rem;
        }

        .watch-name {
            font-size: 3.5rem;
            font-weight: 600;
            color: #FFFFFF;
            line-height: 1.1;
            letter-spacing: -0.03em;
            margin-bottom: 0.5rem;
        }

        .watch-reference {
            font-size: 1.125rem;
            color: rgba(255, 255, 255, 0.4);
            margin-bottom: 3rem;
            font-weight: 400;
        }

        .watch-measurement-display {
            margin-bottom: 3rem;
        }

        .measurement-rate {
            font-size: 4rem;
            font-weight: 600;
            color: #FFFFFF;
            line-height: 1;
            margin-bottom: 0.5rem;
        }

        .measurement-rate.great {
            color: #00CC33;
        }

        .measurement-rate.good {
            color: #99CC00;
        }

        .measurement-rate.fair {
            color: #FFB300;
        }

        .measurement-rate.poor {
            color: #FF4D4D;
        }

        .measurement-count {
            font-size: 0.875rem;
            color: rgba(255, 255, 255, 0.4);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 500;
        }

        .watch-stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 2rem;
            margin-top: 3rem;
        }

        .watch-stat {
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            padding-top: 1rem;
        }

        .watch-stat-label {
            font-size: 0.875rem;
            color: rgba(255, 255, 255, 0.4);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 0.5rem;
            font-weight: 500;
        }

        .watch-stat-value {
            font-size: 1.5rem;
            color: #FFFFFF;
            font-weight: 500;
        }

        /* Rotation Pie Chart */
        .rotation-stat-with-chart {
            display: flex;
            align-items: center;
            gap: 1.5rem;
        }

        .rotation-pie-chart {
            width: 60px;
            height: 60px;
            flex-shrink: 0;
        }

        .rotation-pie-chart circle {
            transform: rotate(-90deg);
            transform-origin: center;
        }

        .rotation-stat-content {
            flex: 1;
        }

        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 6rem 2rem;
        }

        .empty-state h2 {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 1rem;
            color: #FFFFFF;
        }

        .empty-state p {
            font-size: 1.125rem;
            color: rgba(255, 255, 255, 0.7); /* Secondary text from iOS */
        }

        /* CTA Section */
        .cta-section {
            background: rgba(255, 255, 255, 0.02); /* Card background from iOS */
            color: #fff;
            padding: 6rem 2rem;
            text-align: center;
            margin-top: 4rem;
            border-top: 1px solid rgba(255, 255, 255, 0.06); /* Border from iOS */
        }

        .cta-section h2 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 1rem;
            letter-spacing: -0.02em;
            color: #FFFFFF; /* Primary text from iOS */
        }

        .cta-section p {
            font-size: 1.25rem;
            color: rgba(255, 255, 255, 0.7); /* Secondary text from iOS */
            margin-bottom: 2rem;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
        }

        .cta-button {
            display: inline-block;
            background: #fff;
            color: #000;
            padding: 1rem 2.5rem;
            font-size: 1rem;
            font-weight: 600;
            text-decoration: none;
            border-radius: 980px;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(255, 255, 255, 0.3);
        }

        /* Loading State */
        .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 2rem;
            background: #1C160D;
        }

        .spinner {
            width: 48px;
            height: 48px;
            border: 3px solid rgba(255, 255, 255, 0.06);
            border-top-color: #FFFFFF;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .loading-text {
            margin-top: 1.5rem;
            font-size: 1rem;
            color: rgba(255, 255, 255, 0.7); /* Secondary text from iOS */
        }

        /* Error State */
        .error-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 2rem;
            text-align: center;
            background: #1C160D;
        }

        .error-state h1 {
            font-size: 3rem;
            font-weight: 700;
            margin-bottom: 1rem;
            color: #FFFFFF; /* Primary text from iOS */
        }

        .error-state p {
            font-size: 1.25rem;
            color: rgba(255, 255, 255, 0.7); /* Secondary text from iOS */
            margin-bottom: 2rem;
        }

        .error-button {
            display: inline-block;
            background: #FFFFFF;
            color: #000;
            padding: 1rem 2rem;
            text-decoration: none;
            border-radius: 980px;
            font-weight: 600;
        }

        /* Utilities */
        .hidden {
            display: none !important;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .profile-header {
                padding: 10rem 1.5rem 8rem 1.5rem;
                min-height: 100vh;
            }

            .profile-username {
                font-size: 3.5rem;
                letter-spacing: -0.03em;
                margin-bottom: 0.75rem;
            }

            .profile-tagline {
                font-size: 1.75rem;
                margin-bottom: 1.5rem;
            }

            .profile-join-date {
                font-size: 0.7rem;
                margin-bottom: 2.5rem;
            }

            .profile-stats-card {
                padding: 2rem 1.25rem;
                max-width: 100%;
                margin: 0 1rem;
            }

            .stat-value {
                font-size: 2rem;
            }

            .stat-label {
                font-size: 0.7rem;
            }

            .stat:not(:last-child)::after {
                height: 60px;
            }

            .stat {
                min-width: 90px;
            }

            .stat-value {
                font-size: 2rem;
            }

            .stat-label {
                font-size: 0.7rem;
            }

            /* Apple Scrollytelling - Mobile */
            .watch-section {
                min-height: auto;
                padding: 4rem 1.5rem;
            }

            .watch-section-inner {
                flex-direction: column;
                gap: 3rem;
            }

            .watch-image-side {
                flex: none;
                width: 100%;
                max-width: 100%;
            }

            .watch-details-side {
                width: 100%;
            }

            .watch-name {
                font-size: 2.5rem;
            }

            .watch-reference {
                font-size: 1rem;
                margin-bottom: 2rem;
            }

            .measurement-rate {
                font-size: 3rem;
            }

            .watch-stats-grid {
                grid-template-columns: 1fr;
                gap: 1.5rem;
                margin-top: 2rem;
            }

            /* Birds Eye View - Mobile */
            .box-image-container {
                max-width: 100px;
                margin-bottom: -30px;
            }

            .birds-eye-card {
                padding: 50px 1.5rem 1.5rem 1.5rem;
                border-radius: 24px;
            }

            .birds-eye-title {
                font-size: 0.75rem;
                margin-bottom: 1.5rem;
            }

            .watch-grid {
                grid-template-columns: repeat(3, 1fr);
                gap: 1rem;
            }

            .watch-grid-name {
                font-size: 0.75rem;
            }

            .watch-grid-rank {
                font-size: 0.5rem;
            }

            .cta-section h2 {
                font-size: 2rem;
            }
        }

        @media (max-width: 480px) {
            .watch-name {
                font-size: 2rem;
            }

            .measurement-rate {
                font-size: 2.5rem;
            }

            .profile-stats {
                gap: 1.5rem;
            }
        }
    </style>
</head>
<body>
    <!-- Header will be injected by components.js -->
    <header></header>

    <!-- Loading State -->
    <div id="loading" class="loading-state">
        <div class="spinner"></div>
        <p class="loading-text">Loading collection...</p>
    </div>

    <!-- Error State -->
    <div id="error" class="error-state hidden">
        <h1>Profile Not Found</h1>
        <p>This profile is private or doesn't exist.</p>
        <a href="https://tickiq.app" class="error-button">Go to tickIQ</a>
    </div>

    <!-- Profile Content -->
    <div id="profile" class="hidden">
        <!-- Profile Header -->
        <section class="profile-header">
            <h1 class="profile-username" id="username"><span class="apostrophe">'s</span></h1>
            <p class="profile-tagline">State of the Collection</p>
            <p class="profile-join-date" id="join-date">Tracking since ...</p>

            <!-- Stats Card -->
            <div class="profile-stats-card">
                <div class="profile-stats">
                    <div class="stat">
                        <span class="stat-value" id="watch-count">0</span>
                        <span class="stat-label">Watches</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value" id="measurement-count">0</span>
                        <span class="stat-label">Measurements</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value" id="days-logged">0</span>
                        <span class="stat-label">Days Logged</span>
                    </div>
                </div>
            </div>

            <!-- Scroll Indicator -->
            <div class="scroll-indicator">
                <span class="scroll-indicator-text">Scroll to explore</span>
                <div class="scroll-indicator-arrow"></div>
            </div>
        </section>

        <!-- Birds Eye View -->
        <section class="birds-eye-view-section" id="birds-eye-view">
            <div class="birds-eye-card">
                <h2 class="birds-eye-title">At a Glance</h2>
                <div id="watch-grid" class="watch-grid">
                    <!-- Watch grid items will be inserted here by JavaScript -->
                </div>
            </div>
        </section>

        <!-- Watch Collection - Apple Scrollytelling -->
        <main class="watch-collection-container">
            <h2 class="scrollytelling-title">Details</h2>
            <div id="watch-collection">
                <!-- Watch sections will be inserted here by JavaScript -->
            </div>

            <!-- Empty State -->
            <div id="empty-state" class="empty-state hidden">
                <h2>No Watches Yet</h2>
                <p>This collection is just getting started.</p>
            </div>
        </main>

        <!-- CTA Section -->
        <section class="cta-section">
            <h2>Create Your Own Collection</h2>
            <p>Track your watches with professional accuracy. See real performance data and build your collection.</p>
            <a href="https://apps.apple.com/app/tickiq/id6504108092" class="cta-button">Download tickIQ for iOS</a>
        </section>

    </div>

    <!-- Footer will be injected by components.js -->
    <footer></footer>

    <!-- Load shared components -->
    <script src="/js/components.js"></script>

    <script>
        // Client-side rendering (will be hydrated with server-side data)
        (function() {
            // Check if data was injected server-side
            const profileData = window.__PROFILE_DATA__;

            if (profileData) {
                // Server-side data available, render immediately
                renderProfile(profileData);
            } else {
                // Fallback: fetch data client-side (for development/testing)
                console.log('No server-side data, fetching client-side...');
                // In production, this shouldn't happen as we use SSR
                showError();
            }

            function renderProfile(data) {
                try {
                    // Hide loading, show profile
                    document.getElementById('loading').classList.add('hidden');
                    document.getElementById('profile').classList.remove('hidden');

                    // Set username with @ and possessive
                    const usernameEl = document.getElementById('username');
                    usernameEl.innerHTML = \`@\${escapeHtml(data.profile.username)}<span class="apostrophe">'s</span>\`;

                    // Format and set join date
                    const joinDate = new Date(data.profile.created_at);
                    const monthYear = joinDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    document.getElementById('join-date').textContent = 'Tracking since ' + monthYear;

                    // Set stats
                    document.getElementById('watch-count').textContent = data.stats.watch_count;
                    document.getElementById('measurement-count').textContent = data.stats.measurement_count;
                    document.getElementById('days-logged').textContent = data.stats.total_posting_days || 0;

                    // Render watches with cumulative rotation offset
                    if (data.watches && data.watches.length > 0) {
                        // Render birds eye view grid
                        renderBirdsEyeView(data.watches);

                        // Render scrollytelling sections
                        const watchCollection = document.getElementById('watch-collection');
                        let cumulativeRotation = 0;

                        const sections = data.watches.map((watch, index) => {
                            const section = renderWatchSection(watch, index + 1, cumulativeRotation);
                            cumulativeRotation += watch.percentage_of_rotation;
                            return section;
                        });

                        watchCollection.innerHTML = sections.join('');

                        // Initialize scroll animations
                        initScrollAnimations();
                    } else {
                        // Hide birds eye view and show empty state
                        document.getElementById('birds-eye-view').classList.add('hidden');
                        document.getElementById('watch-collection').classList.add('hidden');
                        document.getElementById('empty-state').classList.remove('hidden');
                    }

                } catch (error) {
                    console.error('Error rendering profile:', error);
                    showError();
                }
            }

            function renderBirdsEyeView(watches) {
                const watchGrid = document.getElementById('watch-grid');

                const gridItems = watches.map((watch, index) => {
                    const watchName = [watch.make, watch.model].filter(Boolean).join(' ') || 'Watch';
                    const rank = index + 1;

                    // Image or placeholder
                    const imageHtml = watch.thumbnail_url
                        ? \`<img src="/api/img/\${escapeHtml(watch.thumbnail_url)}" alt="\${escapeHtml(watchName)}" loading="lazy">\`
                        : \`<div class="watch-grid-placeholder">⌚</div>\`;

                    return \`
                        <a href="#watch-\${watch.id}" class="watch-grid-item" data-watch-id="\${watch.id}">
                            <div class="watch-grid-rank">#\${rank}</div>
                            <div class="watch-grid-thumbnail">
                                \${imageHtml}
                            </div>
                            <div class="watch-grid-name">\${escapeHtml(watchName)}</div>
                        </a>
                    \`;
                }).join('');

                watchGrid.innerHTML = gridItems;

                // Add smooth scroll to watch sections
                document.querySelectorAll('.watch-grid-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        e.preventDefault();
                        const watchId = item.getAttribute('data-watch-id');
                        const watchSection = document.querySelector(\`[data-watch-id="\${watchId}"].watch-section\`);
                        if (watchSection) {
                            watchSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    });
                });
            }

            function renderWatchSection(watch, rank, rotationOffset) {
                const watchName = [watch.make, watch.model].filter(Boolean).join(' ') || 'Watch';
                const referenceText = watch.reference_number ? escapeHtml(watch.reference_number) : '';

                // Image or placeholder - use full image for scrollytelling
                const imageUrl = watch.full_image_url || watch.thumbnail_url;
                const imageHtml = imageUrl
                    ? \`<img src="/api/img/\${escapeHtml(imageUrl)}" alt="\${escapeHtml(watchName)}" class="watch-image" loading="lazy">\`
                    : \`<div class="watch-image-placeholder">⌚</div>\`;

                // Measurement display
                let measurementHtml = '';
                if (watch.latest_measurement) {
                    const rate = watch.latest_measurement.rate;
                    const sign = rate >= 0 ? '+' : '';
                    const rateClass = watch.latest_measurement.rate_color_class || '';
                    const measurementText = watch.measurement_count === 1
                        ? '1 Measurement'
                        : \`\${watch.measurement_count} Measurements\`;

                    measurementHtml = \`
                        <div class="watch-measurement-display">
                            <div class="measurement-rate \${rateClass}">\${sign}\${rate.toFixed(1)} s/d</div>
                            <div class="measurement-count">\${measurementText}</div>
                        </div>
                    \`;
                }

                // Format dates
                const formatDate = (dateStr) => {
                    if (!dateStr) return null;
                    const date = new Date(dateStr);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                };

                // Pie chart for rotation percentage (iOS-style compositional pie)
                const createPieChart = (percentage, offset) => {
                    const center = 30;
                    const radius = 28;

                    // Calculate angles (start from top, -90 degrees)
                    const baseAngle = -Math.PI / 2;
                    const offsetAngle = 2 * Math.PI * (offset / 100);
                    const startAngle = baseAngle + offsetAngle;
                    const sweepAngle = 2 * Math.PI * (percentage / 100);
                    const endAngle = startAngle + sweepAngle;

                    // Convert to cartesian coordinates for SVG path
                    const startX = center + radius * Math.cos(startAngle);
                    const startY = center + radius * Math.sin(startAngle);
                    const endX = center + radius * Math.cos(endAngle);
                    const endY = center + radius * Math.sin(endAngle);

                    // Large arc flag (1 if angle > 180°)
                    const largeArcFlag = sweepAngle > Math.PI ? 1 : 0;

                    // Create filled pie slice path
                    const fillPath = percentage > 0
                        ? \`M \${center},\${center} L \${startX},\${startY} A \${radius},\${radius} 0 \${largeArcFlag},1 \${endX},\${endY} Z\`
                        : '';

                    // Create empty portion path
                    const emptyPath = percentage > 0 && percentage < 100
                        ? \`M \${center},\${center} L \${endX},\${endY} A \${radius},\${radius} 0 \${1 - largeArcFlag},1 \${startX},\${startY} Z\`
                        : '';

                    return \`
                        <svg class="rotation-pie-chart" viewBox="0 0 60 60">
                            <circle
                                cx="\${center}"
                                cy="\${center}"
                                r="\${radius}"
                                fill="none"
                                stroke="rgba(255, 255, 255, 0.08)"
                                stroke-width="0.5"
                            />
                            \${emptyPath ? \`<path d="\${emptyPath}" fill="rgba(255, 255, 255, 0.12)" />\` : ''}
                            \${fillPath ? \`<path d="\${fillPath}" fill="rgba(255, 255, 255, 0.95)" />\` : ''}
                        </svg>
                    \`;
                };

                // Stats grid
                const statsHtml = \`
                    <div class="watch-stats-grid">
                        \${watch.days_worn > 0 ? \`
                            <div class="watch-stat">
                                <div class="watch-stat-label">Days Worn</div>
                                <div class="watch-stat-value">\${watch.days_worn}</div>
                            </div>
                            <div class="watch-stat rotation-stat-with-chart">
                                \${createPieChart(watch.percentage_of_rotation, rotationOffset)}
                                <div class="rotation-stat-content">
                                    <div class="watch-stat-label">% of Rotation</div>
                                    <div class="watch-stat-value">\${watch.percentage_of_rotation.toFixed(1)}%</div>
                                </div>
                            </div>
                        \` : ''}
                        \${watch.first_worn_date ? \`
                            <div class="watch-stat">
                                <div class="watch-stat-label">First Worn</div>
                                <div class="watch-stat-value">\${formatDate(watch.first_worn_date)}</div>
                            </div>
                        \` : ''}
                        \${watch.last_worn_date ? \`
                            <div class="watch-stat">
                                <div class="watch-stat-label">Last Worn</div>
                                <div class="watch-stat-value">\${formatDate(watch.last_worn_date)}</div>
                            </div>
                        \` : ''}
                        \${watch.measurement_count > 0 ? \`
                            <div class="watch-stat">
                                <div class="watch-stat-label">Total Scans</div>
                                <div class="watch-stat-value">\${watch.measurement_count}</div>
                            </div>
                        \` : ''}
                    </div>
                \`;

                return \`
                    <section class="watch-section" id="watch-\${watch.id}" data-watch-id="\${watch.id}">
                        <div class="watch-section-inner">
                            <div class="watch-image-side">
                                <div class="watch-image-container">
                                    \${imageHtml}
                                </div>
                            </div>
                            <div class="watch-details-side">
                                <div class="watch-rank">No. \${rank}</div>
                                <h2 class="watch-name">\${escapeHtml(watchName)}</h2>
                                \${referenceText ? \`<div class="watch-reference">\${referenceText}</div>\` : ''}
                                \${measurementHtml}
                                \${statsHtml}
                            </div>
                        </div>
                    </section>
                \`;
            }

            function initScrollAnimations() {
                const observerOptions = {
                    root: null,
                    rootMargin: '0px',
                    threshold: 0.2
                };

                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('visible');
                        }
                    });
                }, observerOptions);

                document.querySelectorAll('.watch-section').forEach(section => {
                    observer.observe(section);
                });

                // Animate birds-eye-view grid items
                const birdsEyeSection = document.getElementById('birds-eye-view');
                if (birdsEyeSection) {
                    const birdsEyeObserver = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                const gridItems = entry.target.querySelectorAll('.watch-grid-item');
                                gridItems.forEach((item, index) => {
                                    setTimeout(() => {
                                        item.classList.add('animate-in');
                                    }, index * 120); // 120ms stagger between each item
                                });
                                birdsEyeObserver.unobserve(entry.target);
                            }
                        });
                    }, observerOptions);

                    birdsEyeObserver.observe(birdsEyeSection);
                }
            }

            function showError() {
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('profile').classList.add('hidden');
                document.getElementById('error').classList.remove('hidden');
            }

            function escapeHtml(text) {
                if (!text) return '';
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }
        })();
    </script>
</body>
</html>
`;
