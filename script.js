
document.addEventListener('DOMContentLoaded', () => {

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

    // 3. Magnetic Buttons
    const magneticElements = document.querySelectorAll('.magnetic');

    magneticElements.forEach((el) => {
        el.addEventListener('mousemove', (e) => {
            const position = el.getBoundingClientRect();
            const x = e.clientX - position.left - position.width / 2;
            const y = e.clientY - position.top - position.height / 2;

            // Adjust the denominator to change the intensity of the pull
            el.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
        });

        el.addEventListener('mouseout', () => {
            // Smoothly snap back into place
            el.style.transform = 'translate(0px, 0px)';
        });
    });


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
    // Animated Stat Counters
    const statsGrid = document.querySelector('.power-stats-grid');
    if (statsGrid) {
        const statObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);

                entry.target.querySelectorAll('.stat-value').forEach(el => {
                    const raw = el.textContent.trim();
                    const prefix = raw.match(/^[^0-9]*/)[0];
                    const numMatch = raw.match(/[0-9]+/);
                    const suffix = raw.match(/[0-9]([^0-9]*)$/)[1];
                    const target = parseInt(numMatch[0], 10);
                    const duration = 2000;
                    const start = performance.now();

                    function update(now) {
                        const elapsed = now - start;
                        const progress = Math.min(elapsed / duration, 1);
                        const eased = 1 - Math.pow(1 - progress, 3);
                        const current = Math.round(eased * target);
                        el.textContent = prefix + current + suffix;
                        if (progress < 1) requestAnimationFrame(update);
                    }
                    el.textContent = prefix + '0' + suffix;
                    requestAnimationFrame(update);
                });
            });
        }, { threshold: 0.3 });
        statObserver.observe(statsGrid);
    }

    // 3D Card Tilt on Hover
    document.querySelectorAll('.glass-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateY = ((x - centerX) / centerX) * 6;
            const rotateX = ((centerY - y) / centerY) * 6;
            card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transition = 'transform 0.3s ease';
            card.style.transform = 'perspective(800px) rotateX(0) rotateY(0)';
            setTimeout(() => { card.style.transition = ''; }, 300);
        });
    });

    // 2. Rotating Hero Text Animation
    const typingText = document.querySelector('.typing-text');
    if (typingText) {
        const phrases = [
            "I build complex systems that <span class='text-gradient'>scale</span>.",
            "I architect enterprise <span class='text-gradient'>integrations</span>.",
            "I bridge business strategy and <span class='text-gradient'>engineering</span>.",
            "I design AI-powered <span class='text-gradient'>platforms</span>."
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
