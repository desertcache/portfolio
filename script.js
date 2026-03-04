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
        'slider-edge-light': { prop: '--glass-edge-light', suffix: '', readOut: 'readout-edge-light' }
    };

    const rootStyle = document.documentElement.style;

    Object.keys(glassControlsMap).forEach(id => {
        const input = document.getElementById(id);
        const mapData = glassControlsMap[id];
        const readOut = document.getElementById(mapData.readOut);

        if (input && readOut) {
            input.addEventListener('input', (e) => {
                const val = e.target.value;
                // Update CSS Variable
                rootStyle.setProperty(mapData.prop, `${val}${mapData.suffix}`);

                // Format Readout Text 
                let textVal = val;
                if (mapData.suffix === '') { textVal = parseFloat(val).toFixed(2); } // Ensure raw floats display consistently
                readOut.textContent = `${textVal}${mapData.suffix}`;
            });
        }
    });

    // Close button logic
    const closeBtn = document.getElementById('close-controls');
    const controlsPanel = document.getElementById('glass-controls');
    if (closeBtn && controlsPanel) {
        closeBtn.addEventListener('click', () => {
            controlsPanel.style.display = 'none';
        });
    }

    // Draggable Panel logic
    const dragHandle = document.getElementById('controls-drag-handle');
    let isDragging = false, startX, startY, initialX, initialY;

    if (dragHandle && controlsPanel) {
        dragHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            // Get computed style for current position handling logic since it uses right/top
            const rect = controlsPanel.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;

            // Switch to fixed left/top calculation instead of relying on right CSS prop
            controlsPanel.style.right = 'auto';
            controlsPanel.style.left = `${initialX}px`;
            controlsPanel.style.top = `${initialY}px`;
            // disable transitions while dragging for smooth 1:1 feel
            controlsPanel.style.transition = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            controlsPanel.style.left = `${initialX + dx}px`;
            controlsPanel.style.top = `${initialY + dy}px`;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
});
