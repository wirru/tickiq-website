/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable React strict mode for now
  reactStrictMode: false,

  // Rewrites to serve static HTML files and dynamic routes
  async rewrites() {
    return [
      // Serve index.html for root
      {
        source: '/',
        destination: '/index.html',
      },
      // Serve other static pages
      {
        source: '/about',
        destination: '/about.html',
      },
      {
        source: '/business',
        destination: '/business.html',
      },
      {
        source: '/help',
        destination: '/help.html',
      },
      {
        source: '/privacy',
        destination: '/privacy.html',
      },
      {
        source: '/terms',
        destination: '/terms.html',
      },
      // Dynamic routes handled by App Router:
      // /p/[postId] -> app/p/[postId]/route.js
      // /u/[username] -> app/u/[username]/route.js
      // /u-preview/[username] -> app/u-preview/[username]/route.js
    ];
  },
};

export default nextConfig;
