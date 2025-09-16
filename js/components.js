// Shared header component for tickIQ website
(function() {
    // Header HTML template
    function renderHeader(options = {}) {
        const { isHomePage = false } = options;
        
        // Determine if logo should be wrapped in a link
        const logoContent = `
            <img src="/assets/icons/app-icon.png" alt="tickIQ" class="header-app-icon">
            <img src="/assets/images/logo.svg" alt="tickIQ" class="header-logo">
        `;
        
        const logoHTML = isHomePage ? logoContent : `
            <a href="/" style="text-decoration: none; color: inherit; display: flex; align-items: center;">
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
                                <svg class="apple-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 16.97 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
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
                            <a href="/business">Business</a>
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