# tickIQ Website

## Project Overview
Official website for tickIQ - a professional iOS app for mechanical watch timing analysis. Features AI-powered watch identification, chronometer-precision measurements, and cloud-synchronized collection management.

## Live Site
- **Production URLs**:
  - https://tickiq.app (primary)
  - https://tickiq.b23.ai (secondary)
- **Parent Company**: B23, LLC (https://www.b23.ai)

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Runtime**: Vercel Edge Runtime
- **Hosting**: Vercel
- **OG Images**: `@vercel/og` (dynamic generation)
- **Font**: Inter (Google Fonts)
- **Design**: Minimalist black and white, consistent with B23 brand

## Project Structure
```
tickiq-website/
├── app/                              # Next.js App Router
│   ├── layout.jsx                    # Root layout
│   ├── api/
│   │   ├── img/[token]/route.js      # Image proxy (decrypts & serves images)
│   │   ├── og/post/[postId]/route.jsx # Dynamic OG image generation
│   │   ├── post/route.js             # Post sharing Edge Function
│   │   ├── profile/route.js          # Profile v1 Edge Function
│   │   └── profile-v2/route.js       # Profile v2 Edge Function (SSR)
│   ├── p/[postId]/route.js           # /p/:postId route handler
│   ├── u/[username]/route.js         # /u/:username route handler
│   └── u-preview/[username]/route.js # /u-preview/:username route handler
├── public/                           # Static assets
│   ├── index.html                    # Landing page
│   ├── about.html, business.html, etc.
│   ├── robots.txt                    # Search engine directives
│   ├── sitemap.xml                   # Site map for SEO
│   ├── css/styles.css                # Global styling
│   ├── js/components.js              # Shared JS components
│   └── assets/                       # Images, icons, videos, documents
├── lib/
│   └── crypto.js                     # AES-256-GCM decryption for image tokens
├── templates/                        # Source templates (pre-build)
│   ├── post.template.js
│   ├── profile.template.js
│   └── profile-v2.template.js
├── scripts/
│   └── build-edge-function.cjs       # Embeds HTML into Edge Functions
├── post.html                         # Post sharing HTML template
├── profile.html                      # Profile v1 HTML template
├── profile-v2.html                   # Profile v2 HTML template (SSR)
├── next.config.js                    # Next.js configuration
├── vercel.json                       # Security headers & static rewrites
├── package.json                      # Dependencies and scripts
└── CLAUDE.md                         # This file
```

## Why Next.js + Edge Runtime?

### Edge Runtime Benefits
All dynamic routes use `export const runtime = 'edge'` for:
- **Global distribution**: Runs in 30+ edge locations near users
- **Instant cold starts**: ~0ms startup (vs ~100-500ms for Node.js)
- **Web Crypto API**: Native access for AES-256-GCM token decryption
- **Lower latency**: Critical for image proxying and OG image generation

### Why Not Pure Static?
- **Dynamic OG images**: `@vercel/og` generates social preview images at runtime
- **SSR profiles**: Profile v2 fetches real data from Supabase
- **Image proxy**: Decrypts tokens and proxies private storage images

---

## Development Workflow

### Local Development
```bash
# First time setup
npm install

# Build Edge Functions (only needed after editing HTML templates)
npm run build:edge

# Start local dev server
vercel dev

# Visit: http://localhost:3000
```

### Deployment (Git-based - Recommended)
```bash
# Push to any branch → Vercel creates preview deployment
git push origin feature-branch

# Merge to main → Vercel deploys to production
git checkout main && git merge feature-branch && git push
```

Vercel automatically runs `npm run build` on every deployment, which:
1. Embeds HTML templates into Edge Functions (`build:edge`)
2. Builds Next.js app (`next build`)

### CLI Deployment (Alternative)
```bash
npm run deploy       # Preview deployment
npm run deploy:prod  # Production deployment
```

---

## Route Architecture

### URL → Handler Mapping

| URL Pattern | Handler | Purpose |
|-------------|---------|---------|
| `/` | `public/index.html` | Landing page |
| `/about`, `/business`, etc. | `public/*.html` | Static pages |
| `/u/:username` | `app/u/[username]/route.js` → `app/api/profile/route.js` | Profile v1 (client-side) |
| `/u-preview/:username` | `app/u-preview/[username]/route.js` → `app/api/profile-v2/route.js` | Profile v2 (SSR) |
| `/p/:postId` | `app/p/[postId]/route.js` → `app/api/post/route.js` | Post sharing page |
| `/api/img/:token` | `app/api/img/[token]/route.js` | Image proxy |
| `/api/og/post/:postId` | `app/api/og/post/[postId]/route.jsx` | Dynamic OG image |

### How Routing Works
1. **Static pages**: Served from `public/` via `next.config.js` rewrites
2. **Dynamic routes**: Next.js App Router file-based routing (`app/` directory)
3. **No `vercel.json` rewrites needed**: App Router handles all dynamic routes

---

## Public Profiles

### Two Versions
- **Profile v1** (`/u/:username`): Client-side rendering, static OG image
- **Profile v2** (`/u-preview/:username`): Server-side rendering, real data from Supabase

### Profile V2 Architecture (SSR)

```
User visits: https://tickiq.app/u-preview/username
    ↓
Vercel Edge Function (app/api/profile-v2/route.js)
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
Image Proxy decrypts → fetches from Supabase Storage → returns image
```

### Supabase Edge Function Location
```
/Users/willwu/Development/B23, LLC/tickIQ/supabase/functions/get-public-profile-web/
```

---

## Post Sharing

### Architecture

```
User visits: https://tickiq.app/p/postId
    ↓
Vercel Edge Function (app/api/post/route.js)
    ↓
Supabase Edge Function (get-public-post-web)
    ↓
Returns: post data + encrypted image token
    ↓
Vercel renders HTML with iOS-style feed cell preview
    ↓
OG image uses: /api/og/post/[postId] (dynamic generation)
```

### Dynamic OG Images
The `/api/og/post/:postId` endpoint generates 600x800 portrait images with:
- Post photo as background
- iOS-style gradient overlay
- Caption text
- Username pill
- Like/comment counts
- Watch name and timestamp

Uses `@vercel/og` (Satori + Resvg) for server-side image generation.

---

## Image Proxy System

### Why It Exists
- Watch UUIDs are database primary keys
- Exposing them enables enumeration attacks
- Solution: Encrypt signed URLs into opaque tokens

### Flow
1. Supabase generates signed URL for private storage
2. Encrypts URL + expiration into token (AES-256-GCM)
3. Client requests `/api/img/[token]`
4. Edge Function decrypts token, fetches image, returns bytes

### Files
- **Encryption** (Supabase): `crypto.ts` in tickIQ repo
- **Decryption** (Vercel): `lib/crypto.js`

---

## Build System

### Template Embedding
HTML templates (`post.html`, `profile.html`, `profile-v2.html`) are embedded into Edge Functions at build time:

```
templates/post.template.js  +  post.html  →  app/api/post/route.js
```

**Script**: `scripts/build-edge-function.cjs`

**Why CommonJS (`.cjs`)?**
- `package.json` has `"type": "module"` for ES modules
- Build script uses `require()` for simplicity
- `.cjs` extension forces CommonJS parsing

### When to Rebuild
Run `npm run build:edge` after editing:
- `post.html`
- `profile.html`
- `profile-v2.html`

For deployment, this happens automatically via `npm run build`.

---

## Environment Variables

### Vercel (tickiq-website)
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Anon key for Edge Function calls |
| `IMAGE_TOKEN_SECRET` | 32-byte AES encryption key (shared with Supabase) |

**Note**: Use different values for Preview vs Production environments in Vercel dashboard.

### Supabase (Edge Functions)
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Auto-provided |
| `SUPABASE_ANON_KEY` | Auto-provided |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provided (for signed URLs) |
| `IMAGE_TOKEN_SECRET` | Manually added secret |

---

## Security

### Layers
1. **RLS Policies** (PostgreSQL): Only `include_in_public_feed = true` profiles accessible
2. **Privacy Check** (Supabase): Explicit verification before returning data
3. **Encrypted Tokens**: Watch UUIDs hidden via AES-256-GCM
4. **HTML Escaping**: All user content escaped to prevent XSS
5. **Security Headers** (`vercel.json`):
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-XSS-Protection: 1; mode=block`

### Token Expiration
- Tokens expire in 45 minutes
- HTML pages cached for max 25 minutes
- Safety margin ensures tokens never expire while page is cached

---

## Caching Strategy

### HTML Pages
```
Cache-Control: s-maxage=300, stale-while-revalidate=600
```
- 5 min edge cache, 10 min stale-while-revalidate
- Reduces Supabase invocations by ~95%

### Images (via Proxy)
```
Cache-Control: public, max-age={timeUntilExpiry}, s-maxage={timeUntilExpiry}, immutable
```
- Cached until token expiration
- Unique tokens per generation = safe aggressive caching

### OG Images
```
Cache-Control: s-maxage=600, stale-while-revalidate=900
```
- 10 min edge cache, 15 min stale-while-revalidate

---

## Testing

### Local
```bash
# Start Supabase Edge Functions
cd /Users/willwu/Development/B23, LLC/tickIQ
supabase functions serve

# Start Vercel dev server (separate terminal)
cd /Users/willwu/Development/B23, LLC/tickiq-website
npm run build:edge
vercel dev
```

### Verify Token Encryption
```javascript
// In browser console on profile page
const token = document.querySelector('img').src.split('/api/img/')[1];
console.log('Token length:', token.length);  // ~655 chars
console.log('No UUIDs:', !token.match(/[0-9a-f]{8}-[0-9a-f]{4}/));  // true
```

---

## Troubleshooting

### Images Not Loading (404)
- Check `IMAGE_TOKEN_SECRET` set in both Supabase and Vercel
- Verify Supabase Edge Function deployed
- Check Vercel logs: `vercel logs`

### Profile Shows Private
- Verify `include_in_public_feed = true` in database
- Check Supabase function logs for `[WEB]` prefix

### Build Fails
- Ensure HTML templates exist: `post.html`, `profile.html`, `profile-v2.html`
- Check `templates/*.template.js` files have placeholder strings

### OG Images Not Generating
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` set
- Check post exists and is public
- View `/api/og/post/[postId]` directly in browser

---

## Deploying Supabase Functions

```bash
cd /Users/willwu/Development/B23, LLC/tickIQ

# Deploy to DEV
./deploy-dev.sh functions get-public-profile-web
./deploy-dev.sh functions get-public-post-web

# Deploy to PROD
./deploy-prod.sh functions get-public-profile-web
./deploy-prod.sh functions get-public-post-web
```

---

## Key Design Elements
- **Typography**: Inter font with multiple weights
- **Color Scheme**: Black (#000000) on white (#ffffff) with gray accents
- **Animations**: Fade-in and scale-in effects on load
- **Responsive**: Mobile-optimized with breakpoints at 768px and 480px

## Contact Information
- **Product Email**: tickiq@b23.ai
- **Company Email**: hi@b23.ai

---

## Future Enhancements

### Profiles
- [ ] Merge profile v1 and v2 (use SSR for all profiles)
- [ ] User opt-in for SEO indexing
- [ ] Watch detail modal
- [ ] Measurement graphs/charts
- [ ] User bio/avatar

### Image Proxy
- [ ] Image optimization (WebP/AVIF)
- [ ] Multi-resolution support
- [ ] Rate limiting per IP

### General
- [ ] Product features section on landing page
- [ ] Email capture for notifications
