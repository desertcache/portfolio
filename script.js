// 1. Premium Pre-loader (Fires when all assets/images are fully loaded)
window.addEventListener('load', () => {
    const preloader = document.getElementById('preloader');
    if (preloader) {
        preloader.style.opacity = '0';
        preloader.style.visibility = 'hidden';
        setTimeout(() => {
            preloader.remove(); // Remove from DOM after transition
        }, 800);
    }
});

document.addEventListener('DOMContentLoaded', () => {

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
