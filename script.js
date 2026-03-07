
document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // Dynamic Background tracking
    // ==========================================
    const glow1 = document.querySelector('.glow-1');
    const glow2 = document.querySelector('.glow-2');

    if (glow1 && glow2 && window.innerWidth > 768) {
        window.addEventListener('mousemove', (e) => {
            const x = e.clientX / window.innerWidth;
            const y = e.clientY / window.innerHeight;

            // Subtly shift background glows based on mouse position
            glow1.style.transform = `translate(${x * -30}px, ${y * -30}px)`;
            glow2.style.transform = `translate(${x * 30}px, ${y * 30}px)`;
        });
    }

    // Mobile Hamburger Menu Toggle
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.querySelector('.nav-links');
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('open');
        });
        // Close menu when a link is clicked
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navLinks.classList.remove('open');
            });
        });
    }

    // 3. Magnetic Buttons with transition cleanup
    const magneticElements = document.querySelectorAll('.magnetic');

    magneticElements.forEach((el) => {
        el.addEventListener('mousemove', (e) => {
            // Remove transition for crisp tracking
            el.style.transition = 'none';
            const position = el.getBoundingClientRect();
            const x = e.clientX - position.left - position.width / 2;
            const y = e.clientY - position.top - position.height / 2;

            // Adjust the denominator to change the intensity of the pull
            el.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
        });

        el.addEventListener('mouseout', () => {
            // Reapply transition and smoothly snap back into place
            el.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
            el.style.transform = 'translate(0px, 0px)';
        });
    });

    // Navbar scroll effect (Throttled via rAF for performance)
    const navbar = document.querySelector('.navbar');
    let isScrolling = false;

    window.addEventListener('scroll', () => {
        if (!isScrolling) {
            window.requestAnimationFrame(() => {
                if (window.scrollY > 50) {
                    navbar.classList.add('scrolled');
                } else {
                    navbar.classList.remove('scrolled');
                }
                isScrolling = false;
            });
            isScrolling = true;
        }
    });

    // Intersection Observer for scroll animations (Staggered)
    const revealElements = document.querySelectorAll('.reveal');

    const revealOptions = {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    };

    const revealOnScroll = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;

            entry.target.classList.add('active');

            // Stagger children logic (for projects, stats, or about grid)
            const staggers = entry.target.querySelectorAll('.project-card, .stat-card, .skill-category, .about-stat-item, .about-text');
            staggers.forEach((el, index) => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(20px) scale(0.98)';
                el.style.transition = 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';

                setTimeout(() => {
                    el.style.opacity = '1';
                    el.style.transform = 'translateY(0) scale(1)';
                }, 150 * (index + 1)); // 150ms stagger per child
            });

            observer.unobserve(entry.target); // Only animate once
        });
    }, revealOptions);

    revealElements.forEach(el => {
        revealOnScroll.observe(el);
    });

    // Trigger the active class immediately on elements high up in the viewport
    setTimeout(() => {
        document.getElementById('hero').classList.add('active');
    }, 100);
    // 2. Rotating Hero Text Animation
    const typingText = document.querySelector('.typing-text');
    if (typingText) {
        const phrases = [
            "I build complex systems that <span class='text-gradient'>scale</span>.",
            "I craft resilient backend <span class='text-gradient'>pipelines</span>.",
            "I integrate sophisticated AI <span class='text-gradient'>workflows</span>.",
            "I design pristine user <span class='text-gradient'>experiences</span>."
        ];

        let phraseIndex = 0;

        setInterval(() => {
            // Slide/fade out
            typingText.classList.add('fade-out');

            setTimeout(() => {
                // Change text while invisible
                phraseIndex = (phraseIndex + 1) % phrases.length;
                typingText.innerHTML = phrases[phraseIndex];

                // Reset transform/opacity
                typingText.classList.remove('fade-out');
                typingText.classList.add('fade-in');

                // Slide/fade back in
                setTimeout(() => {
                    typingText.classList.remove('fade-in');
                }, 50); // Small delay to allow CSS to register the starting block

            }, 400); // Wait for the fade-out CSS duration (0.4s)
        }, 3500); // Rotate every 3.5 seconds
    }
});
