# Image Proxy Implementation Plan

## Problem Statement
Watch UUIDs (database primary keys) are exposed in signed image URLs, enabling potential enumeration attacks and database reconnaissance.

Current URL:
```
https://tdnhrbxsxvcoqgfjgddj.supabase.co/storage/v1/object/sign/watch-images/thumbnails/[WATCH-UUID].jpg?token=xxx
```

## Goal
Hide watch UUIDs and Supabase storage URLs from public view while maintaining security and performance.

Target URL:
```
https://tickiq.app/img/[ENCRYPTED-TOKEN]
```

## Architecture

### Flow Diagram
```
Browser requests profile
  ↓
Vercel Edge Function (/api/profile-v2)
  ↓
Supabase Edge Function (get-public-profile-web)
  ↓
1. Generate signed URLs (existing)
  ↓
2. Encrypt each signed URL → token
  ↓
3. Return encrypted tokens as thumbnail_url
  ↓
Vercel renders HTML with: <img src="/img/[ENCRYPTED-TOKEN]">
  ↓
Browser requests image: GET /img/[ENCRYPTED-TOKEN]
  ↓
Vercel Image Proxy (/api/img/[token])
  ↓
1. Decrypt token → extract signed URL
  ↓
2. Fetch image from signed URL
  ↓
3. Return image bytes with cache headers
```

### Key Design Decisions

**1. Token Format: Encrypted Signed URL**
- Token contains the **full signed URL** (not just UUID)
- Encrypted using AES-256-GCM
- No database lookups needed to serve images
- Self-contained and stateless

**2. Encryption Algorithm: AES-256-GCM**
- Industry standard authenticated encryption
- Provides both confidentiality and integrity
- Available in Web Crypto API (Deno + Vercel Edge Runtime)
- Fast and secure

**3. Token Structure**
```json
{
  "url": "https://[supabase].../sign/watch-images/thumbnails/[uuid].jpg?token=xxx",
  "exp": 1763441001
}
```
Encrypted → Base64 URL-safe encoded → Final token

**4. Caching Strategy**

Multiple cache layers:

a. **HTML Cache** (Vercel Edge, 10min)
   - Cached HTML contains encrypted tokens
   - Same tokens served to multiple users during cache window

b. **Image Proxy Cache** (Vercel Edge, 45min)
   - Cache actual image bytes by token
   - Cache-Control: `public, max-age=2700, s-maxage=2700, immutable`
   - Since tokens are unique and expire, can use aggressive caching

c. **Browser Cache**
   - Respects cache headers from proxy
   - `immutable` flag prevents revalidation

**5. Security Properties**

✅ **Hides watch UUIDs** - Not visible in any public URL
✅ **Hides Supabase URLs** - Entire storage path encrypted
✅ **Tamper-proof** - AES-GCM provides authentication
✅ **Time-limited** - Tokens inherit 45min expiration from signed URLs
✅ **Stateless** - No database or KV store needed
✅ **No new secrets exposed** - Encryption key stays server-side only

## Implementation Steps

### Phase 1: Add Encryption Secret (5 minutes)

Both environments need the same secret for encrypt/decrypt.

**Generate a secret:**
```bash
# Generate 32-byte hex string
openssl rand -hex 32
# Example output: 4f2a8b9c1d3e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a
```

**Add to Supabase:**
1. Go to Supabase Dashboard → Project Settings → Edge Functions → Secrets
2. Add secret: `IMAGE_TOKEN_SECRET` = `[your-generated-secret]`
3. Or via CLI: `supabase secrets set IMAGE_TOKEN_SECRET=[secret]`

**Add to Vercel:**
1. Vercel Dashboard → Project Settings → Environment Variables
2. Add: `IMAGE_TOKEN_SECRET` = `[same-secret-as-above]`
3. Apply to: All environments (Production, Preview, Development)

### Phase 2: Create Shared Crypto Utilities

#### 2a. Supabase Edge Function Crypto (Deno)

Create `/Users/willwu/Development/B23, LLC/tickIQ/supabase/functions/_shared/crypto.ts`:

```typescript
/**
 * Image Token Encryption Utilities
 * Uses Web Crypto API (available in Deno)
 */

export interface ImageToken {
  url: string
  exp: number
}

/**
 * Encrypt a signed image URL into a secure token
 */
export async function encryptImageToken(
  signedUrl: string,
  expiresAt: number,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder()

  const data: ImageToken = {
    url: signedUrl,
    exp: expiresAt
  }

  // Generate random IV (12 bytes for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12))

  // Import encryption key
  const keyData = encoder.encode(secret.padEnd(32, '0').substring(0, 32))
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )

  // Encrypt the data
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data))
  )

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)

  // Base64 URL-safe encode
  return base64UrlEncode(combined)
}

/**
 * Decrypt an image token back to signed URL
 */
export async function decryptImageToken(
  token: string,
  secret: string
): Promise<ImageToken> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  // Decode base64 URL
  const combined = base64UrlDecode(token)

  // Extract IV and encrypted data
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)

  // Import decryption key
  const keyData = encoder.encode(secret.padEnd(32, '0').substring(0, 32))
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  )

  // Parse JSON
  const data = JSON.parse(decoder.decode(decrypted))

  // Verify expiration
  const now = Math.floor(Date.now() / 1000)
  if (data.exp && data.exp < now) {
    throw new Error('Token expired')
  }

  return data
}

/**
 * Base64 URL-safe encoding (no padding)
 */
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer))
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Base64 URL-safe decoding
 */
function base64UrlDecode(str: string): Uint8Array {
  // Add padding back
  const padded = str + '=='.substring(0, (4 - str.length % 4) % 4)
  const base64 = padded
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const binary = atob(base64)
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)))
}
```

#### 2b. Vercel Edge Function Crypto (JavaScript)

Create `/Users/willwu/Development/B23, LLC/tickiq-website/lib/crypto.js`:

```javascript
/**
 * Image Token Decryption Utilities
 * Uses Web Crypto API (available in Vercel Edge Runtime)
 */

/**
 * Decrypt an image token back to signed URL
 */
export async function decryptImageToken(token, secret) {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  // Decode base64 URL
  const combined = base64UrlDecode(token)

  // Extract IV and encrypted data
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)

  // Import decryption key
  const keyData = encoder.encode(secret.padEnd(32, '0').substring(0, 32))
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  )

  // Parse JSON
  const data = JSON.parse(decoder.decode(decrypted))

  // Verify expiration
  const now = Math.floor(Date.now() / 1000)
  if (data.exp && data.exp < now) {
    throw new Error('Token expired')
  }

  return data
}

/**
 * Base64 URL-safe decoding
 */
function base64UrlDecode(str) {
  // Add padding back
  const padded = str + '=='.substring(0, (4 - str.length % 4) % 4)
  const base64 = padded
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const binary = atob(base64)
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)))
}
```

### Phase 3: Update Supabase Edge Function

Modify `/Users/willwu/Development/B23, LLC/tickIQ/supabase/functions/get-public-profile-web/index.ts`:

**Add import:**
```typescript
import { encryptImageToken } from '../_shared/crypto.ts'
```

**Replace signed URL generation section** (currently lines 180-204):

```typescript
// Generate signed URLs for all watch thumbnails in parallel
const thumbnailPaths = (watches || [])
  .map(w => w.themed_thumbnail_url || w.themed_image_url)
  .filter(path => path !== null)

// Get encryption secret
const imageTokenSecret = Deno.env.get('IMAGE_TOKEN_SECRET')!

// Calculate expiration timestamp (45 minutes from now)
const expiresAt = Math.floor(Date.now() / 1000) + 2700

const signedUrlPromises = thumbnailPaths.map(async (path) => {
  try {
    // Use service role client to generate signed URLs (bypasses RLS)
    // This is safe because we've already verified the profile is public above
    const { data, error } = await supabaseServiceRole
      .storage
      .from('watch-images')
      .createSignedUrl(path, 2700) // 45 minutes = 2700 seconds

    if (error) {
      console.error(`[WEB] Error signing ${path}:`, error)
      return { path, url: null }
    }

    // Encrypt the signed URL into a token
    try {
      const encryptedToken = await encryptImageToken(
        data.signedUrl,
        expiresAt,
        imageTokenSecret
      )

      // Return token instead of signed URL
      return { path, url: encryptedToken }
    } catch (encryptError) {
      console.error(`[WEB] Error encrypting token for ${path}:`, encryptError)
      return { path, url: null }
    }
  } catch (error) {
    console.error(`[WEB] Exception signing ${path}:`, error)
    return { path, url: null }
  }
})

const signedUrlResults = await Promise.all(signedUrlPromises)
const signedUrlMap = Object.fromEntries(
  signedUrlResults.map(r => [r.path, r.url])
)

const successfulTokens = signedUrlResults.filter(r => r.url !== null).length
console.log(`[WEB] Generated ${successfulTokens}/${thumbnailPaths.length} encrypted image tokens (expire in 45min)`)
```

**Update formatted watches** (line ~251):

```typescript
// Get encrypted token from our pre-generated map
// This will be used as: /img/[token] in the HTML
const thumbnailToken = thumbnailPath ? signedUrlMap[thumbnailPath] : null

return {
  id: watch.id,
  make: watch.make,
  model: watch.model,
  reference_number: watch.reference_number,
  thumbnail_url: thumbnailToken,  // Now returns encrypted token, not URL
  latest_measurement: latestMeasurement ? {
    rate: latestMeasurement.current_rate,
    created_at: latestMeasurement.created_at
  } : null,
  measurement_count: watchMeasurements.length
}
```

### Phase 4: Update Vercel Profile Rendering

Modify `/Users/willwu/Development/B23, LLC/tickiq-website/api/profile-v2.js`:

**In the `renderProfileHTML` function**, update the watch card image rendering:

Find the section that renders watch images (around line 150-200 in the template) and change:

From:
```javascript
${watch.thumbnail_url ? `<img src="${watch.thumbnail_url}" alt="${watchName}">` : watchIcon}
```

To:
```javascript
${watch.thumbnail_url ? `<img src="/img/${watch.thumbnail_url}" alt="${watchName}">` : watchIcon}
```

This changes the image source from a Supabase URL to `/img/[ENCRYPTED-TOKEN]`.

### Phase 5: Create Vercel Image Proxy

Create `/Users/willwu/Development/B23, LLC/tickiq-website/api/img/[token].js`:

```javascript
/**
 * Image Proxy Edge Function
 *
 * Decrypts encrypted image tokens and proxies the actual images from Supabase Storage.
 * This hides watch UUIDs and Supabase storage URLs from public view.
 *
 * URL format: /img/[ENCRYPTED-TOKEN]
 *
 * Security:
 * - Token contains encrypted signed Supabase Storage URL
 * - Tokens expire after 45 minutes (inherited from signed URL)
 * - No database lookups needed - fully stateless
 *
 * Caching:
 * - Aggressive edge caching (45min) since tokens are unique and immutable
 * - Browser caching with immutable flag
 */

import { decryptImageToken } from '../../lib/crypto.js'

export const config = {
  runtime: 'edge',
}

export default async function handler(request) {
  const url = new URL(request.url)
  const pathParts = url.pathname.split('/')
  const token = pathParts[pathParts.length - 1]

  if (!token || token.trim() === '') {
    return new Response('Token required', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  try {
    // Get encryption secret
    const imageTokenSecret = process.env.IMAGE_TOKEN_SECRET

    if (!imageTokenSecret) {
      console.error('[IMG-PROXY] Missing IMAGE_TOKEN_SECRET environment variable')
      return new Response('Server configuration error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    // Decrypt token to get signed URL
    let imageData
    try {
      imageData = await decryptImageToken(token, imageTokenSecret)
    } catch (decryptError) {
      console.error('[IMG-PROXY] Decryption failed:', decryptError.message)

      // Check if it's an expiration error
      if (decryptError.message === 'Token expired') {
        return new Response('Image URL expired', {
          status: 410, // Gone
          headers: { 'Content-Type': 'text/plain' },
        })
      }

      return new Response('Invalid token', {
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    const { url: signedUrl, exp } = imageData

    console.log(`[IMG-PROXY] Fetching image from signed URL (expires: ${new Date(exp * 1000).toISOString()})`)

    // Fetch the image from Supabase Storage using signed URL
    const imageResponse = await fetch(signedUrl)

    if (!imageResponse.ok) {
      console.error(`[IMG-PROXY] Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`)

      if (imageResponse.status === 404) {
        return new Response('Image not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        })
      }

      if (imageResponse.status === 403 || imageResponse.status === 401) {
        return new Response('Image URL expired or invalid', {
          status: 410,
          headers: { 'Content-Type': 'text/plain' },
        })
      }

      return new Response('Failed to fetch image', {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    // Get image content type from Supabase response
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'

    // Get image bytes
    const imageBytes = await imageResponse.arrayBuffer()

    console.log(`[IMG-PROXY] Successfully proxied image (${imageBytes.byteLength} bytes, ${contentType})`)

    // Calculate time until expiration for cache headers
    const now = Math.floor(Date.now() / 1000)
    const secondsUntilExpiry = exp - now
    const maxAge = Math.max(0, secondsUntilExpiry)

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
    })

  } catch (error) {
    console.error('[IMG-PROXY] Unexpected error:', error)
    return new Response('Internal server error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}
```

### Phase 6: Update Vercel Routing Configuration

The catch-all route `/img/[token]` should work automatically with Vercel's file-based routing.

Verify in `vercel.json` that there are no conflicting rewrites. The current rewrites are:
```json
{
  "rewrites": [
    {
      "source": "/apple-app-site-association",
      "destination": "/.well-known/apple-app-site-association"
    },
    {
      "source": "/u/:username",
      "destination": "/api/profile-v2"
    },
    {
      "source": "/p/:postId",
      "destination": "/api/post"
    }
  ]
}
```

No conflicts - `/img/*` will route to `/api/img/[token].js` automatically.

## Testing Strategy

### Test 1: Verify Encryption/Decryption

**In Supabase Edge Function:**
```bash
# Deploy function
./deploy-dev.sh functions get-public-profile-web

# Check logs for "Generated X encrypted image tokens"
```

**Test decryption locally:**
```javascript
// In browser console on profile page
const token = window.__PROFILE_DATA__.watches[0].thumbnail_url
console.log('Token length:', token.length)
console.log('Token format:', /^[A-Za-z0-9_-]+$/.test(token) ? 'Valid base64url' : 'Invalid')
```

### Test 2: Verify Image Proxy

**Test URL manually:**
```bash
# Get a token from the profile page
TOKEN="[encrypted-token-from-page]"

# Test image proxy
curl -I "https://[preview-url]/img/${TOKEN}"

# Should return:
# HTTP/2 200
# content-type: image/jpeg
# cache-control: public, max-age=2700, s-maxage=2700, immutable
```

### Test 3: Verify No UUID Leakage

**Check page source:**
```bash
curl "https://[preview-url]/u/will" | grep -o "3ef619e1-96ed-47df-8cb9-5f4c87c0ed12"
# Should return nothing
```

**Check image URLs:**
```javascript
// In browser console
window.__PROFILE_DATA__.watches.forEach(w => {
  if (w.thumbnail_url) {
    const hasUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(w.thumbnail_url)
    console.log(hasUuid ? '❌ UUID LEAKED' : '✅ UUID hidden', w.make, w.model)
  }
})
```

### Test 4: Verify Performance

**Check cache behavior:**
```bash
# First request - should be MISS
curl -I "https://[preview-url]/img/[TOKEN]" | grep -i cache

# Second request - should be HIT
curl -I "https://[preview-url]/img/[TOKEN]" | grep -i cache
```

**Check image load times:**
- Open DevTools → Network → Images
- Look for `/img/*` requests
- Should be fast (cached after first load)

### Test 5: Verify Expiration Handling

**Wait 45+ minutes and test:**
```bash
# Token should be expired
curl "https://[preview-url]/img/[OLD-TOKEN]"
# Should return: 410 Gone - "Token expired"
```

### Test 6: End-to-End Visual Test

1. Visit profile page
2. All watch images should load
3. Inspect image URLs in browser:
   - Should be `/img/[ENCRYPTED-TOKEN]`
   - No UUIDs visible
   - No Supabase URLs visible
4. Test on mobile
5. Test in incognito (fresh cache)

## Deployment Checklist

- [ ] Generate `IMAGE_TOKEN_SECRET` (32-byte hex)
- [ ] Add secret to Supabase Dashboard → Secrets
- [ ] Add secret to Vercel Dashboard → Environment Variables
- [ ] Create `/supabase/functions/_shared/crypto.ts`
- [ ] Update `/supabase/functions/get-public-profile-web/index.ts`
- [ ] Deploy Supabase Edge Function: `./deploy-dev.sh functions get-public-profile-web`
- [ ] Create `/lib/crypto.js`
- [ ] Create `/api/img/[token].js`
- [ ] Update `/api/profile-v2.js` image URLs
- [ ] Commit and push to GitHub (triggers Vercel deploy)
- [ ] Test encrypted tokens are generated
- [ ] Test image proxy works
- [ ] Verify no UUID leakage
- [ ] Test cache behavior
- [ ] Monitor Vercel and Supabase logs for errors

## Performance Characteristics

**Expected Latency:**
- First image load: ~200-400ms (Vercel edge → Supabase storage)
- Cached image load: ~10-50ms (Vercel edge cache)
- Browser cached: ~1ms (from disk cache)

**Cache Hit Rates:**
- Vercel HTML cache: ~98% (10min window, most users visit once)
- Image proxy cache: ~95% (45min window, tokens reused during HTML cache)
- Browser cache: ~99% (until user navigates away)

**Cost Impact:**
- Vercel bandwidth: Proxy adds image bytes to Vercel bandwidth (vs direct Supabase)
- Vercel function invocations: One per unique image token (not per page view)
- Supabase bandwidth: Same as before (images still fetched from Supabase)

## Security Analysis

### Threat Model

**What we're protecting against:**
- ✅ Watch UUID enumeration
- ✅ Database primary key exposure
- ✅ Storage path reconnaissance
- ✅ Direct Supabase URL access

**What we're NOT protecting against:**
- ❌ Determined attacker downloading all images during 45min window
- ❌ User sharing direct image links (tokens expire anyway)
- ❌ Screenshot/screen recording of images

### Attack Vectors Considered

**1. Token Replay Attack**
- Attacker copies token and reuses it
- ✅ Mitigated: Tokens expire in 45min
- ✅ Mitigated: Tokens are single-use in practice (cache makes reuse unnecessary)

**2. Token Brute Force**
- Attacker tries random tokens to find valid images
- ✅ Mitigated: 256-bit AES key space = 2^256 possibilities (impossible)
- ✅ Mitigated: Tokens expire quickly (moving target)

**3. Token Decryption**
- Attacker tries to decrypt token without secret
- ✅ Mitigated: AES-256-GCM is cryptographically secure
- ✅ Mitigated: Secret stored in env vars (not in code)

**4. Side-Channel Timing Attacks**
- Attacker measures decryption timing to infer secret
- ✅ Mitigated: Web Crypto API uses constant-time operations
- ⚠️ Monitor: Unusual patterns in proxy logs

**5. Token Tampering**
- Attacker modifies token to access different images
- ✅ Mitigated: GCM authentication tag prevents tampering
- ✅ Mitigated: Modified tokens fail decryption

### Encryption Key Management

**Secret Rotation Plan:**

If `IMAGE_TOKEN_SECRET` is compromised:

1. Generate new secret: `openssl rand -hex 32`
2. Add new secret to both Supabase and Vercel
3. Optionally: Keep old secret for grace period (dual-key support)
4. Deploy updated functions
5. After 45min (all old tokens expired), remove old secret

**Best Practices:**
- Never log the secret
- Never commit to git
- Rotate yearly or if suspected compromise
- Use different secrets for DEV/PROD environments

## Rollback Plan

If image proxy causes issues:

### Quick Disable (5 minutes)

**Option A: Revert Supabase Function**
```bash
cd /Users/willwu/Development/B23, LLC/tickIQ
git checkout HEAD~1 supabase/functions/get-public-profile-web/index.ts
./deploy-dev.sh functions get-public-profile-web
```

This reverts to returning signed URLs instead of encrypted tokens.

**Option B: Emergency Fix in Vercel**

Modify `/api/profile-v2.js` to detect if `thumbnail_url` is a token or URL:
```javascript
// If thumbnail_url starts with http, use it directly (old behavior)
// If it's a token, use /img/ proxy (new behavior)
const imgSrc = watch.thumbnail_url?.startsWith('http')
  ? watch.thumbnail_url
  : `/img/${watch.thumbnail_url}`
```

### Full Rollback (15 minutes)

1. Revert Supabase Edge Function (above)
2. Delete `/api/img/[token].js`
3. Revert `/api/profile-v2.js` image rendering
4. Commit and push
5. Verify images load with UUIDs visible (original state)

## Future Enhancements

### 1. Token Compression
Currently tokens are ~300-400 characters. Could compress:
- Use shorter JSON format
- Compress before encryption
- Target: <200 characters

### 2. Multi-Resolution Support
Proxy could resize images on-the-fly:
```
/img/[token]?size=small   → 200px wide
/img/[token]?size=medium  → 500px wide
/img/[token]?size=large   → original
```

### 3. WebP Conversion
Convert JPEG to WebP for better compression:
```javascript
// In image proxy
if (request.headers.get('accept')?.includes('image/webp')) {
  // Convert to WebP using Sharp or similar
}
```

### 4. Rate Limiting
Add per-IP rate limiting to prevent abuse:
```javascript
import { Ratelimit } from '@upstash/ratelimit'
// Limit: 100 image requests per minute per IP
```

### 5. Analytics
Track image proxy usage:
- Most requested images
- Cache hit rates
- Error rates
- Geographic distribution

### 6. Placeholder Images
For failed/missing images, return a nice placeholder:
```javascript
if (imageResponse.status === 404) {
  return fetch('/images/watch-placeholder.jpg')
}
```

## Success Metrics

After deployment, verify:

- [ ] Zero UUID leaks in public URLs
- [ ] Images load successfully (>99% success rate)
- [ ] Average image load time < 500ms
- [ ] Cache hit rate > 90%
- [ ] No security errors in logs
- [ ] No user complaints about missing images

## References

- [Web Crypto API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [AES-GCM Encryption (NIST)](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [Vercel Edge Runtime](https://vercel.com/docs/functions/edge-functions/edge-runtime)
- [Supabase Edge Functions (Deno)](https://supabase.com/docs/guides/functions)
- [Base64 URL Encoding (RFC 4648)](https://tools.ietf.org/html/rfc4648#section-5)
