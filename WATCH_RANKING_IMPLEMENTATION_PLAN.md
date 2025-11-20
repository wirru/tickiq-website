# Watch Ranking Implementation Plan - Public Profiles V2
**Feature**: Port WatchInsightsCalculator algorithm from iOS to web for intelligent watch ranking
**Status**: Planning Phase
**Author**: Claude
**Date**: 2025-11-18

---

## 🎯 Objective

Implement intelligent watch ranking for public web profiles based on actual wearing frequency (days worn), matching the iOS app's ranking logic but without relationship classification.

**Core Metrics**:
- Days worn (with proportional credit)
- Percentage of rotation
- Last/first worn dates
- Sort by days worn (descending)

---

## 📊 Current State Analysis

### What We Have (Public Profile V2)
- ✅ Supabase Edge Function: `get-public-profile-web`
- ✅ Fetches: profile, watches, measurements
- ✅ Returns: encrypted image tokens, basic watch data
- ✅ Vercel Edge Function: renders SSR HTML
- ✅ Caching: 10min edge cache, 45min image tokens

### What We're Missing
- ❌ Posts data (wearing patterns)
- ❌ Proportional days worn calculation
- ❌ Percentage of rotation metric
- ❌ Ranking by actual wear frequency

### iOS Reference Implementation
- **File**: `/Users/willwu/Development/B23, LLC/tickIQ/ios/tickIQ/tickIQ/Models/WatchInsight.swift`
- **Method**: `WatchInsightsCalculator.calculateInsights()`
- **Lines**: 168-302 (core algorithm)
- **Key Concept**: Proportional credit when multiple watches posted same day

---

## 🏗️ Architecture Design

### Data Flow

```
User visits: https://tickiq.app/u/username
    ↓
Vercel Edge Function (/api/profile-v2)
    ↓
Supabase Edge Function (get-public-profile-web)
    ↓
┌─────────────────────────────────────────┐
│ 1. Verify profile is public             │
│ 2. Fetch watches                         │
│ 3. Fetch measurements                    │
│ 4. Fetch posts ← NEW                     │
│ 5. Calculate insights ← NEW              │
│    - Proportional days worn              │
│    - Percentage of rotation              │
│ 6. Rank watches by days worn ← NEW      │
│ 7. Generate encrypted image tokens       │
└─────────────────────────────────────────┘
    ↓
Returns: ranked watches with insights
    ↓
Vercel renders HTML with insights
    ↓
Browser displays ranked collection
```

### Enhanced Data Structure

```typescript
// Current response (before)
{
  profile: { username, created_at },
  stats: { watch_count, measurement_count, average_rate },
  watches: [
    {
      id: string,
      make: string,
      model: string,
      thumbnail_url: string,  // encrypted token
      latest_measurement: { rate, created_at },
      measurement_count: number
    }
  ]
}

// Enhanced response (after)
{
  profile: { username, created_at },
  stats: {
    watch_count,
    measurement_count,
    average_rate,
    total_posting_days: number  // NEW
  },
  watches: [
    {
      id: string,
      make: string,
      model: string,
      thumbnail_url: string,
      latest_measurement: { rate, created_at },
      measurement_count: number,

      // NEW INSIGHTS
      days_worn: number,                    // Rounded days worn
      percentage_of_rotation: number,       // 0-100
      last_worn_date: string | null,        // ISO8601
      first_worn_date: string | null        // ISO8601
    }
  ]
}
```

---

## 🔍 Design Decisions

### Decision 1: Where to Calculate?
**Location**: Supabase Edge Function (get-public-profile-web)

**Rationale**:
- ✅ Closer to data (minimize round trips)
- ✅ Can use service role for efficient queries
- ✅ Result is cached at edge (10min)
- ✅ TypeScript environment (same as Vercel)

**Verdict**: Calculate in Supabase

---

### Decision 2: Query Strategy
**Approach**: Multiple separate queries

```typescript
// Query 1: Get watches
SELECT * FROM watches WHERE user_id = $1

// Query 2: Get all posts for user
SELECT id, watch_id, created_at, timezone, status
FROM posts
WHERE author_id = $1 AND status = 'active'
```

**Rationale**:
- Cleaner data structures
- Easier to debug
- Matches iOS pattern
- Posts query is simple and indexed

**Verdict**: Multiple queries (fetch in parallel)

---

### Decision 3: Timezone Handling
**Challenge**: Posts have `timezone` field, need to convert UTC timestamps to local dates

**Solution**: Use `Intl.DateTimeFormat`

```typescript
function formatDateInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  return formatter.format(date)  // Returns "2025-11-18"
}
```

**Fallback**: If timezone is invalid, use UTC

---

### Decision 4: Algorithm Fidelity
**Goal**: Match iOS proportional days calculation exactly

**Strategy**:
1. Port Swift code line-by-line to TypeScript
2. Use same variable names (camelCase)
3. Use same rounding (Math.round)
4. Same proportional credit formula
5. Same percentage calculation

**Testing**: Compare output with iOS app for same profile

---

## 📝 Implementation Steps

### Phase 1: Add Posts Query
**File**: `/Users/willwu/Development/B23, LLC/tickIQ/supabase/functions/get-public-profile-web/index.ts`
**Location**: After measurements query

```typescript
// Fetch all active posts for this user (for wearing insights)
console.log(`[WEB] Fetching posts for @${username}...`)

const { data: posts, error: postsError } = await supabase
  .from('posts')
  .select('id, watch_id, created_at, status, timezone')
  .eq('author_id', profile.id)
  .eq('status', 'active')
  .order('created_at', { ascending: true })

if (postsError) {
  console.error(`[WEB] Error fetching posts for @${username}:`, postsError)
  // Don't fail - just log and continue with empty posts array
}

const postsData = posts || []
console.log(`[WEB] Found ${postsData.length} posts for @${username}`)
```

**Notes**:
- ✅ RLS policy allows anon access to status='active' posts
- ✅ Don't fail request if posts query fails (graceful degradation)

---

### Phase 2: Create Insights Calculator Module
**File**: `/Users/willwu/Development/B23, LLC/tickIQ/supabase/functions/get-public-profile-web/insights-calculator.ts` (NEW)

```typescript
/**
 * Watch insights calculated from post data (wearing patterns)
 * Simplified version - no relationship classification
 */

export interface WatchInsight {
  watchId: string
  daysWorn: number                      // Rounded for display
  daysWornProportional: number          // Exact value for percentages
  percentageOfRotation: number          // 0-100
  lastWornDate: string | null           // ISO8601
  firstWornDate: string | null          // ISO8601
}

export interface WatchInsightsResult {
  insights: WatchInsight[]
  totalPostingDays: number
}

interface Watch {
  id: string
  [key: string]: any
}

interface Post {
  id: string
  watch_id: string | null
  created_at: string
  status: string
  timezone: string | null
}

/**
 * Calculate insights for all watches from posts data
 * Based on WatchInsightsCalculator.swift:168-302
 */
export function calculateInsights(
  watches: Watch[],
  posts: Post[]
): WatchInsightsResult {

  // Handle edge case: no posts
  if (posts.length === 0) {
    return {
      insights: watches.map(w => ({
        watchId: w.id,
        daysWorn: 0,
        daysWornProportional: 0,
        percentageOfRotation: 0,
        lastWornDate: null,
        firstWornDate: null
      })),
      totalPostingDays: 0
    }
  }

  // Step 1: Group posts by date (YYYY-MM-DD) to track unique posting days
  // Map format: { "2025-11-18" => Set("watch-uuid-1", "watch-uuid-2") }
  const postsByDate = new Map<string, Set<string>>()

  for (const post of posts) {
    if (!post.watch_id || !post.created_at) continue

    // Convert created_at to date string in post's timezone
    const date = new Date(post.created_at)
    const dateString = formatDateInTimezone(date, post.timezone)

    if (!postsByDate.has(dateString)) {
      postsByDate.set(dateString, new Set())
    }
    postsByDate.get(dateString)!.add(post.watch_id)
  }

  // Step 2: Calculate insights for each watch
  let insights: WatchInsight[] = watches.map(watch => {
    // Filter posts for this specific watch
    const watchPosts = posts.filter(p =>
      p.watch_id === watch.id && p.status === 'active'
    )

    // Calculate unique days worn (proportional if multiple watches same day)
    let daysWornProportional = 0
    const uniqueDates = new Set<string>()

    for (const post of watchPosts) {
      const date = new Date(post.created_at)
      const dateString = formatDateInTimezone(date, post.timezone)

      // Only count each date once for this watch
      if (uniqueDates.has(dateString)) continue
      uniqueDates.add(dateString)

      // Proportional credit: 1 / (number of watches posted that day)
      // If user posts 2 watches on same day, each gets 0.5 days credit
      const watchCountThatDay = postsByDate.get(dateString)?.size || 1
      daysWornProportional += 1.0 / watchCountThatDay
    }

    // Round for display (matches Swift: .toNearestOrAwayFromZero)
    const daysWorn = Math.round(daysWornProportional)

    // Get first and last worn dates from actual posts
    const sortedPosts = [...watchPosts].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const firstWornDate = sortedPosts[0]?.created_at || null
    const lastWornDate = sortedPosts[sortedPosts.length - 1]?.created_at || null

    return {
      watchId: watch.id,
      daysWorn,
      daysWornProportional,
      percentageOfRotation: 0,  // Calculate in next step
      lastWornDate,
      firstWornDate
    }
  })

  // Step 3: Sort by actual wear (most worn first)
  // Matches Swift line 237
  insights.sort((a, b) => b.daysWornProportional - a.daysWornProportional)

  // Step 4: Calculate percentages
  const totalUniqueDays = postsByDate.size

  insights = insights.map(insight => {
    const percentage = totalUniqueDays > 0
      ? (insight.daysWornProportional / totalUniqueDays) * 100.0
      : 0.0

    return {
      ...insight,
      percentageOfRotation: percentage
    }
  })

  return {
    insights,
    totalPostingDays: totalUniqueDays
  }
}

/**
 * Format date in specific timezone as YYYY-MM-DD
 * Handles timezone conversion for accurate daily grouping
 */
function formatDateInTimezone(date: Date, timezone: string | null): string {
  try {
    const tz = timezone || 'UTC'

    // Use Intl.DateTimeFormat to get YYYY-MM-DD in specific timezone
    // en-CA locale naturally formats as YYYY-MM-DD
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })

    return formatter.format(date)  // Returns "2025-11-18"
  } catch (error) {
    // Invalid timezone - fallback to UTC
    console.warn(`[Insights] Invalid timezone "${timezone}", using UTC`)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    return formatter.format(date)
  }
}
```

**Design Principles**:
- ✅ Pure function (no side effects)
- ✅ Testable in isolation
- ✅ TypeScript types for safety
- ✅ Graceful error handling (timezone fallback)
- ✅ Comments reference Swift line numbers

---

### Phase 3: Integrate Calculator into Edge Function
**File**: `/Users/willwu/Development/B23, LLC/tickIQ/supabase/functions/get-public-profile-web/index.ts`
**Location**: After fetching posts, before formatting watches

```typescript
import { calculateInsights } from './insights-calculator.ts'

// ... (after fetching posts) ...

// Calculate wearing insights from posts data
console.log(`[WEB] Calculating wearing insights for @${username}...`)
const insightsResult = calculateInsights(watches || [], postsData)
const insightsByWatchId = new Map(
  insightsResult.insights.map(i => [i.watchId, i])
)
console.log(`[WEB] Calculated insights for ${insightsResult.insights.length} watches (${insightsResult.totalPostingDays} posting days)`)

// ... (image token generation - unchanged) ...

// Format watches with their measurement data AND insights
const formattedWatches = (watches || []).map(watch => {
  const watchMeasurements = measurementsByWatch[watch.id] || []
  const latestMeasurement = watchMeasurements[0]

  // Get insights for this watch (if available)
  const insights = insightsByWatchId.get(watch.id)

  // Use the best available image
  const thumbnailPath = watch.themed_image_url || watch.themed_thumbnail_url
  const thumbnailToken = thumbnailPath ? tokenMap[thumbnailPath] : null

  return {
    id: watch.id,
    make: watch.make || '',
    model: watch.model || '',
    reference_number: watch.reference_number,
    thumbnail_url: thumbnailToken,
    latest_measurement: latestMeasurement ? {
      rate: latestMeasurement.rate,
      beat_error: latestMeasurement.beat_error,
      amplitude: latestMeasurement.amplitude,
      created_at: latestMeasurement.created_at
    } : null,
    measurement_count: watchMeasurements.length,

    // NEW: Wearing insights
    days_worn: insights?.daysWorn ?? 0,
    percentage_of_rotation: insights?.percentageOfRotation ?? 0,
    last_worn_date: insights?.lastWornDate ?? null,
    first_worn_date: insights?.firstWornDate ?? null
  }
})

// Sort watches by days worn (descending) - most worn first
formattedWatches.sort((a, b) => {
  const aInsight = insightsByWatchId.get(a.id)
  const bInsight = insightsByWatchId.get(b.id)
  const aProp = aInsight?.daysWornProportional ?? 0
  const bProp = bInsight?.daysWornProportional ?? 0
  return bProp - aProp
})

// ... (rest of response construction) ...

return new Response(JSON.stringify({
  profile: {
    username: profile.username,
    created_at: profile.created_at
  },
  stats: {
    watch_count: watches?.length || 0,
    measurement_count: Object.values(measurementsByWatch).flat().length,
    average_rate: calculateAverageRate(Object.values(measurementsByWatch).flat()),
    total_posting_days: insightsResult.totalPostingDays  // NEW
  },
  watches: formattedWatches
}), {
  status: 200,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300'
  }
})
```

**Key Changes**:
1. Import calculator module
2. Call `calculateInsights()` after fetching posts
3. Create Map for O(1) lookup
4. Merge insights into formatted watches
5. Sort by `daysWornProportional` (descending)
6. Add `total_posting_days` to stats

---

### Phase 4: Update Frontend Display
**File**: `/Users/willwu/Development/B23, LLC/tickiq-website/profile-v2.html`
**Location**: Watch card rendering

**Current HTML**:
```html
<div class="watch-card">
  <img src="/api/img/${watch.thumbnail_url}" />
  <div class="watch-info">
    <h3>${watch.make} ${watch.model}</h3>
    <div class="watch-stats">
      <span>Latest: ${watch.latest_measurement.rate}s/d</span>
      <span>${watch.measurement_count} measurements</span>
    </div>
  </div>
</div>
```

**Enhanced HTML**:
```html
<div class="watch-card">
  <img src="/api/img/${watch.thumbnail_url}" />
  <div class="watch-info">
    <h3>${watch.make} ${watch.model}</h3>

    <!-- NEW: Wearing stats -->
    ${watch.days_worn > 0 ? `
      <div class="wearing-stats">
        <span class="days-worn">
          Worn ${watch.days_worn} ${watch.days_worn === 1 ? 'day' : 'days'}
        </span>
        <span class="percentage">
          ${watch.percentage_of_rotation.toFixed(1)}%
        </span>
      </div>
    ` : ''}

    <!-- Existing measurement stats -->
    <div class="watch-stats">
      ${watch.latest_measurement ? `
        <span>Latest: ${watch.latest_measurement.rate}s/d</span>
      ` : ''}
      <span>${watch.measurement_count} measurements</span>
    </div>
  </div>
</div>
```

**CSS**:
```css
.wearing-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 0.875rem;
  color: #666;
}

.days-worn {
  font-weight: 600;
  color: #000;
}

.percentage {
  color: #999;
}
```

---

## 🧪 Testing Strategy

### Test Suite 1: Unit Tests

**File**: `insights-calculator.test.ts` (create new)

```typescript
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { calculateInsights } from "./insights-calculator.ts"

// Test 1: Single watch, single post
Deno.test("Single watch, single post", () => {
  const watches = [{ id: "watch-1" }]
  const posts = [{
    id: "post-1",
    watch_id: "watch-1",
    created_at: "2025-11-18T10:00:00Z",
    status: "active",
    timezone: "UTC"
  }]

  const result = calculateInsights(watches, posts)

  assertEquals(result.totalPostingDays, 1)
  assertEquals(result.insights[0].daysWorn, 1)
  assertEquals(result.insights[0].daysWornProportional, 1.0)
  assertEquals(result.insights[0].percentageOfRotation, 100.0)
})

// Test 2: Two watches, same day (proportional credit)
Deno.test("Proportional credit for same day", () => {
  const watches = [{ id: "watch-1" }, { id: "watch-2" }]
  const posts = [
    {
      id: "post-1",
      watch_id: "watch-1",
      created_at: "2025-11-18T10:00:00Z",
      status: "active",
      timezone: "UTC"
    },
    {
      id: "post-2",
      watch_id: "watch-2",
      created_at: "2025-11-18T14:00:00Z",
      status: "active",
      timezone: "UTC"
    }
  ]

  const result = calculateInsights(watches, posts)

  // Each watch gets 0.5 days credit
  assertEquals(result.insights[0].daysWornProportional, 0.5)
  assertEquals(result.insights[1].daysWornProportional, 0.5)

  // Both round to 1 day
  assertEquals(result.insights[0].daysWorn, 1)
  assertEquals(result.insights[1].daysWorn, 1)

  // Each gets 50%
  assertEquals(result.insights[0].percentageOfRotation, 50.0)
  assertEquals(result.insights[1].percentageOfRotation, 50.0)
})

// Test 3: Timezone edge case
Deno.test("Timezone affects date grouping", () => {
  const watches = [{ id: "watch-1" }]
  const posts = [
    {
      id: "post-1",
      watch_id: "watch-1",
      created_at: "2025-11-19T06:00:00Z",  // 6am UTC
      status: "active",
      timezone: "America/Los_Angeles"  // 10pm Nov 18 PST
    },
    {
      id: "post-2",
      watch_id: "watch-1",
      created_at: "2025-11-19T08:00:00Z",  // 8am UTC
      status: "active",
      timezone: "America/Los_Angeles"  // 12am Nov 19 PST
    }
  ]

  const result = calculateInsights(watches, posts)

  // Should be 2 unique days in PST (Nov 18 and Nov 19)
  assertEquals(result.insights[0].daysWorn, 2)
})

// Test 4: No posts
Deno.test("No posts gracefully handled", () => {
  const watches = [{ id: "watch-1" }]
  const posts = []

  const result = calculateInsights(watches, posts)

  assertEquals(result.totalPostingDays, 0)
  assertEquals(result.insights[0].daysWorn, 0)
  assertEquals(result.insights[0].percentageOfRotation, 0)
})
```

**Run**: `deno test insights-calculator.test.ts`

---

### Test Suite 2: Integration Tests

**Scenario 1: Compare with iOS App**
1. Deploy to DEV
2. Pick test profile with known posts
3. Fetch iOS insights from app
4. Fetch web insights from API
5. Compare field-by-field

**Expected**: 100% match on days_worn, percentage_of_rotation

**Scenario 2: Edge Cases**
- Profile with 0 posts
- Profile with 1 watch, 1 post
- Profile with 100+ posts

---

### Test Suite 3: Performance Tests

| Profile Size | Posts | Watches | Target Response Time |
|--------------|-------|---------|---------------------|
| Small        | 10    | 3       | <200ms              |
| Medium       | 100   | 10      | <500ms              |
| Large        | 500   | 25      | <1000ms             |

**Monitoring**:
```typescript
console.time('[WEB] Insights calculation')
const insights = calculateInsights(watches, posts)
console.timeEnd('[WEB] Insights calculation')
```

---

## ⚡ Performance Optimization

### 1. Parallel Queries
```typescript
const [watchesResult, postsResult] = await Promise.all([
  supabase.from('watches').select('...').eq('user_id', profile.id),
  supabase.from('posts').select('...').eq('author_id', profile.id)
])
```

### 2. Algorithm Complexity
- Time: O(W × P) where W=watches, P=posts
- Typical: 10 watches × 100 posts = 1,000 operations
- Computation: <10ms even for large profiles

### 3. Caching
- 10min edge cache on entire response
- ~144 requests/day max per profile
- Cache hit rate: >95%

---

## 🛡️ Error Handling

### No Posts
```typescript
if (posts.length === 0) {
  // Return all zeros, don't show wearing stats on frontend
}
```

### Invalid Timezone
```typescript
try {
  return formatter.format(date)
} catch (error) {
  // Fallback to UTC
}
```

### Posts Query Fails
```typescript
if (postsError) {
  console.error('[WEB] Posts error:', postsError)
  // Continue with empty array
}
const postsData = posts || []
```

---

## 🚀 Rollout Plan

### Phase 1: Development
- [ ] Create `insights-calculator.ts`
- [ ] Write 4 unit tests
- [ ] Add posts query
- [ ] Integrate calculator
- [ ] Test locally

### Phase 2: Deploy to DEV
- [ ] Deploy Supabase function to DEV
- [ ] Deploy Vercel to preview
- [ ] Compare with iOS results
- [ ] Performance testing

### Phase 3: Frontend
- [ ] Update HTML template
- [ ] Add CSS
- [ ] Run build script
- [ ] Deploy to preview

### Phase 4: Production
- [ ] Merge to main
- [ ] Deploy Supabase to PROD
- [ ] Deploy Vercel to PROD
- [ ] Monitor logs

---

## 📊 Success Metrics

- ✅ Days worn matches iOS app (exactly)
- ✅ Percentage matches iOS (within 0.1%)
- ✅ Response time <500ms (p50)
- ✅ All unit tests pass
- ✅ No production errors
- ✅ Watches ranked by actual wear

---

## ✅ Acceptance Criteria

1. ✅ Web shows watches in same order as iOS
2. ✅ Days worn metric matches iOS exactly
3. ✅ Percentage of rotation matches iOS
4. ✅ Timezone handling works correctly
5. ✅ Response time <500ms
6. ✅ All tests pass
7. ✅ Frontend displays insights clearly
8. ✅ Mobile layout works

---

**End of Plan**

Ready to implement!
