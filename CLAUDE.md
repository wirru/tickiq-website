# tickIQ Website

## Project Overview
Official website for tickIQ - a professional iOS app for mechanical watch timing analysis. Features AI-powered watch identification, chronometer-precision measurements, and cloud-synchronized collection management.

## Live Site
- **Production URL**: https://tickiq.b23.ai (to be configured)
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

## Deployment Commands
```bash
# Install dependencies
npm install

# Deploy to preview
npm run deploy
# or
vercel

# Deploy to production
npm run deploy:prod
# or
vercel --prod

# Login to Vercel (if needed)
vercel login
```

## DNS Configuration (To Do)
1. Add subdomain in Vercel dashboard
2. Configure DNS for tickiq.b23.ai to point to Vercel
3. SSL certificate will be automatically provisioned

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