# Signed URLs Implementation Plan (Option 2)

## Overview
Implement secure image access using signed URLs with intelligent caching to balance security, performance, and cost.

**Core Strategy**: Generate temporary signed URLs with 15-minute expiration, cache the HTML page for 1 minute at the edge. This ensures images remain accessible during cache lifetime while preventing long-term URL scraping.

## Architecture Diagram

```
User Request → Vercel Edge Function (1min cache) → Supabase Edge Function (generates signed URLs, 15min expiry)
                      ↓
                 Cached HTML with signed image URLs
                      ↓
                User's Browser → Supabase Storage (validates signed URLs)
```

## Key Parameters (Option B: Balanced)

### Cache Duration (Vercel Edge Function)
- **s-maxage**: 600 seconds (10 minutes edge cache)
- **stale-while-revalidate**: 900 seconds (15 minutes grace period)
- **Rationale**: Balances freshness with performance, reduces Supabase invocations by ~98%

### Signed URL Expiration (Supabase Storage)
- **expiresIn**: 2700 seconds (45 minutes)
- **Rationale**: Must be significantly longer than cache duration to ensure URLs don't expire while cached HTML is still valid

### Safety Margin
```
URL Expiration (45min) = Cache Duration (10min) + Grace Period (15min) + Safety Buffer (20min)
```

This ensures:
1. URLs valid during initial cache period (10min)
2. URLs valid during revalidation period (15min)
3. Extra buffer for slow networks, browser caching, etc. (20min)

## Implementation Steps

### Phase 1: Update Supabase Edge Function

**File**: `/Users/willwu/Development/B23, LLC/tickIQ/supabase/functions/get-public-profile-web/index.ts`

#### Changes Required:

1. **Import storage client utilities**:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
```

2. **Replace URL construction with signed URL generation** (around line 210-226):

**Current code**:
```typescript
// Construct full Supabase Storage URL
let thumbnailUrl: string | null = null
if (thumbnailPath) {
  const storageBaseUrl = `${supabaseUrl}/storage/v1/object/public/watch-images`
  thumbnailUrl = `${storageBaseUrl}/${thumbnailPath}`
}
```

**New code**:
```typescript
// Generate signed URL for secure access
let thumbnailUrl: string | null = null
if (thumbnailPath) {
  try {
    const { data: signedData, error: signError } = await supabase
      .storage
      .from('watch-images')
      .createSignedUrl(thumbnailPath, 2700) // 45 minutes = 2700 seconds

    if (signError) {
      console.error(`[WEB] Error generating signed URL for ${thumbnailPath}:`, signError)
      // Fallback: don't include thumbnail rather than expose error
      thumbnailUrl = null
    } else {
      thumbnailUrl = signedData.signedUrl
      console.log(`[WEB] Generated signed URL for ${thumbnailPath}, expires in 45min`)
    }
  } catch (error) {
    console.error(`[WEB] Exception generating signed URL:`, error)
    thumbnailUrl = null
  }
}
```

3. **Add batch signed URL generation** (more efficient):

Since we're generating URLs for multiple images, batch them:

```typescript
// After fetching watches (around line 156), prepare all thumbnail paths
const thumbnailPaths = (watches || [])
  .map(w => w.themed_thumbnail_url || w.themed_image_url)
  .filter(path => path !== null)

// Generate all signed URLs in parallel
const signedUrlPromises = thumbnailPaths.map(async (path) => {
  try {
    const { data, error } = await supabase
      .storage
      .from('watch-images')
      .createSignedUrl(path, 2700) // 45 minutes = 2700 seconds

    if (error) {
      console.error(`[WEB] Error signing ${path}:`, error)
      return { path, url: null }
    }
    return { path, url: data.signedUrl }
  } catch (error) {
    console.error(`[WEB] Exception signing ${path}:`, error)
    return { path, url: null }
  }
})

const signedUrlResults = await Promise.all(signedUrlPromises)
const signedUrlMap = Object.fromEntries(
  signedUrlResults.map(r => [r.path, r.url])
)

console.log(`[WEB] Generated ${signedUrlResults.filter(r => r.url).length}/${thumbnailPaths.length} signed URLs`)

// Then in the format watches section:
const formattedWatches = (watches || []).map(watch => {
  const watchMeasurements = measurementsByWatch[watch.id] || []
  const latestMeasurement = watchMeasurements[0]

  const thumbnailPath = watch.themed_thumbnail_url || watch.themed_image_url
  const thumbnailUrl = thumbnailPath ? signedUrlMap[thumbnailPath] : null

  return {
    id: watch.id,
    make: watch.make,
    model: watch.model,
    reference_number: watch.reference_number,
    thumbnail_url: thumbnailUrl,
    latest_measurement: latestMeasurement ? {
      rate: latestMeasurement.current_rate,
      created_at: latestMeasurement.created_at
    } : null,
    measurement_count: watchMeasurements.length
  }
})
```

#### Benefits of Batch Approach:
- All signed URL generation happens in parallel (faster)
- Single point of error handling
- Easy to log success/failure rates
- More efficient for profiles with many watches

### Phase 2: Verify Vercel Edge Function Cache Headers

**File**: `/Users/willwu/Development/B23, LLC/tickiq-website/api/profile-v2.js`

**Updated cache headers** (need to change):
```javascript
return new Response(html, {
  status: 200,
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 's-maxage=600, stale-while-revalidate=900',
  },
});
```

**Configuration**:
- ✅ `s-maxage=600` = 10 minute cache
- ✅ `stale-while-revalidate=900` = 15 minute grace period
- ✅ Total effective cache window = 25 minutes
- ✅ Well within 45 minute signed URL expiration

**Changes needed** - update from 60s/300s to 600s/900s

### Phase 3: Update RLS Policies

**Current Policy** (blocks anonymous access):
```sql
(bucket_id = 'watch-images'::text)
AND ((storage.foldername(name))[1] = 'thumbnails'::text)
AND (auth.role() = 'authenticated'::text)
```

**New Policy** (allows signed URL access):

Signed URLs work differently - they include a temporary token in the URL that bypasses normal RLS checks. Therefore:

**ACTION**: Keep the existing RLS policy as-is. Signed URLs work independently of RLS policies.

**Reasoning**:
- Signed URLs contain cryptographic signatures that Supabase Storage validates
- The signature proves the URL was generated by an authorized service (our Edge Function)
- RLS policies apply to regular storage access, not signed URLs
- This is actually more secure - we don't open up public access at all

### Phase 4: Error Handling & Fallbacks

**Scenario 1: Signed URL generation fails**
```typescript
// In Supabase Edge Function
if (signError) {
  console.error(`[WEB] Error generating signed URL:`, signError)
  thumbnailUrl = null  // Watch card will show placeholder
}
```

**Scenario 2: Signed URL expires while user is viewing page**
- Likelihood: Very low (15min expiration, most sessions < 5min)
- Impact: Image fails to load, shows broken image icon
- Mitigation: Not needed for v1 - 15min window is generous
- Future enhancement: Client-side image load error handler that shows placeholder

**Scenario 3: Network delays during page load**
- Signed URL expiration starts when URL is generated (server-side)
- User receives HTML with pre-generated URLs
- 15min window is more than enough for slow networks

**Scenario 4: User shares the page URL with someone**
- Page URL: `https://tickiq.app/u/will` (permanent, works)
- Image URLs: Signed, embedded in HTML (15min expiration)
- When friend clicks link:
  - If within 1min: Gets cached HTML with valid signed URLs ✅
  - If after 1min: Vercel revalidates, Supabase generates fresh signed URLs ✅
- **Result**: Sharing works seamlessly

### Phase 5: Testing Strategy

#### Local Testing
```bash
# 1. Deploy Supabase function to DEV
cd /Users/willwu/Development/B23, LLC/tickIQ
./deploy-dev.sh functions get-public-profile-web

# 2. Test the endpoint directly
curl -H "Authorization: Bearer [SUPABASE_ANON_KEY]" \
  https://tdnhrbxsxvcoqgfjgddj.supabase.co/functions/v1/get-public-profile-web/will \
  | jq '.watches[0].thumbnail_url'

# Expected: URL with signature token like:
# https://tdnhrbxsxvcoqgfjgddj.supabase.co/storage/v1/object/sign/watch-images/thumbnails/xxx.jpg?token=xxx&t=xxx

# 3. Build and deploy Vercel preview
cd /Users/willwu/Development/B23, LLC/tickiq-website
npm run deploy

# 4. Test full flow
# Visit: https://[preview-url]/u/will
# Open DevTools → Network tab → Check image requests
```

#### Verification Checklist

**Step 1: Verify Signed URLs are generated**
```javascript
// In browser console on profile page
window.__PROFILE_DATA__.watches.forEach(w => {
  if (w.thumbnail_url) {
    console.log(w.thumbnail_url.includes('token=') ? '✅ Signed' : '❌ Public', w.make, w.model)
  }
})
```

**Step 2: Verify images load**
- All watch card thumbnails should display
- No 404 errors in Network tab
- No "Bucket not found" errors

**Step 3: Verify cache behavior**
```bash
# First request
curl -I https://[preview-url]/u/will
# Look for: X-Vercel-Cache: MISS

# Second request (within 1 minute)
curl -I https://[preview-url]/u/will
# Look for: X-Vercel-Cache: HIT

# Wait 2 minutes, third request
curl -I https://[preview-url]/u/will
# Look for: X-Vercel-Cache: MISS or STALE
```

**Step 4: Verify URL expiration time**
```javascript
// Extract token from signed URL
const url = new URL(window.__PROFILE_DATA__.watches[0].thumbnail_url)
const tokenParam = url.searchParams.get('t')
const expirationTime = parseInt(tokenParam, 10)
const now = Math.floor(Date.now() / 1000)
const timeUntilExpiry = expirationTime - now
console.log(`URL expires in ${Math.floor(timeUntilExpiry / 60)} minutes`)
// Expected: ~45 minutes
```

**Step 5: Test URL persistence in cache**
1. Load page → Note image URL with token
2. Wait 2 minutes
3. Reload page in new incognito window
4. If cache hit: Image should still work (same token)
5. If cache miss: Image should work (new token)

### Phase 6: Monitoring & Debugging

#### Key Metrics to Track

**Supabase Edge Function Logs**:
```typescript
console.log(`[WEB] Generated ${successCount}/${totalCount} signed URLs`)
console.error(`[WEB] Failed to sign URL for ${path}:`, error)
```

Look for:
- Signed URL generation errors
- Success rate of batch URL generation
- Patterns in failures (specific paths, timing)

**Vercel Edge Function Logs**:
```javascript
// Already has good logging
console.log('[PROFILE-V2] Cache status:', cacheStatus)
console.log('[PROFILE-V2] Fetched profile for:', username)
```

**Client-Side Monitoring** (future enhancement):
```javascript
// Add to profile-v2.html
document.querySelectorAll('.watch-card img').forEach(img => {
  img.addEventListener('error', (e) => {
    console.error('Image failed to load:', img.src.substring(0, 100))
    // Could send to analytics
  })
})
```

#### Debugging Commands

**Check if images are using signed URLs**:
```bash
curl https://[preview-url]/u/will | grep -o 'https://[^"]*watch-images[^"]*' | head -1
# Should contain: token= and t= parameters
```

**Test signed URL directly**:
```bash
# Copy a thumbnail_url from the page response
curl -I "[signed-url]"
# Should return: 200 OK (if valid)
# Or: 403 Forbidden (if expired or invalid signature)
```

**Check Supabase function logs**:
```bash
# In Supabase dashboard
# Logs → Edge Functions → get-public-profile-web
# Filter for: "WEB" and "signed"
```

### Phase 7: Security Considerations

#### What This Protects Against:
✅ **Long-term URL scraping**: URLs expire after 15min
✅ **Unauthorized storage access**: Signed URLs prove request came from our Edge Function
✅ **Public bucket exposure**: Storage bucket remains private, no open RLS policy
✅ **Direct storage URL guessing**: Public URLs don't work, only signed ones

#### What This Does NOT Protect Against:
❌ **Immediate scraping**: Someone viewing the page can save images within 15min window
❌ **Determined bots**: Could repeatedly fetch fresh pages to get new signed URLs
❌ **Screenshot/copy**: Any content on screen can be captured

#### Additional Security Measures (Future):

**Rate Limiting** (Vercel):
```javascript
// In profile-v2.js
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute per IP
})

const identifier = request.headers.get('x-forwarded-for') || 'anonymous'
const { success } = await ratelimit.limit(identifier)

if (!success) {
  return new Response('Too many requests', { status: 429 })
}
```

**Watermarking** (Long-term):
- Add subtle "tickIQ" watermark to themed thumbnails
- Makes scraped images less valuable
- Provides brand attribution if shared

**Cloudflare Image Proxy** (Phase 2):
- Proxy all image requests through Cloudflare Worker
- Implement sophisticated rate limiting
- Add hotlink protection
- Resize/optimize images on the fly

### Phase 8: Performance Impact

#### Expected Performance:

**Without Signed URLs** (baseline):
- Supabase Edge Function: ~200ms
- Image URLs: Simple string concatenation, ~0ms
- Total: ~200ms

**With Signed URLs**:
- Supabase Edge Function: ~200ms base
- Batch signed URL generation (5 images): ~100ms
- Total: ~300ms

**Impact**: +100ms per request (acceptable, still under 500ms target)

#### Optimization Strategies:

**Already Implemented**:
✅ Batch URL generation (parallel promises)
✅ Edge caching reduces frequency of URL generation
✅ Efficient error handling (fail gracefully, no retries)

**Future Optimizations**:
- Cache signed URLs at Supabase Edge Function level for 30 seconds
- Pre-generate signed URLs during watch upload (store in database)
- Use Cloudflare Workers to cache signed URL mappings

### Phase 9: Rollback Plan

If signed URLs cause issues:

**Step 1: Identify Issue**
- Images not loading? Check browser console for 403 errors
- Slow page loads? Check Vercel/Supabase logs for timing
- High error rates? Check Supabase logs for signed URL failures

**Step 2: Quick Revert**
```bash
# Revert Supabase Edge Function
cd /Users/willwu/Development/B23, LLC/tickIQ
git checkout HEAD~1 supabase/functions/get-public-profile-web/index.ts
./deploy-dev.sh functions get-public-profile-web
```

**Step 3: Fallback to Public URLs**
If urgent, add temporary public RLS policy:
```sql
-- In Supabase Dashboard → Storage → watch-images → Policies
CREATE POLICY "Public thumbnail access for web"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'watch-images'
  AND (storage.foldername(name))[1] = 'thumbnails'
)
```

Then revert Edge Function to use public URLs.

### Phase 10: Success Criteria

Before marking this complete, verify:

- [ ] Supabase Edge Function generates signed URLs successfully
- [ ] All watch thumbnails load on profile page
- [ ] No 403 or 404 errors for images
- [ ] Signed URLs contain `token=` and `t=` parameters
- [ ] URLs expire in ~15 minutes (verified in browser console)
- [ ] Page loads in < 1 second (including images)
- [ ] Cache headers work correctly (HIT on second request)
- [ ] Sharing page URL works for new visitors
- [ ] Mobile responsive layout displays correctly
- [ ] Social preview cards show correct images

## Implementation Timeline

### Immediate (Next 30 minutes):
1. Update Supabase Edge Function with signed URL generation
2. Deploy to DEV
3. Test manually on preview deployment

### Short-term (Next 2 hours):
4. Run full verification checklist
5. Monitor logs for errors
6. Fix any edge cases discovered

### Before Production:
7. Test on multiple devices/browsers
8. Verify social sharing previews
9. Check performance metrics
10. Document any issues in PUBLIC_PROFILES_V2_PLAN.md

## Notes & Decisions

### Why 15 minutes for signed URLs?
- Long enough: Covers cache duration + grace period + buffer
- Short enough: Limits window for URL abuse
- Industry standard: Many services use 15-30min for similar use cases

### Why 1 minute for edge cache?
- Balances freshness with performance
- Reduces Supabase Edge Function invocations by ~98% (60 requests → 1)
- Users typically spend < 5min on profile page, so cache hit rate will be high

### Why batch URL generation?
- Parallel promises are much faster than sequential
- Single point for error handling
- Easier to add caching layer later

### Why no fallback to public URLs?
- Defeats the purpose of signed URLs
- Better to show placeholder than expose public URL
- Images are important but not critical - profile still functional without them

## Future Enhancements

1. **Client-side URL refresh**: If URL expires while viewing, fetch new signed URL via API
2. **Progressive loading**: Load placeholder first, signed URL second
3. **Image optimization**: Use Cloudflare Image Resizing to reduce bandwidth
4. **Analytics**: Track cache hit rates, URL expiration issues, image load failures
5. **Rate limiting**: Implement Upstash-based rate limiting per IP
6. **Watermarking**: Add tickIQ branding to images

## References

- [Supabase Storage Signed URLs Docs](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl)
- [Vercel Edge Caching](https://vercel.com/docs/concepts/edge-network/caching)
- [HTTP Cache-Control Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
