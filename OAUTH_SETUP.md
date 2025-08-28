# Google OAuth Redirect Relay Setup

This document explains how to set up the OAuth redirect relay for tickIQ using your B23 domain.

## Why This Is Needed

Google OAuth shows "Sign in to [domain]" based on the redirect URI's domain. By using a redirect relay on `tickiq.b23.ai`, users will see "Sign in to tickiq.b23.ai" instead of "Sign in to supabase.co", providing better branding.

## How It Works

1. Google OAuth redirects to: `https://tickiq.b23.ai/api/oauth/google/callback?code=...&state=...`
2. Our Vercel API route receives this request
3. It immediately redirects (302) to Supabase: `https://ifylbjpybfjzimicbldy.supabase.co/auth/v1/callback?code=...&state=...`
4. Supabase handles the authentication as normal

## Setup Steps

### 1. Deploy the Vercel API Route

The API route has been created at: `api/oauth/google/callback.js`

Deploy it to Vercel:

```bash
cd "/Users/willwu/Development/B23, LLC/tickiq-website"
vercel --prod
```

### 2. Update Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your B23 project
3. Navigate to **APIs & Services** → **Credentials**
4. Click on your OAuth 2.0 Client ID
5. In **Authorized redirect URIs**, add:
   ```
   https://tickiq.b23.ai/api/oauth/google/callback
   ```
6. Keep the existing Supabase redirect URI as well (for fallback)
7. Save the changes

### 3. Configure Supabase (No Changes Needed)

Keep your Supabase Google provider configuration exactly as-is:
- Client ID: [Your B23 Google Client ID]
- Client Secret: [Your B23 Google Client Secret]

The relay handles the redirect transparently, so Supabase doesn't need any changes.

### 4. Test the Flow

1. Sign out of the tickIQ app
2. Click "Continue with Google"
3. Check that the Google consent screen shows "Sign in to tickiq.b23.ai"
4. Complete authentication
5. Verify successful login

## Important Notes

- **No query mutation**: The relay passes through all query parameters unchanged
- **Security**: The endpoint only performs a 302 redirect, no data processing
- **HTTPS**: Vercel automatically provides HTTPS for all deployments
- **Rotation**: If you ever change Supabase projects, update the destination URL in `callback.js`

## Troubleshooting

### "redirect_uri_mismatch" Error
- Ensure the exact URL is added to Google Cloud Console
- Check for trailing slashes - use exactly: `https://tickiq.b23.ai/api/oauth/google/callback`

### Users Still See "supabase.co"
- Clear browser cache/cookies
- Verify the Vercel deployment is live
- Check that Google Cloud Console changes are saved

### Authentication Fails
- Check Vercel function logs: `vercel logs`
- Verify the redirect is working: `curl -I https://tickiq.b23.ai/api/oauth/google/callback?test=1`
- Ensure Supabase credentials are still valid

## Benefits

✅ Professional branding - "Sign in to tickiq.b23.ai"
✅ No code changes needed in iOS app
✅ Transparent to Supabase authentication
✅ Free with Vercel's hobby plan
✅ Fast global CDN redirect