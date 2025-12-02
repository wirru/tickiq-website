import { ImageResponse } from 'next/og';

/**
 * Post OG Image Generator
 * Generates dynamic Open Graph images for post sharing.
 * Creates a 3:4 portrait image with the post photo and iOS-style overlays.
 */

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

// SVG icon paths
const ICONS = {
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  comment: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
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
    // Fetch post data from Supabase
    const postData = await fetchPostData(postId);

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
              {/* Caption */}
              {postData.caption && (
                <p
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    color: '#ffffff',
                    margin: 0,
                    marginBottom: 12,
                    lineHeight: 1.25,
                  }}
                >
                  {truncateText(postData.caption, 120)}
                </p>
              )}

              {/* Metadata row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
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
                        fontWeight: 500,
                        color: '#ffffff',
                      }}
                    >
                      @{postData.author_username}
                    </span>
                  </div>
                )}

                {/* Watch name */}
                {postData.watch_display_name && (
                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: 500,
                      color: 'rgba(255, 255, 255, 0.6)',
                    }}
                  >
                    · {postData.watch_display_name}
                  </span>
                )}

                {/* Timestamp */}
                {postData.created_at && (
                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: 400,
                      color: 'rgba(255, 255, 255, 0.6)',
                    }}
                  >
                    · {formatRelativeTime(postData.created_at)}
                  </span>
                )}
              </div>
            </div>

            {/* Right side: Like/comment counts */}
            <div
              style={{
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
                <svg width={32} height={32} viewBox="0 0 24 24" fill="#ffffff">
                  <path d={ICONS.heart} />
                </svg>
                <span
                  style={{
                    fontSize: 18,
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
                <svg width={32} height={32} viewBox="0 0 24 24" fill="#ffffff">
                  <path d={ICONS.comment} />
                </svg>
                <span
                  style={{
                    fontSize: 18,
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
        width: 900,
        height: 1200,
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
