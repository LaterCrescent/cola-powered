const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const superBtn = document.getElementById('super-btn');
const colaFill = document.getElementById('cola-fill');
const scoreEl = document.getElementById('score');

// --- ASSET GENERATION ---
function createSprite(color, type) {
    const c = document.createElement('canvas');
    c.width = type === 'boss' ? 64 : 32; c.height = type === 'boss' ? 64 : 32;
    const x = c.getContext('2d');
    
    if (type === 'player') {
        x.fillStyle = '#00ccff'; x.fillRect(8, 0, 16, 10); x.fillRect(4, 4, 4, 6); x.fillRect(24, 4, 4, 6);
        x.fillStyle = '#ffccaa'; x.fillRect(6, 10, 20, 14); x.fillStyle = '#333'; x.fillRect(8, 14, 16, 4);
    } else if (type === 'enemy') {
        x.fillStyle = '#cc0000'; x.fillRect(4, 4, 24, 24); x.fillStyle = '#ff0000'; x.fillRect(10, 8, 12, 6);
    } else if (type === 'boss') {
        x.fillStyle = '#aa0000'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#ffff00'; x.fillRect(20, 30, 24, 24);
        x.fillStyle = '#550000'; x.fillRect(10, 50, 44, 10); // Mouth
    } else if (type === 'cola') {
        x.fillStyle = '#442200'; x.fillRect(10, 10, 12, 22); // Brown Liquid
        x.fillStyle = '#00ffff'; x.fillRect(10, 15, 12, 8); // Blue Label
        x.fillStyle = '#ccc'; x.fillRect(12, 8, 8, 2); // Cap
    }
    return c;
}

const spritePlayer = createSprite(null, 'player');
const spriteEnemy = createSprite(null, 'enemy');
const spriteBoss = createSprite(null, 'boss');
const spriteCola = createSprite(null, 'cola');

// --- AUDIO ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'shoot') {
        osc.type = 'square'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'hit') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now); osc.frequency.exponentialRampToValueAtTime(10, now + 0.2);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'powerup') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, now); osc.frequency.linearRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

// Game State
let score = 0;
let xp = 0;
let level = 1;
let nextLevelXp = 50; // Fast first level
let colaEnergy = 100;
let superCharge = 0; 
let gameOver = false;
let gamePaused = false;

// Player Stats
const stats = {
    fireRate: 300,
    bulletSpeed: 10,
    multiShot: 1, 
    damage: 1,
    mentos: false,
    spread: 0
};

// Resize
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Player
const player = { x: canvas.width/2, y: canvas.height/2, size: 20, speed: 4, color: '#00ccff' };

// Input
const joystick = { active: false, startX: 0, startY: 0, dx: 0, dy: 0 };
window.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    if (superBtn.style.display !== 'none' && touch.clientY < 150) { activateSuper(); return; }
    joystick.active = true; joystick.startX = touch.clientX; joystick.startY = touch.clientY;
});
window.addEventListener('touchmove', (e) => {
    if (!joystick.active) return;
    const t = e.touches[0];
    let diffX = t.clientX - joystick.startX; let diffY = t.clientY - joystick.startY;
    const dist = Math.sqrt(diffX*diffX + diffY*diffY);
    if (dist > 0) {
        joystick.dx = (diffX/dist) * Math.min(dist,50)/50;
        joystick.dy = (diffY/dist) * Math.min(dist,50)/50;
    }
});
window.addEventListener('touchend', () => { joystick.active = false; joystick.dx = 0; joystick.dy = 0; });

superBtn.addEventListener('click', activateSuper);
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
            x: x, y: y, vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10, life: 30, color: color, size: Math.random()*5+2
        });
    }
}

function activateSuper() {
    if (superCharge >= 3) {
        enemies.forEach(e => spawnExplosion(e.x, e.y, '#ff4444'));
        enemies.length = 0;
        spawnExplosion(player.x, player.y, '#ffff00');
        superCharge = 0; superBtn.style.display = 'none';
        score += 500; scoreEl.innerText = "SCORE: " + score;
    }
}

// Level Up
function checkLevelUp() {
    if (xp >= nextLevelXp) {
        level++;
        xp -= nextLevelXp;
        nextLevelXp = Math.floor(nextLevelXp * 1.5);
        showUpgrades();
    }
}

function showUpgrades() {
    gamePaused = true;
    const screen = document.getElementById('upgrade-screen');
    const container = document.getElementById('cards-container');
    container.innerHTML = '';
    
    // Research-based Upgrades
    const options = [
        { name: "Caffeine Jitters", desc: "Fire Rate +15%", type: "rate" },
        { name: "High Carbonation", desc: "Damage +1", type: "dmg" },
        { name: "Six-Pack Ring", desc: "+1 Projectile", type: "multi" },
        { name: "The Mentos Reaction", desc: "Wobbly Exploding Bullets!", type: "mentos" }
    ];
    
    // Pick 3 random
    const choices = options.sort(() => 0.5 - Math.random()).slice(0, 3);
    
    choices.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'upgrade-card';
        div.innerHTML = `<h3>${opt.name}</h3><p>${opt.desc}</p>`;
        div.onclick = () => applyUpgrade(opt);
        container.appendChild(div);
    });
    screen.style.display = 'flex';
}

function applyUpgrade(opt) {
    if (opt.type === 'rate') stats.fireRate *= 0.85;
    if (opt.type === 'dmg') stats.damage += 1;
    if (opt.type === 'multi') { stats.multiShot += 1; stats.spread += 0.2; }
    if (opt.type === 'mentos') stats.mentos = true;
    
    gamePaused = false;
    document.getElementById('upgrade-screen').style.display = 'none';
    requestAnimationFrame(loop);
}

// Spawners
let bossActive = false;
setInterval(() => {
    if (gameOver || gamePaused) return;
    if (!bossActive && score > 0 && score % 500 === 0) {
        bossActive = true;
        enemies.push({ x: canvas.width/2, y: -100, size: 32, speed: 1, hp: 20, type: 'boss' });
        enemies.forEach((e, i) => { if (e.type !== 'boss') enemies.splice(i, 1); });
        return;
    }
    if (bossActive) return;
    const side = Math.floor(Math.random() * 4);
    let ex, ey;
    switch(side) {
        case 0: ex = Math.random()*canvas.width; ey = -20; break;
        case 1: ex = canvas.width+20; ey = Math.random()*canvas.height; break;
        case 2: ex = Math.random()*canvas.width; ey = canvas.height+20; break;
        case 3: ex = -20; ey = Math.random()*canvas.height; break;
    }
    enemies.push({ x: ex, y: ey, size: 15, speed: 2+(score/500), hp: 1, type: 'minion' });
}, 800);

setInterval(() => {
    if (gameOver || gamePaused) return;
    pickups.push({ x: Math.random()*(canvas.width-40)+20, y: Math.random()*(canvas.height-40)+20, size: 15 });
}, 5000);

setInterval(() => {
    if (gameOver || gamePaused) return;
    colaEnergy -= 1; 
    if (colaEnergy <= 0) {
        gameOver = true;
        const goScreen = document.getElementById('game-over-screen');
        if (goScreen) {
            goScreen.style.display = 'flex';
            goScreen.style.zIndex = '9999'; // Force it to top
            document.getElementById('final-score').innerText = "SCORE: " + score;
        } else {
            alert("GAME OVER! Score: " + score);
            location.reload();
        }
    }
    colaFill.style.width = Math.max(0, colaEnergy) + '%';
}, 200);

// Shooting
setInterval(() => {
    if (gameOver || gamePaused) return;
    let closest = null; let minDist = Infinity;
    enemies.forEach(e => {
        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < minDist) { minDist = dist; closest = e; }
    });
    
    if (closest) {
        const angle = Math.atan2(closest.y - player.y, closest.x - player.x);
        for(let k=0; k<stats.multiShot; k++) {
            // Spread shots slightly
            const spreadAngle = angle + (k - (stats.multiShot-1)/2) * 0.2; 
            bullets.push({
                x: player.x, y: player.y,
                vx: Math.cos(spreadAngle) * stats.bulletSpeed,
                vy: Math.sin(spreadAngle) * stats.bulletSpeed,
                life: 60,
                wobble: stats.mentos,
                age: 0
            });
        }
        playSound('shoot');
    }
}, stats.fireRate); 

let shootTimer = 0;

// Update Loop
function update() {
    if (gameOver || gamePaused) return;

    // Shooting (Moved here for dynamic fire rate)
    shootTimer++;
    if (shootTimer >= stats.fireRate / 16) { // Approx frame conversion
        shootTimer = 0;
        let closest = null; let minDist = Infinity;
        enemies.forEach(e => {
            const dist = Math.hypot(e.x - player.x, e.y - player.y);
            if (dist < minDist) { minDist = dist; closest = e; }
        });
        if (closest) {
            const angle = Math.atan2(closest.y - player.y, closest.x - player.x);
            for(let k=0; k<stats.multiShot; k++) {
                const spreadAngle = angle + (k - (stats.multiShot-1)/2) * 0.2; 
                bullets.push({
                    x: player.x, y: player.y,
                    vx: Math.cos(spreadAngle) * stats.bulletSpeed,
                    vy: Math.sin(spreadAngle) * stats.bulletSpeed,
                    life: 60, wobble: stats.mentos, age: 0
                });
            }
            playSound('shoot');
        }
    }

    if (joystick.active) { player.x += joystick.dx*player.speed; player.y += joystick.dy*player.speed; }
    else {
        if (keys['w'] || keys['ArrowUp']) player.y -= player.speed;
        if (keys['s'] || keys['ArrowDown']) player.y += player.speed;
        if (keys['a'] || keys['ArrowLeft']) player.x -= player.speed;
        if (keys['d'] || keys['ArrowRight']) player.x += player.speed;
    }
    player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));
    player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y));

    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx; b.y += b.vy; b.life--; b.age++;
        if (b.wobble) {
            b.x += Math.sin(b.age * 0.5) * 5; // Mentos wobble
        }
        if (b.life <= 0) bullets.splice(i, 1);
    }

    for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        if (Math.hypot(p.x - player.x, p.y - player.y) < player.size + p.size) {
            colaEnergy = Math.min(100, colaEnergy + 20);
            superCharge++; pickups.splice(i, 1); score += 50; playSound('powerup');
            if (superCharge >= 3) { superBtn.style.display = 'block'; superBtn.innerText = "SUPER!"; }
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.x += p.vx; p.y += p.vy; p.life--; p.size *= 0.9;
        if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const angle = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(angle) * e.speed; e.y += Math.sin(angle) * e.speed;

        if (Math.hypot(e.x - player.x, e.y - player.y) < player.size + e.size) {
            colaEnergy -= (e.type === 'boss' ? 50 : 20); 
            spawnExplosion(player.x, player.y, '#00ccff');
            if (e.type !== 'boss') enemies.splice(i, 1);
            playSound('hit');
            if (colaEnergy <= 0) {
                gameOver = true;
                const goScreen = document.getElementById('game-over-screen');
                if (goScreen) {
                    goScreen.style.display = 'flex';
                    goScreen.style.zIndex = '9999';
                    document.getElementById('final-score').innerText = "SCORE: " + score;
                } else {
                    alert("GAME OVER! Score: " + score);
                    location.reload();
                }
            }
            continue;
        }

        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (Math.hypot(e.x - b.x, e.y - b.y) < e.size + 5) {
                spawnExplosion(e.x, e.y, '#ff4444');
                bullets.splice(j, 1);
                e.hp -= stats.damage;
                if (e.hp <= 0) {
                    enemies.splice(i, 1);
                    score += (e.type === 'boss' ? 1000 : 10);
                    xp += (e.type === 'boss' ? 100 : 20);
                    checkLevelUp();
                    scoreEl.innerText = "SCORE: " + score;
                    if (e.type === 'boss') {
                        bossActive = false;
                        spawnExplosion(e.x, e.y, '#ffff00');
                    }
                } else { playSound('hit'); }
                break;
            }
        }
    }
}

function draw() {
    ctx.fillStyle = '#222'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    pickups.forEach(p => { ctx.drawImage(spriteCola, p.x - 16, p.y - 16, 32, 32); });
    particles.forEach(p => { ctx.fillStyle = p.color; ctx.beginPath(); ctx.rect(p.x, p.y, p.size, p.size); ctx.fill(); });
    ctx.fillStyle = '#ffaa00';
    bullets.forEach(b => {
        ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255, 100, 0, 0.5)';
        ctx.beginPath(); ctx.arc(b.x - b.vx*0.5, b.y - b.vy*0.5, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffaa00';
    });
    enemies.forEach(e => {
        if (e.type === 'boss') ctx.drawImage(spriteBoss, e.x - 32, e.y - 32, 64, 64);
        else ctx.drawImage(spriteEnemy, e.x - e.size, e.y - e.size, e.size*2, e.size*2);
    });
    ctx.drawImage(spritePlayer, player.x - player.size, player.y - player.size, player.size*2, player.size*2);
    if (joystick.active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(joystick.startX, joystick.startY, 50, 0, Math.PI * 2); ctx.stroke();
    }
}

function loop() { update(); draw(); if (!gameOver) requestAnimationFrame(loop); }
loop();