export const runtime = 'edge';

export async function GET(request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');

  // Extract username from path (expecting /u/username)
  const username = pathParts[2] || 'user';

  // Get the current domain for absolute URLs
  const currentDomain = `${url.protocol}//${url.host}`;

  // Escape username for safe HTML insertion
  const safeUsername = username.replace(/[<>&"']/g, (char) => {
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
  let html = PROFILE_HTML_TEMPLATE;

  // Replace meta tags with dynamic values - ONLY updating titles with username
  html = html
    // Update title tag
    .replace(
      '<title>View This Watch Collection on tickIQ</title>',
      `<title>@${safeUsername}'s Watch Collection - tickIQ</title>`
    )
    // Update Open Graph title
    .replace(
      '<meta property="og:title" content="View This Watch Collection on tickIQ">',
      `<meta property="og:title" content="@${safeUsername}'s Watch Collection on tickIQ">`
    )
    // Update Open Graph URL
    .replace(
      '<meta property="og:url" content="https://tickiq.app/profile">',
      `<meta property="og:url" content="${currentDomain}/u/${safeUsername}">`
    )
    // Update OG image URL to use current domain
    .replace(
      '<meta property="og:image" content="https://tickiq.app/assets/images/og-image-profile-landscape.png">',
      `<meta property="og:image" content="${currentDomain}/assets/images/og-image-profile-landscape.png">`
    )
    // Update Twitter title
    .replace(
      '<meta name="twitter:title" content="View This Watch Collection on tickIQ">',
      `<meta name="twitter:title" content="@${safeUsername}'s Watch Collection on tickIQ">`
    )
    // Update Twitter image URL to use current domain
    .replace(
      '<meta name="twitter:image" content="https://tickiq.app/assets/images/og-image-profile-landscape.png">',
      `<meta name="twitter:image" content="${currentDomain}/assets/images/og-image-profile-landscape.png">`
    )
    // Update iOS app link
    .replace(
      '<meta property="al:ios:url" content="tickiq://profile/">',
      `<meta property="al:ios:url" content="tickiq://profile/${safeUsername}">`
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

// This will be replaced during build with the actual profile.html content
const PROFILE_HTML_TEMPLATE = `...embedded during build...`;
