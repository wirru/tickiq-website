/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable React strict mode for now
  reactStrictMode: false,

  // Rewrites to serve static HTML files
  // We're only using Next.js for API routes (OG images)
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
    ];
  },
};

export default nextConfig;
