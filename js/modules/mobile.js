// =====================================================
// MOBILE TOUCH INTERACTIONS - GAMEVAULT
// =====================================================

export const initMobileTouchHandlers = () => {
    // Detect if user is on mobile/tablet
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (!isMobile && !isTouchDevice) return;

    console.log('📱 Initializing mobile touch handlers');

    // Prevent body scroll when modal is open
    const preventBodyScroll = () => {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'class') {
                        const isHidden = modal.classList.contains('hidden');
                        document.body.style.overflow = isHidden ? 'auto' : 'hidden';
                    }
                });
            });
            observer.observe(modal, { attributes: true });
        });
    };

    // Pull-to-refresh for game list
    let touchStartY = 0;
    let pulling = false;

    const handleTouchStart = (e) => {
        if (window.scrollY === 0) {
            touchStartY = e.touches[0].clientY;
        }
    };

    const handleTouchMove = (e) => {
        if (touchStartY === 0) return;

        const touchY = e.touches[0].clientY;
        const pullDistance = touchY - touchStartY;

        if (pullDistance > 100 && window.scrollY === 0 && !pulling) {
            pulling = true;
            // Trigger refresh
            const event = new CustomEvent('pull-to-refresh');
            document.dispatchEvent(event);
        }
    };

    const handleTouchEnd = () => {
        touchStartY = 0;
        pulling = false;
    };

    // Swipe to dismiss modals (optional enhancement)
    const initSwipeToDismiss = () => {
        const modals = document.querySelectorAll('.modal-content');

        modals.forEach(modal => {
            let startX = 0;
            let startY = 0;

            modal.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            });

            modal.addEventListener('touchend', (e) => {
                const endX = e.changedTouches[0].clientX;
                const endY = e.changedTouches[0].clientY;

                const diffX = endX - startX;
                const diffY = endY - startY;

                // Swipe down to close (only if swiped more vertical than horizontal)
                if (diffY > 100 && Math.abs(diffY) > Math.abs(diffX)) {
                    const closeBtn = modal.querySelector('.close-btn');
                    if (closeBtn) closeBtn.click();
                }
            });
        });
    };

    // Haptic feedback (if supported)
    const triggerHaptic = (type = 'light') => {
        if ('vibrate' in navigator) {
            const patterns = {
                light: 10,
                medium: 20,
                heavy: 40
            };
            navigator.vibrate(patterns[type] || 10);
        }
    };

    // Add haptic to important buttons
    const addHapticToButtons = () => {
        const importantButtons = document.querySelectorAll('.btn-primary, .game-card, .feed-actions button');

        importantButtons.forEach(btn => {
            btn.addEventListener('touchstart', () => {
                triggerHaptic('light');
            }, { passive: true });
        });
    };

    // Fast tap (prevent 300ms delay on old browsers)
    const fastTap = () => {
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    };

    // Prevent double-tap zoom on buttons/controls
    const preventDoubleTapZoom = () => {
        const controls = document.querySelectorAll('button, .btn, .icon-btn, .game-card');

        controls.forEach(control => {
            control.addEventListener('touchend', (e) => {
                e.preventDefault();
                control.click();
            });
        });
    };

    // Image viewer - allow pinch zoom on images
    const enableImagePinchZoom = () => {
        const images = document.querySelectorAll('.game-card img, .feed-card img');

        images.forEach(img => {
            img.style.touchAction = 'pinch-zoom';
        });
    };

    // Smooth scroll for anchor links
    const smoothScroll = () => {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    };

    // Initialize all handlers
    preventBodyScroll();
    addHapticToButtons();
    fastTap();
    enableImagePinchZoom();
    smoothScroll();
    initBackToTop();
    initMenuBackdrop();
    initLazyLoading();

    // Add touch event listeners to document
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Initialize swipe to dismiss after modals are rendered
    setTimeout(initSwipeToDismiss, 1000);

    // Expose haptic trigger globally
    window.triggerHaptic = triggerHaptic;

    console.log('✅ Mobile touch handlers initialized');
};

// Back to Top FAB button
const initBackToTop = () => {
    // Create button if not exists
    let btn = document.querySelector('.back-to-top');
    if (!btn) {
        btn = document.createElement('button');
        btn.className = 'back-to-top';
        btn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
        btn.setAttribute('aria-label', 'Voltar ao topo');
        document.body.appendChild(btn);
    }

    // Show/hide on scroll
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    }, { passive: true });

    // Scroll to top on click
    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
};

// Menu backdrop for closing menus when clicking outside
const initMenuBackdrop = () => {
    // Create backdrop element
    let backdrop = document.querySelector('.menu-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'menu-backdrop';
        document.body.appendChild(backdrop);
    }

    // Close menus when clicking backdrop
    backdrop.addEventListener('click', () => {
        document.getElementById('mobileMenu')?.classList.add('hidden');
        document.getElementById('userDropdown')?.classList.add('hidden');
        document.getElementById('notifPanel')?.classList.add('hidden');
        backdrop.classList.remove('active');
    });

    // Observe menu state changes
    const observer = new MutationObserver((mutations) => {
        const mobileMenu = document.getElementById('mobileMenu');
        const userDropdown = document.getElementById('userDropdown');

        const isAnyOpen =
            (mobileMenu && !mobileMenu.classList.contains('hidden')) ||
            (userDropdown && !userDropdown.classList.contains('hidden'));

        if (isAnyOpen) {
            backdrop.classList.add('active');
        } else {
            backdrop.classList.remove('active');
        }
    });

    // Start observing after a short delay
    setTimeout(() => {
        const mobileMenu = document.getElementById('mobileMenu');
        const userDropdown = document.getElementById('userDropdown');

        if (mobileMenu) observer.observe(mobileMenu, { attributes: true, attributeFilter: ['class'] });
        if (userDropdown) observer.observe(userDropdown, { attributes: true, attributeFilter: ['class'] });
    }, 1000);
};

// Lazy loading for images
const initLazyLoading = () => {
    // Add loading="lazy" to all game card images
    const images = document.querySelectorAll('.game-card img:not([loading])');
    images.forEach(img => {
        img.setAttribute('loading', 'lazy');
    });

    // Use IntersectionObserver for better control
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }
                    img.classList.remove('lazy');
                    imageObserver.unobserve(img);
                }
            });
        }, { rootMargin: '50px' });

        document.querySelectorAll('img.lazy').forEach(img => {
            imageObserver.observe(img);
        });
    }
};

// Auto-detect orientation changes
export const handleOrientationChange = () => {
    const updateOrientation = () => {
        const orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
        document.body.setAttribute('data-orientation', orientation);

        // Don't dispatch resize event here - it causes infinite loop!
        // Layout recalculation happens automatically on orientation change
    };

    window.addEventListener('orientationchange', updateOrientation);
    window.addEventListener('resize', updateOrientation);
    updateOrientation(); // Initial call
};

// Network detection (for offline mode)
export const initNetworkDetection = () => {
    const updateOnlineStatus = () => {
        const isOnline = navigator.onLine;
        document.body.setAttribute('data-online', isOnline);

        if (!isOnline) {
            console.warn('📵 Offline mode detected');
            // Could show a toast notification here
        }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus(); // Initial call
};
