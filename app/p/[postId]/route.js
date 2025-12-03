/**
 * Post Sharing Route - /p/[postId]
 *
 * Wrapper that imports from /api/post and passes the postId via params.
 * This allows the route to work with Next.js App Router's param extraction.
 */

export const runtime = 'edge';

// Re-export the GET handler from api/post
// The URL will be /p/[postId] so the handler can extract postId from pathname
export { GET } from '../../api/post/route.js';
