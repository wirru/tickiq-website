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
├── index.html       # Main HTML with product logo and information
├── styles.css       # Styling with animations and responsive design
├── vercel.json      # Vercel deployment configuration
├── package.json     # Project dependencies and scripts
├── .gitignore       # Git ignore configuration
└── CLAUDE.md        # Project documentation
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

## Profile Page & Edge Function Architecture

### Overview
The profile pages (`/u/username`) use a Vercel Edge Function to dynamically generate metadata for social sharing while maintaining client-side functionality.

### How It Works
1. **Request Flow**:
   - User/crawler visits `https://tickiq.app/u/will`
   - Vercel routes this to `/api/profile` Edge Function (configured in `vercel.json`)
   - Edge Function extracts username from URL
   - Returns HTML with personalized meta tags

2. **Edge Function (`api/profile.js`)**:
   - Runs at the edge (close to users) for low latency
   - Has `profile.html` content embedded during build
   - Dynamically replaces meta tags with username
   - Uses current domain for image URLs (works on preview & production)

3. **Build Process (`scripts/build-edge-function.js`)**:
   - Reads `profile.html` file
   - Embeds entire HTML as a string in the Edge Function
   - Allows Edge Function to work without filesystem access

4. **Dynamic Replacements**:
   - Title: `@username's Watch Collection - tickIQ`
   - OG/Twitter titles with username
   - Correct domain URLs for images
   - iOS deep links with username

### Username Validation
- Edge Function escapes HTML characters for safety
- Compatible with tickIQ app rules: `[a-zA-Z0-9_-]`, 3-30 chars
- Valid usernames never contain HTML special characters

### Testing Social Previews

#### Preview Deployments
1. Run `npm run deploy` to create preview
2. **Disable Vercel Authentication** in dashboard (Settings → Password Protection)
3. Test URL: `https://[preview-url]/u/testuser`

#### Production Testing
1. Run `npm run deploy:prod`
2. Test URL: `https://tickiq.app/u/username`

#### Validation Tools
- **iMessage**: Paste link directly to see preview
- **Facebook Debugger**: https://developers.facebook.com/tools/debug/
- **Twitter Card Validator**: https://cards-dev.twitter.com/validator
- **View Source**: Check meta tags are properly replaced

## Security Headers
Configured in vercel.json:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block

## Future Enhancements
- Add product features section
- Include demo request form
- Add pricing information
- Implement email capture for launch notifications
- Add favicon and meta tags for SEO
- Include Open Graph tags for social sharing

## Development Notes
- Maintains consistency with B23 parent brand
- Designed for minimal load time and maximum performance
- No build process required - pure static files
- Ready for immediate deployment to Vercel