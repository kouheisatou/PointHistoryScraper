// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeParticles();
    initializeThemeToggle();
    initializeScrollAnimations();
    initializeNavbar();
    initializeSmoothScroll();
    initializeTypingEffect();
    initializeCounters();
    initializeParallax();
    initializeDownloadButtonRedirect();
});

// Particles.js Configuration
function initializeParticles() {
    if (typeof particlesJS !== 'undefined') {
        particlesJS('particles-js', {
            particles: {
                number: {
                    value: 80,
                    density: {
                        enable: true,
                        value_area: 800
                    }
                },
                color: {
                    value: ['#6366f1', '#f59e0b', '#10b981', '#ef4444']
                },
                shape: {
                    type: 'circle',
                    stroke: {
                        width: 0,
                        color: '#000000'
                    }
                },
                opacity: {
                    value: 0.5,
                    random: false,
                    anim: {
                        enable: true,
                        speed: 1,
                        opacity_min: 0.1,
                        sync: false
                    }
                },
                size: {
                    value: 3,
                    random: true,
                    anim: {
                        enable: true,
                        speed: 2,
                        size_min: 0.1,
                        sync: false
                    }
                },
                line_linked: {
                    enable: true,
                    distance: 150,
                    color: '#6366f1',
                    opacity: 0.2,
                    width: 1
                },
                move: {
                    enable: true,
                    speed: 2,
                    direction: 'none',
                    random: false,
                    straight: false,
                    out_mode: 'out',
                    bounce: false,
                    attract: {
                        enable: false,
                        rotateX: 600,
                        rotateY: 1200
                    }
                }
            },
            interactivity: {
                detect_on: 'canvas',
                events: {
                    onhover: {
                        enable: true,
                        mode: 'repulse'
                    },
                    onclick: {
                        enable: true,
                        mode: 'push'
                    },
                    resize: true
                },
                modes: {
                    grab: {
                        distance: 400,
                        line_linked: {
                            opacity: 1
                        }
                    },
                    bubble: {
                        distance: 400,
                        size: 40,
                        duration: 2,
                        opacity: 8,
                        speed: 3
                    },
                    repulse: {
                        distance: 200,
                        duration: 0.4
                    },
                    push: {
                        particles_nb: 4
                    },
                    remove: {
                        particles_nb: 2
                    }
                }
            },
            retina_detect: true
        });
    }
}

// Theme Toggle
function initializeThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const toggleIcon = themeToggle.querySelector('.toggle-icon');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    
    // Set initial theme
    document.documentElement.setAttribute('data-theme', currentTheme);
    toggleIcon.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
    
    themeToggle.addEventListener('click', function() {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        toggleIcon.textContent = newTheme === 'dark' ? '🌙' : '☀️';
        
        // Add animation effect
        themeToggle.style.transform = 'scale(0.8)';
        setTimeout(() => {
            themeToggle.style.transform = 'scale(1)';
        }, 150);
    });
}

// Scroll Animations with Intersection Observer
function initializeScrollAnimations() {
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,
            easing: 'ease-out-cubic',
            once: true,
            offset: 100
        });
    }
    
    // Custom scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);
    
    // Observe elements
    document.querySelectorAll('.feature-card, .step, .download-card, .stat-item').forEach(el => {
        observer.observe(el);
    });
}

// Navbar Scroll Effect
function initializeNavbar() {
    const navbar = document.querySelector('.navbar');
    let lastScrollY = window.scrollY;
    
    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;
        
        if (currentScrollY > 100) {
            navbar.style.backgroundColor = 'rgba(15, 15, 35, 0.95)';
            navbar.style.backdropFilter = 'blur(20px) saturate(180%)';
        } else {
            navbar.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            navbar.style.backdropFilter = 'blur(20px) saturate(180%)';
        }
        
        // Hide/show navbar on scroll
        if (currentScrollY > lastScrollY && currentScrollY > 200) {
            navbar.style.transform = 'translateY(-100%)';
        } else {
            navbar.style.transform = 'translateY(0)';
        }
        
        lastScrollY = currentScrollY;
    });
}

// Smooth Scroll for Navigation Links
function initializeSmoothScroll() {
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
}

// Typing Effect for Hero Title
function initializeTypingEffect() {
    const heroTitle = document.querySelector('.hero-title');
    if (!heroTitle) return;
    
    const text = heroTitle.innerHTML;
    heroTitle.innerHTML = '';
    
    let index = 0;
    let isTag = false;
    let tagBuffer = '';
    
    function typeText() {
        if (index < text.length) {
            const currentChar = text[index];
            
            if (currentChar === '<') {
                isTag = true;
                tagBuffer = '<';
            } else if (currentChar === '>' && isTag) {
                isTag = false;
                tagBuffer += '>';
                heroTitle.innerHTML += tagBuffer;
                tagBuffer = '';
            } else if (isTag) {
                tagBuffer += currentChar;
            } else {
                heroTitle.innerHTML += currentChar;
            }
            
            index++;
            setTimeout(typeText, isTag ? 0 : 50);
        } else {
            // Add cursor animation
            const cursor = document.createElement('span');
            cursor.className = 'typing-cursor';
            cursor.textContent = '|';
            cursor.style.animation = 'blink 1s infinite';
            heroTitle.appendChild(cursor);
            
            setTimeout(() => {
                cursor.remove();
            }, 3000);
        }
    }
    
    // Start typing effect after a delay
    setTimeout(typeText, 1000);
}

// Counter Animation
function initializeCounters() {
    const counters = document.querySelectorAll('[data-counter]');
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseInt(counter.dataset.counter);
                const duration = 2000;
                const increment = target / (duration / 16);
                let current = 0;
                
                const timer = setInterval(() => {
                    current += increment;
                    if (current >= target) {
                        current = target;
                        clearInterval(timer);
                    }
                    counter.textContent = Math.floor(current).toLocaleString();
                }, 16);
                
                counterObserver.unobserve(counter);
            }
        });
    });
    
    counters.forEach(counter => {
        counterObserver.observe(counter);
    });
}

// Parallax Effect
function initializeParallax() {
    const parallaxElements = document.querySelectorAll('[data-parallax]');
    
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        
        parallaxElements.forEach(element => {
            const speed = element.dataset.parallax || 0.5;
            const yPos = -(scrolled * speed);
            element.style.transform = `translateY(${yPos}px)`;
        });
    });
}

// Mouse Cursor Effect
function initializeCursorEffect() {
    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    cursor.style.cssText = `
        position: fixed;
        width: 20px;
        height: 20px;
        background: radial-gradient(circle, rgba(99, 102, 241, 0.8) 0%, transparent 70%);
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999;
        mix-blend-mode: difference;
        transition: transform 0.1s ease;
    `;
    document.body.appendChild(cursor);
    
    document.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX - 10 + 'px';
        cursor.style.top = e.clientY - 10 + 'px';
    });
    
    document.addEventListener('mousedown', () => {
        cursor.style.transform = 'scale(1.5)';
    });
    
    document.addEventListener('mouseup', () => {
        cursor.style.transform = 'scale(1)';
    });
}

// Card Tilt Effect
function initializeCardTilt() {
    const cards = document.querySelectorAll('.feature-card, .download-card, .floating-card');
    
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / 10;
            const rotateY = (centerX - x) / 10;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
        });
    });
}

// Scroll Progress Indicator
function initializeScrollProgress() {
    const progressBar = document.createElement('div');
    progressBar.className = 'scroll-progress';
    progressBar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 0%;
        height: 4px;
        background: linear-gradient(90deg, #6366f1, #f59e0b, #10b981);
        z-index: 1001;
        transition: width 0.1s ease;
    `;
    document.body.appendChild(progressBar);
    
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const maxHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = (scrolled / maxHeight) * 100;
        progressBar.style.width = progress + '%';
    });
}

// Button Ripple Effect
function initializeRippleEffect() {
    const buttons = document.querySelectorAll('.btn-primary, .btn-secondary, .download-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s ease-out;
                pointer-events: none;
            `;
            
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    });
}

// ダウンロードボタンでChrome Web Storeに遷移
function initializeDownloadButtonRedirect() {
    document.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            window.open('https://chromewebstore.google.com/detail/fdancdeohoaopohmjfnbpddgndlkcaip', '_blank');
        });
    });
}

// Initialize additional effects
setTimeout(() => {
    initializeCursorEffect();
    initializeCardTilt();
    initializeScrollProgress();
    initializeRippleEffect();
}, 100);

// CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
    }
    
    @keyframes ripple {
        to {
            transform: scale(2);
            opacity: 0;
        }
    }
    
    .animate-in {
        opacity: 1;
        transform: translateY(0);
    }
    
    .typing-cursor {
        color: var(--primary-color);
        font-weight: normal;
    }
    
    .loader-spinner {
        width: 50px;
        height: 50px;
        border: 3px solid var(--glass-border);
        border-top: 3px solid var(--primary-color);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .loader-content {
        text-align: center;
        color: var(--text-secondary);
    }
`;
document.head.appendChild(style);

// Performance optimization
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Optimize scroll events
const optimizedScrollHandler = debounce(() => {
    // Scroll optimizations here
}, 16);

window.addEventListener('scroll', optimizedScrollHandler);

// Service Worker Registration (for PWA-like experience)
// Note: Service Worker is commented out for this promotional homepage
// Uncomment and create sw.js if you need PWA functionality
/*
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration failed, continue without it
    });
}
*/

// Error Handling
window.addEventListener('error', (e) => {
    console.warn('Non-critical error:', e.error);
});

// Console Art
console.log(`
%c
 ____  ____  ____  _  _  ____  ____  _  _    _  _  ____  ___  ____  ____  ____  _  _ 
(  _ \\(  _ \\(_  _)( \\/ )(  _ \\(_  _)( \\( )  ( \\/ )(  _ \\/ __)(_  _)(  _ \\(  _ \\( \\/ )
 )___/ )   / _)(_  \\  /  )___/  )(   )  (    \\  /  )___/\\__ \\  )(   )   / )   / )  ( 
(__)  (_)\\_)(____)  \\/  (__)   (__) (_)\\_)    \\/  (__)  (___/ (__) (_)\\_)(_)\\_)(_/\\_)

楽天ポイント履歴一括保存 - Chrome拡張機能
セキュア・高速・プライバシー重視

GitHub: https://github.com/kouheisatou/PointHistoryScraper
`, 'color: #6366f1; font-weight: bold;');

console.log('%c限界を超えてリッチでモダンなホームページへようこそ！🚀', 'color: #f59e0b; font-size: 16px; font-weight: bold;'); 