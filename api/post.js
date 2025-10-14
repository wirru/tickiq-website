export const config = {
  runtime: 'edge',
};

export default function handler(request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');

  // Extract post ID from path (expecting /p/postId)
  const postId = pathParts[2] || 'post';

  // Get the current domain for absolute URLs
  const currentDomain = `${url.protocol}//${url.host}`;

  // Escape post ID for safe HTML insertion
  const safePostId = postId.replace(/[<>&"']/g, (char) => {
    const escapeMap = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return escapeMap[char];
  });

  // Use the embedded HTML template
  let html = POST_HTML_TEMPLATE;

  // Replace meta tags with dynamic values
  html = html
    // Update title tag
    .replace(
      '<title>View This Post on tickIQ</title>',
      `<title>View This Post on tickIQ</title>`
    )
    // Update Open Graph title
    .replace(
      '<meta property="og:title" content="View This Post on tickIQ">',
      `<meta property="og:title" content="View This Post on tickIQ">`
    )
    // Update Open Graph URL
    .replace(
      '<meta property="og:url" content="https://tickiq.app/post">',
      `<meta property="og:url" content="${currentDomain}/p/${safePostId}">`
    )
    // Update OG image URL to use current domain
    .replace(
      '<meta property="og:image" content="https://tickiq.app/assets/images/og-image-profile-landscape.png">',
      `<meta property="og:image" content="${currentDomain}/assets/images/og-image-profile-landscape.png">`
    )
    // Update Twitter title
    .replace(
      '<meta name="twitter:title" content="View This Post on tickIQ">',
      `<meta name="twitter:title" content="View This Post on tickIQ">`
    )
    // Update Twitter image URL to use current domain
    .replace(
      '<meta name="twitter:image" content="https://tickiq.app/assets/images/og-image-profile-landscape.png">',
      `<meta name="twitter:image" content="${currentDomain}/assets/images/og-image-profile-landscape.png">`
    )
    // Update iOS app link
    .replace(
      '<meta property="al:ios:url" content="tickiq://post/">',
      `<meta property="al:ios:url" content="tickiq://post/${safePostId}">`
    );

  // Return the modified HTML
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate', // Cache for 1 hour at edge
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
    <title>Someone Sent You a Watch</title>
    <meta name="description" content="Open in tickIQ to see the watch, read the story behind it, and check out the conversation.">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="Someone Sent You a Watch">
    <meta property="og:description" content="Open in tickIQ to see the watch, read the story behind it, and check out the conversation.">
    <meta property="og:image" content="https://tickiq.app/assets/images/og-image-landscape.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="https://tickiq.app/post">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Someone Sent You a Watch">
    <meta name="twitter:description" content="Open in tickIQ to see the watch, read the story behind it, and check out the conversation.">
    <meta name="twitter:image" content="https://tickiq.app/assets/images/og-image-landscape.png">

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
<body>
    <div class="container">
        <!-- Header will be injected here -->
        <header></header>

        <!-- Post Hero Section -->
        <div class="post-hero">
            <div class="post-content">
                <img src="/assets/icons/app-icon.png" alt="tickIQ" class="post-app-icon">

                <h1 class="post-title" id="post-title">You've Been Sent a Watch</h1>

                <p class="post-message">
                    Open in the tickIQ app to see the watch and join the conversation.
                </p>

                <div class="post-cta-container">
                    <a href="#" id="open-app" class="post-cta-button primary">
                        View Post in App
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
            <div class="qr-modal-subtitle" id="post-url-display"></div>
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

        // Update page with post ID
        const titleElement = document.getElementById('post-title');
        titleElement.textContent = 'You\\'ve Been Sent a Watch';

        // Update all meta tags for better sharing
        document.title = 'Someone Sent You a Watch';

        // Update meta description
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
            metaDesc.setAttribute('content', 'Open in tickIQ to see the watch, read the story behind it, and check out the conversation.');
        }

        // Update Open Graph meta tags
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
            ogTitle.setAttribute('content', 'Someone Sent You a Watch');
        }

        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) {
            ogDesc.setAttribute('content', 'Open in tickIQ to see the watch, read the story behind it, and check out the conversation.');
        }

        const ogUrl = document.querySelector('meta[property="og:url"]');
        if (ogUrl) {
            ogUrl.setAttribute('content', \`https://tickiq.app/p/\${postId}\`);
        }

        // Update Twitter meta tags
        const twitterTitle = document.querySelector('meta[name="twitter:title"]');
        if (twitterTitle) {
            twitterTitle.setAttribute('content', 'Someone Sent You a Watch');
        }

        const twitterDesc = document.querySelector('meta[name="twitter:description"]');
        if (twitterDesc) {
            twitterDesc.setAttribute('content', 'Open in tickIQ to see the watch, read the story behind it, and check out the conversation.');
        }

        // Update iOS app link
        const iosUrl = document.querySelector('meta[property="al:ios:url"]');
        if (iosUrl) {
            iosUrl.setAttribute('content', \`tickiq://post/\${postId}\`);
        }

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
            // Desktop: Show QR code on click
            openAppLink.textContent = 'Open on iPhone';
            openAppLink.href = '#';
            openAppLink.classList.add('desktop');

            // Change download button text for desktop
            if (downloadButton) {
                downloadButton.textContent = 'View on App Store';
            }

            // Generate QR code
            const qrCodeUrl = \`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=\${encodeURIComponent(postUrl)}\`;
            document.getElementById('qr-code-img').src = qrCodeUrl;
            document.getElementById('post-url-display').textContent = postUrl.replace('https://', '');

            // Update modal title
            document.getElementById('qr-modal-title').textContent = 'View This Post';

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
