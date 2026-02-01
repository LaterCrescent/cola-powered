const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const superBtn = document.getElementById('super-btn');
const colaFill = document.getElementById('cola-fill');
const scoreEl = document.getElementById('score');

// --- ASSET GENERATION (Pixel Art via Canvas) ---
function createSprite(color, type) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const x = c.getContext('2d');
    
    if (type === 'player') {
        // Franky Face
        x.fillStyle = '#00ccff'; // Hair
        x.fillRect(8, 0, 16, 10);
        x.fillRect(4, 4, 4, 6); // Sideburns
        x.fillRect(24, 4, 4, 6);
        x.fillStyle = '#ffccaa'; // Skin
        x.fillRect(6, 10, 20, 14);
        x.fillStyle = '#333'; // Sunglasses
        x.fillRect(8, 14, 16, 4);
        x.fillStyle = '#000'; // Mouth
        x.fillRect(12, 22, 8, 2);
    } else if (type === 'enemy') {
        // Robot
        x.fillStyle = '#cc0000'; // Body
        x.fillRect(4, 4, 24, 24);
        x.fillStyle = '#ff0000'; // Eye
        x.fillRect(10, 8, 12, 6);
        x.fillStyle = '#ffff00'; // Eye Glow
        x.fillRect(14, 10, 4, 2);
        x.fillStyle = '#550000'; // Legs
        x.fillRect(4, 28, 6, 4);
        x.fillRect(22, 28, 6, 4);
    } else if (type === 'cola') {
        // Bottle
        x.fillStyle = '#884400'; // Liquid
        x.fillRect(10, 8, 12, 18);
        x.fillStyle = '#ccffff'; // Glass Shine
        x.fillRect(12, 10, 2, 10);
        x.fillStyle = '#cccccc'; // Cap
        x.fillRect(10, 6, 12, 2);
    }
    return c;
}

const spritePlayer = createSprite(null, 'player');
const spriteEnemy = createSprite(null, 'enemy');
const spriteCola = createSprite(null, 'cola');

// --- AUDIO ENGINE (Oscillators) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    if (type === 'shoot') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === 'powerup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'super') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(50, now + 1.0);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0, now + 1.0);
        osc.start(now);
        osc.stop(now + 1.0);
    }
}

// Game State
let score = 0;
let colaEnergy = 100;
let superCharge = 0; // 0 to 3
let gameOver = false;

// Resize
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Player
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    size: 20,
    speed: 4,
    color: '#00ccff'
};

// Input
const joystick = { active: false, startX: 0, startY: 0, dx: 0, dy: 0 };

window.addEventListener('touchstart', (e) => {
    // Check if touching super button
    const touch = e.touches[0];
    const rect = superBtn.getBoundingClientRect();
    if (superBtn.style.display !== 'none' && 
        touch.clientX >= rect.left && touch.clientX <= rect.right &&
        touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        activateSuper();
        return;
    }
    
    joystick.active = true;
    joystick.startX = touch.clientX;
    joystick.startY = touch.clientY;
});

window.addEventListener('touchmove', (e) => {
    if (!joystick.active) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    let diffX = currentX - joystick.startX;
    let diffY = currentY - joystick.startY;
    const distance = Math.sqrt(diffX*diffX + diffY*diffY);
    const maxDist = 50;
    if (distance > 0) {
        joystick.dx = (diffX / distance) * Math.min(distance, maxDist) / maxDist;
        joystick.dy = (diffY / distance) * Math.min(distance, maxDist) / maxDist;
    }
});

window.addEventListener('touchend', () => {
    joystick.active = false;
    joystick.dx = 0;
    joystick.dy = 0;
});

// Click for Super (Desktop)
superBtn.addEventListener('click', activateSuper);

// Keyboard Input (Desktop)
const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

// Entities
const bullets = [];
const enemies = [];
const particles = [];
const pickups = [];

function spawnExplosion(x, y, color) {
    for(let i=0; i<8; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 30,
            color: color,
            size: Math.random() * 5 + 2
        });
    }
}

function activateSuper() {
    if (superCharge >= 3) {
        // NUKE!
        enemies.forEach(e => spawnExplosion(e.x, e.y, '#ff4444'));
        enemies.length = 0; // Kill all
        spawnExplosion(player.x, player.y, '#ffff00'); // Shockwave effect
        playSound('super');
        
        superCharge = 0;
        superBtn.style.display = 'none';
        
        // Bonus Score
        score += 500;
        scoreEl.innerText = "SCORE: " + score;
    }
}

// Spawners
setInterval(() => {
    if (gameOver) return;
    const side = Math.floor(Math.random() * 4);
    let ex, ey;
    switch(side) {
        case 0: ex = Math.random() * canvas.width; ey = -20; break;
        case 1: ex = canvas.width + 20; ey = Math.random() * canvas.height; break;
        case 2: ex = Math.random() * canvas.width; ey = canvas.height + 20; break;
        case 3: ex = -20; ey = Math.random() * canvas.height; break;
    }
    enemies.push({ x: ex, y: ey, size: 15, speed: 2 + (score/500) });
}, 800);

// Cola Spawner
setInterval(() => {
    if (gameOver) return;
    pickups.push({
        x: Math.random() * (canvas.width - 40) + 20,
        y: Math.random() * (canvas.height - 40) + 20,
        size: 15
    });
}, 5000);

// Drain Energy
setInterval(() => {
    if (gameOver) return;
    colaEnergy -= 1; // 1% per tick
    if (colaEnergy <= 0) {
        gameOver = true;
        document.getElementById('game-over-screen').style.display = 'flex';
        document.getElementById('final-score').innerText = "SCORE: " + score;
    }
    colaFill.style.width = Math.max(0, colaEnergy) + '%';
}, 200);

// Shooting
setInterval(() => {
    if (gameOver) return;
    let closest = null;
    let minDist = Infinity;
    enemies.forEach(e => {
        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < minDist) { minDist = dist; closest = e; }
    });
    if (closest) {
        const angle = Math.atan2(closest.y - player.y, closest.x - player.x);
        bullets.push({
            x: player.x, y: player.y,
            vx: Math.cos(angle) * 10, vy: Math.sin(angle) * 10,
            life: 60
        });
        playSound('shoot');
    }
}, 300);

// Game Loop
function update() {
    if (gameOver) {
        document.getElementById('game-over-screen').style.display = 'flex';
        document.getElementById('final-score').innerText = "SCORE: " + score;
        return;
    }

    // Player Move
    if (joystick.active) {
        player.x += joystick.dx * player.speed;
        player.y += joystick.dy * player.speed;
    } else {
        // Keyboard Fallback
        if (keys['w'] || keys['ArrowUp']) player.y -= player.speed;
        if (keys['s'] || keys['ArrowDown']) player.y += player.speed;
        if (keys['a'] || keys['ArrowLeft']) player.x -= player.speed;
        if (keys['d'] || keys['ArrowRight']) player.x += player.speed;
    }
    
    player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));
    player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y));

    // Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx; b.y += b.vy; b.life--;
        if (b.life <= 0) bullets.splice(i, 1);
    }

    // Pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        const dist = Math.hypot(p.x - player.x, p.y - player.y);
        if (dist < player.size + p.size) {
            // Collect!
            colaEnergy = Math.min(100, colaEnergy + 20);
            superCharge++;
            pickups.splice(i, 1);
            score += 50;
            playSound('powerup');
            
            // Check Super
            if (superCharge >= 3) {
                superBtn.style.display = 'block';
                superBtn.innerText = "SUPER!";
            } else {
                // Flash message maybe?
            }
        }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        p.size *= 0.9;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const angle = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(angle) * e.speed;
        e.y += Math.sin(angle) * e.speed;

        // Hit Player
        const distPlayer = Math.hypot(e.x - player.x, e.y - player.y);
        if (distPlayer < player.size + e.size) {
            colaEnergy -= 20; 
            spawnExplosion(player.x, player.y, '#00ccff');
            enemies.splice(i, 1);
            playSound('hit');
            if (colaEnergy <= 0) {
                gameOver = true;
                // Force update immediately to show screen
                document.getElementById('game-over-screen').style.display = 'flex';
                document.getElementById('final-score').innerText = "SCORE: " + score;
            }
            continue;
        }

        // Hit Bullet
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            const distBullet = Math.hypot(e.x - b.x, e.y - b.y);
            if (distBullet < e.size + 5) {
                spawnExplosion(e.x, e.y, '#ff4444');
                enemies.splice(i, 1);
                bullets.splice(j, 1);
                score += 10;
                scoreEl.innerText = "SCORE: " + score;
                playSound('hit');
                break;
            }
        }
    }
}

function draw() {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pickups (Cola)
    pickups.forEach(p => {
        // Draw centered
        ctx.drawImage(spriteCola, p.x - 16, p.y - 16, 32, 32);
        
        // Glow effect
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    // Particles
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.rect(p.x, p.y, p.size, p.size);
        ctx.fill();
    });

    // Bullets (Fireballs)
    ctx.fillStyle = '#ffaa00';
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
        ctx.fill();
        // Trail
        ctx.fillStyle = 'rgba(255, 100, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(b.x - b.vx*0.5, b.y - b.vy*0.5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffaa00'; // Reset
    });

    // Enemies
    enemies.forEach(e => {
        ctx.drawImage(spriteEnemy, e.x - e.size, e.y - e.size, e.size*2, e.size*2);
    });
    
    // Player
    // Rotate player towards movement or mouse? For now just static upright
    ctx.drawImage(spritePlayer, player.x - player.size, player.y - player.size, player.size*2, player.size*2);
    
    // Debug Joystick
    if (joystick.active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(joystick.startX, joystick.startY, 50, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function loop() {
    update();
    draw();
    if (!gameOver) requestAnimationFrame(loop);
}

loop();