document.addEventListener('DOMContentLoaded', () => {

    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Intersection Observer for scroll animations
    const revealElements = document.querySelectorAll('.reveal');

    const revealOptions = {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    };

    const revealOnScroll = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            } else {
                entry.target.classList.add('active');
                observer.unobserve(entry.target); // Only animate once
            }
        });
    }, revealOptions);

    revealElements.forEach(el => {
        revealOnScroll.observe(el);
    });

    // Trigger the active class immediately on elements high up in the viewport
    setTimeout(() => {
        document.getElementById('hero').classList.add('active');
    }, 100);



    // -----------------------------------------
    // Glass Controls Logic
    // -----------------------------------------

    // Sliders to CSS Variables Map
    const glassControlsMap = {
        'slider-blur': { prop: '--glass-blur', suffix: 'px', readOut: 'readout-blur' },
        'slider-saturate': { prop: '--glass-saturate', suffix: '%', readOut: 'readout-saturate' },
        'slider-opacity': { prop: '--glass-opacity', suffix: '', readOut: 'readout-opacity' },
        'slider-noise': { prop: '--glass-noise', suffix: '', readOut: 'readout-noise' },
        'slider-prism': { prop: '--glass-prism', suffix: '', readOut: 'readout-prism' },
    });
