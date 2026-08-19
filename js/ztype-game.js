document.addEventListener("DOMContentLoaded", async () => {
    if (window.HaygAPI) await window.HaygAPI.requireAuth();

    // --- DOM Elements ---
    const canvas = document.getElementById("game-canvas");
    const ctx = canvas.getContext("2d");
    const hud = document.getElementById("hud");
    const scoreDisplay = document.getElementById("score-display");
    const comboDisplay = document.getElementById("combo-display");
    const comboMult = document.getElementById("combo-mult");
    const levelDisplay = document.getElementById("level-display");
    const livesDisplay = document.getElementById("lives-display");
    const startMenu = document.getElementById("start-menu");
    const startBtn = document.getElementById("start-btn");
    const gameOver = document.getElementById("game-over");
    const retryBtn = document.getElementById("retry-btn");
    const finalScore = document.getElementById("final-score");
    const finalLevel = document.getElementById("final-level");
    const finalWords = document.getElementById("final-words");
    const finalAccuracy = document.getElementById("final-accuracy");
    const wordTarget = document.getElementById("word-target");
    const keyboardContainer = document.getElementById("keyboard-container");

    // --- Game State ---
    let width, height;
    let isPlaying = false;
    let lastTime = 0;
    let score = 0;
    let combo = 0;
    let level = 1;
    let lives = 3;
    let wordsCompleted = 0;
    let totalKeystrokes = 0;
    let correctKeystrokes = 0;

    // Entities
    let stars = [];
    let enemies = [];
    let particles = [];
    let projectiles = [];

    // Typing state
    let targetEnemy = null;
    let targetIndex = 0;
    let spawnTimer = 0;
    let levelTimer = 0;

    // --- Audio System ---
    let audioCtx;
    function initAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    function playSound(type) {
        if (!audioCtx) return;
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'shoot') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(300, t + 0.1);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.start(t);
            osc.stop(t + 0.1);
        } else if (type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
            gain.gain.setValueAtTime(0.4, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            osc.start(t);
            osc.stop(t + 0.15);
        } else if (type === 'explode') {
            // White noise burst
            const bufSize = audioCtx.sampleRate * 0.2;
            const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = audioCtx.createBufferSource();
            noise.buffer = buf;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1000;
            noise.connect(filter);
            filter.connect(gain);
            gain.gain.setValueAtTime(0.5, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            noise.start(t);
        }
    }

    // --- Setup ---
    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        initStars();
    }
    window.addEventListener("resize", resize);
    resize();

    // Armenian Keyboard Layout
    const kbLayout = [
        ['է', 'թ', 'փ', 'ձ', 'ջ', 'ր', 'չ', 'ճ', 'ժ', 'ծ'],
        ['ք', 'ո', 'ե', 'ռ', 'տ', 'ը', 'ւ', 'ի', 'օ', 'պ'],
        ['ա', 'ս', 'դ', 'ֆ', 'գ', 'հ', 'յ', 'կ', 'լ'],
        ['զ', 'խ', 'ց', 'վ', 'բ', 'ն', 'մ', 'շ', 'ղ', '⌫'],
        ['SPACE']
    ];

    function initKeyboard() {
        keyboardContainer.innerHTML = '';
        kbLayout.forEach(row => {
            const rEl = document.createElement('div');
            rEl.className = 'keyboard-row';
            row.forEach(key => {
                const btn = document.createElement('button');
                btn.textContent = key === 'SPACE' ? '␣' : key;
                btn.dataset.key = key;
                if (key === 'SPACE' || key === '⌫') btn.classList.add('wide-button');

                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    handleInput(key);
                    btn.classList.add('pressed');
                });
                btn.addEventListener('touchend', () => btn.classList.remove('pressed'));
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    handleInput(key);
                    btn.classList.add('pressed');
                });
                btn.addEventListener('mouseup', () => btn.classList.remove('pressed'));
                btn.addEventListener('mouseleave', () => btn.classList.remove('pressed'));

                rEl.appendChild(btn);
            });
            keyboardContainer.appendChild(rEl);
        });
    }

    // --- Starfield ---
    function initStars() {
        stars = [];
        for (let i = 0; i < 100; i++) {
            stars.push({
                x: Math.random() * width,
                y: Math.random() * height,
                size: Math.random() * 2 + 0.5,
                speed: Math.random() * 0.5 + 0.1,
                alpha: Math.random()
            });
        }
    }

    function drawBackground(dt) {
        ctx.fillStyle = "#050a18";
        ctx.fillRect(0, 0, width, height);

        stars.forEach(s => {
            s.y += s.speed * (dt / 16);
            if (s.y > height) {
                s.y = 0;
                s.x = Math.random() * width;
            }
            ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // --- Ship ---
    const ship = {
        x: 0, y: 0, size: 20,
        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);

            // Engine glow
            ctx.shadowBlur = 15;
            ctx.shadowColor = "#00e5ff";

            ctx.beginPath();
            ctx.moveTo(0, -this.size);
            ctx.lineTo(this.size, this.size);
            ctx.lineTo(0, this.size * 0.5);
            ctx.lineTo(-this.size, this.size);
            ctx.closePath();

            const grad = ctx.createLinearGradient(0, -this.size, 0, this.size);
            grad.addColorStop(0, "#ffffff");
            grad.addColorStop(1, "#00e5ff");
            ctx.fillStyle = grad;
            ctx.fill();

            ctx.restore();
        }
    };

    // --- Entities ---
    class Enemy {
        constructor(word, type = "basic") {
            this.word = word;
            this.type = type;
            this.x = Math.random() * (width - 100) + 50;
            this.y = -50;
            this.radius = 25 + word.length * 2;

            // Stats based on level
            let difficulty = document.getElementById("ztype-level-select") ? document.getElementById("ztype-level-select").value : "hard";
            let speedMult = 1;
            if (difficulty === "easy") speedMult = 0.5;
            else if (difficulty === "medium") speedMult = 0.75;

            this.baseSpeed = (0.2 + Math.random() * 0.2) * (1 + level * 0.1) * speedMult;
            if (type === "fast") this.baseSpeed *= 1.8;
            if (type === "tank") this.baseSpeed *= 0.5;

            this.speed = this.baseSpeed;
            this.color = type === "fast" ? "#ff00e5" : type === "tank" ? "#ff8800" : "#ff4455";
        }

        update(dt) {
            this.y += this.speed * (dt / 16);
        }

        draw(isActive, progress) {
            ctx.save();
            ctx.translate(this.x, this.y);

            // Aura
            ctx.shadowBlur = isActive ? 20 : 10;
            ctx.shadowColor = isActive ? "#00e5ff" : this.color;

            // Hexagon shape
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i;
                const px = Math.cos(angle) * this.radius;
                const py = Math.sin(angle) * this.radius;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = `rgba(10, 20, 40, 0.8)`;
            ctx.fill();
            ctx.strokeStyle = isActive ? "#00e5ff" : this.color;
            ctx.lineWidth = isActive ? 3 : 2;
            ctx.stroke();

            // Text
            ctx.shadowBlur = 0;
            ctx.font = "bold 16px Outfit";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const w = ctx.measureText(this.word).width;
            let currentX = -w / 2;

            for (let i = 0; i < this.word.length; i++) {
                const char = this.word[i];
                const charW = ctx.measureText(char).width;

                if (isActive && i < progress) {
                    ctx.fillStyle = "#666";
                } else if (isActive && i === progress) {
                    ctx.fillStyle = "#00e5ff";
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = "#00e5ff";
                } else {
                    ctx.fillStyle = "#fff";
                    ctx.shadowBlur = 0;
                }

                ctx.fillText(char, currentX + charW / 2, 0);
                currentX += charW;
            }

            ctx.restore();
        }
    }

    class Particle {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.life = 1.0;
            this.decay = Math.random() * 0.05 + 0.02;
            this.color = color;
            this.size = Math.random() * 3 + 1;
        }
        update(dt) {
            this.x += this.vx * (dt / 16);
            this.y += this.vy * (dt / 16);
            this.life -= this.decay * (dt / 16);
        }
        draw() {
            ctx.globalAlpha = this.life;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }

    class Projectile {
        constructor(x, y, tx, ty) {
            this.x = x;
            this.y = y;
            this.tx = tx;
            this.ty = ty;
            const dx = tx - x;
            const dy = ty - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            this.vx = (dx / dist) * 20;
            this.vy = (dy / dist) * 20;
            this.life = 1;
        }
        update(dt) {
            this.x += this.vx * (dt / 16);
            this.y += this.vy * (dt / 16);

            // Check hit
            const dx = this.tx - this.x;
            const dy = this.ty - this.y;
            if (Math.sqrt(dx * dx + dy * dy) < 20) {
                this.life = 0;
                createExplosion(this.tx, this.ty, "#00e5ff", 5);
            }
        }
        draw() {
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#00e5ff";
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    function createExplosion(x, y, color, count = 15) {
        for (let i = 0; i < count; i++) {
            particles.push(new Particle(x, y, color));
        }
    }

    // --- Game Logic ---
    function spawnEnemy() {
        if (!ztypeWords) return;

        let pool = ztypeWords.easy;
        let type = "basic";

        // Difficulty scaling
        const rand = Math.random();
        if (level >= 2 && rand > 0.6) {
            pool = ztypeWords.medium;
            type = "fast";
        }
        if (level >= 3 && rand > 0.8) {
            pool = ztypeWords.hard;
            type = "tank";
        }

        const word = pool[Math.floor(Math.random() * pool.length)];
        enemies.push(new Enemy(word, type));
    }

    function getRandomWord() {
        const pool = ztypeWords.easy;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function updateHUD() {
        scoreDisplay.textContent = score;
        comboDisplay.textContent = combo;
        let mult = 1;
        if (combo >= 5) mult = 2;
        if (combo >= 10) mult = 3;
        if (combo >= 20) mult = 4;
        if (combo >= 30) mult = 5;
        comboMult.textContent = `x${mult}`;
        levelDisplay.textContent = level;
        livesDisplay.textContent = '❤️'.repeat(lives);
    }

    function updateWordTarget() {
        if (!targetEnemy) {
            wordTarget.classList.add('hidden');
            return;
        }

        wordTarget.classList.remove('hidden');
        wordTarget.innerHTML = '';

        for (let i = 0; i < targetEnemy.word.length; i++) {
            const span = document.createElement('span');
            span.className = 'letter';
            span.textContent = targetEnemy.word[i];

            if (i < targetIndex) span.classList.add('typed');
            else if (i === targetIndex) span.classList.add('current');

            wordTarget.appendChild(span);
        }
    }

    function getComboMultiplier() {
        if (combo >= 30) return 5;
        if (combo >= 20) return 4;
        if (combo >= 10) return 3;
        if (combo >= 5) return 2;
        return 1;
    }

    function handleInput(key) {
        if (!isPlaying) return;
        initAudio();

        const k = key.toLowerCase();

        // Find target
        if (!targetEnemy) {
            // Find lowest enemy starting with this letter
            let bestEnemy = null;
            let lowestY = -1000;

            for (let e of enemies) {
                if (e.word[0].toLowerCase() === k && e.y > lowestY) {
                    bestEnemy = e;
                    lowestY = e.y;
                }
            }

            if (bestEnemy) {
                targetEnemy = bestEnemy;
                targetIndex = 0;
            } else {
                combo = 0;
                playSound('error');
                updateHUD();
                return;
            }
        }

        // Check letter
        if (targetEnemy.word[targetIndex].toLowerCase() === k) {
            // Correct
            totalKeystrokes++;
            correctKeystrokes++;
            combo++;
            score += 1; // 1 XP per correct character
            targetIndex++;

            playSound('shoot');
            projectiles.push(new Projectile(ship.x, ship.y, targetEnemy.x, targetEnemy.y));

            if (targetIndex >= targetEnemy.word.length) {
                // Word complete
                wordsCompleted++;
                score += targetEnemy.word.length * 2; // Extra 2 XP per character on word completion
                createExplosion(targetEnemy.x, targetEnemy.y, targetEnemy.color, 30);
                playSound('explode');

                enemies = enemies.filter(e => e !== targetEnemy);
                targetEnemy = null;
                targetIndex = 0;
            }
        } else {
            // Wrong
            totalKeystrokes++;
            combo = 0;
            playSound('error');

            if (targetEnemy.type === 'tank') {
                targetIndex = 0; // Punish tank mistakes
            }
        }

        updateHUD();
        updateWordTarget();
    }

    // --- Main Loop ---
    function update(dt) {
        // Timers
        spawnTimer += dt;
        let difficulty = document.getElementById("ztype-level-select") ? document.getElementById("ztype-level-select").value : "hard";
        let spawnMult = 1;
        if (difficulty === "easy") spawnMult = 1.5;
        else if (difficulty === "medium") spawnMult = 1.25;

        const spawnRate = Math.max(800, 2000 - level * 100) * spawnMult;
        if (spawnTimer > spawnRate) {
            spawnTimer = 0;
            spawnEnemy();
        }

        levelTimer += dt;
        if (levelTimer > 30000) { // Level up every 30s
            levelTimer = 0;
            level++;
            updateHUD();
        }

        // Entities
        ship.x = width / 2;
        ship.y = height - 250; // Above keyboard

        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            e.update(dt);

            // Reached bottom
            if (e.y > height - 200) {
                createExplosion(e.x, e.y, e.color, 20);
                playSound('explode');
                enemies.splice(i, 1);
                lives--;

                if (e === targetEnemy) {
                    targetEnemy = null;
                    targetIndex = 0;
                    updateWordTarget();
                }

                updateHUD();

                if (lives <= 0) {
                    endGame();
                }
            }
        }

        projectiles.forEach(p => p.update(dt));
        projectiles = projectiles.filter(p => p.life > 0);

        particles.forEach(p => p.update(dt));
        particles = particles.filter(p => p.life > 0);
    }

    function render(dt) {
        drawBackground(dt);

        particles.forEach(p => p.draw());
        projectiles.forEach(p => p.draw());
        enemies.forEach(e => e.draw(e === targetEnemy, targetIndex));
        ship.draw();
    }

    function loop(timestamp) {
        if (!isPlaying) return;

        const dt = timestamp - lastTime;
        lastTime = timestamp;

        // Cap dt to prevent huge jumps if tab inactive
        if (dt < 100) {
            update(dt);
            render(dt);
        }

        requestAnimationFrame(loop);
    }

    // --- Game Flow ---
    function startGame() {
        initAudio();
        startMenu.classList.add("hidden");
        gameOver.classList.add("hidden");
        hud.classList.remove("hidden");

        score = 0;
        combo = 0;
        level = 1;
        lives = 3;
        wordsCompleted = 0;
        totalKeystrokes = 0;
        correctKeystrokes = 0;

        enemies = [];
        particles = [];
        projectiles = [];
        targetEnemy = null;
        targetIndex = 0;

        spawnTimer = 0;
        levelTimer = 0;

        isPlaying = true;
        lastTime = performance.now();
        updateHUD();
        updateWordTarget();

        // Initial spawn
        spawnEnemy();

        requestAnimationFrame(loop);
    }

    function endGame() {
        isPlaying = false;
        hud.classList.add("hidden");
        wordTarget.classList.add("hidden");
        gameOver.classList.remove("hidden");

        finalScore.textContent = score;
        finalLevel.textContent = level;
        finalWords.textContent = wordsCompleted;

        const acc = totalKeystrokes > 0 ? Math.round((correctKeystrokes / totalKeystrokes) * 100) : 0;
        finalAccuracy.textContent = acc + "%";

        if (window.HaygAPI) window.HaygAPI.updateScore('ztype', score);
    }

    // --- Event Listeners ---
    document.getElementById("hud-back").addEventListener("click", () => {
        isPlaying = false;
        hud.classList.add("hidden");
        wordTarget.classList.add("hidden");
        startMenu.classList.remove("hidden");
    });

    startBtn.addEventListener("click", startGame);
    retryBtn.addEventListener("click", startGame);

    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (isPlaying) {
            let k = e.key;
            if (k === "Backspace") k = "⌫";
            if (k === " ") {
                k = "SPACE";
                e.preventDefault();
            }
            if (k.length === 1 || k === "⌫" || k === "SPACE") {
                handleInput(k);

                // Visual feedback on virtual keyboard
                const btn = document.querySelector(`.keyboard-row button[data-key="${k === " " ? "SPACE" : k}"]`);
                if (btn) {
                    btn.classList.add('pressed');
                    setTimeout(() => btn.classList.remove('pressed'), 100);
                }
            }
        }
    });

    initKeyboard();
    initStars();
    drawBackground(0); // Initial draw behind menu
});
