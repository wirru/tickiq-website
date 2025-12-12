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
const PROFILE_V2_HTML_TEMPLATE = `...embedded during build...`;
