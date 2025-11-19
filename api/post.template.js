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
const POST_HTML_TEMPLATE = `...embedded during build...`;
