// Vercel API route for Google OAuth redirect relay
// Handles requests to https://tickiq.b23.ai/api/oauth/google/callback

export default async function handler(req, res) {
  // Extract query string from the incoming request
  const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  
  // Build the Supabase callback URL with the preserved query string
  const dest = 'https://ifylbjpybfjzimicbldy.supabase.co/auth/v1/callback' + qs;
  
  // Redirect to Supabase with a 302 temporary redirect
  res.redirect(302, dest);
}