/**
 * Profile Route - /u/[username]
 *
 * Wrapper that imports from /api/profile-v2.
 * This allows the route to work with Next.js App Router's param extraction.
 */

export const runtime = 'edge';

// Re-export the GET handler from api/profile-v2
export { GET } from '../../api/profile-v2/route.js';
