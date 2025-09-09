// Shared header component for tickIQ website
(function() {
    // Header HTML template
    function renderHeader(options = {}) {
        const { isHomePage = false } = options;
        
        // Determine if logo should be wrapped in a link
        const logoContent = `
            <img src="app-icon.png" alt="tickIQ" class="header-app-icon">
            <img src="logo.png" alt="tickIQ" class="header-logo">
        `;
        
        const logoHTML = isHomePage ? logoContent : `
            <a href="/" style="text-decoration: none; color: inherit; display: flex; align-items: center; gap: 0.75rem;">
                ${logoContent}
            </a>
        `;
        
        return `
            <header id="header">
                <div class="header-content">
                    <div class="header-pill">
                        <div class="pill-content">
                            <div class="nav-brand">
                                ${logoHTML}
                            </div>
                            <div class="pill-separator"></div>
                            <nav class="nav-links">
                                <a href="/about" class="nav-link">About</a>
                                <a href="/help" class="nav-link">Help Center</a>
                            </nav>
                            <div class="spacer"></div>
                            <a href="https://apps.apple.com/us/app/tickiq-measure-watch-accuracy/id6749871310" target="_blank" class="get-app-button">
                                <span>Get the app</span>
                                <svg class="phone-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" stroke-width="2"/>
                                    <line x1="9" y1="18" x2="15" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                </svg>
                                <div class="qr-popover">
                                    <div class="qr-code">
                                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://apps.apple.com/us/app/tickiq-measure-watch-accuracy/id6749871310" alt="QR Code for tickIQ App">
                                    </div>
                                    <p>Scan to download tickIQ</p>
                                </div>
                            </a>
                            <button class="hamburger-menu" id="hamburger-menu" aria-label="Menu">
                                <div class="hamburger-icon">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                            </button>
                            <div class="mobile-menu" id="mobile-menu">
                                <a href="/about">About</a>
                                <a href="/help">Help Center</a>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
        `;
    }

    // Header scroll animation
    function initHeaderAnimation() {
        const header = document.getElementById('header');
        const scrollThreshold = 100;
        let isCollapsed = false;
        
        function updateHeader() {
            const scrollY = window.scrollY;
            const shouldCollapse = scrollY > scrollThreshold;
            
            if (shouldCollapse !== isCollapsed) {
                if (shouldCollapse) {
                    header.classList.add('collapsed');
                } else {
                    header.classList.remove('collapsed');
                }
                isCollapsed = shouldCollapse;
            }
        }
        
        // Throttle scroll events
        let ticking = false;
        function handleScroll() {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    updateHeader();
                    ticking = false;
                });
                ticking = true;
            }
        }
        
        window.addEventListener('scroll', handleScroll);
        updateHeader();
        
        // Hamburger menu functionality
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const mobileMenu = document.getElementById('mobile-menu');
        
        if (hamburgerMenu && mobileMenu) {
            hamburgerMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                mobileMenu.classList.toggle('active');
            });
            
            document.addEventListener('click', () => {
                mobileMenu.classList.remove('active');
            });
            
            mobileMenu.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    }

    // Footer HTML template
    function renderFooter() {
        return `
            <footer>
                <div class="footer-content">
                    <div class="footer-sections">
                        <div class="footer-section">
                            <h4>Company</h4>
                            <a href="/about">About</a>
                            <a href="/privacy">Privacy Policy</a>
                            <a href="/terms">Terms of Service</a>
                        </div>
                        
                        <div class="footer-section">
                            <h4>Support</h4>
                            <a href="/help">Help Center</a>
                            <a href="https://forms.gle/c8UFuimtHGte3h4x5" target="_blank">Leave Feedback</a>
                        </div>
                    </div>
                    
                    <div class="footer-tagline">
                        <p>Made with love in Los Angeles</p>
                    </div>
                </div>
            </footer>
        `;
    }

    // Initialize when DOM is ready
    function init() {
        // Check if we're on the home page
        const path = window.location.pathname;
        const isHome = path === '/' || path.endsWith('/index.html') || path === '/index.html';
        
        // Replace the existing header with our component
        const existingHeader = document.querySelector('header');
        if (existingHeader) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = renderHeader({ isHomePage: isHome });
            existingHeader.replaceWith(tempDiv.firstElementChild);
        }
        
        // Replace the existing footer with our component
        const existingFooter = document.querySelector('footer');
        if (existingFooter) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = renderFooter();
            existingFooter.replaceWith(tempDiv.firstElementChild);
        }
        
        // Initialize animations
        initHeaderAnimation();
    }

    // Run initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();