document.addEventListener('DOMContentLoaded', () => {

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
    // ARCADE ENGINE
    // ==========================================
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // UI Elements
    const menuScreen = document.getElementById('arcade-menu');
    const gameOverScreen = document.getElementById('game-over-screen');
    const hudScore = document.getElementById('hud-score');
    const currentScoreText = document.getElementById('current-score');
    const finalScoreText = document.getElementById('final-score');

    // Buttons
    const btnSnake = document.getElementById('btn-snake');
    const btnFlappy = document.getElementById('btn-flappy');
    const btnRestart = document.getElementById('btn-restart');
    const btnMenu = document.getElementById('btn-menu');

    // State Machine
    let activeGame = null;
    let gameLoopRef = null;

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

    btnRestart.addEventListener('click', () => {
        hideGameOver();
        if (activeGame === 'SNAKE') startSnake();
        if (activeGame === 'FLAPPY') startFlappy();
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
    }
    function showMenu() {
        menuScreen.style.display = 'block';
        hudScore.style.display = 'none';
        ctx.clearRect(0, 0, canvas.width, canvas.height); // clear board
    }

    // Will be called by individual games when hit boundary or died
    window.triggerGameOver = function (score) {
        cancelAnimationFrame(gameLoopRef); // halt engine
        finalScoreText.innerText = `Score: ${score}`;
        hudScore.style.display = 'none';
        gameOverScreen.style.display = 'block';
    };

    window.updateHUDScore = function (score) {
        currentScoreText.innerText = score;
    };

    function hideGameOver() {
        gameOverScreen.style.display = 'none';
        hudScore.style.display = 'block';
    }

    // ==========================================
    // GAME 1: NEON SNAKE
    // ==========================================
    function startSnake() {
        // Snake configuration
        const grid = 20;
        let count = 0;
        let score = 0;
        let speedControl = 8; // Higher is slower (frames per move)
        updateHUDScore(0);

        let snake = {
            x: 160, y: 160,
            dx: grid, dy: 0, // initially move right
            cells: [],
            maxCells: 4
        };

        let apple = { x: 320, y: 320 };

        // Key Listener (Overriding any previous)
        document.onkeydown = function (e) {
            // Prevent default scrolling when playing
            if ([37, 38, 39, 40, 32].includes(e.keyCode)) { e.preventDefault(); }

            if (e.which === 37 && snake.dx === 0) { // LEFT
                snake.dx = -grid; snake.dy = 0;
            } else if (e.which === 38 && snake.dy === 0) { // UP
                snake.dy = -grid; snake.dx = 0;
            } else if (e.which === 39 && snake.dx === 0) { // RIGHT
                snake.dx = grid; snake.dy = 0;
            } else if (e.which === 40 && snake.dy === 0) { // DOWN
                snake.dy = grid; snake.dx = 0;
            }
        };

        function loop() {
            gameLoopRef = requestAnimationFrame(loop);

            // Throttle speed
            if (++count < speedControl) { return; }
            count = 0;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Move Snake
            snake.x += snake.dx;
            snake.y += snake.dy;

            // Collision with boundaries (Wall = Death)
            if (snake.x < 0 || snake.x >= canvas.width || snake.y < 0 || snake.y >= canvas.height) {
                window.triggerGameOver(score);
                return;
            }

            // Track movements
            snake.cells.unshift({ x: snake.x, y: snake.y });
            if (snake.cells.length > snake.maxCells) { snake.cells.pop(); }

            // Draw Apple (Neon Pink/Red)
            ctx.fillStyle = '#ef4444';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ef4444';
            ctx.fillRect(apple.x, apple.y, grid - 1, grid - 1);

            // Draw Snake (Neon Blue)
            ctx.fillStyle = '#3b82f6';
            ctx.shadowColor = '#3b82f6';

            for (let i = 0; i < snake.cells.length; i++) {
                ctx.fillRect(snake.cells[i].x, snake.cells[i].y, grid - 1, grid - 1);

                // Ate Apple?
                if (snake.cells[i].x === apple.x && snake.cells[i].y === apple.y) {
                    snake.maxCells++;
                    score += 10;
                    updateHUDScore(score);

                    // Increase speed slightly every 100 points
                    if (score % 100 === 0 && speedControl > 2) { speedControl--; }

                    // Respawn Apple
                    apple.x = Math.floor(Math.random() * (canvas.width / grid)) * grid;
                    apple.y = Math.floor(Math.random() * (canvas.height / grid)) * grid;
                }

                // Self Collision
                for (let j = i + 1; j < snake.cells.length; j++) {
                    if (snake.cells[i].x === snake.cells[j].x && snake.cells[i].y === snake.cells[j].y) {
                        window.triggerGameOver(score);
                        return;
                    }
                }
            }
            ctx.shadowBlur = 0; // reset
        }

        gameLoopRef = requestAnimationFrame(loop);
    }

    // ==========================================
    // GAME 2: FLAPPY UFO
    // ==========================================
    function startFlappy() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Settings
        const gravity = 0.15;
        const jumpThrust = -4.5;
        const speed = 2;
        const pipeWidth = 60;
        const pipeGap = 200;

        let score = 0;
        let lastPipeVal = 0; // tracking for scored pipes
        updateHUDScore(0);

        let ufo = {
            x: 100,
            y: 200,
            radius: 12,
            velocity: 0
        };

        let pipes = []; // {x, topHeight}

        // Spawn first pipes
        pipes.push({ x: canvas.width, topHeight: 200 });

        // Input overrides
        document.onkeydown = function (e) {
            if (e.which === 32 || e.which === 38) { // Space or Up Arrow
                e.preventDefault();
                ufo.velocity = jumpThrust;
            }
        };

        function loop() {
            gameLoopRef = requestAnimationFrame(loop);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Physics
            ufo.velocity += gravity;
            ufo.y += ufo.velocity;

            // Draw UFO (Neon Purple/Pink orb)
            ctx.beginPath();
            ctx.arc(ufo.x, ufo.y, ufo.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#c084fc';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#c084fc';
            ctx.fill();

            // Draw UFO ring
            ctx.beginPath();
            ctx.ellipse(ufo.x, ufo.y + 2, ufo.radius + 6, parseInt(ufo.radius / 2), 0, 0, Math.PI * 2);
            ctx.strokeStyle = '#e879f9';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Process Pipes
            ctx.fillStyle = '#10b981'; // Neon Emerald Pipes
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#10b981';

            for (let i = 0; i < pipes.length; i++) {
                let p = pipes[i];
                p.x -= speed;

                // Draw Top Pipe
                ctx.fillRect(p.x, 0, pipeWidth, p.topHeight);
                // Draw Bottom Pipe
                let bottomY = p.topHeight + pipeGap;
                let bottomHeight = canvas.height - bottomY;
                ctx.fillRect(p.x, bottomY, pipeWidth, bottomHeight);

                // Collision Logic
                // If UFO X is inside Pipe X
                if (ufo.x + ufo.radius > p.x && ufo.x - ufo.radius < p.x + pipeWidth) {
                    // If UFO Y hits Top or Bottom
                    if (ufo.y - ufo.radius < p.topHeight || ufo.y + ufo.radius > bottomY) {
                        window.triggerGameOver(score);
                        return;
                    }
                }

                // Scoring (Pass middle of pipe)
                if (p.x + pipeWidth / 2 < ufo.x && !p.scored) {
                    p.scored = true;
                    score++;
                    updateHUDScore(score);
                }
            }
            ctx.shadowBlur = 0;

            // Spawn Logic
            const lastPipe = pipes[pipes.length - 1];
            if (lastPipe && lastPipe.x < canvas.width - 250) {
                let rHeight = Math.floor(Math.random() * (canvas.height - pipeGap - 100)) + 50;
                pipes.push({ x: canvas.width, topHeight: rHeight, scored: false });
            }

            // Cleanup offscreen pipes
            if (pipes[0] && pipes[0].x < -pipeWidth) {
                pipes.shift();
            }

            // Floor/Ceil collision
            if (ufo.y > canvas.height || ufo.y < 0) {
                window.triggerGameOver(score);
                return;
            }
        }

        gameLoopRef = requestAnimationFrame(loop);
    }
});
