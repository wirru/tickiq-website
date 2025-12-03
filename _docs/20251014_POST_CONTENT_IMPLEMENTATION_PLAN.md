# Post Content Display Implementation Plan

## Executive Summary

This plan outlines how to enhance the tickIQ website to fetch and display actual post content (images, captions, watch info, engagement metrics) instead of just showing a generic "View in App" page. The implementation uses Supabase's anon key with RLS policies for secure, public data access.

---

## Table of Contents

1. [Security Architecture](#security-architecture)
2. [Prerequisites](#prerequisites)
3. [Implementation Steps](#implementation-steps)
4. [Code Changes](#code-changes)
5. [Testing Strategy](#testing-strategy)
6. [Deployment Process](#deployment-process)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Rollback Plan](#rollback-plan)

---

## Security Architecture

### Current Security Model (Verified)

Our security is **multi-layered** and safe for public access:

#### Layer 1: RLS Policies on Base Tables
```sql
-- posts table
posts_select_active_or_own: (status = 'active') OR (author_id = auth.uid())
-- For anon users, auth.uid() = NULL, so only active posts are visible

-- profiles table
"Profiles are viewable by everyone": true (⚠️ see optional cleanup below)
"Public profiles are viewable by anyone": include_in_public_feed = true

-- watches table
"Watches of public profiles are viewable by anyone":
  EXISTS (SELECT 1 FROM profiles WHERE id = watches.user_id AND include_in_public_feed = true)

-- measurements table
"Users can view measurements of their watches": auth.uid() = watches.user_id
-- Anon cannot query measurements directly
```

#### Layer 2: View Filtering (public_feed_posts)
```sql
-- Additional filtering beyond RLS
WHERE p.status = 'active'
  AND (
    p.kind = 'post_photo'  -- All photo posts
    OR (p.kind = 'post_measurement' AND prof.include_in_public_feed = true)  -- Opted-in measurement posts
  )
```

### Security Guarantees

✅ **Anon key can be used safely** (even if exposed):
- RLS policies restrict access to public data only
- View adds additional filtering
- No write access for anon users (RLS blocks INSERT/UPDATE/DELETE)

✅ **Private content is protected**:
- Inactive posts: Blocked by RLS + view
- Private measurements: User must opt-in via `include_in_public_feed`
- User's own watches/measurements: Requires `auth.uid()` match

✅ **Edge function keeps keys server-side**:
- Environment variables never exposed to browser
- User only sees generated HTML output

### Optional Security Hardening

Before implementation, consider this optional cleanup:

```sql
-- OPTIONAL: Tighten profiles access (if profiles contain sensitive data)
DROP POLICY "Profiles are viewable by everyone" ON profiles;
-- Keep only: "Public profiles are viewable by anyone"

-- OPTIONAL: Tighten view permissions (cosmetic - RLS already protects)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON public_feed_posts FROM anon;
GRANT SELECT ON public_feed_posts TO anon;
```

**Decision**: These are optional. The current security is already sound due to RLS policies.

---

## Prerequisites

### 1. Supabase Configuration

**Verify access to:**
- Supabase Project URL
- Supabase Anon Key (same key used by iOS app)

**Confirm RLS policies allow public access:**
```sql
-- Run this query to verify anon can access public_feed_posts
SELECT COUNT(*) FROM public_feed_posts;
-- If this returns a number (not an error), anon access is configured correctly
```

### 2. Development Environment

**Local setup:**
```bash
cd /Users/willwu/Development/B23, LLC/tickiq-website

# Install Supabase SDK
npm install @supabase/supabase-js

# Verify package.json updated
cat package.json | grep supabase
```

### 3. Vercel Environment Variables

**Add to Vercel project settings** (not committed to git):
- `SUPABASE_URL`: `https://[your-project].supabase.co`
- `SUPABASE_ANON_KEY`: `eyJ...` (your anon key)

**For local testing**, create `.env.local`:
```bash
# DO NOT commit this file - add to .gitignore
SUPABASE_URL=https://[your-project].supabase.co
SUPABASE_ANON_KEY=eyJ...
```

---

## Implementation Steps

### Phase 1: Environment Setup (15 min)

1. **Install dependencies**
   ```bash
   npm install @supabase/supabase-js
   ```

2. **Add environment variables to Vercel**
   - Go to Vercel Dashboard → Project → Settings → Environment Variables
   - Add `SUPABASE_URL` and `SUPABASE_ANON_KEY`
   - Add to all environments: Production, Preview, Development

3. **Create `.env.local` for local testing**
   ```bash
   echo "SUPABASE_URL=your_url" > .env.local
   echo "SUPABASE_ANON_KEY=your_key" >> .env.local
   echo ".env.local" >> .gitignore  # Ensure it's ignored
   ```

### Phase 2: Update Edge Function (30 min)

1. **Backup current implementation**
   ```bash
   cp api/post.js api/post.js.backup
   ```

2. **Replace `api/post.js`** with new implementation (see Code Changes section)

3. **Key changes**:
   - Add Supabase client initialization
   - Fetch post data from `public_feed_posts` view
   - Generate dynamic HTML with actual content
   - Handle errors gracefully (404 for missing posts)
   - Support dev mode (`?dev=true` parameter)

### Phase 3: Update HTML Template (20 min)

1. **Backup current template**
   ```bash
   cp post.html post.html.backup
   ```

2. **Update `post.html`** (or embed in edge function):
   - Add styles for post image display
   - Add styles for caption, author info, watch details
   - Add engagement metrics display (likes, comments)
   - Maintain dev mode indicator
   - Keep QR code modal for desktop

3. **Design considerations**:
   - Mobile-first responsive design
   - Image optimization (consider CDN/Vercel Image Optimization)
   - Graceful fallbacks (missing images, empty captions)
   - Accessibility (alt tags, semantic HTML)

### Phase 4: Local Testing (30 min)

1. **Start local dev server**
   ```bash
   npm run dev  # or: vercel dev
   ```

2. **Test scenarios** (see Testing Strategy section):
   - Valid post ID (photo post)
   - Valid post ID (measurement post with opt-in)
   - Invalid post ID (should show 404)
   - Private post (should show 404)
   - Dev mode parameter (`?dev=true`)

### Phase 5: Deploy to Preview (15 min)

1. **Commit changes**
   ```bash
   git add api/post.js post.html package.json package-lock.json
   git commit -m "Add post content display with Supabase integration"
   ```

2. **Push to feature branch**
   ```bash
   git checkout -b feature/post-content-display
   git push origin feature/post-content-display
   ```

3. **Vercel auto-deploys preview**
   - Get preview URL from Vercel
   - Test on preview environment

### Phase 6: Production Deployment (10 min)

1. **Merge to main**
   ```bash
   git checkout main
   git merge feature/post-content-display
   git push origin main
   ```

2. **Verify production deployment**
   - Check Vercel deployment logs
   - Test production URLs

---

## Code Changes

### 1. Updated `api/post.js`

<details>
<summary>Full implementation (click to expand)</summary>

```javascript
import { createClient } from '@supabase/supabase-js'

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const postId = pathParts[2];

  if (!postId || postId === 'post') {
    return show404Page();
  }

  // Check for dev parameter
  const isDev = url.searchParams.get('dev') === 'true';
  const currentDomain = `${url.protocol}//${url.host}`;

  // Initialize Supabase client with anon key (RLS enforces security)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    // Fetch post from public_feed_posts view
    const { data: post, error } = await supabase
      .from('public_feed_posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (error || !post) {
      console.error('Post fetch error:', error);
      return show404Page();
    }

    // Generate HTML with post content
    const html = generatePostHTML({
      post,
      currentDomain,
      isDev
    });

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 's-maxage=300, stale-while-revalidate=3600', // Cache 5 min, revalidate 1 hour
      },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return show404Page();
  }
}

function generatePostHTML({ post, currentDomain, isDev }) {
  // Escape HTML to prevent XSS
  const caption = escapeHtml(post.caption || '');
  const username = escapeHtml(post.username || 'tickIQ User');
  const watchInfo = post.watch_make && post.watch_model
    ? `${escapeHtml(post.watch_make)} ${escapeHtml(post.watch_model)}`
    : '';

  // Generate meta tags
  const title = `${username} on tickIQ${watchInfo ? ` - ${watchInfo}` : ''}`;
  const description = caption.substring(0, 160) || 'See this watch moment on tickIQ';
  const ogImage = post.image_url || `${currentDomain}/assets/images/og-image-profile-landscape.png`;

  // Determine URL scheme for deep linking
  const urlScheme = isDev ? 'tickiq-dev' : 'tickiq';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex,nofollow">
    <title>${title}</title>
    <meta name="description" content="${description}">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:url" content="${currentDomain}/p/${post.id}">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${ogImage}">

    <!-- App Links -->
    <meta property="al:ios:app_name" content="tickIQ">
    <meta property="al:ios:url" content="${urlScheme}://post/${post.id}">

    <!-- Favicons -->
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32x32.png">
    <link rel="apple-touch-icon" href="/assets/icons/app-icon.png">

    <link rel="stylesheet" href="/css/styles.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">

    <style>
        body {
            background: #fafafa;
        }

        .post-container {
            max-width: 600px;
            margin: 100px auto 2rem;
            padding: 0 1rem;
        }

        .post-card {
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            margin-bottom: 2rem;
        }

        .post-header {
            padding: 1rem;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .post-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #ddd;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            color: #666;
        }

        .post-author-info h3 {
            margin: 0;
            font-size: 0.95rem;
            font-weight: 600;
        }

        .post-watch-info {
            margin: 0;
            font-size: 0.85rem;
            color: #666;
        }

        .post-image {
            width: 100%;
            display: block;
            background: #f0f0f0;
        }

        .post-content {
            padding: 1rem;
        }

        .post-engagement {
            display: flex;
            gap: 1.5rem;
            padding: 0.75rem 1rem;
            border-top: 1px solid #efefef;
            color: #666;
            font-size: 0.9rem;
        }

        .post-engagement span {
            display: flex;
            align-items: center;
            gap: 0.375rem;
        }

        .post-caption {
            line-height: 1.6;
            margin-bottom: 1rem;
        }

        .post-timestamp {
            font-size: 0.85rem;
            color: #999;
        }

        .post-cta {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 1rem 2rem;
            background: #000;
            color: #fff;
            text-decoration: none;
            border-radius: 100px;
            font-weight: 600;
            margin: 1rem 0;
            transition: all 0.2s;
        }

        .post-cta:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }

        .dev-badge {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff3838;
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 100px;
            font-size: 0.75rem;
            font-weight: 600;
            z-index: 1000;
            animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        @media (max-width: 768px) {
            .post-container {
                margin-top: 80px;
            }
        }
    </style>
</head>
<body>
    ${isDev ? '<div class="dev-badge">DEV MODE</div>' : ''}

    <!-- Header will be injected -->
    <header></header>

    <div class="post-container">
        <div class="post-card">
            <div class="post-header">
                ${post.avatar_url
                  ? `<img src="${post.avatar_url}" alt="${username}" class="post-avatar">`
                  : `<div class="post-avatar">${username.charAt(0).toUpperCase()}</div>`
                }
                <div class="post-author-info">
                    <h3>@${username}</h3>
                    ${watchInfo ? `<p class="post-watch-info">${watchInfo}</p>` : ''}
                </div>
            </div>

            ${post.image_url ? `<img src="${post.image_url}" alt="Post" class="post-image">` : ''}

            <div class="post-engagement">
                <span>❤️ ${post.like_count || 0}</span>
                <span>💬 ${post.comment_count || 0}</span>
            </div>

            ${caption ? `
            <div class="post-content">
                <p class="post-caption"><strong>@${username}</strong> ${caption}</p>
            </div>
            ` : ''}
        </div>

        <div style="text-align: center;">
            <a href="${urlScheme}://post/${post.id}" class="post-cta">
                View Full Post in App
            </a>
            <p style="color: #666; font-size: 0.9rem; margin-top: 1rem;">
                See all comments, like posts, and explore more watches
            </p>
        </div>
    </div>

    <!-- Footer will be injected -->
    <footer></footer>

    <script src="/js/components.js"></script>

    <!-- Auto-redirect on iOS -->
    <script>
        (function() {
            const isIPad = /iPad/.test(navigator.userAgent) ||
                           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
            const isIOS = isIPad || isIPhone;

            if (isIOS) {
                setTimeout(() => {
                    const appUrl = '${urlScheme}://post/${post.id}';
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    iframe.src = appUrl;
                    document.body.appendChild(iframe);

                    setTimeout(() => {
                        document.body.removeChild(iframe);
                    }, 1000);
                }, 800);
            }
        })();
    </script>

    <!-- Vercel Analytics -->
    <script>
        window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    </script>
    <script defer src="/_vercel/insights/script.js"></script>
</body>
</html>`;
}

function show404Page() {
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Post Not Found - tickIQ</title>
    <link rel="stylesheet" href="/css/styles.css">
    <style>
        body {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
            padding: 2rem;
        }
        .error-container {
            max-width: 500px;
        }
        h1 {
            font-size: 6rem;
            font-weight: 200;
            margin: 0 0 1rem;
        }
        p {
            font-size: 1.25rem;
            color: #666;
            margin-bottom: 2rem;
        }
        a {
            display: inline-block;
            padding: 1rem 2rem;
            background: #000;
            color: #fff;
            text-decoration: none;
            border-radius: 100px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>404</h1>
        <p>This post doesn't exist or is no longer public.</p>
        <a href="/">Return to homepage</a>
    </div>
</body>
</html>`, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(text).replace(/[<>&"']/g, m => map[m]);
}
```

</details>

### 2. Update `.gitignore`

```bash
# Add to .gitignore if not already present
.env.local
.env*.local
.vercel
```

---

## Testing Strategy

### Test Cases

#### 1. Valid Photo Post
```bash
# Test URL: https://tickiq.app/p/[valid-photo-post-id]
Expected:
✓ Shows post image
✓ Shows caption
✓ Shows author username
✓ Shows like/comment counts
✓ Deep link button works
✓ Meta tags populated correctly
```

#### 2. Valid Measurement Post (Opted In)
```bash
# Test URL: https://tickiq.app/p/[valid-measurement-post-id]
Expected:
✓ Shows measurement data
✓ Shows watch info (make, model)
✓ Shows author username
✓ Only visible if user opted in to public feed
```

#### 3. Invalid/Private Post
```bash
# Test URL: https://tickiq.app/p/invalid-uuid
Expected:
✓ Shows 404 page
✓ Does not expose error details
✓ Provides link back to homepage
```

#### 4. Dev Mode
```bash
# Test URL: https://tickiq.app/p/[post-id]?dev=true
Expected:
✓ Shows "DEV MODE" badge
✓ Deep links use tickiq-dev:// scheme
✓ All other functionality identical
```

#### 5. Mobile vs Desktop
```bash
# Test on iOS
Expected:
✓ Auto-attempts app launch
✓ Deep link button uses tickiq:// scheme

# Test on Desktop
Expected:
✓ Shows QR code option (if we keep this feature)
✓ Responsive layout works
```

#### 6. Social Sharing
```bash
# Share on Twitter, Facebook, iMessage
Expected:
✓ Rich preview with image
✓ Correct title and description
✓ OG tags populated
```

### Testing Checklist

- [ ] Local testing with `.env.local`
- [ ] Preview deployment testing
- [ ] Production deployment testing
- [ ] Test with real post IDs from iOS app
- [ ] Test cross-platform (iOS, Android, Desktop)
- [ ] Test social media sharing previews
- [ ] Test 404 handling
- [ ] Test dev mode parameter
- [ ] Verify Vercel function logs (no errors)
- [ ] Performance check (Edge function latency)

---

## Deployment Process

### Pre-Deployment Checklist

- [ ] Code reviewed
- [ ] All tests passing
- [ ] Environment variables set in Vercel
- [ ] Supabase RLS policies verified
- [ ] Backup of current `api/post.js` created
- [ ] Rollback plan understood

### Deployment Steps

1. **Feature branch deployment** (auto via Vercel)
   ```bash
   git push origin feature/post-content-display
   ```
   - Vercel creates preview deployment
   - Test preview URL thoroughly

2. **Merge to main** (manual)
   ```bash
   git checkout main
   git merge feature/post-content-display
   git push origin main
   ```
   - Vercel auto-deploys to production
   - Monitor deployment logs

3. **Verify production**
   - Test multiple post URLs
   - Check Vercel function logs
   - Monitor error rates

### Post-Deployment Verification

Within 15 minutes of deployment:
- [ ] Test 3-5 different post URLs
- [ ] Verify meta tags in browser inspector
- [ ] Check Vercel function logs for errors
- [ ] Test dev mode parameter
- [ ] Verify 404 handling

Within 24 hours:
- [ ] Monitor Vercel Analytics for errors
- [ ] Check Supabase dashboard for API usage spike
- [ ] Review user feedback (if any)

---

## Monitoring & Maintenance

### What to Monitor

**Vercel Dashboard:**
- Function invocation count (expect increase)
- Function errors (should be near 0%)
- Function duration (expect <500ms)
- Bandwidth usage

**Supabase Dashboard:**
- API request count (expect increase)
- Query performance
- RLS policy violations (should be 0)
- Database connection pool usage

### Expected Metrics

**Normal traffic:**
- Function duration: 200-500ms
- Cache hit rate: 60-80% (after initial requests)
- Error rate: <1%

**Red flags:**
- Function errors >5%
- Function duration >2s
- Supabase errors in logs
- Unexpected RLS denials

### Alerting

**Set up Vercel alerts for:**
- Function error rate >5%
- Function duration >2s
- Deployment failures

**Set up Supabase alerts for:**
- API error rate spike
- Unusual query patterns
- Rate limit approaching

### Maintenance Tasks

**Weekly:**
- Review Vercel function logs
- Check Supabase API usage trends
- Monitor error rates

**Monthly:**
- Review cache performance
- Optimize image loading if needed
- Update dependencies

**Quarterly:**
- Security audit of RLS policies
- Review access patterns
- Consider adding CDN for images

---

## Rollback Plan

### Quick Rollback (If Critical Issue)

**Option 1: Revert Git Commit**
```bash
# Identify the commit to revert to
git log --oneline

# Revert to previous commit
git revert HEAD
git push origin main
# Vercel auto-deploys rollback
```

**Option 2: Redeploy Previous Version in Vercel**
- Go to Vercel Dashboard → Deployments
- Find previous successful deployment
- Click "..." → "Promote to Production"

**Option 3: Restore Backup File**
```bash
# Restore from backup
cp api/post.js.backup api/post.js
git add api/post.js
git commit -m "Rollback: restore previous post.js"
git push origin main
```

### Rollback Decision Matrix

**Immediate rollback if:**
- All post pages showing 404
- Supabase credentials exposed
- Function errors >50%
- Private data exposed

**Monitor and fix if:**
- Function errors 5-20%
- Slow performance (>2s)
- Intermittent failures
- UI/UX issues

**No action needed if:**
- Function errors <5%
- Performance acceptable
- Minor styling issues

---

## Success Criteria

### Minimum Viable Success
- [ ] Post pages display actual content (image, caption, author)
- [ ] 404 handling works for invalid posts
- [ ] No private data exposed
- [ ] Function error rate <5%
- [ ] Deep linking still works

### Full Success
- [ ] All above ✓
- [ ] Social sharing shows rich previews
- [ ] Performance <500ms average
- [ ] Dev mode works correctly
- [ ] Mobile and desktop experiences optimized
- [ ] Cache hit rate >60%

---

## Future Enhancements (Out of Scope)

Consider for future iterations:

1. **Comments Display**
   - Show top 3 comments
   - "View all in app" link

2. **Image Optimization**
   - Use Vercel Image Optimization
   - Responsive image sizes
   - Lazy loading

3. **Related Posts**
   - "More from @username"
   - "Similar watches"

4. **Analytics**
   - Track web views vs app opens
   - Monitor conversion rate

5. **Progressive Enhancement**
   - Add interactions (like button, comment preview)
   - Real-time updates via Supabase Realtime

---

## Appendix

### A. Useful SQL Queries

```sql
-- Test anon access to view
SELECT COUNT(*) FROM public_feed_posts;

-- Find recent posts for testing
SELECT id, kind, author_id, caption, created_at
FROM public_feed_posts
ORDER BY created_at DESC
LIMIT 10;

-- Check if specific post is public
SELECT * FROM public_feed_posts WHERE id = '[post-id]';

-- Verify RLS policies
SELECT * FROM pg_policies WHERE tablename = 'posts';
```

### B. Environment Variables Reference

```bash
# Required for edge function
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_ANON_KEY=eyJ...

# For local development only (.env.local)
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_ANON_KEY=eyJ...
```

### C. Useful Commands

```bash
# Install dependencies
npm install @supabase/supabase-js

# Local development
npm run dev  # or: vercel dev

# Deploy to preview
git push origin feature-branch

# Deploy to production
git push origin main

# View Vercel logs
vercel logs [deployment-url]

# Check environment variables
vercel env ls
```

### D. Troubleshooting

**Issue: "Supabase client error"**
- Check environment variables are set
- Verify SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Test credentials with curl

**Issue: "404 for all posts"**
- Check RLS policies allow anon SELECT
- Verify public_feed_posts view exists
- Test query in Supabase SQL editor as anon

**Issue: "Private posts showing"**
- Review RLS policies immediately
- Check view definition WHERE clause
- Test with private post ID

**Issue: "Slow performance"**
- Check Supabase query performance
- Verify edge function caching
- Consider adding indexes

---

## Sign-off

**Created by:** Claude Code
**Date:** 2025-10-14
**Status:** Ready for Implementation

**Reviewed by:** [To be filled]
**Approved by:** [To be filled]
**Implementation Date:** [To be filled]
