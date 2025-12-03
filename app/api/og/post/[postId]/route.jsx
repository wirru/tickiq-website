import { ImageResponse } from 'next/og';

/**
 * Post OG Image Generator
 * Generates dynamic Open Graph images for post sharing.
 * Creates a 600x800 portrait image (3:4 ratio to match post photos) with iOS-style overlays.
 * Reduced resolution for faster loading while maintaining quality for social previews.
 */

// Load Inter font with multiple weights
async function loadFonts() {
  const [interBold, interMedium, interRegular] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hjp-Ek-_EeA.woff').then(res => res.arrayBuffer()),
    fetch('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hjp-Ek-_EeA.woff').then(res => res.arrayBuffer()),
    fetch('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff').then(res => res.arrayBuffer()),
  ]);
  return [
    { name: 'Inter', data: interBold, weight: 700, style: 'normal' },
    { name: 'Inter', data: interMedium, weight: 500, style: 'normal' },
    { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
  ];
}

// Utility functions
function truncateText(text, maxLength) {
  if (!text) return '';
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  const truncated = chars.slice(0, maxLength).join('');
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.5) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}

function formatCount(count) {
  if (typeof count !== 'number' || isNaN(count)) return '0';
  if (count < 0) return '0';
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(Math.floor(count));
}

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now - date;
  if (diffMs < 0) return 'just now';
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

async function fetchPostData(postId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[OG/POST] Missing Supabase environment variables');
    return null;
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-public-post-web/${postId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.log(`[OG/POST] Post not found: ${postId} (status: ${response.status})`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[OG/POST] Failed to fetch post data:', error);
    return null;
  }
}

// SVG icon paths (Heroicons outline style to match post.html)
const ICONS = {
  heart: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z',
  comment: 'M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z',
};

export async function GET(request, { params }) {
  const { postId } = await params;

  // Validate postId format
  if (!postId || !isValidUUID(postId)) {
    console.log(`[OG/POST] Invalid post ID format: ${postId}`);
    return new Response('Invalid post ID', { status: 400 });
  }

  // Get current domain for image URLs
  const url = new URL(request.url);
  const currentDomain = `${url.protocol}//${url.host}`;

  try {
    // Load fonts and fetch post data in parallel
    const [fonts, postData] = await Promise.all([
      loadFonts(),
      fetchPostData(postId),
    ]);

    if (!postData || !postData.image_token) {
      console.log(`[OG/POST] Post not found or missing image: ${postId}`);
      return new Response('Post not found', { status: 404 });
    }

    // Build image URL using our image proxy
    const imageUrl = `${currentDomain}/api/img/${postData.image_token}`;

    console.log(`[OG/POST] Generating OG image for post: ${postId}`);

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            position: 'relative',
            backgroundColor: '#000000',
          }}
        >
          {/* Background image */}
          <img
            src={imageUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />

          {/* Gradient overlay with content */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '45%',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.55))',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              padding: 32,
            }}
          >
            {/* Left side: Caption + metadata */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                marginRight: 24,
              }}
            >
              {/* Caption with fake text-shadow (Satori doesn't support textShadow) */}
              {postData.caption && (
                <div style={{ display: 'flex', position: 'relative', marginBottom: 12 }}>
                  {/* Shadow layer */}
                  <p
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: 0,
                      fontSize: 36,
                      fontFamily: 'Inter',
                      fontWeight: 700,
                      color: 'rgba(0, 0, 0, 0.5)',
                      margin: 0,
                      lineHeight: 1.25,
                    }}
                  >
                    {truncateText(postData.caption, 120)}
                  </p>
                  {/* Main text */}
                  <p
                    style={{
                      position: 'relative',
                      fontSize: 36,
                      fontFamily: 'Inter',
                      fontWeight: 700,
                      color: '#ffffff',
                      margin: 0,
                      lineHeight: 1.25,
                    }}
                  >
                    {truncateText(postData.caption, 120)}
                  </p>
                </div>
              )}

              {/* Metadata row - no wrap, truncate if needed */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'nowrap',
                  gap: 8,
                  overflow: 'hidden',
                }}
              >
                {/* Username pill */}
                {postData.author_username && (
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.12)',
                      borderRadius: 9999,
                      padding: '4px 12px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 18,
                        fontFamily: 'Inter',
                        fontWeight: 500,
                        color: '#ffffff',
                      }}
                    >
                      @{postData.author_username}
                    </span>
                  </div>
                )}

                {/* Watch name - truncate if too long */}
                {postData.watch_display_name && (
                  <span
                    style={{
                      fontSize: 18,
                      fontFamily: 'Inter',
                      fontWeight: 500,
                      color: 'rgba(255, 255, 255, 0.6)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      flexShrink: 1,
                      minWidth: 0,
                    }}
                  >
                    · {truncateText(postData.watch_display_name, 35)}
                  </span>
                )}

                {/* Timestamp */}
                {postData.created_at && (
                  <span
                    style={{
                      fontSize: 18,
                      fontFamily: 'Inter',
                      fontWeight: 400,
                      color: 'rgba(255, 255, 255, 0.6)',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    · {formatRelativeTime(postData.created_at)}
                  </span>
                )}
              </div>
            </div>

            {/* Right side: Like/comment counts - positioned above metadata row */}
            <div
              style={{
                position: 'absolute',
                right: 32,
                bottom: 75,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
              }}
            >
              {/* Heart icon + count */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={1.5}>
                  <path d={ICONS.heart} />
                </svg>
                <span
                  style={{
                    fontSize: 18,
                    fontFamily: 'Inter',
                    fontWeight: 500,
                    color: '#ffffff',
                    marginTop: 4,
                  }}
                >
                  {formatCount(postData.like_count || 0)}
                </span>
              </div>

              {/* Comment icon + count */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={1.5}>
                  <path d={ICONS.comment} />
                </svg>
                <span
                  style={{
                    fontSize: 18,
                    fontFamily: 'Inter',
                    fontWeight: 500,
                    color: '#ffffff',
                    marginTop: 4,
                  }}
                >
                  {formatCount(postData.comment_count || 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 600,
        height: 800,
        fonts,
        headers: {
          'Cache-Control': 's-maxage=600, stale-while-revalidate=900',
        },
      }
    );
  } catch (error) {
    console.error(`[OG/POST] Failed to generate OG image for ${postId}:`, error);
    return new Response('Failed to generate image', { status: 500 });
  }
}
