/**
 * Image Proxy - Next.js App Router
 *
 * Decrypts encrypted image tokens and proxies the actual images from Supabase Storage.
 * This hides watch UUIDs and Supabase storage URLs from public view.
 *
 * URL format: /api/img/[ENCRYPTED-TOKEN]
 *
 * Security:
 * - Token contains encrypted signed Supabase Storage URL
 * - Tokens expire after 45 minutes (inherited from signed URL)
 * - No database lookups needed - fully stateless
 *
 * Caching:
 * - Aggressive edge caching (up to 45min) since tokens are unique and immutable
 * - Browser caching with public cache-control
 */

import { decryptImageToken } from '../../../../lib/crypto.js';

export const runtime = 'edge';

export async function GET(request, { params }) {
  const { token } = await params;

  if (!token || token.trim() === '') {
    return new Response('Token required', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  try {
    // Get encryption secret
    const imageTokenSecret = process.env.IMAGE_TOKEN_SECRET;

    if (!imageTokenSecret) {
      console.error('[IMG-PROXY] Missing IMAGE_TOKEN_SECRET environment variable');
      return new Response('Server configuration error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Decrypt token to get signed URL
    let imageData;
    try {
      imageData = await decryptImageToken(token, imageTokenSecret);
    } catch (decryptError) {
      console.error('[IMG-PROXY] Decryption failed:', decryptError.message);

      // Check if it's an expiration error
      if (decryptError.message === 'Token expired') {
        return new Response('Image URL expired', {
          status: 410, // Gone
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      return new Response('Invalid token', {
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const { url: signedUrl, exp } = imageData;

    console.log(`[IMG-PROXY] Fetching image from signed URL (expires: ${new Date(exp * 1000).toISOString()})`);

    // Fetch the image from Supabase Storage using signed URL
    const imageResponse = await fetch(signedUrl);

    if (!imageResponse.ok) {
      console.error(`[IMG-PROXY] Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);

      if (imageResponse.status === 404) {
        return new Response('Image not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      if (imageResponse.status === 403 || imageResponse.status === 401) {
        return new Response('Image URL expired or invalid', {
          status: 410,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      return new Response('Failed to fetch image', {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Get image content type from Supabase response
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

    // Get image bytes
    const imageBytes = await imageResponse.arrayBuffer();

    console.log(`[IMG-PROXY] Successfully proxied image (${imageBytes.byteLength} bytes, ${contentType})`);

    // Calculate time until expiration for cache headers
    const now = Math.floor(Date.now() / 1000);
    const secondsUntilExpiry = exp - now;
    const maxAge = Math.max(0, secondsUntilExpiry);

    // Return image with aggressive caching
    // Since tokens are unique and expire, we can cache aggressively
    return new Response(imageBytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Cache at edge and browser for full token lifetime
        'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, immutable`,
        // Security headers
        'X-Content-Type-Options': 'nosniff',
        // Allow CORS for images
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('[IMG-PROXY] Unexpected error:', error);
    return new Response('Internal server error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
