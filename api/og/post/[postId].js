/**
 * Post OG Image Generator - Vercel Edge Function
 *
 * Generates dynamic Open Graph images for post sharing.
 * Creates a 3:4 portrait image with the post photo and iOS-style overlays.
 *
 * URL: /api/og/post/{postId}
 *
 * Security:
 * - Validates UUID format for postId
 * - Fetches data via authenticated Supabase Edge Function
 * - No user input is rendered without validation
 *
 * Caching: 10min edge cache, 15min stale-while-revalidate
 * (matches HTML page caching, shorter than 45min token expiry)
 *
 * Note: Uses object format instead of JSX for compatibility with vercel dev
 */

import { ImageResponse } from '@vercel/og';
import {
  truncateText,
  formatCount,
  formatRelativeTime,
  ICONS,
  COLORS,
} from '../../../lib/og-utils.js';


/**
 * Helper function to create element objects (like React.createElement)
 * @param {string} type - Element type (div, span, img, svg, path, p)
 * @param {object} props - Element props including style and children
 * @param {...any} children - Child elements
 * @returns {object} Element object for ImageResponse
 */
function h(type, props, ...children) {
  const flatChildren = children
    .flat()
    .filter((child) => child !== null && child !== undefined && child !== false);

  return {
    type,
    props: {
      ...props,
      children: flatChildren.length === 0
        ? undefined
        : flatChildren.length === 1
          ? flatChildren[0]
          : flatChildren,
    },
  };
}

/**
 * Validate UUID format
 * @param {string} str - String to validate
 * @returns {boolean} True if valid UUID
 */
function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Fetch post data from Supabase Edge Function
 * @param {string} postId - UUID of the post
 * @returns {Promise<object|null>} Post data or null if not found
 */
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
      console.log(`[OG/POST] Post not found or not accessible: ${postId} (status: ${response.status})`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[OG/POST] Failed to fetch post data:', error);
    return null;
  }
}

/**
 * Get the current domain from request URL
 * @param {Request} request - Incoming request
 * @returns {string} Current domain with protocol
 */
function getCurrentDomain(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * Build the OG image element tree
 * @param {object} postData - Post data from Supabase
 * @param {string} imageUrl - URL to the post image
 * @returns {object} Element tree for ImageResponse
 */
function buildImageElement(postData, imageUrl) {
  // Build metadata row children
  const metadataChildren = [];

  // Username pill
  if (postData.author_username) {
    metadataChildren.push(
      h('div', {
        style: {
          background: COLORS.whiteTransparent12,
          borderRadius: 9999,
          padding: '4px 12px',
          display: 'flex',
          alignItems: 'center',
        },
      },
        h('span', {
          style: {
            fontSize: 18,
            fontWeight: 500,
            color: COLORS.white,
          },
        }, `@${postData.author_username}`)
      )
    );
  }

  // Watch name
  if (postData.watch_display_name) {
    metadataChildren.push(
      h('span', {
        style: {
          fontSize: 18,
          fontWeight: 500,
          color: COLORS.whiteTransparent60,
        },
      }, `· ${postData.watch_display_name}`)
    );
  }

  // Timestamp
  if (postData.created_at) {
    metadataChildren.push(
      h('span', {
        style: {
          fontSize: 18,
          fontWeight: 400,
          color: COLORS.whiteTransparent60,
        },
      }, `· ${formatRelativeTime(postData.created_at)}`)
    );
  }

  // Build left side (caption + metadata)
  const leftSideChildren = [];

  // Caption
  if (postData.caption) {
    leftSideChildren.push(
      h('p', {
        style: {
          fontSize: 36,
          fontWeight: 700,
          color: COLORS.white,
          margin: 0,
          marginBottom: 12,
          lineHeight: 1.25,
        },
      }, truncateText(postData.caption, 120))
    );
  }

  // Metadata row
  leftSideChildren.push(
    h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
      },
    }, ...metadataChildren)
  );

  // Build right side (like/comment counts)
  const rightSide = h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
    },
  },
    // Heart icon + count
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      },
    },
      h('svg', {
        width: 32,
        height: 32,
        viewBox: '0 0 24 24',
        fill: COLORS.white,
      },
        h('path', { d: ICONS.heart })
      ),
      h('span', {
        style: {
          fontSize: 18,
          fontWeight: 500,
          color: COLORS.white,
          marginTop: 4,
        },
      }, formatCount(postData.like_count || 0))
    ),
    // Comment icon + count
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      },
    },
      h('svg', {
        width: 32,
        height: 32,
        viewBox: '0 0 24 24',
        fill: COLORS.white,
      },
        h('path', { d: ICONS.comment })
      ),
      h('span', {
        style: {
          fontSize: 18,
          fontWeight: 500,
          color: COLORS.white,
          marginTop: 4,
        },
      }, formatCount(postData.comment_count || 0))
    )
  );

  // Build the full element tree
  return h('div', {
    style: {
      display: 'flex',
      width: '100%',
      height: '100%',
      position: 'relative',
      backgroundColor: COLORS.black,
    },
  },
    // Background image
    h('img', {
      src: imageUrl,
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
      },
    }),
    // Gradient overlay
    h('div', {
      style: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '45%',
        background: `linear-gradient(to bottom, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        padding: 32,
      },
    },
      // Left side
      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          marginRight: 24,
        },
      }, ...leftSideChildren),
      // Right side
      rightSide
    )
  );
}

export default async function handler(request) {
  // Extract postId from URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const postId = pathParts[pathParts.length - 1];

  // Validate postId format
  if (!postId || !isValidUUID(postId)) {
    console.log(`[OG/POST] Invalid post ID format: ${postId}`);
    return new Response('Invalid post ID', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const currentDomain = getCurrentDomain(request);

  try {
    // Fetch post data
    const postData = await fetchPostData(postId);

    if (!postData || !postData.image_token) {
      console.log(`[OG/POST] Post not found or missing image: ${postId}`);
      return new Response('Post not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Build image URL using our image proxy
    const imageUrl = `${currentDomain}/api/img/${postData.image_token}`;

    console.log(`[OG/POST] Generating OG image for post: ${postId}`);

    // Build the element tree
    const element = buildImageElement(postData, imageUrl);

    // Generate the OG image
    return new ImageResponse(element, {
      width: 900,
      height: 1200,
      headers: {
        'Cache-Control': 's-maxage=600, stale-while-revalidate=900',
      },
    });
  } catch (error) {
    console.error(`[OG/POST] Failed to generate OG image for ${postId}:`, error);

    return new Response('Failed to generate image', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
