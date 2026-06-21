document.addEventListener('DOMContentLoaded', () => {

    // Mobile Hamburger Menu Toggle
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.querySelector('.nav-links');
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('open');
        });
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navLinks.classList.remove('open');
            });
        });
    }

    // Same baseline UI behavior (navbar scroll)
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) navbar.classList.add('scrolled');
        else navbar.classList.remove('scrolled');
    });

    const revealElements = document.querySelectorAll('.reveal');
    const revealOnScroll = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: "0px 0px -50px 0px" });
    revealElements.forEach(el => revealOnScroll.observe(el));
    setTimeout(() => { document.getElementById('arcade-section').classList.add('active'); }, 100);

    // ==========================================
    // HIGH SCORES (localStorage)
    // ==========================================
    const HS_KEY = 'sb_arcade_pb_v1';
    function loadPBs() {
        try { return JSON.parse(localStorage.getItem(HS_KEY)) || {}; }
        catch (e) { return {}; }
    }
    function savePBs(pbs) {
        try { localStorage.setItem(HS_KEY, JSON.stringify(pbs)); } catch (e) {}
    }
    function renderPBs() {
        const pbs = loadPBs();
        document.querySelectorAll('.arcade-btn .hi').forEach(el => {
            const g = el.dataset.game;
            const v = pbs[g];
            el.textContent = v != null ? `PB · ${v}` : 'PB · —';
        });
    }
    function recordPB(game, score) {
        if (!game || score == null) return;
        const pbs = loadPBs();
        const cur = pbs[game] || 0;
        if (score > cur) {
            pbs[game] = score;
            savePBs(pbs);
            return true;
        }
        return false;
    }
    renderPBs();

    // ==========================================
    // ARCADE ENGINE
    // ==========================================
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // --- Responsive Canvas ---
    function resizeCanvas() {
        const container = canvas.parentElement;
        const maxW = container.clientWidth - 32;
        const ratio = 800 / 500;
        let w = Math.min(maxW, 800);
        let h = w / ratio;
        canvas.width = Math.floor(w);
        canvas.height = Math.floor(h);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // UI Elements
    const menuScreen = document.getElementById('arcade-menu');
    const gameOverScreen = document.getElementById('game-over-screen');
    const hudScore = document.getElementById('hud-score');
    const currentScoreText = document.getElementById('current-score');
    const finalScoreText = document.getElementById('final-score');

    // Buttons
    const btnSnake = document.getElementById('btn-snake');
    const btnFlappy = document.getElementById('btn-flappy');
    const btnBreakout = document.getElementById('btn-breakout');
    const btnAsteroids = document.getElementById('btn-asteroids');
    const btnRunner = document.getElementById('btn-runner');
    const btnRestart = document.getElementById('btn-restart');
    const btnMenu = document.getElementById('btn-menu');

    // State Machine
    let activeGame = null;
    let gameLoopRef = null;

    // ==========================================
    // INPUT REGISTRY SYSTEM
    // ==========================================
    let _touchHandlers = [];
    let _keyDownHandler = null;
    let _keyUpHandler = null;
    let _mouseHandlers = [];

    function registerTouchHandlers(handlers) {
        // handlers: { event: 'touchstart'|'touchmove'|'touchend', fn: Function }[]
        clearTouchHandlers();
        handlers.forEach(h => {
            canvas.addEventListener(h.event, h.fn, { passive: false });
            _touchHandlers.push(h);
        });
    }

    function clearTouchHandlers() {
        _touchHandlers.forEach(h => {
            canvas.removeEventListener(h.event, h.fn);
        });
        _touchHandlers = [];
    }

    function registerKeyHandler(downFn, upFn) {
        clearKeyHandler();
        if (downFn) {
            _keyDownHandler = downFn;
            document.addEventListener('keydown', _keyDownHandler);
        }
        if (upFn) {
            _keyUpHandler = upFn;
            document.addEventListener('keyup', _keyUpHandler);
        }
    }

    function clearKeyHandler() {
        if (_keyDownHandler) {
            document.removeEventListener('keydown', _keyDownHandler);
            _keyDownHandler = null;
        }
        if (_keyUpHandler) {
            document.removeEventListener('keyup', _keyUpHandler);
            _keyUpHandler = null;
        }
    }

    function registerMouseHandler(event, fn) {
        _mouseHandlers.push({ event, fn });
        canvas.addEventListener(event, fn);
    }

    function clearMouseHandlers() {
        _mouseHandlers.forEach(h => {
            canvas.removeEventListener(h.event, h.fn);
        });
        _mouseHandlers = [];
    }

    function clearAllInputs() {
        clearTouchHandlers();
        clearKeyHandler();
        clearMouseHandlers();
    }

    // ==========================================
    // VIRTUAL GAMEPAD
    // ==========================================
    const mobileControls = document.getElementById('mobile-controls');
    window.vpad = { up: false, down: false, left: false, right: false, a: false, b: false };

    function setupMobileControls() {
        const btns = [
            { id: 'btn-up', key: 'up' }, { id: 'btn-down', key: 'down' },
            { id: 'btn-left', key: 'left' }, { id: 'btn-right', key: 'right' },
            { id: 'btn-action-a', key: 'a' }, { id: 'btn-action-b', key: 'b' }
        ];
        btns.forEach(b => {
            const el = document.getElementById(b.id);
            if (!el) return;
            const press = (e) => { e.preventDefault(); window.vpad[b.key] = true; };
            const release = (e) => { e.preventDefault(); window.vpad[b.key] = false; };
            el.addEventListener('touchstart', press, { passive: false });
            el.addEventListener('touchend', release, { passive: false });
            el.addEventListener('mousedown', press);
            window.addEventListener('mouseup', release);
            window.addEventListener('mouseleave', release);
        });
    }
    setupMobileControls();

    function showMobileControls(show) {
        if (!mobileControls) return;
        if (show) mobileControls.classList.add('active');
        else mobileControls.classList.remove('active');
    }

    // --- Core Routing ---
    btnSnake.addEventListener('click', () => {
        activeGame = 'SNAKE';
        hideMenu();
        startSnake();
    });

    btnFlappy.addEventListener('click', () => {
        activeGame = 'FLAPPY';
        hideMenu();
        startFlappy();
    });

    btnBreakout.addEventListener('click', () => {
        activeGame = 'BREAKOUT';
        hideMenu();
        startBreakout();
    });

    btnAsteroids.addEventListener('click', () => {
        activeGame = 'ASTEROIDS';
        hideMenu();
        startAsteroids();
    });

    if (btnRunner) {
        btnRunner.addEventListener('click', () => {
            activeGame = 'RUNNER';
            hideMenu();
            startResumeRunner();
        });
    }

    btnRestart.addEventListener('click', () => {
        hideGameOver();
        if (activeGame === 'SNAKE') startSnake();
        else if (activeGame === 'FLAPPY') startFlappy();
        else if (activeGame === 'BREAKOUT') startBreakout();
        else if (activeGame === 'ASTEROIDS') startAsteroids();
        else if (activeGame === 'RUNNER') startResumeRunner();
    });

    btnMenu.addEventListener('click', () => {
        hideGameOver();
        activeGame = null;
        showMenu();
    });

    // --- UI Helpers ---
    function hideMenu() {
        menuScreen.style.display = 'none';
        hudScore.style.display = 'block';
        if (activeGame !== 'BREAKOUT') showMobileControls(true);
    }
    function showMenu() {
        showMobileControls(false);
        clearAllInputs();
        if (deathLoopRef) cancelAnimationFrame(deathLoopRef);
        clearParticles();
        menuScreen.style.display = 'block';
        hudScore.style.display = 'none';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    let deathLoopRef = null;
    window.triggerGameOver = function (score) {
        showMobileControls(false);
        cancelAnimationFrame(gameLoopRef);
        clearAllInputs();
        const isNewPB = recordPB(activeGame, score);
        finalScoreText.innerHTML = isNewPB
            ? `Score: ${score} <span style="color:var(--accent);font-family:var(--serif);font-style:italic;font-size:0.95em;margin-left:8px;">new personal best</span>`
            : `Score: ${score}`;
        renderPBs();
        hudScore.style.display = 'none';
        gameOverScreen.style.display = 'block';

        function deathLoop() {
            if (particles.length > 0) {
                ctx.fillStyle = 'rgba(15, 23, 42, 0.15)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                updateAndDrawParticles();
                deathLoopRef = requestAnimationFrame(deathLoop);
            } else {
                if (deathLoopRef) cancelAnimationFrame(deathLoopRef);
            }
        }
        if (particles.length > 0) deathLoop();
    };

    window.updateHUDScore = function (score) {
        currentScoreText.innerText = score;
    };

    function hideGameOver() {
        gameOverScreen.style.display = 'none';
        hudScore.style.display = 'block';
    }

    // ==========================================
    // PARTICLE SYSTEM
    // ==========================================
    let particles = [];
    function createParticles(x, y, count, color, speedRange, lifeRange) {
        for (let i = 0; i < count; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);
            let life = lifeRange[0] + Math.random() * (lifeRange[1] - lifeRange[0]);
            particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: life,
                maxLife: life,
                color: color,
                size: 1 + Math.random() * 2
            });
        }
    }

    function updateAndDrawParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;

            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 8;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();

            if (p.life <= 0) particles.splice(i, 1);
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
    }

    function clearParticles() { particles = []; }

    // ==========================================
    // GAME 1: NEON SNAKE
    // ==========================================
    function startSnake() {
        clearAllInputs();
        clearParticles();
        const grid = 20;
        let count = 0;
        let score = 0;
        let speedControl = 8;
        updateHUDScore(0);

        let snake = {
            x: 160, y: 160,
            dx: grid, dy: 0,
            cells: [],
            maxCells: 4
        };

        let apple = { x: 320, y: 320 };

        // Keyboard
        registerKeyHandler(function (e) {
            if ([37, 38, 39, 40, 32].includes(e.keyCode)) e.preventDefault();
            if (e.which === 37 && snake.dx === 0) { snake.dx = -grid; snake.dy = 0; }
            else if (e.which === 38 && snake.dy === 0) { snake.dy = -grid; snake.dx = 0; }
            else if (e.which === 39 && snake.dx === 0) { snake.dx = grid; snake.dy = 0; }
            else if (e.which === 40 && snake.dy === 0) { snake.dy = grid; snake.dx = 0; }
        });

        // Touch: swipe via touchmove with 20px threshold
        let touchStartX = 0, touchStartY = 0, touchCommitted = false;
        registerTouchHandlers([
            {
                event: 'touchstart', fn: function (e) {
                    e.preventDefault();
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;
                    touchCommitted = false;
                }
            },
            {
                event: 'touchmove', fn: function (e) {
                    e.preventDefault();
                    if (touchCommitted) return;
                    let dx = e.touches[0].clientX - touchStartX;
                    let dy = e.touches[0].clientY - touchStartY;
                    if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
                        touchCommitted = true;
                        if (Math.abs(dx) > Math.abs(dy)) {
                            if (dx > 0 && snake.dx === 0) { snake.dx = grid; snake.dy = 0; }
                            else if (dx < 0 && snake.dx === 0) { snake.dx = -grid; snake.dy = 0; }
                        } else {
                            if (dy > 0 && snake.dy === 0) { snake.dy = grid; snake.dx = 0; }
                            else if (dy < 0 && snake.dy === 0) { snake.dy = -grid; snake.dx = 0; }
                        }
                    }
                }
            }
        ]);

        function loop() {
            gameLoopRef = requestAnimationFrame(loop);
            if (++count < speedControl) return;
            count = 0;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            updateAndDrawParticles();

            if (window.vpad.left && snake.dx === 0) { snake.dx = -grid; snake.dy = 0; }
            else if (window.vpad.up && snake.dy === 0) { snake.dy = -grid; snake.dx = 0; }
            else if (window.vpad.right && snake.dx === 0) { snake.dx = grid; snake.dy = 0; }
            else if (window.vpad.down && snake.dy === 0) { snake.dy = grid; snake.dx = 0; }

            snake.x += snake.dx;
            snake.y += snake.dy;

            if (snake.x < 0 || snake.x >= canvas.width || snake.y < 0 || snake.y >= canvas.height) {
                createParticles(snake.x + grid / 2, snake.y + grid / 2, 30, '#3b82f6', [2, 6], [20, 50]);
                window.triggerGameOver(score);
                return;
            }

            snake.cells.unshift({ x: snake.x, y: snake.y });
            if (snake.cells.length > snake.maxCells) snake.cells.pop();

            // Apple
            ctx.fillStyle = '#ef4444';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ef4444';
            ctx.fillRect(apple.x, apple.y, grid - 1, grid - 1);

            // Snake
            ctx.fillStyle = '#3b82f6';
            ctx.shadowColor = '#3b82f6';

            for (let i = 0; i < snake.cells.length; i++) {
                ctx.fillRect(snake.cells[i].x, snake.cells[i].y, grid - 1, grid - 1);

                if (snake.cells[i].x === apple.x && snake.cells[i].y === apple.y) {
                    snake.maxCells++;
                    score += 10;
                    updateHUDScore(score);
                    if (score % 100 === 0 && speedControl > 2) speedControl--;
                    apple.x = Math.floor(Math.random() * (canvas.width / grid)) * grid;
                    apple.y = Math.floor(Math.random() * (canvas.height / grid)) * grid;
                }

                for (let j = i + 1; j < snake.cells.length; j++) {
                    if (snake.cells[i].x === snake.cells[j].x && snake.cells[i].y === snake.cells[j].y) {
                        createParticles(snake.x + grid / 2, snake.y + grid / 2, 30, '#3b82f6', [2, 6], [20, 50]);
                        window.triggerGameOver(score);
                        return;
                    }
                }
            }
            ctx.shadowBlur = 0;
        }

        gameLoopRef = requestAnimationFrame(loop);
    }

    // ==========================================
    // GAME 2: FLAPPY UFO
    // ==========================================
    function startFlappy() {
        clearAllInputs();
        clearParticles();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const gravity = 0.15;
        const jumpThrust = -4.5;
        const speed = 2;
        const pipeWidth = 60;
        const pipeGap = 200;

        let score = 0;
        updateHUDScore(0);
        let vpadPrev = { ...window.vpad };

        let ufo = { x: 100, y: 200, radius: 12, velocity: 0 };
        let pipes = [{ x: canvas.width, topHeight: 200 }];

        registerKeyHandler(function (e) {
            if (e.which === 32 || e.which === 38) {
                e.preventDefault();
                ufo.velocity = jumpThrust;
            }
        });

        registerTouchHandlers([{
            event: 'touchstart', fn: function (e) {
                e.preventDefault();
                ufo.velocity = jumpThrust;
            }
        }]);

        function loop() {
            gameLoopRef = requestAnimationFrame(loop);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            updateAndDrawParticles();

            if ((window.vpad.b && !vpadPrev.b) || (window.vpad.a && !vpadPrev.a) || (window.vpad.up && !vpadPrev.up)) {
                ufo.velocity = jumpThrust;
            }
            vpadPrev = { ...window.vpad };

            ufo.velocity += gravity;
            ufo.y += ufo.velocity;

            // UFO body
            ctx.beginPath();
            ctx.arc(ufo.x, ufo.y, ufo.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#c084fc';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#c084fc';
            ctx.fill();

            // UFO ring
            ctx.beginPath();
            ctx.ellipse(ufo.x, ufo.y + 2, ufo.radius + 6, Math.floor(ufo.radius / 2), 0, 0, Math.PI * 2);
            ctx.strokeStyle = '#e879f9';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Pipes
            ctx.fillStyle = '#10b981';
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#10b981';

            for (let i = 0; i < pipes.length; i++) {
                let p = pipes[i];
                p.x -= speed;

                ctx.fillRect(p.x, 0, pipeWidth, p.topHeight);
                let bottomY = p.topHeight + pipeGap;
                ctx.fillRect(p.x, bottomY, pipeWidth, canvas.height - bottomY);

                if (ufo.x + ufo.radius > p.x && ufo.x - ufo.radius < p.x + pipeWidth) {
                    if (ufo.y - ufo.radius < p.topHeight || ufo.y + ufo.radius > bottomY) {
                        createParticles(ufo.x, ufo.y, 40, '#c084fc', [2, 7], [20, 50]);
                        window.triggerGameOver(score);
                        return;
                    }
                }

                if (p.x + pipeWidth / 2 < ufo.x && !p.scored) {
                    p.scored = true;
                    score++;
                    updateHUDScore(score);
                }
            }
            ctx.shadowBlur = 0;

            const lastPipe = pipes[pipes.length - 1];
            if (lastPipe && lastPipe.x < canvas.width - 250) {
                let rHeight = Math.floor(Math.random() * (canvas.height - pipeGap - 100)) + 50;
                pipes.push({ x: canvas.width, topHeight: rHeight, scored: false });
            }

            if (pipes[0] && pipes[0].x < -pipeWidth) pipes.shift();

            if (ufo.y > canvas.height || ufo.y < 0) {
                createParticles(ufo.x, ufo.y, 40, '#c084fc', [2, 7], [20, 50]);
                window.triggerGameOver(score);
                return;
            }
        }

        gameLoopRef = requestAnimationFrame(loop);
    }

    // ==========================================
    // GAME 3: BREAKOUT
    // ==========================================
    function startBreakout() {
        clearAllInputs();
        clearParticles();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let score = 0;
        let bricksDestroyed = 0;
        updateHUDScore(0);

        const paddleW = 100, paddleH = 12;
        let paddleX = (canvas.width - paddleW) / 2;

        const ballRadius = 6;
        let ballX = canvas.width / 2;
        let ballY = canvas.height - 40;
        let ballSpeedBase = 4;
        let ballDX = ballSpeedBase * (Math.random() > 0.5 ? 1 : -1);
        let ballDY = -ballSpeedBase;

        // Brick grid
        const cols = 8, rows = 5;
        const brickPad = 4;
        const brickTopOffset = 40;
        const rowColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
        let bricks = [];

        function buildBricks() {
            bricks = [];
            const brickW = (canvas.width - brickPad * (cols + 1)) / cols;
            const brickH = 18;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    bricks.push({
                        x: brickPad + c * (brickW + brickPad),
                        y: brickTopOffset + r * (brickH + brickPad),
                        w: brickW,
                        h: brickH,
                        color: rowColors[r],
                        alive: true
                    });
                }
            }
        }
        buildBricks();

        // Mouse control
        registerMouseHandler('mousemove', function (e) {
            const rect = canvas.getBoundingClientRect();
            let mx = e.clientX - rect.left;
            paddleX = Math.max(0, Math.min(canvas.width - paddleW, mx - paddleW / 2));
        });

        // Touch drag
        registerTouchHandlers([{
            event: 'touchmove', fn: function (e) {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                let tx = e.touches[0].clientX - rect.left;
                paddleX = Math.max(0, Math.min(canvas.width - paddleW, tx - paddleW / 2));
            }
        }, {
            event: 'touchstart', fn: function (e) {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                let tx = e.touches[0].clientX - rect.left;
                paddleX = Math.max(0, Math.min(canvas.width - paddleW, tx - paddleW / 2));
            }
        }]);

        function loop() {
            gameLoopRef = requestAnimationFrame(loop);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            updateAndDrawParticles();

            // Move ball
            ballX += ballDX;
            ballY += ballDY;

            // Wall bounces
            if (ballX - ballRadius < 0 || ballX + ballRadius > canvas.width) ballDX = -ballDX;
            if (ballY - ballRadius < 0) ballDY = -ballDY;

            // Ball below paddle = game over
            if (ballY + ballRadius > canvas.height) {
                window.triggerGameOver(score);
                return;
            }

            // Paddle collision
            if (ballDY > 0 &&
                ballY + ballRadius >= canvas.height - 25 - paddleH &&
                ballY + ballRadius <= canvas.height - 25 &&
                ballX >= paddleX && ballX <= paddleX + paddleW) {
                // Angle based on hit position
                let hitPos = (ballX - paddleX) / paddleW; // 0..1
                let angle = (hitPos - 0.5) * Math.PI * 0.7; // -63deg to +63deg
                let speed = Math.sqrt(ballDX * ballDX + ballDY * ballDY);
                ballDX = speed * Math.sin(angle);
                ballDY = -speed * Math.cos(angle);
            }

            // Brick collisions
            for (let i = 0; i < bricks.length; i++) {
                let b = bricks[i];
                if (!b.alive) continue;

                if (ballX + ballRadius > b.x && ballX - ballRadius < b.x + b.w &&
                    ballY + ballRadius > b.y && ballY - ballRadius < b.y + b.h) {
                    b.alive = false;
                    score += 10;
                    bricksDestroyed++;
                    updateHUDScore(score);
                    createParticles(b.x + b.w / 2, b.y + b.h / 2, 12, b.color, [1, 3], [15, 30]);

                    // Speed up every 15 bricks
                    if (bricksDestroyed % 15 === 0) {
                        let spd = Math.sqrt(ballDX * ballDX + ballDY * ballDY);
                        let factor = (spd + 0.5) / spd;
                        ballDX *= factor;
                        ballDY *= factor;
                    }

                    // Determine bounce direction
                    let overlapLeft = (ballX + ballRadius) - b.x;
                    let overlapRight = (b.x + b.w) - (ballX - ballRadius);
                    let overlapTop = (ballY + ballRadius) - b.y;
                    let overlapBottom = (b.y + b.h) - (ballY - ballRadius);
                    let minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
                    if (minOverlap === overlapTop || minOverlap === overlapBottom) ballDY = -ballDY;
                    else ballDX = -ballDX;
                    break;
                }
            }

            // All bricks cleared = reset with faster ball
            if (bricks.every(b => !b.alive)) {
                buildBricks();
                let spd = Math.sqrt(ballDX * ballDX + ballDY * ballDY);
                let factor = (spd + 1) / spd;
                ballDX *= factor;
                ballDY *= factor;
            }

            // Draw bricks
            for (let i = 0; i < bricks.length; i++) {
                let b = bricks[i];
                if (!b.alive) continue;
                ctx.fillStyle = b.color;
                ctx.shadowBlur = 6;
                ctx.shadowColor = b.color;
                ctx.fillRect(b.x, b.y, b.w, b.h);
            }
            ctx.shadowBlur = 0;

            // Draw paddle
            ctx.fillStyle = '#e879f9';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#e879f9';
            ctx.fillRect(paddleX, canvas.height - 25 - paddleH, paddleW, paddleH);
            ctx.shadowBlur = 0;

            // Draw ball
            ctx.beginPath();
            ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#ffffff';
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        gameLoopRef = requestAnimationFrame(loop);
    }

    // ==========================================
    // GAME 4: ASTEROIDS
    // ==========================================
    function startAsteroids() {
        clearAllInputs();
        clearParticles();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let score = 0;
        let wave = 1;
        updateHUDScore(0);

        // Ship
        let ship = {
            x: canvas.width / 2,
            y: canvas.height / 2,
            angle: -Math.PI / 2,
            vx: 0, vy: 0,
            radius: 14
        };

        let keys = {};
        let bullets = [];
        let asteroids = [];
        let lastShot = 0;
        const SHOOT_COOLDOWN = 200;

        // Touch state
        let activeTouches = {};

        function spawnAsteroids(count) {
            for (let i = 0; i < count; i++) {
                let ax, ay;
                // Spawn away from ship
                do {
                    ax = Math.random() * canvas.width;
                    ay = Math.random() * canvas.height;
                } while (Math.hypot(ax - ship.x, ay - ship.y) < 120);
                let angle = Math.random() * Math.PI * 2;
                let spd = 0.5 + Math.random() * 1;
                asteroids.push(makeAsteroid(ax, ay, 40, Math.cos(angle) * spd, Math.sin(angle) * spd));
            }
        }

        function makeAsteroid(x, y, radius, vx, vy) {
            // Irregular polygon 8-12 vertices
            let verts = 8 + Math.floor(Math.random() * 5);
            let shape = [];
            for (let i = 0; i < verts; i++) {
                let a = (i / verts) * Math.PI * 2;
                let r = radius * (0.7 + Math.random() * 0.3);
                shape.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
            }
            let pts = radius >= 35 ? 20 : radius >= 18 ? 50 : 100;
            return { x, y, vx, vy, radius, shape, points: pts };
        }

        spawnAsteroids(3 + wave);

        // Desktop keyboard
        registerKeyHandler(
            function (e) {
                if ([37, 38, 39, 40, 32].includes(e.keyCode)) e.preventDefault();
                keys[e.keyCode] = true;
                if (e.keyCode === 32) shoot();
            },
            function (e) {
                keys[e.keyCode] = false;
            }
        );

        // Mobile touch zones
        registerTouchHandlers([
            {
                event: 'touchstart', fn: function (e) {
                    e.preventDefault();
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        let t = e.changedTouches[i];
                        let zone = getTouchZone(t);
                        activeTouches[t.identifier] = zone;
                        if (zone === 'shoot') shoot();
                    }
                }
            },
            {
                event: 'touchmove', fn: function (e) {
                    e.preventDefault();
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        let t = e.changedTouches[i];
                        activeTouches[t.identifier] = getTouchZone(t);
                    }
                }
            },
            {
                event: 'touchend', fn: function (e) {
                    e.preventDefault();
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        delete activeTouches[e.changedTouches[i].identifier];
                    }
                }
            }
        ]);

        function getTouchZone(touch) {
            let rect = canvas.getBoundingClientRect();
            let rx = (touch.clientX - rect.left) / rect.width;
            let ry = (touch.clientY - rect.top) / rect.height;
            if (rx < 0.25) return 'left';
            if (rx > 0.75) return 'right';
            if (ry > 0.6) return 'thrust';
            return 'shoot';
        }

        function touchActive(zone) {
            for (let id in activeTouches) {
                if (activeTouches[id] === zone) return true;
            }
            return false;
        }

        function shoot() {
            let now = Date.now();
            if (now - lastShot < SHOOT_COOLDOWN) return;
            lastShot = now;
            bullets.push({
                x: ship.x + Math.cos(ship.angle) * ship.radius,
                y: ship.y + Math.sin(ship.angle) * ship.radius,
                vx: Math.cos(ship.angle) * 6 + ship.vx * 0.5,
                vy: Math.sin(ship.angle) * 6 + ship.vy * 0.5,
                life: 60
            });
        }

        function wrap(obj) {
            if (obj.x < 0) obj.x += canvas.width;
            if (obj.x > canvas.width) obj.x -= canvas.width;
            if (obj.y < 0) obj.y += canvas.height;
            if (obj.y > canvas.height) obj.y -= canvas.height;
        }

        function loop() {
            gameLoopRef = requestAnimationFrame(loop);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            updateAndDrawParticles();

            // Input processing
            let rotSpeed = 0.06;
            if (keys[37] || touchActive('left') || window.vpad.left) ship.angle -= rotSpeed;
            if (keys[39] || touchActive('right') || window.vpad.right) ship.angle += rotSpeed;
            if (keys[38] || touchActive('thrust') || window.vpad.a || window.vpad.up) {
                ship.vx += Math.cos(ship.angle) * 0.12;
                ship.vy += Math.sin(ship.angle) * 0.12;
            }
            if (window.vpad.b) shoot();

            // Friction
            ship.vx *= 0.995;
            ship.vy *= 0.995;
            ship.x += ship.vx;
            ship.y += ship.vy;
            wrap(ship);

            // Draw ship (neon cyan wireframe triangle)
            ctx.save();
            ctx.translate(ship.x, ship.y);
            ctx.rotate(ship.angle);
            ctx.strokeStyle = '#22d3ee';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#22d3ee';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(ship.radius, 0);
            ctx.lineTo(-ship.radius * 0.7, -ship.radius * 0.6);
            ctx.lineTo(-ship.radius * 0.4, 0);
            ctx.lineTo(-ship.radius * 0.7, ship.radius * 0.6);
            ctx.closePath();
            ctx.stroke();

            // Thrust flame
            if (keys[38] || touchActive('thrust')) {
                ctx.strokeStyle = '#f97316';
                ctx.shadowColor = '#f97316';
                ctx.beginPath();
                ctx.moveTo(-ship.radius * 0.5, -ship.radius * 0.25);
                ctx.lineTo(-ship.radius * 0.9 - Math.random() * 5, 0);
                ctx.lineTo(-ship.radius * 0.5, ship.radius * 0.25);
                ctx.stroke();
            }
            ctx.restore();
            ctx.shadowBlur = 0;

            // Bullets
            ctx.fillStyle = '#fbbf24';
            ctx.shadowBlur = 6;
            ctx.shadowColor = '#fbbf24';
            for (let i = bullets.length - 1; i >= 0; i--) {
                let b = bullets[i];
                b.x += b.vx;
                b.y += b.vy;
                b.life--;
                wrap(b);
                if (b.life <= 0) { bullets.splice(i, 1); continue; }
                ctx.beginPath();
                ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;

            // Asteroids
            ctx.strokeStyle = '#a78bfa';
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#a78bfa';
            ctx.lineWidth = 1.5;
            for (let i = asteroids.length - 1; i >= 0; i--) {
                let a = asteroids[i];
                a.x += a.vx;
                a.y += a.vy;
                wrap(a);

                // Draw asteroid
                ctx.beginPath();
                ctx.moveTo(a.x + a.shape[0].x, a.y + a.shape[0].y);
                for (let v = 1; v < a.shape.length; v++) {
                    ctx.lineTo(a.x + a.shape[v].x, a.y + a.shape[v].y);
                }
                ctx.closePath();
                ctx.stroke();

                // Bullet-asteroid collision
                for (let j = bullets.length - 1; j >= 0; j--) {
                    let b = bullets[j];
                    if (Math.hypot(b.x - a.x, b.y - a.y) < a.radius) {
                        score += a.points;
                        updateHUDScore(score);
                        bullets.splice(j, 1);
                        createParticles(a.x, a.y, 20, '#a78bfa', [1, 4], [20, 40]);

                        // Split
                        if (a.radius >= 35) {
                            // Large -> 2 medium
                            for (let k = 0; k < 2; k++) {
                                let ang = Math.random() * Math.PI * 2;
                                let spd = 1 + Math.random() * 1;
                                asteroids.push(makeAsteroid(a.x, a.y, 20, Math.cos(ang) * spd, Math.sin(ang) * spd));
                            }
                        } else if (a.radius >= 18) {
                            // Medium -> 2 small
                            for (let k = 0; k < 2; k++) {
                                let ang = Math.random() * Math.PI * 2;
                                let spd = 1.5 + Math.random() * 1.5;
                                asteroids.push(makeAsteroid(a.x, a.y, 10, Math.cos(ang) * spd, Math.sin(ang) * spd));
                            }
                        }
                        asteroids.splice(i, 1);
                        break;
                    }
                }
            }
            ctx.shadowBlur = 0;

            // Ship-asteroid collision
            for (let i = 0; i < asteroids.length; i++) {
                if (Math.hypot(ship.x - asteroids[i].x, ship.y - asteroids[i].y) < ship.radius + asteroids[i].radius * 0.7) {
                    createParticles(ship.x, ship.y, 50, '#22d3ee', [2, 8], [30, 60]);
                    window.triggerGameOver(score);
                    return;
                }
            }

            // Wave cleared
            if (asteroids.length === 0) {
                wave++;
                spawnAsteroids(3 + wave);
            }

            // Draw touch zones hint on mobile (subtle)
            if ('ontouchstart' in window && asteroids.length > 0 && false) { // disabled hint via `&& false` since we have Gamepad now.
                ctx.globalAlpha = 0.12;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                // Left zone
                ctx.beginPath();
                ctx.moveTo(canvas.width * 0.25, 0);
                ctx.lineTo(canvas.width * 0.25, canvas.height);
                ctx.stroke();
                // Right zone
                ctx.beginPath();
                ctx.moveTo(canvas.width * 0.75, 0);
                ctx.lineTo(canvas.width * 0.75, canvas.height);
                ctx.stroke();
                // Bottom zone
                ctx.beginPath();
                ctx.moveTo(canvas.width * 0.25, canvas.height * 0.6);
                ctx.lineTo(canvas.width * 0.75, canvas.height * 0.6);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
            }
        }

        gameLoopRef = requestAnimationFrame(loop);
    }

    // ==========================================
    // GAME 5: RESUME RUNNER
    // ==========================================
    function startResumeRunner() {
        clearAllInputs();
        clearParticles();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let score = 0;
        let speed = 5;
        let gravity = 0.6;
        updateHUDScore(0);

        let player = {
            x: 50,
            y: canvas.height - 50,
            w: 30,
            h: 40,
            dy: 0,
            jumping: false
        };

        const groundY = canvas.height - 10;

        // Arrays for obstacles and items
        let obstacles = [];
        let coffees = [];
        let nextObstacleWait = 60;
        let framesCounter = 0;

        let vpadPrev = { ...window.vpad };

        function jump() {
            if (!player.jumping) {
                player.dy = -12;
                player.jumping = true;
                createParticles(player.x + player.w / 2, player.y + player.h, 10, '#ffffff', [0.5, 2], [10, 20]);
            }
        }

        registerKeyHandler(function (e) {
            if (e.which === 32 || e.which === 38) { e.preventDefault(); jump(); }
        });

        registerTouchHandlers([{
            event: 'touchstart', fn: function (e) {
                e.preventDefault();
                jump();
            }
        }]);

        let floorOffset = 0;

        function loop() {
            gameLoopRef = requestAnimationFrame(loop);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            updateAndDrawParticles();

            framesCounter++;

            // Input
            if ((window.vpad.b && !vpadPrev.b) || (window.vpad.up && !vpadPrev.up)) {
                jump();
            }
            vpadPrev = { ...window.vpad };

            // Physics
            player.dy += gravity;
            player.y += player.dy;

            if (player.y + player.h > groundY) {
                player.y = groundY - player.h;
                player.dy = 0;
                player.jumping = false;
            }

            // Speed up
            if (framesCounter % 600 === 0 && speed < 12) {
                speed += 0.5;
            }

            // Spawn
            if (framesCounter >= nextObstacleWait) {
                let type = Math.random() > 0.6 ? 'glitch' : 'email';
                let w = type === 'email' ? 30 : 20;
                let h = type === 'email' ? 20 : 30;
                let y = groundY - h;

                if (type === 'glitch' && Math.random() > 0.5) y = groundY - h - 45;

                obstacles.push({ x: canvas.width, y: y, w: w, h: h, type: type });
                nextObstacleWait = framesCounter + Math.floor(Math.random() * 60 + 50);

                if (Math.random() > 0.7) {
                    coffees.push({
                        x: canvas.width + Math.random() * 100 + 50,
                        y: groundY - 20 - Math.random() * 80,
                        r: 10
                    });
                }
            }

            // Draw Ground
            floorOffset = (floorOffset + speed) % 40;
            ctx.fillStyle = '#334155';
            ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0 - floorOffset; i < canvas.width + 40; i += 40) {
                ctx.moveTo(i, groundY);
                ctx.lineTo(i - 20, canvas.height);
            }
            ctx.stroke();

            // Obstacles
            for (let i = obstacles.length - 1; i >= 0; i--) {
                let obs = obstacles[i];
                obs.x -= speed;

                if (obs.type === 'email') {
                    ctx.fillStyle = '#ef4444';
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#ef4444';
                    ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(obs.x, obs.y);
                    ctx.lineTo(obs.x + obs.w / 2, obs.y + obs.h / 2);
                    ctx.lineTo(obs.x + obs.w, obs.y);
                    ctx.stroke();
                } else {
                    ctx.fillStyle = '#8ce82c';
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#8ce82c';
                    ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
                    if (framesCounter % 10 < 5) ctx.fillStyle = '#ffffff';
                    else ctx.fillStyle = '#1e293b';
                    ctx.fillRect(obs.x + 4, obs.y + 4, obs.w - 8, obs.h - 8);
                }
                ctx.shadowBlur = 0;

                // Collision
                if (player.x < obs.x + obs.w && player.x + player.w > obs.x &&
                    player.y < obs.y + obs.h && player.y + player.h > obs.y) {
                    createParticles(player.x + player.w / 2, player.y + player.h / 2, 40, '#ef4444', [2, 8], [20, 50]);
                    window.triggerGameOver(score);
                    return;
                }

                if (obs.x + obs.w < 0) {
                    obstacles.splice(i, 1);
                    score += 10;
                    updateHUDScore(score);
                }
            }

            // Collectibles
            for (let i = coffees.length - 1; i >= 0; i--) {
                let c = coffees[i];
                c.x -= speed;

                ctx.fillStyle = '#d97706';
                ctx.shadowBlur = 8;
                ctx.shadowColor = '#d97706';
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                let distX = (player.x + player.w / 2) - c.x;
                let distY = (player.y + player.h / 2) - c.y;
                if (Math.hypot(distX, distY) < c.r + Math.max(player.w, player.h) / 2) {
                    coffees.splice(i, 1);
                    score += 50;
                    updateHUDScore(score);
                    createParticles(c.x, c.y, 15, '#fcd34d', [1, 3], [10, 30]);
                } else if (c.x + c.r < 0) {
                    coffees.splice(i, 1);
                }
            }

            // Player Drop Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(player.x, groundY, player.w, 4);

            // Draw Player (Resume)
            ctx.fillStyle = '#f8fafc';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#facc15';
            ctx.fillRect(player.x, player.y, player.w, player.h);
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(player.x + 5, player.y + 5, 10, 3);
            ctx.fillRect(player.x + 5, player.y + 12, 20, 3);
            ctx.fillRect(player.x + 5, player.y + 19, 20, 3);
            ctx.fillRect(player.x + 5, player.y + 26, 15, 3);
            ctx.shadowBlur = 0;
        }

        gameLoopRef = requestAnimationFrame(loop);
    }
});
