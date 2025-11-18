/**
 * Public Profile V2 - Vercel Edge Function
 *
 * Server-side renders user profiles with watch collection data.
 * Fetches data from Supabase Edge Function and injects into HTML template.
 *
 * Security: Uses Supabase anon key (safe - RLS policies enforce privacy)
 * Caching: 10min edge cache, 15min stale-while-revalidate (signed URLs expire in 45min)
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
        // Cache at edge for 10 minutes, serve stale for up to 15 minutes while revalidating
        'Cache-Control': 's-maxage=600, stale-while-revalidate=900',
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
    <title>{{USERNAME}}'s Watch Collection - tickIQ</title>
    <meta name="description" content="Explore {{USERNAME}}'s watch collection with real accuracy data from tickIQ. See timing measurements and discover their watches.">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="{{USERNAME}}'s Watch Collection on tickIQ">
    <meta property="og:description" content="Explore this curated collection with real accuracy data. See grail pieces and discover how each watch performs.">
    <meta property="og:image" content="https://{{DOMAIN}}/assets/images/og-image-profile-landscape.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="https://{{DOMAIN}}/u/{{USERNAME}}">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{{USERNAME}}'s Watch Collection on tickIQ">
    <meta name="twitter:description" content="Explore this curated collection with real accuracy data. See timing measurements and watch performance.">
    <meta name="twitter:image" content="https://{{DOMAIN}}/assets/images/og-image-profile-landscape.png">

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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

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
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        /* Header */
        .site-header {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            z-index: 100;
            padding: 1rem 2rem;
        }

        .b23-logo {
            font-size: 1.25rem;
            font-weight: 600;
            color: #000;
            text-decoration: none;
        }

        /* Main Container */
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
        }

        /* Profile Header */
        .profile-header {
            padding: 8rem 0 4rem 0;
            text-align: center;
        }

        .profile-username {
            font-size: 3rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 0.5rem;
            color: #000;
        }

        .profile-join-date {
            font-size: 1rem;
            color: #666;
            margin-bottom: 2rem;
        }

        /* Stats */
        .profile-stats {
            display: flex;
            gap: 3rem;
            justify-content: center;
            margin-top: 2rem;
            flex-wrap: wrap;
        }

        .stat {
            text-align: center;
        }

        .stat-value {
            display: block;
            font-size: 2rem;
            font-weight: 700;
            color: #000;
        }

        .stat-label {
            display: block;
            font-size: 0.875rem;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-top: 0.25rem;
        }

        /* Watch Grid */
        .watch-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 2rem;
            padding: 3rem 0;
        }

        .watch-card {
            background: #fff;
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 12px;
            overflow: hidden;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .watch-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
        }

        .watch-image-container {
            aspect-ratio: 1;
            background: #f5f5f5;
            position: relative;
            overflow: hidden;
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
            background: linear-gradient(135deg, #f5f5f5 0%, #e5e5e5 100%);
            font-size: 3rem;
        }

        .watch-info {
            padding: 1.25rem;
        }

        .watch-name {
            font-size: 1.125rem;
            font-weight: 600;
            color: #000;
            margin-bottom: 0.25rem;
            line-height: 1.3;
        }

        .watch-reference {
            font-size: 0.875rem;
            color: #666;
            margin-bottom: 1rem;
        }

        .watch-measurement {
            padding-top: 1rem;
            border-top: 1px solid rgba(0, 0, 0, 0.05);
        }

        .measurement-rate {
            font-size: 1.25rem;
            font-weight: 600;
            color: #000;
            margin-bottom: 0.25rem;
        }

        .measurement-rate.positive {
            color: #d32f2f;
        }

        .measurement-rate.negative {
            color: #1976d2;
        }

        .measurement-count {
            font-size: 0.75rem;
            color: #999;
            text-transform: uppercase;
            letter-spacing: 0.05em;
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
        }

        .empty-state p {
            font-size: 1.125rem;
            color: #666;
        }

        /* CTA Section */
        .cta-section {
            background: #000;
            color: #fff;
            padding: 6rem 2rem;
            text-align: center;
            margin-top: 4rem;
        }

        .cta-section h2 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 1rem;
            letter-spacing: -0.02em;
        }

        .cta-section p {
            font-size: 1.25rem;
            color: rgba(255, 255, 255, 0.8);
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

        /* Footer */
        .footer {
            padding: 3rem 2rem;
            text-align: center;
            color: #999;
            font-size: 0.875rem;
        }

        .footer a {
            color: #666;
            text-decoration: none;
        }

        .footer a:hover {
            color: #000;
        }

        /* Loading State */
        .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 2rem;
        }

        .spinner {
            width: 48px;
            height: 48px;
            border: 3px solid rgba(0, 0, 0, 0.1);
            border-top-color: #000;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .loading-text {
            margin-top: 1.5rem;
            font-size: 1rem;
            color: #666;
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
        }

        .error-state h1 {
            font-size: 3rem;
            font-weight: 700;
            margin-bottom: 1rem;
        }

        .error-state p {
            font-size: 1.25rem;
            color: #666;
            margin-bottom: 2rem;
        }

        .error-button {
            display: inline-block;
            background: #000;
            color: #fff;
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
                padding: 6rem 0 3rem 0;
            }

            .profile-username {
                font-size: 2rem;
            }

            .profile-stats {
                gap: 2rem;
            }

            .stat-value {
                font-size: 1.5rem;
            }

            .watch-grid {
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 1.5rem;
            }

            .cta-section h2 {
                font-size: 2rem;
            }

            .container {
                padding: 0 1.5rem;
            }
        }

        @media (max-width: 480px) {
            .watch-grid {
                grid-template-columns: 1fr;
                gap: 1.5rem;
            }

            .profile-stats {
                gap: 1.5rem;
            }
        }
    </style>
</head>
<body>
    <!-- Site Header -->
    <header class="site-header">
        <a href="https://www.b23.ai" class="b23-logo">B23</a>
    </header>

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
        <section class="profile-header container">
            <h1 class="profile-username" id="username">@username</h1>
            <p class="profile-join-date" id="join-date">Member since ...</p>

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
                    <span class="stat-value" id="avg-rate">--</span>
                    <span class="stat-label">Avg Rate</span>
                </div>
            </div>
        </section>

        <!-- Watch Grid -->
        <main class="container">
            <div id="watch-grid" class="watch-grid">
                <!-- Watches will be inserted here by JavaScript -->
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

        <!-- Footer -->
        <footer class="footer">
            <p>&copy; 2025 <a href="https://www.b23.ai">B23, LLC</a>. All rights reserved.</p>
        </footer>
    </div>

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

                    // Set username
                    document.getElementById('username').textContent = '@' + data.profile.username;

                    // Format and set join date
                    const joinDate = new Date(data.profile.created_at);
                    const monthYear = joinDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    document.getElementById('join-date').textContent = 'Member since ' + monthYear;

                    // Set stats
                    document.getElementById('watch-count').textContent = data.stats.watch_count;
                    document.getElementById('measurement-count').textContent = data.stats.measurement_count;

                    // Format average rate
                    if (data.stats.average_rate !== null) {
                        const avgRate = data.stats.average_rate;
                        const sign = avgRate >= 0 ? '+' : '';
                        document.getElementById('avg-rate').textContent = sign + avgRate.toFixed(1) + ' s/d';
                    } else {
                        document.getElementById('avg-rate').textContent = '--';
                    }

                    // Render watches
                    if (data.watches && data.watches.length > 0) {
                        const watchGrid = document.getElementById('watch-grid');
                        watchGrid.innerHTML = data.watches.map(watch => renderWatchCard(watch)).join('');
                    } else {
                        // Show empty state
                        document.getElementById('watch-grid').classList.add('hidden');
                        document.getElementById('empty-state').classList.remove('hidden');
                    }

                } catch (error) {
                    console.error('Error rendering profile:', error);
                    showError();
                }
            }

            function renderWatchCard(watch) {
                const watchName = [watch.make, watch.model].filter(Boolean).join(' ') || 'Watch';
                const referenceText = watch.reference_number ? 'Ref: ' + escapeHtml(watch.reference_number) : '';

                // Image or placeholder
                // thumbnail_url now contains encrypted token, use image proxy endpoint
                const imageHtml = watch.thumbnail_url
                    ? \`<img src="/img/\${escapeHtml(watch.thumbnail_url)}" alt="\${escapeHtml(watchName)}" class="watch-image" loading="lazy">\`
                    : \`<div class="watch-image-placeholder">⌚</div>\`;

                // Measurement info
                let measurementHtml = '';
                if (watch.latest_measurement) {
                    const rate = watch.latest_measurement.rate;
                    const sign = rate >= 0 ? '+' : '';
                    const rateClass = rate >= 0 ? 'positive' : 'negative';
                    const measurementText = watch.measurement_count === 1
                        ? '1 measurement'
                        : watch.measurement_count + ' measurements';

                    measurementHtml = \`
                        <div class="watch-measurement">
                            <div class="measurement-rate \${rateClass}">\${sign}\${rate.toFixed(1)} s/d</div>
                            <div class="measurement-count">\${measurementText}</div>
                        </div>
                    \`;
                } else if (watch.measurement_count > 0) {
                    const measurementText = watch.measurement_count === 1
                        ? '1 measurement'
                        : watch.measurement_count + ' measurements';
                    measurementHtml = \`
                        <div class="watch-measurement">
                            <div class="measurement-count">\${measurementText}</div>
                        </div>
                    \`;
                }

                return \`
                    <div class="watch-card">
                        <div class="watch-image-container">
                            \${imageHtml}
                        </div>
                        <div class="watch-info">
                            <div class="watch-name">\${escapeHtml(watchName)}</div>
                            \${referenceText ? \`<div class="watch-reference">\${referenceText}</div>\` : ''}
                            \${measurementHtml}
                        </div>
                    </div>
                \`;
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
