# Public Profiles V2 Implementation Plan

**Branch:** `public-profiles-v2`
**Goal:** Display user's watch collection on web for anonymous users
**Status:** Planning Complete, Ready for Implementation

---

## Current State Analysis

### Existing Architecture
- `api/profile.js` - Vercel Edge Function that serves `profile.html` with dynamic meta tags
- `profile.html` - Landing page that prompts users to download app (NO actual data display)
- Routes: `/u/:username` → `api/profile`
- Build process embeds HTML template into Edge Function

### What's Missing
- ❌ No actual watch collection data fetched
- ❌ No visual display of watches
- ❌ Just a "download app to view" page

### What We're Building
- ✅ Fetch real user data from Supabase
- ✅ Display watch collection in gallery grid
- ✅ Show user stats (watches, measurements, avg rate)
- ✅ Mobile-responsive design
- ✅ SEO-friendly (but noindex for now)

---

## Security Verification ✅

### Database Schema
- ✅ `profiles.username` - Available
- ✅ `profiles.created_at` - Available
- ✅ `profiles.include_in_public_feed` - Privacy flag exists
- ✅ `watches` table - Has make, model, reference_number, thumbnail_url
- ✅ `watch_analyses` table - Has current_rate, current_amplitude, current_beat_error

### RLS Policies (Migration: 20250916200858)
- ✅ "Public profiles are viewable by anyone" - Allows anon access
- ✅ "Watches of public profiles are viewable by anyone" - Allows anon access
- ✅ "Watch analyses of public profiles are viewable by anyone" - Allows anon access
- ✅ Privacy enforced at database level via `include_in_public_feed` flag

### Existing API
- ✅ `get-public-profile` Supabase Edge Function already works with anon key
- ✅ iOS app successfully uses it for in-app public profiles
- ✅ Verified in code: `PublicProfileViewModel.swift:114-125`

---

## Implementation Phases

### ✅ Phase 0: Planning & Verification (COMPLETE)
- [x] Explore Supabase schema
- [x] Verify RLS policies
- [x] Confirm data accessibility
- [x] Design architecture
- [x] Create implementation plan

---

### Phase 1: Supabase Edge Function

**File:** `/Users/willwu/Development/B23, LLC/tickIQ/supabase/functions/get-public-profile-web/index.ts`

**Tasks:**
- [ ] Create new directory: `supabase/functions/get-public-profile-web/`
- [ ] Copy existing `get-public-profile/index.ts` as base
- [ ] Add logging prefix: `[WEB]` to distinguish from app requests
- [ ] Test locally: `supabase functions serve get-public-profile-web`
- [ ] Test with curl:
  ```bash
  curl "http://localhost:54321/functions/v1/get-public-profile-web/will" \
    -H "Authorization: Bearer ANON_KEY"
  ```
- [ ] Deploy: `supabase functions deploy get-public-profile-web`
- [ ] Test deployed version with real username

**Expected Response Format:**
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
      "thumbnail_url": "https://...",
      "latest_measurement": {
        "rate": 2.3,
        "created_at": "2024-11-01T00:00:00Z"
      },
      "measurement_count": 8
    }
  ]
}
```

**Security Checklist:**
- [x] Uses anon key (safe - RLS enforced)
- [x] Checks `include_in_public_feed` flag
- [x] Returns 404 for private profiles
- [x] Built-in Supabase rate limiting (1000/min)

---

### Phase 2: Frontend HTML Template

**File:** `profile-v2.html`

**Design Layout:**
```
┌─────────────────────────────────────────┐
│  HEADER (B23 logo)                      │
├─────────────────────────────────────────┤
│  [@USERNAME]                             │
│  Member since [DATE]                     │
│                                          │
│  [X watches] [Y measurements] [Avg: Z]   │
├─────────────────────────────────────────┤
│  ┌────┐ ┌────┐ ┌────┐                  │
│  │ W1 │ │ W2 │ │ W3 │  [Watch Grid]    │
│  └────┘ └────┘ └────┘                  │
│  ┌────┐ ┌────┐ ┌────┐                  │
│  │ W4 │ │ W5 │ │ W6 │                  │
│  └────┘ └────┘ └────┘                  │
├─────────────────────────────────────────┤
│  [Download tickIQ CTA]                   │
├─────────────────────────────────────────┤
│  FOOTER (© B23, LLC)                    │
└─────────────────────────────────────────┘
```

**Watch Card Design:**
```
┌──────────────────┐
│                  │
│   [Watch Image]  │
│                  │
├──────────────────┤
│  Make Model      │
│  Ref: XXXXX      │
│                  │
│  Rate: +X s/d    │
│  [Y measurements]│
└──────────────────┘
```

**Tasks:**
- [ ] Create `profile-v2.html` with complete structure
- [ ] Add SEO meta tags (with placeholders for dynamic replacement)
- [ ] Include `<meta name="robots" content="noindex,nofollow">` (decided: no indexing for v2)
- [ ] Add social sharing tags (og:image, twitter:card)
- [ ] Design responsive CSS grid for watch cards
- [ ] Style profile header section
- [ ] Create loading state UI
- [ ] Create error state UI (404/private profile)
- [ ] Add empty state (user with 0 watches)
- [ ] Test responsive design on mobile/tablet/desktop
- [ ] Optimize for performance (inline critical CSS)

**Design Principles:**
- ✅ Minimalist black/white (consistent with tickiq.app)
- ✅ Mobile-first responsive
- ✅ Fast loading (inline CSS, minimal JS)
- ✅ Progressive enhancement
- ✅ Accessible (semantic HTML, ARIA labels)

---

### Phase 3: Vercel Edge Function V2

**File:** `api/profile-v2.js`

**Architecture:** Server-Side Rendering (SSR)
- ✅ Fetch data in Edge Function
- ✅ Render complete HTML with data
- ✅ Better SEO, faster First Contentful Paint
- ✅ Data available to crawlers/social bots

**Tasks:**
- [ ] Create `api/profile-v2.js` with SSR logic
- [ ] Add username extraction from URL path
- [ ] Add Supabase Edge Function call with anon key
- [ ] Handle 404 response (private/non-existent profiles)
- [ ] Handle 500 errors gracefully
- [ ] Implement HTML rendering function
- [ ] Inject data as JSON for client-side hydration: `window.__PROFILE_DATA__`
- [ ] Replace meta tag placeholders with dynamic values
- [ ] Add cache headers: `Cache-Control: s-maxage=300, stale-while-revalidate=600` (5min cache)
- [ ] Add error page rendering
- [ ] Add HTML escaping for security
- [ ] Test locally with `vercel dev`

**Key Features:**
- ✅ Server-side data fetching
- ✅ SEO-friendly (data in HTML)
- ✅ Edge caching (5 min)
- ✅ Error handling (404, 500)
- ✅ Security (HTML escaping)

**Environment Variables Needed:**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

---

### Phase 4: Build Process

**File:** `scripts/build-profile-v2.js`

**Tasks:**
- [ ] Create build script that reads `profile-v2.html`
- [ ] Embed HTML into `api/profile-v2.js` as template literal
- [ ] Handle escaping (backticks, ${}, backslashes)
- [ ] Update `package.json` scripts:
  ```json
  {
    "scripts": {
      "build": "node scripts/build-edge-function.js && node scripts/build-profile-v2.js",
      "deploy": "npm run build && vercel",
      "deploy:prod": "npm run build && vercel --prod"
    }
  }
  ```
- [ ] Test build process: `npm run build`
- [ ] Verify generated `api/profile-v2.js` has embedded HTML

---

### Phase 5: Routing Configuration

**File:** `vercel.json`

**Tasks:**
- [ ] Update routing to point `/u/:username` to `api/profile-v2`:
  ```json
  {
    "rewrites": [
      {
        "source": "/u/:username",
        "destination": "/api/profile-v2"
      }
    ]
  }
  ```
- [ ] Keep other routes unchanged

---

### Phase 6: Environment Setup

**Tasks:**
- [ ] Add environment variables to Vercel project:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- [ ] Verify variables in Vercel dashboard
- [ ] Test that Edge Function can access env vars

---

### Phase 7: Testing

#### Local Testing
- [ ] Test Supabase function locally:
  ```bash
  cd /Users/willwu/Development/B23, LLC/tickIQ
  supabase functions serve get-public-profile-web
  ```
- [ ] Test with curl (public profile)
- [ ] Test with curl (private profile - should 404)
- [ ] Test Vercel function locally:
  ```bash
  cd /Users/willwu/Development/B23, LLC/tickiq-website
  npm run build
  vercel dev
  ```
- [ ] Visit: `http://localhost:3000/u/will`

#### Test Cases
- [ ] Public profile with watches → Should display collection
- [ ] Public profile without watches → Should show empty state
- [ ] Private profile (`include_in_public_feed=false`) → Should return 404
- [ ] Non-existent username → Should return 404
- [ ] Mobile responsiveness (iPhone, Android)
- [ ] Tablet responsiveness (iPad)
- [ ] Desktop responsiveness (1920px+)
- [ ] Social sharing preview (iMessage, Reddit, Twitter)
- [ ] Image loading (thumbnails display correctly)
- [ ] Performance (< 2s load time)
- [ ] Caching (verify edge cache headers)

#### Social Sharing Tests
- [ ] Test iMessage preview
- [ ] Test Facebook sharing: https://developers.facebook.com/tools/debug/
- [ ] Test Twitter preview: https://cards-dev.twitter.com/validator
- [ ] Verify og:image displays correctly
- [ ] Verify dynamic title with username

---

### Phase 8: Deployment

#### Pre-Deployment Checklist
- [ ] All tests passing
- [ ] Build process works
- [ ] Environment variables configured
- [ ] Social previews verified
- [ ] Mobile tested on real devices
- [ ] Error states tested

#### Deploy Supabase Function
```bash
cd /Users/willwu/Development/B23, LLC/tickIQ
supabase functions deploy get-public-profile-web
```

#### Deploy to Vercel Preview
```bash
cd /Users/willwu/Development/B23, LLC/tickiq-website
git add .
git commit -m "Add public profiles v2 with watch collection display"
git push origin public-profiles-v2
npm run deploy
```

#### Test Preview
- [ ] Visit preview URL: `https://[preview-url]/u/will`
- [ ] Test with real usernames
- [ ] Test privacy settings
- [ ] Test social sharing from preview URL
- [ ] Check Vercel logs for errors
- [ ] Verify caching works (check response headers)

#### Deploy to Production
```bash
npm run deploy:prod
```

#### Post-Deployment Verification
- [ ] Test production: `https://tickiq.app/u/will`
- [ ] Test from mobile device
- [ ] Test social sharing in production
- [ ] Monitor Vercel analytics for errors
- [ ] Check Supabase logs for function errors
- [ ] Test from different geographic regions
- [ ] Verify edge caching working globally

---

## Technical Architecture

### Data Flow
```
Browser Request
    ↓
Vercel Edge (profile-v2.js)
    ↓
Supabase Edge Function (get-public-profile-web)
    ↓
Supabase Database (RLS enforced)
    ↓
Response with profile data
    ↓
SSR HTML rendering
    ↓
Cached response (5 min)
    ↓
Browser renders page
```

### Security Layers
1. **RLS Policies** (PostgreSQL) - Database-level enforcement
2. **Privacy Flag Check** (Supabase Function) - Returns 404 if private
3. **Anon Key** (Vercel Edge) - No write access, read-only
4. **HTML Escaping** (Vercel Edge) - Prevents XSS
5. **Rate Limiting** (Supabase built-in) - 1000 req/min

### Caching Strategy
- **Edge Cache:** 5 minutes (`s-maxage=300`)
- **Stale While Revalidate:** 10 minutes (`stale-while-revalidate=600`)
- **Browser Cache:** Controlled by edge headers
- **Image Cache:** Supabase CDN (long TTL)

---

## Risk Mitigation

### Potential Issues & Solutions

1. **Rate Limiting Abuse**
   - Current: Supabase built-in (1000/min)
   - Future: Add IP-based limiting in Vercel Edge

2. **High Load on Supabase**
   - Mitigation: 5-min edge caching
   - Fallback: Increase cache time to 10 min

3. **Slow Image Loading**
   - Solution: Supabase Storage CDN
   - Fallback: Add lazy loading

4. **SEO Indexing (unintended)**
   - Solution: `noindex,nofollow` meta tag
   - Verification: Check Google Search Console

5. **Privacy Violations**
   - Protection: RLS policies enforce database-level security
   - Monitoring: Log all access attempts
   - Audit: Review Supabase logs regularly

---

## Success Metrics

### Technical Performance
- ✅ < 2s page load time (LCP)
- ✅ > 95% uptime
- ✅ < 1% error rate
- ✅ Edge cache hit rate > 80%
- ✅ Mobile performance score > 90

### User Experience
- ✅ Displays all watches correctly
- ✅ Mobile-responsive on all devices
- ✅ Social sharing works (og:image displays)
- ✅ Clear CTA to download app
- ✅ Fast perceived performance

### Security
- ✅ Private profiles return 404 (never leak data)
- ✅ No XSS vulnerabilities
- ✅ RLS policies never bypassed
- ✅ No exposure of sensitive data

---

## Timeline Estimate

- **Phase 1** (Supabase Function): 30 minutes
- **Phase 2** (HTML Template): 2 hours
- **Phase 3** (Edge Function): 1 hour
- **Phase 4** (Build Process): 30 minutes
- **Phase 5-6** (Config): 15 minutes
- **Phase 7** (Testing): 1 hour
- **Phase 8** (Deployment): 30 minutes

**Total: ~6 hours of focused work**

---

## Future Enhancements (Post-V2)

### Rate Limiting (High Priority)
- [ ] Implement IP-based rate limiting with Vercel KV
- [ ] Set limits: 60 req/min per IP
- [ ] Add username-based limits: 120 req/min per username

### Analytics
- [ ] Track profile views
- [ ] Track which watches get most views
- [ ] Monitor app download conversion rate

### SEO (Optional)
- [ ] Add user opt-in for search indexing
- [ ] Quality threshold (5+ watches, 10+ measurements)
- [ ] Structured data (JSON-LD) for rich snippets

### Enhanced UI
- [ ] Watch detail modal (click to see full measurements)
- [ ] Measurement graphs/charts
- [ ] Watch collection value estimates
- [ ] User bio/description
- [ ] Avatar/profile photo

### Performance
- [ ] Image optimization (WebP, AVIF)
- [ ] Lazy loading for images
- [ ] Preload critical assets
- [ ] Service worker for offline support

---

## Notes

- Keep `noindex,nofollow` for initial v2 launch (can enable SEO later)
- Focus on social sharing use case (Reddit, forums, iMessage)
- Primary goal: showcase collections, drive app downloads
- Secondary goal: community building, not SEO discovery

---

## Questions / Decisions Log

**Q: Should we index profiles for SEO?**
**A:** No, start with `noindex,nofollow`. Focus on social sharing use case. Can add selective indexing later with user opt-in.

**Q: Server-side or client-side rendering?**
**A:** Server-side (SSR) for better social sharing and performance.

**Q: Separate Supabase function or reuse existing?**
**A:** Create separate `get-public-profile-web` for clean separation from in-app usage.

**Q: What if user has no watches?**
**A:** Show empty state with CTA to download app and add first watch.

---

**Last Updated:** 2025-11-17
**Status:** Ready to begin Phase 1
