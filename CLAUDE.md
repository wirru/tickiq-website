# tickIQ Website

## Project Overview
Official website for tickIQ - a professional iOS app for mechanical watch timing analysis. Features AI-powered watch identification, chronometer-precision measurements, and cloud-synchronized collection management.

## Live Site
- **Production URLs**:
  - https://tickiq.app (primary)
  - https://tickiq.b23.ai (secondary)
- **Parent Company**: B23, LLC (https://www.b23.ai)

## Tech Stack
- **Hosting**: Vercel
- **Framework**: Static HTML/CSS
- **Font**: Inter (Google Fonts)
- **Design**: Minimalist black and white, consistent with B23 brand

## Project Structure
```
tickiq-website/
├── index.html                    # Main landing page
├── styles.css                    # Global styling
├── profile-v2.html              # Public profile template (SSR)
├── post.html                    # Post sharing template
├── api/
│   ├── profile-v2.js            # Profile V2 Edge Function (SSR + data fetching)
│   ├── post.js                  # Post sharing Edge Function
│   └── img/
│       └── [token].js           # Image proxy (decrypts & serves images)
├── lib/
│   └── crypto.js                # AES-256-GCM decryption for image tokens
├── scripts/
│   └── build-edge-function.js   # Embeds HTML into Edge Functions
├── vercel.json                  # Routing & security headers
├── package.json                 # Dependencies and scripts
└── CLAUDE.md                    # Project documentation
```

## Key Design Elements
- **App Logo**: Circle with checkmark icon (200x200px SVG)
- **B23 Brand**: Small B23 logo in header linking to parent company
- **Typography**: Inter font with multiple weights
- **Color Scheme**: Black (#000000) on white (#ffffff) with gray accents
- **Animations**: Fade-in and scale-in effects on load
- **Responsive**: Mobile-optimized with breakpoints at 768px and 480px

## Deployment Process

### Build Process
The project includes an Edge Function that requires building before deployment:
1. **Build Script**: `scripts/build-edge-function.js` embeds the `profile.html` content into the Edge Function
2. **Automatic Build**: Both `npm run deploy` and `npm run deploy:prod` automatically run the build first
3. **Git Deployment**: When pushing to Git, Vercel automatically runs the build process

### Deployment Commands
```bash
# Install dependencies
npm install

# Deploy to preview (includes automatic build)
npm run deploy

# Deploy to production (includes automatic build)
npm run deploy:prod

# Login to Vercel (if needed)
vercel login
```

### Important Notes
- **No manual build needed**: Never run `npm run build` manually - it's automatic
- **Preview Authentication**: Disable Vercel Authentication on preview deployments to test social sharing
- **Build Output**: The Edge Function gets the HTML embedded during build, no filesystem access needed

## Domain Configuration
Both domains are managed through Vercel:
1. Add domains in Vercel dashboard (Project Settings > Domains)
2. Configure DNS records at your domain registrar to point to Vercel
3. SSL certificates automatically provisioned by Vercel for all domains

## Contact Information
- **Product Email**: tickiq@b23.ai
- **Company Email**: hi@b23.ai

## Content Details
- **Product Name**: tickIQ
- **Tagline**: "Professional watch timing. AI-powered insights."
- **Status**: Now Available on iOS
- **Description**: Professional mechanical watch timing app with chronometer precision
- **Key Features**:
  - Professional timegrapher with ±0.5ms beat error precision
  - AI-powered watch identification using GPT-4 Vision
  - Real-time measurement visualization
  - Cloud-synchronized watch collection
  - Machine learning signal detection
- **Technical Specs**:
  - BPH Range: 12,000 - 72,000
  - Rate Accuracy: ±6 s/d
  - Beat Error: ±0.5 ms
  - Amplitude: 200-360°

## Public Profiles V2 Architecture

### Overview
Public profile pages (`/u/username`) display a user's watch collection on the web for anonymous visitors. This is a complete Server-Side Rendered (SSR) experience that fetches real data from Supabase and displays watches, measurements, and statistics.

**Current Status**: ✅ Deployed to DEV environment
**Branch**: `public-profiles-v2`
**Key Feature**: Encrypted image tokens to hide watch UUIDs (database primary keys)

### Full Architecture

```
User visits: https://tickiq.app/u/username
    ↓
Vercel Edge Function (/api/profile-v2)
    ↓
Supabase Edge Function (get-public-profile-web)
    ↓
Database (with RLS policies)
    ↓
Returns: profile data + encrypted image tokens
    ↓
Vercel renders HTML with embedded data
    ↓
Browser displays watch collection
    ↓
Images load via: /api/img/[encrypted-token]
    ↓
Image Proxy decrypts token → fetches from Supabase Storage → returns image
```

### Components

#### 1. Vercel Edge Function (`/api/profile-v2.js`)
**Purpose**: Server-Side Rendering with data fetching

**Flow**:
1. Extract username from URL path
2. Call Supabase Edge Function with anon key
3. Receive profile data with encrypted image tokens
4. Render HTML with embedded data
5. Return with cache headers (10min edge cache, 15min stale-while-revalidate)

**Key Features**:
- ✅ Server-side data fetching
- ✅ SEO-friendly (data in HTML)
- ✅ Error handling (404 for private/non-existent profiles)
- ✅ HTML escaping for security
- ✅ `noindex,nofollow` meta tags (social sharing focus, not SEO)

#### 2. Supabase Edge Function (`get-public-profile-web`)
**Location**: `/Users/willwu/Development/B23, LLC/tickIQ/supabase/functions/get-public-profile-web/`

**Purpose**: Fetch public profile data and generate encrypted image tokens

**Flow**:
1. Verify profile has `include_in_public_feed = true`
2. Fetch watches and measurements (RLS enforced)
3. Generate signed URLs for thumbnails using service role key
4. Encrypt signed URLs using AES-256-GCM
5. Return profile data with encrypted tokens

**Security Features**:
- ✅ RLS policies enforce `include_in_public_feed` flag
- ✅ Service role key used ONLY after verifying profile is public
- ✅ Signed URLs encrypted to hide watch UUIDs
- ✅ Returns 404 for private profiles
- ✅ Logging prefixed with `[WEB]` for monitoring

**Response Format**:
```json
{
  "profile": {
    "username": "will",
    "created_at": "2024-07-01T00:00:00Z"
  },
  "stats": {
    "watch_count": 5,
    "measurement_count": 23,
    "average_rate": 2.5
  },
  "watches": [
    {
      "id": "uuid",
      "make": "Rolex",
      "model": "Submariner",
      "reference_number": "116610LN",
      "thumbnail_url": "ENCRYPTED_TOKEN_HERE",  // Not actual URL!
      "latest_measurement": {
        "rate": 2.3,
        "created_at": "2024-11-01T00:00:00Z"
      },
      "measurement_count": 8
    }
  ]
}
```

#### 3. Image Proxy (`/api/img/[token].js`)
**Purpose**: Decrypt encrypted image tokens and proxy actual images from Supabase Storage

**Why This Exists**:
- Watch UUIDs are database primary keys
- Exposing them enables enumeration attacks and database reconnaissance
- Solution: Encrypt the entire signed URL into a token

**Flow**:
1. Receive encrypted token from URL: `/api/img/abc123def456...`
2. Decrypt token using `IMAGE_TOKEN_SECRET` (AES-256-GCM)
3. Extract signed Supabase Storage URL
4. Fetch image from Supabase Storage
5. Return image bytes with aggressive cache headers

**Security Benefits**:
- ✅ Watch UUIDs completely hidden from public view
- ✅ Supabase storage URLs not exposed
- ✅ Tokens expire in 45 minutes
- ✅ AES-256-GCM provides tamper-proof authentication
- ✅ Storage bucket remains private (RLS unchanged)

**Performance**:
- Cache-Control: `public, max-age=2700, s-maxage=2700, immutable`
- Tokens are unique per generation, so aggressive caching is safe
- Expected cache hit rate: >95%

#### 4. Encryption Utilities

**Supabase Side** (`crypto.ts`):
- `encryptImageToken()` - Encrypts signed URLs into tokens
- Uses Web Crypto API (available in Deno)
- AES-256-GCM with random IV
- Base64 URL-safe encoding

**Vercel Side** (`lib/crypto.js`):
- `decryptImageToken()` - Decrypts tokens back to signed URLs
- Uses Web Crypto API (available in Edge Runtime)
- Validates expiration timestamp
- Returns signed URL for proxying

### Environment Variables

**Vercel** (tickiq-website):
- `SUPABASE_URL` - Points to Supabase project (DEV for Preview, PROD for production)
- `SUPABASE_ANON_KEY` - Anon key for calling Supabase Edge Function
- `IMAGE_TOKEN_SECRET` - 32-byte encryption key (shared with Supabase)

**Supabase** (Edge Functions):
- `SUPABASE_URL` - Auto-provided
- `SUPABASE_ANON_KEY` - Auto-provided
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-provided (used for signed URLs)
- `IMAGE_TOKEN_SECRET` - 32-byte encryption key (manually added secret)

### Build Process

**Script**: `scripts/build-edge-function.js`

**What it does**:
1. Reads `profile-v2.html` template
2. Embeds HTML into `api/profile-v2.js` as template literal
3. Escapes special characters (backticks, ${}, backslashes)
4. Same process for `post.js`

**When it runs**:
- Automatically on `npm run deploy`
- Automatically on `npm run deploy:prod`
- Automatically when Vercel builds from Git

### Routing Configuration

**File**: `vercel.json`

```json
{
  "rewrites": [
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

**Image Proxy Routing**:
- `/api/img/[token]` → Handled by `/api/img/[token].js` (Vercel's file-based routing)
- No rewrite needed, works automatically

### Caching Strategy

**HTML Page** (Vercel Edge):
- `s-maxage=600` (10 minutes edge cache)
- `stale-while-revalidate=900` (15 minutes grace period)
- Total cache window: 25 minutes
- Reduces Supabase invocations by ~98%

**Images** (Image Proxy):
- `max-age=2700, s-maxage=2700, immutable` (45 minutes)
- Tokens are unique, so aggressive caching is safe
- Browser cache + edge cache for optimal performance

**Why These Durations**:
- Tokens expire in 45 minutes (must be longer than HTML cache)
- Safety margin: 45min (tokens) > 25min (max HTML cache) = 20min buffer
- Balances freshness with performance

### Security Layers

1. **RLS Policies** (PostgreSQL) - Database-level enforcement
   - Only profiles with `include_in_public_feed = true` are accessible
   - Watches and measurements follow profile visibility

2. **Privacy Flag Check** (Supabase Function) - Defense in depth
   - Explicitly checks `include_in_public_feed` before returning data
   - Returns 404 for private profiles

3. **Service Role Key** (Supabase Function) - Controlled elevation
   - Used ONLY after verifying profile is public
   - Generates signed URLs that bypass RLS (safe because already verified)
   - Never exposed to client or Vercel

4. **Encrypted Tokens** (Image Proxy) - UUID protection
   - Watch UUIDs completely hidden from public view
   - AES-256-GCM prevents tampering and reverse engineering
   - Tokens expire in 45 minutes

5. **HTML Escaping** (Vercel Edge) - XSS prevention
   - All user-generated content escaped
   - Prevents injection attacks

### Testing

#### Local Testing (Supabase)
```bash
cd /Users/willwu/Development/B23, LLC/tickIQ
supabase functions serve get-public-profile-web
curl "http://localhost:54321/functions/v1/get-public-profile-web/will" \
  -H "Authorization: Bearer ANON_KEY"
```

#### Local Testing (Vercel)
```bash
cd /Users/willwu/Development/B23, LLC/tickiq-website
npm run build
vercel dev
# Visit: http://localhost:3000/u/will
```

#### Preview Deployment Testing
1. Run `npm run deploy`
2. Visit preview URL: `https://[preview-url]/u/will`
3. Check browser console for encrypted tokens
4. Verify images load with `/api/img/[token]` URLs
5. Confirm no UUIDs in page source or Network tab

#### Verification Commands
```javascript
// In browser console on profile page

// Check tokens are encrypted (not UUIDs)
window.__PROFILE_DATA__.watches[0].thumbnail_url.match(/[0-9a-f]{8}-[0-9a-f]{4}/)
// Should return: null (no UUIDs found)

// Verify token format
const token = window.__PROFILE_DATA__.watches[0].thumbnail_url
console.log('Token length:', token.length)  // ~655 chars
console.log('Valid base64url:', /^[A-Za-z0-9_-]+$/.test(token))  // true
```

### Deployment

#### Deploy Supabase Edge Function
```bash
cd /Users/willwu/Development/B23, LLC/tickIQ
./deploy-dev.sh functions get-public-profile-web  # For DEV
# OR
./deploy-prod.sh functions get-public-profile-web  # For PROD
```

#### Deploy Vercel (Automatic)
```bash
cd /Users/willwu/Development/B23, LLC/tickiq-website
git add .
git commit -m "Update public profiles"
git push origin public-profiles-v2
# Vercel automatically builds and deploys
```

### Troubleshooting

**Images not loading (404)**:
- Check `IMAGE_TOKEN_SECRET` is set in both Supabase and Vercel
- Verify token format in browser console (should be base64url)
- Check Vercel logs for decryption errors
- Ensure Supabase Edge Function deployed successfully

**UUIDs still visible**:
- Verify using latest deployed version of Supabase function
- Check encryption is working: token length should be ~655 chars
- Confirm image URLs use `/api/img/[token]` not direct Supabase URLs

**Profile shows as private when it's public**:
- Verify `include_in_public_feed = true` in database
- Check Supabase Edge Function logs for privacy check
- Ensure RLS policies allow anon access to profiles table

### Performance Metrics

**Expected**:
- Page load time (LCP): < 2 seconds
- Edge cache hit rate: > 90%
- Image load time: < 500ms (first load), ~0ms (cached)
- Token generation overhead: +100ms per profile request
- Image proxy overhead: +50ms per image (first load)

**Current (DEV)**:
- ✅ Images loading successfully (200 OK)
- ✅ Cache working (memory cache, 0ms subsequent loads)
- ✅ No UUID leakage verified
- ✅ Mobile responsive

## Security Headers
Configured in vercel.json:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block

## Future Enhancements

### Public Profiles V2
- [ ] Deploy to production (merge `public-profiles-v2` → `main`)
- [ ] User opt-in for SEO indexing (remove `noindex` for opted-in users)
- [ ] Rate limiting (IP-based, 60 req/min per IP)
- [ ] Analytics (track profile views, popular watches)
- [ ] Watch detail modal (click to see full measurements)
- [ ] Measurement graphs/charts
- [ ] User bio/description field
- [ ] Avatar/profile photo

### Image Proxy Enhancements
- [ ] Cloudflare Worker proxy (better than Vercel for images long-term)
- [ ] Image optimization (WebP, AVIF conversion)
- [ ] Multi-resolution support (small/medium/large)
- [ ] Watermarking for public images
- [ ] Advanced rate limiting per IP

### Website General
- [ ] Add product features section to landing page
- [ ] Include demo request form
- [ ] Add pricing information
- [ ] Implement email capture for launch notifications

## Development Notes
- Maintains consistency with B23 parent brand
- Designed for minimal load time and maximum performance
- No build process required - pure static files
- Ready for immediate deployment to Vercel