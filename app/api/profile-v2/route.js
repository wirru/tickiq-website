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
    // Show error page for empty username (malformed request)
    return renderErrorPage('', url.host, '500');
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
 * For 404 (private/non-existent profiles): Shows v1-style page prompting app download
 * For other errors: Shows simple error message
 */
function renderErrorPage(username, domain, errorType) {
  const safeUsername = escapeHtml(username);

  // For 404 or invalid username, show the v1-style profile page (app download prompt)
  // This prevents revealing whether a username exists, is private, or has invalid format
  if (errorType === '404' || errorType === 'invalid') {
    return renderFallbackProfilePage(safeUsername, domain);
  }

  // For server errors (500), show an error page
  const title = 'Error Loading Profile';
  const message = 'Something went wrong. Please try again later.';
  const statusCode = 500;

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
 * Render v1-style fallback profile page for private/non-existent profiles
 * This shows a generic "view in app" page without revealing whether the profile exists
 */
function renderFallbackProfilePage(safeUsername, domain) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex,nofollow">
    <title>@${safeUsername}'s Watch Collection - tickIQ</title>
    <meta name="description" content="Explore @${safeUsername}'s watch collection with real accuracy data. See their grail pieces, timing measurements, and mechanical insights on tickIQ.">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="@${safeUsername}'s Watch Collection on tickIQ">
    <meta property="og:description" content="Explore @${safeUsername}'s curated collection with real accuracy data. See grail pieces and timing measurements from actual wear.">
    <meta property="og:image" content="https://${domain}/assets/images/og-image-profile-landscape.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="https://${domain}/u/${safeUsername}">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="@${safeUsername}'s Watch Collection on tickIQ">
    <meta name="twitter:description" content="Explore @${safeUsername}'s watch collection with real accuracy data on tickIQ.">
    <meta name="twitter:image" content="https://${domain}/assets/images/og-image-profile-landscape.png">

    <!-- App Links for iOS -->
    <meta property="al:ios:app_name" content="tickIQ">
    <meta property="al:ios:url" content="tickiq://profile/${safeUsername}">

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
        /* Profile-specific styles that extend the main styles.css */
        .profile-hero {
            min-height: calc(100vh - 100px);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 2rem;
            margin-top: 100px;
        }

        .profile-content {
            text-align: center;
            max-width: 900px;
            width: 100%;
            margin: 0 auto;
        }

        .profile-app-icon {
            width: 120px;
            height: 120px;
            border-radius: 27px;
            margin: 0 auto 2rem;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15),
                        0 0 0 1px rgba(0, 0, 0, 0.05);
            animation: fadeInScale 0.6s cubic-bezier(0.4, 0, 0.2, 1);
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

        .profile-username {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 1rem;
            letter-spacing: -0.02em;
            animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.1s both;
        }

        .profile-message {
            font-size: 1.25rem;
            line-height: 1.6;
            color: #666;
            margin-bottom: 3rem;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
            animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.2s both;
        }

        .profile-cta-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.3s both;
        }

        .profile-cta-button {
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

        .profile-cta-button.primary {
            background: #000;
            color: #fff;
        }

        .profile-cta-button.primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }

        .profile-cta-button.secondary {
            background: transparent;
            color: #000;
            border: 1px solid rgba(0, 0, 0, 0.1);
        }

        .profile-cta-button.secondary:hover {
            background: rgba(0, 0, 0, 0.05);
        }

        /* Loading state */
        .profile-loading {
            display: none;
            text-align: center;
            padding: 2rem;
        }

        .profile-loading.active {
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
            .profile-hero {
                min-height: calc(100vh - 80px);
                margin-top: 80px;
            }

            .profile-username {
                font-size: 2rem;
            }

            .profile-message {
                font-size: 1.125rem;
            }

            .profile-app-icon {
                width: 100px;
                height: 100px;
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
            .profile-cta-button.primary.desktop {
                cursor: pointer;
            }

            .profile-cta-button.primary.desktop:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header will be injected here -->
        <header></header>

        <!-- Profile Hero Section -->
        <div class="profile-hero">
            <div class="profile-content">
                <img src="/assets/icons/app-icon.png" alt="tickIQ" class="profile-app-icon">

                <h1 class="profile-username">@${safeUsername}'s Watch Collection</h1>

                <p class="profile-message">
                    Explore this member's curated collection with real accuracy data from actual wear.
                    See which pieces they treasure most, how each watch performs, and discover grail pieces you never knew existed.
                </p>

                <div class="profile-cta-container">
                    <a href="#" id="open-app" class="profile-cta-button primary">
                        View Collection in App
                    </a>
                    <a href="https://apps.apple.com/us/app/tickiq-measure-watch-accuracy/id6749871310" class="profile-cta-button secondary">
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
            <div class="qr-modal-title">View @${safeUsername}'s Collection</div>
            <div class="qr-modal-subtitle">Open your iPhone camera and point it at this code to view this watch collection in tickIQ</div>
            <div class="qr-code-container">
                <img id="qr-code-img" src="" alt="QR Code">
            </div>
            <div class="qr-modal-subtitle" id="profile-url-display">${domain}/u/${safeUsername}</div>
        </div>
    </div>

    <!-- Load the shared components -->
    <script src="/js/components.js"></script>

    <script>
        (function() {
            const username = '${safeUsername}';
            const profileUrl = 'https://${domain}/u/${safeUsername}';

            // Check for dev parameter
            const urlParams = new URLSearchParams(window.location.search);
            const isDev = urlParams.get('dev') === 'true';
            const urlScheme = isDev ? 'tickiq-dev' : 'tickiq';

            // If dev mode, show indicator
            if (isDev) {
                const devBadge = document.createElement('div');
                devBadge.className = 'dev-indicator';
                devBadge.textContent = 'Dev Mode';
                document.body.appendChild(devBadge);
            }

            // Detect if desktop or mobile/tablet
            const isIPad = /iPad/.test(navigator.userAgent) ||
                           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
            const isIOS = isIPad || isIPhone || /iPhone|iPod/.test(navigator.platform);
            const isAndroid = /Android/i.test(navigator.userAgent);
            const isMobile = isIOS || isAndroid;
            const isDesktop = !isMobile;

            // Update Open in App link
            const openAppLink = document.getElementById('open-app');
            const downloadButton = document.querySelector('.profile-cta-button.secondary');

            if (isDesktop) {
                // Desktop: Show QR code on click
                openAppLink.textContent = 'Open on iPhone';
                openAppLink.href = '#';
                openAppLink.classList.add('desktop');

                // Change download button text for desktop
                if (downloadButton) {
                    downloadButton.textContent = 'View on App Store';
                }

                // Generate QR code
                const qrCodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(profileUrl);
                document.getElementById('qr-code-img').src = qrCodeUrl;

                // Handle click to show modal
                openAppLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    document.getElementById('qr-modal').classList.add('active');
                });

                // Close modal handlers
                document.getElementById('qr-modal-close').addEventListener('click', function() {
                    document.getElementById('qr-modal').classList.remove('active');
                });

                document.getElementById('qr-modal').addEventListener('click', function(e) {
                    if (e.target.id === 'qr-modal') {
                        document.getElementById('qr-modal').classList.remove('active');
                    }
                });

                // ESC key to close
                document.addEventListener('keydown', function(e) {
                    if (e.key === 'Escape') {
                        document.getElementById('qr-modal').classList.remove('active');
                    }
                });
            } else {
                // Mobile: Deep link to app
                openAppLink.href = urlScheme + '://profile/' + username;
            }

            // Smooth auto-redirect on iOS with better UX
            if (isIOS) {
                setTimeout(function() {
                    const appUrl = urlScheme + '://profile/' + username;

                    // Create invisible iframe to attempt app launch
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    iframe.src = appUrl;
                    document.body.appendChild(iframe);

                    // Clean up iframe after attempt
                    setTimeout(function() {
                        document.body.removeChild(iframe);
                    }, 1000);
                }, 800);
            }
        })();
    </script>

    <!-- Vercel Analytics -->
    <script>
        window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    </script>
    <script defer src="/_vercel/insights/script.js"></script>
</body>
</html>`;

  return new Response(html, {
    status: 200, // Return 200, not 404, to not reveal profile existence
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
    '\\': '&#92;',
  };
  return text.replace(/[<>&"'\\]/g, (char) => map[char]);
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
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.375rem;
        }

        .join-date-logo {
            height: 1.5rem;
            width: auto;
            color: rgba(255, 255, 255, 0.3);
            flex-shrink: 0;
            display: block;
            margin: 0 0.125rem;
            align-self: center;
            transform: translateY(-0.2rem);
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
            text-indent: 0.2em;
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
            text-indent: 0.2em;
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
            width: 100%;
            padding-top: 12rem;
        }

        .watch-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 240px));
            gap: 2.5rem;
            width: 100%;
            justify-content: center;
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
            width: 100%;
            max-width: 240px;
            justify-self: center;
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
            margin-bottom: 1rem;
            background: linear-gradient(
                135deg,
                rgba(255, 255, 255, 0.02) 0%,
                rgba(255, 255, 255, 0.04) 50%,
                rgba(255, 255, 255, 0.02) 100%
            );
        }

        /* Only shimmer when loading actual images */
        .watch-grid-thumbnail.has-image {
            background: linear-gradient(
                90deg,
                rgba(255, 255, 255, 0.03) 0%,
                rgba(255, 255, 255, 0.08) 50%,
                rgba(255, 255, 255, 0.03) 100%
            );
            background-size: 200% 100%;
            animation: shimmer 4s infinite ease-in-out;
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
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
        }

        .placeholder-icon {
            width: 32px;
            height: 32px;
            opacity: 0.25;
        }

        .placeholder-text {
            font-size: 0.75rem;
            font-weight: 400;
            color: rgba(255, 255, 255, 0.3);
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }

        .watch-grid-name {
            font-size: 0.8125rem;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.7);
            text-align: center;
            line-height: 1.4;
            letter-spacing: -0.01em;
            margin-bottom: 0.625rem;
            height: 2.4em;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .watch-grid-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.06);
            margin: 0 0.5rem 0.75rem 0.5rem;
        }

        .watch-grid-metric {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.375rem;
            margin-bottom: 0.25rem;
        }

        .grid-pie-chart {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
        }

        .grid-percentage {
            font-size: 1.5rem;
            font-weight: 400;
            color: rgba(255, 255, 255, 0.85);
            letter-spacing: -0.02em;
            line-height: 1;
        }

        .watch-grid-context {
            font-size: 0.625rem;
            font-weight: 400;
            color: rgba(255, 255, 255, 0.45);
            text-align: center;
            letter-spacing: -0.01em;
        }

        /* Mid-Page CTA */
        .cta-mid {
            background: linear-gradient(135deg, #2A1F15 0%, #1A1410 100%);
            padding: 4rem 2rem;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .cta-mid::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        }

        .cta-mid::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        }

        .cta-mid-content {
            max-width: 600px;
            margin: 0 auto;
            position: relative;
            z-index: 1;
        }

        .cta-mid-badge {
            display: inline-block;
            font-size: 0.6875rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            color: rgba(255, 255, 255, 0.5);
            background: rgba(255, 255, 255, 0.05);
            padding: 0.5rem 1rem;
            border-radius: 20px;
            margin-bottom: 2rem;
        }

        .cta-mid-title {
            font-size: 3rem;
            font-weight: 700;
            letter-spacing: -0.03em;
            color: #FFFFFF;
            margin-bottom: 1.5rem;
            line-height: 1.1;
        }

        .cta-mid-description {
            font-size: 1.125rem;
            color: rgba(255, 255, 255, 0.65);
            margin-bottom: 3rem;
            line-height: 1.6;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.375rem;
            flex-wrap: wrap;
        }

        .cta-mid-logo {
            height: 1.65rem;
            width: auto;
            color: rgba(255, 255, 255, 0.65);
            flex-shrink: 0;
            display: inline-block;
            margin: 0 0.125rem 0 -0.2rem;
            transform: translateY(-0.075rem);
        }

        .cta-mid-button {
            display: inline-flex;
            align-items: center;
            gap: 0.75rem;
            background: #FFFFFF;
            color: #000000;
            padding: 1.25rem 2.5rem;
            border-radius: 50px;
            text-decoration: none;
            font-size: 1.125rem;
            font-weight: 600;
            transition: all 0.3s ease;
            box-shadow: 0 4px 20px rgba(255, 255, 255, 0.15);
        }

        .cta-mid-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 30px rgba(255, 255, 255, 0.25);
        }

        .cta-mid-button svg {
            transition: transform 0.3s ease;
            transform: translateY(-3px);
        }

        .cta-mid-button:hover svg {
            transform: translateY(-3px) scale(1.1);
        }

        /* Watch Collection - Apple Scrollytelling Style */
        .watch-collection-container {
            width: 100%;
            background: linear-gradient(to bottom, #1A1612, #000000);
            position: relative;
            padding-top: 0;
            margin-bottom: 0;
        }


        .watch-section {
            min-height: 100vh;
            width: 100%;
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

        .watch-section.visible {
            opacity: 1;
            transform: translateY(0);
        }

        .watch-section-inner {
            display: flex;
            align-items: center;
            gap: 8rem;
            max-width: 1400px;
            width: 100% !important;
            flex-shrink: 0;
        }

        .watch-image-side {
            flex: 0 0 55%;
            max-width: 700px;
        }

        .watch-image-container {
            aspect-ratio: 1;
            border-radius: 32px;
            overflow: hidden;
            background: linear-gradient(
                135deg,
                rgba(255, 255, 255, 0.02) 0%,
                rgba(255, 255, 255, 0.04) 50%,
                rgba(255, 255, 255, 0.02) 100%
            );
        }

        /* Only shimmer when loading actual images */
        .watch-image-container.has-image {
            background: linear-gradient(
                90deg,
                rgba(255, 255, 255, 0.02) 0%,
                rgba(255, 255, 255, 0.08) 50%,
                rgba(255, 255, 255, 0.02) 100%
            );
            background-size: 200% 100%;
            animation: shimmer 4s infinite ease-in-out;
        }

        @keyframes shimmer {
            0% {
                background-position: 200% 0;
            }
            100% {
                background-position: -200% 0;
            }
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
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
        }

        .watch-image-placeholder .placeholder-icon {
            width: 48px;
            height: 48px;
            opacity: 0.25;
        }

        .watch-image-placeholder .placeholder-text {
            font-size: 0.875rem;
            font-weight: 400;
            color: rgba(255, 255, 255, 0.3);
            text-transform: uppercase;
            letter-spacing: 0.1em;
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
            font-size: clamp(2.5rem, 0.5rem + 3vw, 3.5rem);
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
            font-size: clamp(2rem, 0.5rem + 2vw, 2.5rem);
            font-weight: 500;
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
            font-weight: 400;
        }

        .watch-stat-value {
            font-size: 1.5rem;
            color: #FFFFFF;
            font-weight: 500;
        }

        /* Rotation Pie Chart */
        .rotation-stat-with-chart {
            display: grid;
            grid-template-areas:
                "label label"
                "chart value";
            grid-template-columns: auto 1fr;
            row-gap: 0.5rem;
            column-gap: 0.625rem;
            align-items: center;
        }

        .rotation-stat-with-chart .watch-stat-label {
            grid-area: label;
            margin-bottom: 0;
        }

        .rotation-pie-chart {
            grid-area: chart;
            width: 1.4rem;
            height: 1.4rem;
            flex-shrink: 0;
        }

        .rotation-pie-chart circle {
            transform: rotate(-90deg);
            transform-origin: center;
        }

        .rotation-stat-content {
            display: contents;
        }

        .rotation-stat-with-chart .watch-stat-label {
            grid-area: label;
        }

        .rotation-stat-with-chart .watch-stat-value {
            grid-area: value;
            align-self: center;
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

        /* Bottom CTA Section - Refined */
        .cta-section {
            background: transparent;
            color: #fff;
            padding: 9rem 2rem;
            margin-top: 0;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2rem;
        }


        .cta-section h2 {
            font-size: 2.75rem;
            font-weight: 600;
            margin-bottom: 0;
            letter-spacing: -0.02em;
            color: #FFFFFF;
            white-space: nowrap;
        }

        .cta-button {
            display: inline-flex !important;
            align-items: center !important;
            gap: 0.5rem !important;
            background: #FFFFFF !important;
            color: #000000 !important;
            padding: 0.75rem 2rem !important;
            font-size: 1rem !important;
            font-weight: 600 !important;
            line-height: 1.2 !important;
            text-decoration: none !important;
            border-radius: 50px !important;
            transition: all 0.3s ease !important;
            box-shadow: 0 4px 24px rgba(255, 255, 255, 0.12) !important;
            height: auto !important;
            max-height: 60px !important;
            transform: translateY(3px) !important;
        }

        .cta-button:hover {
            transform: translateY(1px) !important;
            box-shadow: 0 8px 32px rgba(255, 255, 255, 0.2);
        }

        .cta-button svg {
            transition: transform 0.3s ease;
        }

        .cta-button:hover svg {
            transform: scale(1.05);
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

            .join-date-logo {
                height: 1.2rem;
                transform: translateY(-0.05rem);
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

            /* Birds Eye View - Mobile */
            .birds-eye-view-section {
                padding: 4rem 1.5rem;
            }

            .box-image-container {
                max-width: 120px;
                margin-bottom: -30px;
            }

            .birds-eye-card {
                padding: 60px 0.75rem 2rem 0.75rem;
                border-radius: 24px;
            }

            .birds-eye-title {
                font-size: 0.75rem;
                margin-bottom: 2rem;
            }

            .watch-grid {
                grid-template-columns: repeat(2, minmax(180px, 240px));
                gap: 1.25rem;
            }

            .watch-grid-item {
                padding: 1rem 0.75rem;
            }

            .watch-grid-name {
                font-size: 0.7rem;
                margin-bottom: 0.5rem;
                height: 2.2em;
            }

            .watch-grid-divider {
                margin: 0 0.25rem 0.625rem 0.25rem;
            }

            .grid-pie-chart {
                width: 18px;
                height: 18px;
            }

            .grid-percentage {
                font-size: 1.25rem;
            }

            .watch-grid-context {
                font-size: 0.5625rem;
            }

            .watch-grid-rank {
                font-size: 0.5rem;
            }

            /* Mid-Page CTA - Mobile */
            .cta-mid {
                padding: 3rem 1.5rem;
            }

            .cta-mid-badge {
                font-size: 0.625rem;
                padding: 0.4rem 0.875rem;
                margin-bottom: 1.5rem;
            }

            .cta-mid-title {
                font-size: 2rem;
                margin-bottom: 1.25rem;
                line-height: 1.15;
            }

            .cta-mid-description {
                font-size: 1rem;
                margin-bottom: 2.25rem;
                line-height: 1.5;
            }

            .cta-mid-logo {
                height: 1.35rem;
            }

            .cta-mid-button {
                padding: 1rem 2rem;
                font-size: 1rem;
                gap: 0.625rem;
            }

            .cta-mid-button svg {
                width: 22px;
                height: 22px;
            }

            /* Scrollytelling - Mobile */
            .scrollytelling-title {
                font-size: 0.75rem;
                padding: 1.5rem 1.5rem 1rem 1.5rem;
            }

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
                gap: 1.25rem;
                margin-top: 2rem;
            }

            .watch-stat {
                border-top: none;
                padding-top: 0.75rem;
            }

            .watch-stat-label {
                margin-bottom: 0.3rem;
            }

            /* Bottom CTA - Mobile */
            .cta-section {
                padding: 6rem 1.5rem 5rem 1.5rem;
                flex-direction: column;
                gap: 2rem;
            }

            .cta-section h2 {
                font-size: 2rem;
                white-space: normal;
                text-align: center;
            }

            .cta-button {
                padding: 0.875rem 1.75rem !important;
                font-size: 1rem !important;
                transform: translateY(0) !important;
            }

            .cta-button:hover {
                transform: translateY(-2px) !important;
            }
        }

        @media (max-width: 480px) {
            /* Profile Header */
            .profile-username {
                font-size: 2.75rem;
            }

            .profile-tagline {
                font-size: 1.5rem;
            }

            .profile-join-date {
                font-size: 0.65rem;
                flex-wrap: nowrap;
                gap: 0.3rem;
            }

            .join-date-logo {
                height: 1rem;
            }

            .profile-stats {
                gap: 1.5rem;
            }

            .stat {
                min-width: 80px;
            }

            .stat-value {
                font-size: 1.75rem;
            }

            .stat-label {
                font-size: 0.65rem;
            }

            /* Birds Eye View - 2 columns on small screens */
            .watch-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 1rem;
            }

            .watch-grid-item {
                padding: 1.25rem 1rem;
            }

            .watch-grid-name {
                font-size: 0.8125rem;
                height: auto;
                min-height: 2.6em;
            }

            .grid-percentage {
                font-size: 1.5rem;
            }

            .watch-grid-context {
                font-size: 0.625rem;
            }

            /* Mid-Page CTA */
            .cta-mid {
                padding: 2.5rem 1.25rem;
            }

            .cta-mid-title {
                font-size: 1.75rem;
            }

            .cta-mid-description {
                font-size: 0.9375rem;
            }

            .cta-mid-logo {
                height: 1.2rem;
            }

            .cta-mid-button {
                padding: 0.875rem 1.75rem;
                font-size: 0.9375rem;
            }

            .cta-mid-button svg {
                width: 20px;
                height: 20px;
            }

            /* Scrollytelling */
            .watch-section {
                padding: 3rem 1.25rem;
            }

            .watch-name {
                font-size: 2rem;
            }

            .watch-reference {
                font-size: 0.9375rem;
            }

            .measurement-rate {
                font-size: 2.5rem;
            }

            .watch-stats-grid {
                gap: 1.25rem;
            }

            /* Bottom CTA */
            .cta-section {
                padding: 5rem 1.25rem 4rem 1.25rem;
            }

            .cta-section h2 {
                font-size: 1.75rem;
            }

            .cta-button {
                padding: 0.75rem 1.5rem !important;
                font-size: 0.9375rem !important;
            }
        }

        @media (max-width: 380px) {
            /* Small screens - prevent join date wrapping */
            .profile-join-date {
                font-size: 0.6rem;
                flex-wrap: nowrap;
                gap: 0.25rem;
            }

            .join-date-logo {
                height: 0.95rem;
            }
        }

        @media (max-width: 350px) {
            /* Extra small screens (< 350px) - fix layout issues */

            /* Ensure no horizontal overflow */
            body {
                overflow-x: hidden;
            }

            /* Profile Header - tighter spacing */
            .profile-header {
                padding: 10rem 1rem 8rem 1rem;
            }

            .profile-username {
                font-size: 2.25rem;
            }

            .profile-tagline {
                font-size: 1.25rem;
            }

            .profile-join-date {
                font-size: 0.52rem;
                flex-wrap: nowrap !important;
                gap: 0.2rem;
            }

            .join-date-logo {
                height: 0.8rem;
                transform: translateY(0);
            }

            /* Stats Card - prevent overflow */
            .profile-stats-card {
                padding: 1.25rem 0.5rem;
                margin: 0 0.5rem;
            }

            .profile-stats {
                gap: 1rem;
            }

            .stat {
                min-width: 60px;
                flex: 1;
            }

            .stat-value {
                font-size: 1.35rem;
            }

            .stat-label {
                font-size: 0.55rem;
                letter-spacing: 0.01em;
                line-height: 1.3;
            }

            /* Reduce separator height */
            .stat:not(:last-child)::after {
                height: 45px;
            }

            /* All sections - prevent background gaps */
            .profile-header,
            .birds-eye-view-section,
            .cta-mid,
            .watch-collection-container,
            .cta-section {
                width: 100%;
                max-width: 100%;
                overflow-x: hidden;
            }

            /* Birds Eye View */
            .birds-eye-view-section {
                padding: 4rem 1rem;
            }

            .birds-eye-card {
                padding: 60px 0.5rem 2rem 0.5rem;
            }

            /* Mid-Page CTA */
            .cta-mid {
                padding: 2.5rem 1rem;
            }

            .cta-mid-title {
                font-size: 1.5rem;
            }

            /* Scrollytelling */
            .watch-section {
                padding: 3rem 1rem;
            }

            /* Bottom CTA */
            .cta-section {
                padding: 5rem 1rem 4rem 1rem;
            }

            .cta-section h2 {
                font-size: 1.5rem;
            }
        }
    </style>
</head>
<body data-campaign-token="web-profile">
    <!-- Header will be injected by components.js -->
    <header></header>

    <!-- Loading State -->
    <div id="loading" class="loading-state">
        <div class="spinner"></div>
        <p class="loading-text">Loading collection...</p>
    </div>

    <!-- Error State -->
    <div id="error" class="error-state hidden">
        <h1>Collection Not Found</h1>
        <p>This collection doesn't exist or isn't available.</p>
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
                        <span class="stat-label">Days Tracked</span>
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

        <!-- Mid-Page CTA -->
        <section class="cta-mid">
            <div class="cta-mid-content">
                <div class="cta-mid-badge">Get Started</div>
                <h2 class="cta-mid-title">Build Your Watch Collection</h2>
                <p class="cta-mid-description">
                    <span>Your collection, always up-to-date with</span>
                    <svg class="cta-mid-logo" viewBox="0 0 256 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <g clip-path="url(#clip0_cta)">
                            <path d="M30.507 82.008C22.499 82.008 18.495 77.332 18.495 67.98V40.68H14.463V39.588C16.815 38.356 19.251 36.704 21.771 34.632C24.347 32.56 26.559 30.404 28.407 28.164L29.583 28.752V39.084L40.671 38.916V41.016L35.127 40.848C32.551 40.736 30.703 40.68 29.583 40.68V64.62C29.583 68.932 30.059 71.956 31.011 73.692C32.019 75.372 33.587 76.212 35.715 76.212C36.667 76.212 37.591 76.016 38.487 75.624C39.383 75.176 40.111 74.616 40.671 73.944L41.763 74.784C40.755 76.856 39.243 78.592 37.227 79.992C35.211 81.336 32.971 82.008 30.507 82.008ZM43.5237 79.74C45.0917 79.46 46.3237 78.872 47.2197 77.976C48.1157 77.08 48.5637 75.988 48.5637 74.7V49.584C48.5637 48.184 48.1717 47.064 47.3877 46.224C46.6037 45.384 45.3157 44.852 43.5237 44.628V43.368L58.6437 38.16L59.6517 38.916V74.7C59.6517 76.044 60.1277 77.164 61.0797 78.06C62.0317 78.956 63.3197 79.516 64.9437 79.74V81H43.5237V79.74ZM46.8837 25.392C46.8837 23.6 47.5277 22.06 48.8157 20.772C50.1597 19.428 51.7277 18.756 53.5197 18.756C55.3117 18.756 56.8517 19.428 58.1397 20.772C59.4837 22.06 60.1557 23.6 60.1557 25.392C60.1557 27.184 59.4837 28.752 58.1397 30.096C56.8517 31.384 55.3117 32.028 53.5197 32.028C51.7277 32.028 50.1597 31.384 48.8157 30.096C47.5277 28.752 46.8837 27.184 46.8837 25.392ZM87.5705 81.84C83.9865 81.84 80.6545 80.972 77.5745 79.236C74.4945 77.444 72.0305 74.84 70.1825 71.424C68.3905 67.952 67.4945 63.864 67.4945 59.16C67.4945 54.68 68.3905 50.844 70.1825 47.652C71.9745 44.404 74.3825 41.968 77.4065 40.344C80.4305 38.664 83.7625 37.824 87.4025 37.824C90.6505 37.824 93.4785 38.272 95.8865 39.168C98.2945 40.064 100.115 41.24 101.347 42.696C102.579 44.152 103.195 45.748 103.195 47.484C103.195 48.884 102.803 50.032 102.019 50.928C101.235 51.824 100.115 52.272 98.6585 52.272C96.9785 52.272 95.7465 51.74 94.9625 50.676C94.2345 49.612 93.5065 47.988 92.7785 45.804C92.1065 43.676 91.3785 42.08 90.5945 41.016C89.8665 39.896 88.6345 39.336 86.8985 39.336C84.3785 39.336 82.4745 40.876 81.1865 43.956C79.8985 47.036 79.2545 51.46 79.2545 57.228C79.2545 63.444 80.4585 68.176 82.8665 71.424C85.3305 74.616 88.4385 76.212 92.1905 76.212C96.0545 76.212 99.2745 74.672 101.851 71.592L102.943 72.264C101.431 75.344 99.3585 77.724 96.7265 79.404C94.1505 81.028 91.0985 81.84 87.5705 81.84ZM130.313 79.74C131.377 79.628 132.133 79.404 132.581 79.068C133.085 78.676 133.337 78.144 133.337 77.472C133.337 76.52 132.805 75.036 131.741 73.02L127.205 64.872C126.141 62.912 125.217 61.596 124.433 60.924C123.649 60.252 122.865 59.916 122.081 59.916H121.913V74.7C121.913 76.044 122.389 77.164 123.341 78.06C124.293 78.956 125.581 79.516 127.205 79.74V81H105.785V79.74C107.353 79.46 108.585 78.872 109.481 77.976C110.377 77.08 110.825 75.988 110.825 74.7V26.316C110.825 24.748 110.433 23.572 109.649 22.788C108.865 21.948 107.577 21.416 105.785 21.192V19.932L120.905 15.396L121.913 16.152V58.236C123.201 58.18 125.161 57.032 127.793 54.792C130.425 52.552 132.861 49.976 135.101 47.064C136.109 45.776 136.613 44.656 136.613 43.704C136.613 42.752 136.137 41.968 135.185 41.352C134.289 40.736 132.917 40.372 131.069 40.26V39H150.137V40.26C147.561 40.764 145.321 41.52 143.417 42.528C141.569 43.48 139.581 45.104 137.453 47.4L132.665 52.608L144.593 73.02C145.825 75.26 147.113 76.884 148.457 77.892C149.801 78.9 151.397 79.516 153.245 79.74V81H130.313V79.74ZM155.34 79.74C157.58 79.46 159.204 78.9 160.212 78.06C161.22 77.164 161.724 75.792 161.724 73.944V26.904C161.724 25.056 161.22 23.712 160.212 22.872C159.204 21.976 157.58 21.388 155.34 21.108V19.848H180.288V21.108C177.992 21.332 176.312 21.892 175.248 22.788C174.184 23.684 173.652 25.056 173.652 26.904V73.944C173.652 75.792 174.184 77.164 175.248 78.06C176.312 78.956 177.992 79.516 180.288 79.74V81H155.34V79.74ZM235.909 94.944C232.885 94.944 230.169 94.524 227.761 93.684C225.353 92.9 223.281 91.948 221.545 90.828C219.865 89.764 217.989 88.364 215.917 86.628C213.845 85.004 212.221 83.828 211.045 83.1C209.925 82.428 208.721 82.008 207.433 81.84C202.841 81.392 198.725 79.768 195.085 76.968C191.501 74.112 188.701 70.388 186.685 65.796C184.669 61.204 183.661 56.08 183.661 50.424C183.661 44.096 184.809 38.552 187.105 33.792C189.457 29.032 192.677 25.364 196.765 22.788C200.853 20.212 205.445 18.924 210.541 18.924C215.637 18.924 220.201 20.212 224.233 22.788C228.265 25.308 231.429 28.92 233.725 33.624C236.021 38.328 237.169 43.788 237.169 50.004C237.169 56.668 235.937 62.492 233.473 67.476C231.009 72.46 227.621 76.184 223.309 78.648C227.901 82.176 231.765 84.752 234.901 86.376C238.093 88 240.893 88.812 243.301 88.812C245.149 88.812 247.025 88.336 248.929 87.384L249.601 88.644C247.137 90.996 244.869 92.62 242.797 93.516C240.725 94.468 238.429 94.944 235.909 94.944ZM196.513 49.836C196.513 59.468 197.773 66.972 200.293 72.348C202.869 77.668 206.677 80.328 211.717 80.328C215.861 80.328 218.997 77.836 221.125 72.852C223.253 67.812 224.317 60.7 224.317 51.516C224.317 41.716 223.113 34.156 220.705 28.836C218.353 23.516 214.769 20.856 209.953 20.856C205.417 20.856 202.029 23.376 199.789 28.416C197.605 33.4 196.513 40.54 196.513 49.836Z" fill="currentColor"/>
                            <path d="M221 40.1052C220.674 40.4827 219.466 41.78 219.371 42.1345C219.282 42.4715 219.372 42.8291 219.375 42.8406L212.981 49.2341L212.459 49.1414L211.372 50.1804L210.757 49.5652L211.847 48.53L211.754 48.0076L218.147 41.614C218.147 41.614 218.545 41.723 218.904 41.6179C219.301 41.5016 220.886 39.9998 220.886 39.9998L221 40.1052Z" fill="currentColor"/>
                            <path d="M203.101 42.6697C203.477 42.9971 204.773 44.2068 205.122 44.3064C205.46 44.402 205.814 44.3162 205.814 44.3162L209.6 48.0037L209.519 48.5134L210.559 49.5994L209.968 50.1902L208.932 49.1003L208.421 49.1814L204.636 45.4949C204.636 45.4949 204.735 45.1065 204.625 44.7527C204.502 44.3611 203 42.7791 203 42.7791L203.101 42.6697Z" fill="currentColor"/>
                            <path d="M210.648 49.437C211.128 49.437 211.517 49.8259 211.517 50.3052C211.516 50.7843 211.128 51.1724 210.648 51.1724C210.169 51.1723 209.78 50.7843 209.78 50.3052C209.78 49.8259 210.169 49.4371 210.648 49.437ZM210.647 49.8726C210.408 49.8727 210.214 50.0666 210.214 50.3062C210.214 50.5456 210.408 50.7396 210.647 50.7397C210.887 50.7397 211.082 50.5457 211.082 50.3062C211.082 50.0665 210.887 49.8726 210.647 49.8726Z" fill="currentColor"/>
                        </g>
                        <defs>
                            <clipPath id="clip0_cta">
                                <rect width="256" height="101" fill="white"/>
                            </clipPath>
                        </defs>
                    </svg>
                </p>
                <a href="https://apps.apple.com/app/apple-store/id6749871310?pt=128058562&ct=web-profile&mt=8" target="_blank" class="cta-mid-button">
                    <span>Download for iOS</span>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 16.97 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
                    </svg>
                </a>
            </div>
        </section>

        <!-- Watch Collection - Apple Scrollytelling -->
        <main class="watch-collection-container">
            <h2 id="details-title" class="scrollytelling-title">Details</h2>
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
            <h2>Join thousands of collectors</h2>
            <a href="https://apps.apple.com/app/apple-store/id6749871310?pt=128058562&ct=web-profile&mt=8" target="_blank" class="cta-button">
                <span>Download for iOS</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 16.97 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
                </svg>
            </a>
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

                    // Format and set join date with logo
                    const joinDate = new Date(data.profile.created_at);
                    const monthYear = joinDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    const logoSvg = \`<svg class="join-date-logo" viewBox="0 0 256 101" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_join)"><path d="M30.507 82.008C22.499 82.008 18.495 77.332 18.495 67.98V40.68H14.463V39.588C16.815 38.356 19.251 36.704 21.771 34.632C24.347 32.56 26.559 30.404 28.407 28.164L29.583 28.752V39.084L40.671 38.916V41.016L35.127 40.848C32.551 40.736 30.703 40.68 29.583 40.68V64.62C29.583 68.932 30.059 71.956 31.011 73.692C32.019 75.372 33.587 76.212 35.715 76.212C36.667 76.212 37.591 76.016 38.487 75.624C39.383 75.176 40.111 74.616 40.671 73.944L41.763 74.784C40.755 76.856 39.243 78.592 37.227 79.992C35.211 81.336 32.971 82.008 30.507 82.008ZM43.5237 79.74C45.0917 79.46 46.3237 78.872 47.2197 77.976C48.1157 77.08 48.5637 75.988 48.5637 74.7V49.584C48.5637 48.184 48.1717 47.064 47.3877 46.224C46.6037 45.384 45.3157 44.852 43.5237 44.628V43.368L58.6437 38.16L59.6517 38.916V74.7C59.6517 76.044 60.1277 77.164 61.0797 78.06C62.0317 78.956 63.3197 79.516 64.9437 79.74V81H43.5237V79.74ZM46.8837 25.392C46.8837 23.6 47.5277 22.06 48.8157 20.772C50.1597 19.428 51.7277 18.756 53.5197 18.756C55.3117 18.756 56.8517 19.428 58.1397 20.772C59.4837 22.06 60.1557 23.6 60.1557 25.392C60.1557 27.184 59.4837 28.752 58.1397 30.096C56.8517 31.384 55.3117 32.028 53.5197 32.028C51.7277 32.028 50.1597 31.384 48.8157 30.096C47.5277 28.752 46.8837 27.184 46.8837 25.392ZM87.5705 81.84C83.9865 81.84 80.6545 80.972 77.5745 79.236C74.4945 77.444 72.0305 74.84 70.1825 71.424C68.3905 67.952 67.4945 63.864 67.4945 59.16C67.4945 54.68 68.3905 50.844 70.1825 47.652C71.9745 44.404 74.3825 41.968 77.4065 40.344C80.4305 38.664 83.7625 37.824 87.4025 37.824C90.6505 37.824 93.4785 38.272 95.8865 39.168C98.2945 40.064 100.115 41.24 101.347 42.696C102.579 44.152 103.195 45.748 103.195 47.484C103.195 48.884 102.803 50.032 102.019 50.928C101.235 51.824 100.115 52.272 98.6585 52.272C96.9785 52.272 95.7465 51.74 94.9625 50.676C94.2345 49.612 93.5065 47.988 92.7785 45.804C92.1065 43.676 91.3785 42.08 90.5945 41.016C89.8665 39.896 88.6345 39.336 86.8985 39.336C84.3785 39.336 82.4745 40.876 81.1865 43.956C79.8985 47.036 79.2545 51.46 79.2545 57.228C79.2545 63.444 80.4585 68.176 82.8665 71.424C85.3305 74.616 88.4385 76.212 92.1905 76.212C96.0545 76.212 99.2745 74.672 101.851 71.592L102.943 72.264C101.431 75.344 99.3585 77.724 96.7265 79.404C94.1505 81.028 91.0985 81.84 87.5705 81.84ZM130.313 79.74C131.377 79.628 132.133 79.404 132.581 79.068C133.085 78.676 133.337 78.144 133.337 77.472C133.337 76.52 132.805 75.036 131.741 73.02L127.205 64.872C126.141 62.912 125.217 61.596 124.433 60.924C123.649 60.252 122.865 59.916 122.081 59.916H121.913V74.7C121.913 76.044 122.389 77.164 123.341 78.06C124.293 78.956 125.581 79.516 127.205 79.74V81H105.785V79.74C107.353 79.46 108.585 78.872 109.481 77.976C110.377 77.08 110.825 75.988 110.825 74.7V26.316C110.825 24.748 110.433 23.572 109.649 22.788C108.865 21.948 107.577 21.416 105.785 21.192V19.932L120.905 15.396L121.913 16.152V58.236C123.201 58.18 125.161 57.032 127.793 54.792C130.425 52.552 132.861 49.976 135.101 47.064C136.109 45.776 136.613 44.656 136.613 43.704C136.613 42.752 136.137 41.968 135.185 41.352C134.289 40.736 132.917 40.372 131.069 40.26V39H150.137V40.26C147.561 40.764 145.321 41.52 143.417 42.528C141.569 43.48 139.581 45.104 137.453 47.4L132.665 52.608L144.593 73.02C145.825 75.26 147.113 76.884 148.457 77.892C149.801 78.9 151.397 79.516 153.245 79.74V81H130.313V79.74ZM155.34 79.74C157.58 79.46 159.204 78.9 160.212 78.06C161.22 77.164 161.724 75.792 161.724 73.944V26.904C161.724 25.056 161.22 23.712 160.212 22.872C159.204 21.976 157.58 21.388 155.34 21.108V19.848H180.288V21.108C177.992 21.332 176.312 21.892 175.248 22.788C174.184 23.684 173.652 25.056 173.652 26.904V73.944C173.652 75.792 174.184 77.164 175.248 78.06C176.312 78.956 177.992 79.516 180.288 79.74V81H155.34V79.74ZM235.909 94.944C232.885 94.944 230.169 94.524 227.761 93.684C225.353 92.9 223.281 91.948 221.545 90.828C219.865 89.764 217.989 88.364 215.917 86.628C213.845 85.004 212.221 83.828 211.045 83.1C209.925 82.428 208.721 82.008 207.433 81.84C202.841 81.392 198.725 79.768 195.085 76.968C191.501 74.112 188.701 70.388 186.685 65.796C184.669 61.204 183.661 56.08 183.661 50.424C183.661 44.096 184.809 38.552 187.105 33.792C189.457 29.032 192.677 25.364 196.765 22.788C200.853 20.212 205.445 18.924 210.541 18.924C215.637 18.924 220.201 20.212 224.233 22.788C228.265 25.308 231.429 28.92 233.725 33.624C236.021 38.328 237.169 43.788 237.169 50.004C237.169 56.668 235.937 62.492 233.473 67.476C231.009 72.46 227.621 76.184 223.309 78.648C227.901 82.176 231.765 84.752 234.901 86.376C238.093 88 240.893 88.812 243.301 88.812C245.149 88.812 247.025 88.336 248.929 87.384L249.601 88.644C247.137 90.996 244.869 92.62 242.797 93.516C240.725 94.468 238.429 94.944 235.909 94.944ZM196.513 49.836C196.513 59.468 197.773 66.972 200.293 72.348C202.869 77.668 206.677 80.328 211.717 80.328C215.861 80.328 218.997 77.836 221.125 72.852C223.253 67.812 224.317 60.7 224.317 51.516C224.317 41.716 223.113 34.156 220.705 28.836C218.353 23.516 214.769 20.856 209.953 20.856C205.417 20.856 202.029 23.376 199.789 28.416C197.605 33.4 196.513 40.54 196.513 49.836Z" fill="currentColor"/><path d="M221 40.1052C220.674 40.4827 219.466 41.78 219.371 42.1345C219.282 42.4715 219.372 42.8291 219.375 42.8406L212.981 49.2341L212.459 49.1414L211.372 50.1804L210.757 49.5652L211.847 48.53L211.754 48.0076L218.147 41.614C218.147 41.614 218.545 41.723 218.904 41.6179C219.301 41.5016 220.886 39.9998 220.886 39.9998L221 40.1052Z" fill="currentColor"/><path d="M203.101 42.6697C203.477 42.9971 204.773 44.2068 205.122 44.3064C205.46 44.402 205.814 44.3162 205.814 44.3162L209.6 48.0037L209.519 48.5134L210.559 49.5994L209.968 50.1902L208.932 49.1003L208.421 49.1814L204.636 45.4949C204.636 45.4949 204.735 45.1065 204.625 44.7527C204.502 44.3611 203 42.7791 203 42.7791L203.101 42.6697Z" fill="currentColor"/><path d="M210.648 49.437C211.128 49.437 211.517 49.8259 211.517 50.3052C211.516 50.7843 211.128 51.1724 210.648 51.1724C210.169 51.1723 209.78 50.7843 209.78 50.3052C209.78 49.8259 210.169 49.4371 210.648 49.437ZM210.647 49.8726C210.408 49.8727 210.214 50.0666 210.214 50.3062C210.214 50.5456 210.408 50.7396 210.647 50.7397C210.887 50.7397 211.082 50.5457 211.082 50.3062C211.082 50.0665 210.887 49.8726 210.647 49.8726Z" fill="currentColor"/></g><clipPath id="clip0_join"><rect width="256" height="101" fill="white"/></clipPath></svg>\`;
                    document.getElementById('join-date').innerHTML = \`Tracking with \${logoSvg} since \${monthYear}\`;

                    // Set stats
                    document.getElementById('watch-count').textContent = data.stats.watch_count;
                    document.getElementById('measurement-count').textContent = data.stats.measurement_count;

                    // Only show "Days Tracked" for PRO users with rotation insights
                    const rotationInsightsAvailable = data.stats.rotation_insights_available;
                    if (rotationInsightsAvailable) {
                        document.getElementById('days-logged').textContent = data.stats.total_posting_days || 0;
                    } else {
                        // Hide the Days Tracked stat for FREE users
                        const daysLoggedStat = document.getElementById('days-logged').closest('.stat');
                        if (daysLoggedStat) {
                            daysLoggedStat.style.display = 'none';
                        }
                        // Adjust grid to 2 columns
                        const statsGrid = document.querySelector('.profile-stats');
                        if (statsGrid) {
                            statsGrid.style.gridTemplateColumns = '1fr 1fr';
                        }
                    }

                    // Render watches with cumulative rotation offset
                    if (data.watches && data.watches.length > 0) {
                        // Render birds eye view grid (pass rotation flag)
                        renderBirdsEyeView(data.watches, rotationInsightsAvailable);

                        // Render scrollytelling sections
                        const watchCollection = document.getElementById('watch-collection');
                        let cumulativeRotation = 0;

                        const sections = data.watches.map((watch, index) => {
                            const section = renderWatchSection(watch, index + 1, cumulativeRotation, rotationInsightsAvailable);
                            cumulativeRotation += watch.percentage_of_rotation;
                            return section;
                        });

                        watchCollection.innerHTML = sections.join('');

                        // Initialize scroll animations
                        initScrollAnimations();
                    } else {
                        // Hide birds eye view and show empty state
                        document.getElementById('birds-eye-view').classList.add('hidden');
                        document.getElementById('details-title').classList.add('hidden');
                        document.getElementById('watch-collection').classList.add('hidden');
                        document.getElementById('empty-state').classList.remove('hidden');
                    }

                } catch (error) {
                    console.error('Error rendering profile:', error);
                    showError();
                }
            }

            function renderBirdsEyeView(watches, rotationInsightsAvailable) {
                const watchGrid = document.getElementById('watch-grid');

                // Helper to create filled pie chart (matching scrollytelling style)
                const createGridPieChart = (percentage) => {
                    const center = 10;
                    const radius = 9.5;
                    const baseAngle = -Math.PI / 2;
                    const sweepAngle = 2 * Math.PI * (percentage / 100);
                    const endAngle = baseAngle + sweepAngle;

                    const startX = center + radius * Math.cos(baseAngle);
                    const startY = center + radius * Math.sin(baseAngle);
                    const endX = center + radius * Math.cos(endAngle);
                    const endY = center + radius * Math.sin(endAngle);

                    const largeArcFlag = sweepAngle > Math.PI ? 1 : 0;

                    const fillPath = percentage > 0
                        ? \`M \${center},\${center} L \${startX},\${startY} A \${radius},\${radius} 0 \${largeArcFlag},1 \${endX},\${endY} Z\`
                        : '';

                    const emptyPath = percentage > 0 && percentage < 100
                        ? \`M \${center},\${center} L \${endX},\${endY} A \${radius},\${radius} 0 \${1 - largeArcFlag},1 \${startX},\${startY} Z\`
                        : '';

                    return \`
                        <svg class="grid-pie-chart" viewBox="0 0 20 20">
                            <circle cx="\${center}" cy="\${center}" r="\${radius}" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="0.5"/>
                            \${emptyPath ? \`<path d="\${emptyPath}" fill="rgba(255, 255, 255, 0.12)"/>\` : ''}
                            \${fillPath ? \`<path d="\${fillPath}" fill="rgba(255, 255, 255, 0.95)"/>\` : ''}
                        </svg>
                    \`;
                };

                const gridItems = watches.map((watch, index) => {
                    const watchName = [watch.make, watch.model].filter(Boolean).join(' ') || 'Watch';
                    const rank = index + 1;

                    // Image or placeholder
                    const imageHtml = watch.thumbnail_url
                        ? \`<img src="/api/img/\${escapeHtml(watch.thumbnail_url)}" alt="\${escapeHtml(watchName)}" width="512" height="512">\`
                        : \`<div class="watch-grid-placeholder">
                            <svg class="placeholder-icon" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="13" cy="13" r="12" fill="white" opacity="0.15"/>
                                <path d="M13 6C11.3431 6 10 7.34315 10 9V11H9C8.44772 11 8 11.4477 8 12V18C8 18.5523 8.44772 19 9 19H17C17.5523 19 18 18.5523 18 18V12C18 11.4477 17.5523 11 17 11H16V9C16 7.34315 14.6569 6 13 6ZM11.5 9C11.5 8.17157 12.1716 7.5 13 7.5C13.8284 7.5 14.5 8.17157 14.5 9V11H11.5V9Z" fill="white" opacity="0.4"/>
                            </svg>
                            <div class="placeholder-text">LOCKED</div>
                        </div>\`;

                    // Add has-image class only when there's an actual image
                    const thumbnailClass = watch.thumbnail_url ? 'watch-grid-thumbnail has-image' : 'watch-grid-thumbnail';

                    // Rotation percentage
                    const percentage = watch.percentage_of_rotation || 0;

                    // Only show rotation metrics for PRO users
                    const rotationHtml = rotationInsightsAvailable ? \`
                            <div class="watch-grid-divider"></div>
                            <div class="watch-grid-metric">
                                \${createGridPieChart(percentage)}
                                <span class="grid-percentage">\${Math.round(percentage)}%</span>
                            </div>
                            <div class="watch-grid-context">of rotation</div>
                    \` : '';

                    return \`
                        <a href="#watch-\${watch.id}" class="watch-grid-item" data-watch-id="\${watch.id}">
                            <div class="watch-grid-rank">#\${rank}</div>
                            <div class="\${thumbnailClass}">
                                \${imageHtml}
                            </div>
                            <div class="watch-grid-name">\${escapeHtml(watchName)}</div>
                            \${rotationHtml}
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

            function renderWatchSection(watch, rank, rotationOffset, rotationInsightsAvailable) {
                const watchName = [watch.make, watch.model].filter(Boolean).join(' ') || 'Watch';
                const referenceText = watch.reference_number ? escapeHtml(watch.reference_number) : '';

                // Image or placeholder - use full image for scrollytelling
                const imageUrl = watch.full_image_url || watch.thumbnail_url;
                const imageHtml = imageUrl
                    ? \`<img src="/api/img/\${escapeHtml(imageUrl)}" alt="\${escapeHtml(watchName)}" class="watch-image" width="1024" height="1024" loading="lazy">\`
                    : \`<div class="watch-image-placeholder">
                        <svg class="placeholder-icon" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="13" cy="13" r="12" fill="white" opacity="0.15"/>
                            <path d="M13 6C11.3431 6 10 7.34315 10 9V11H9C8.44772 11 8 11.4477 8 12V18C8 18.5523 8.44772 19 9 19H17C17.5523 19 18 18.5523 18 18V12C18 11.4477 17.5523 11 17 11H16V9C16 7.34315 14.6569 6 13 6ZM11.5 9C11.5 8.17157 12.1716 7.5 13 7.5C13.8284 7.5 14.5 8.17157 14.5 9V11H11.5V9Z" fill="white" opacity="0.4"/>
                        </svg>
                        <div class="placeholder-text">LOCKED</div>
                    </div>\`;

                // Add has-image class only when there's an actual image
                const imageContainerClass = imageUrl ? 'watch-image-container has-image' : 'watch-image-container';

                // Prepare measurement data for stats grid
                let measurementData = null;
                if (watch.latest_measurement) {
                    const rate = watch.latest_measurement.rate;
                    const sign = rate >= 0 ? '+' : '';
                    const rateClass = watch.latest_measurement.rate_color_class || '';
                    measurementData = {
                        rate: \`\${sign}\${rate.toFixed(1)} sec/day\`,
                        rateClass: rateClass,
                        count: watch.measurement_count
                    };
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

                // Stats grid - Order: Accuracy, % of Rotation, # of Measurements, Days Worn
                // Rotation stats (% of Rotation, Days Worn) only shown for PRO users
                const statsHtml = \`
                    <div class="watch-stats-grid">
                        \${measurementData ? \`
                            <div class="watch-stat">
                                <div class="watch-stat-label">Accuracy</div>
                                <div class="watch-stat-value \${measurementData.rateClass}">\${measurementData.rate}</div>
                            </div>
                        \` : ''}
                        \${rotationInsightsAvailable && watch.days_worn > 0 ? \`
                            <div class="watch-stat rotation-stat-with-chart">
                                \${createPieChart(watch.percentage_of_rotation, rotationOffset)}
                                <div class="rotation-stat-content">
                                    <div class="watch-stat-label">% of Rotation</div>
                                    <div class="watch-stat-value">\${Math.round(watch.percentage_of_rotation)}%</div>
                                </div>
                            </div>
                        \` : ''}
                        \${measurementData ? \`
                            <div class="watch-stat">
                                <div class="watch-stat-label">Measurements</div>
                                <div class="watch-stat-value">\${measurementData.count}</div>
                            </div>
                        \` : ''}
                        \${rotationInsightsAvailable && watch.days_worn > 0 ? \`
                            <div class="watch-stat">
                                <div class="watch-stat-label">Days Worn</div>
                                <div class="watch-stat-value">\${watch.days_worn}</div>
                            </div>
                        \` : ''}
                    </div>
                \`;

                return \`
                    <section class="watch-section" id="watch-\${watch.id}" data-watch-id="\${watch.id}">
                        <div class="watch-section-inner">
                            <div class="watch-image-side">
                                <div class="\${imageContainerClass}">
                                    \${imageHtml}
                                </div>
                            </div>
                            <div class="watch-details-side">
                                <div class="watch-rank">No. \${rank}</div>
                                <h2 class="watch-name">\${escapeHtml(watchName)}</h2>
                                \${referenceText ? \`<div class="watch-reference">\${referenceText}</div>\` : ''}
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
                    // Use lower threshold for birds-eye-view since it can be very tall with many watches
                    // On mobile with 24 watches, the section might be 4000px tall
                    // threshold: 0.2 would require 800px visible (more than viewport!)
                    const birdsEyeObserverOptions = {
                        root: null,
                        rootMargin: '0px',
                        threshold: 0.01  // Only need 1% visible to trigger
                    };

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
                    }, birdsEyeObserverOptions);

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
