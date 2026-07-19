(() => {
  const MONTH = 7;
  const DAY = 19;
  const ROUND_SECONDS = 45;
  const GOAL_SCORE = 1200;
  const STORAGE_KEY = "artem-bubble-toast-board";
  const COMBO_WINDOW_MS = 900;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hud = document.getElementById("hud");
  const scoreEl = document.getElementById("score");
  const comboEl = document.getElementById("combo");
  const timeEl = document.getElementById("time");
  const toastFill = document.getElementById("toastFill");
  const floatScore = document.getElementById("floatScore");
  const startPanel = document.getElementById("startPanel");
  const endPanel = document.getElementById("endPanel");
  const startBtn = document.getElementById("startBtn");
  const againBtn = document.getElementById("againBtn");
  const menuBtn = document.getElementById("menuBtn");
  const playerNameInput = document.getElementById("playerName");
  const boardEl = document.getElementById("board");
  const hint = document.getElementById("hint");
  const arrived = document.getElementById("arrived");
  const countdown = document.querySelector(".countdown");
  const endScore = document.getElementById("endScore");
  const endTitle = document.getElementById("endTitle");
  const endText = document.getElementById("endText");
  const unitEls = {
    days: document.querySelector('[data-unit="days"]'),
    hours: document.querySelector('[data-unit="hours"]'),
    minutes: document.querySelector('[data-unit="minutes"]'),
    seconds: document.querySelector('[data-unit="seconds"]'),
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  let bubbles = [];
  let bursts = [];
  let streams = [];
  let ambient = [];
  let playing = false;
  let score = 0;
  let combo = 1;
  let lastPopAt = 0;
  let timeLeft = ROUND_SECONDS;
  let roundEndsAt = 0;
  let playerName = "";
  let raf = 0;
  let lastTs = 0;
  let spawnAcc = 0;
  let previousUnits = { days: null, hours: null, minutes: null, seconds: null };

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function nextBirthday(from = new Date()) {
    const year = from.getFullYear();
    let target = new Date(year, MONTH, DAY, 0, 0, 0, 0);
    if (from >= target) target = new Date(year + 1, MONTH, DAY, 0, 0, 0, 0);
    return target;
  }

  function isBirthdayToday(now) {
    return now.getMonth() === MONTH && now.getDate() === DAY;
  }

  function updateCountdown() {
    const now = new Date();
    if (isBirthdayToday(now)) {
      countdown.hidden = true;
      arrived.hidden = false;
      return;
    }
    countdown.hidden = false;
    arrived.hidden = true;
    const totalSeconds = Math.max(0, Math.floor((nextBirthday(now) - now) / 1000));
    const next = {
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    };
    for (const key of Object.keys(unitEls)) {
      const formatted = key === "days" ? String(next[key]) : pad(next[key]);
      if (previousUnits[key] !== next[key]) {
        unitEls[key].textContent = formatted;
        previousUnits[key] = next[key];
      }
    }
  }

  function loadBoard() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveBoard(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 8)));
  }

  function renderBoard() {
    const list = loadBoard().sort((a, b) => b.score - a.score).slice(0, 5);
    boardEl.innerHTML = list
      .map(
        (row, i) =>
          `<li><span class="rank">${i + 1}.</span><span class="who">${escapeHtml(
            row.name
          )}</span><span class="pts">${row.score}</span></li>`
      )
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!streams.length) initStreams();
  }

  function initStreams() {
    const count = Math.max(5, Math.floor(width / 180));
    streams = Array.from({ length: count }, (_, i) => ({
      x: ((i + 0.5) / count) * width + (Math.random() - 0.5) * 30,
      drift: (Math.random() - 0.5) * 18,
      rate: 0.012 + Math.random() * 0.02,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function makeBubble({ interactive, streamX, goldChance = 0.12 }) {
    const gold = interactive && Math.random() < goldChance;
    const base = interactive ? 16 + Math.random() * 28 : 2 + Math.random() * 5;
    const x = streamX ?? Math.random() * width;
    return {
      x,
      y: height + base + Math.random() * 40,
      r: base,
      vy: interactive ? 55 + Math.random() * 85 : 30 + Math.random() * 50,
      wobble: 0.6 + Math.random() * 1.8,
      wobbleSpeed: 1.2 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2,
      life: 1,
      interactive,
      gold,
      shine: Math.random() * Math.PI * 2,
      trail: [],
      popped: false,
    };
  }

  function spawnInteractive(dt) {
    if (!playing) return;
    spawnAcc += dt;
    const intensity = 0.55 + (1 - timeLeft / ROUND_SECONDS) * 0.75;
    const interval = 0.28 / intensity;
    while (spawnAcc >= interval) {
      spawnAcc -= interval;
      const stream = streams[Math.floor(Math.random() * streams.length)];
      const x = stream.x + Math.sin(performance.now() / 700 + stream.phase) * stream.drift;
      bubbles.push(makeBubble({ interactive: true, streamX: x }));
      if (Math.random() < 0.35) {
        ambient.push(makeBubble({ interactive: false, streamX: x + (Math.random() - 0.5) * 20 }));
      }
    }
  }

  function spawnAmbientIdle() {
    if (ambient.length > 70) return;
    const stream = streams[Math.floor(Math.random() * streams.length)];
    const x = stream.x + Math.sin(performance.now() / 900 + stream.phase) * stream.drift;
    ambient.push(makeBubble({ interactive: false, streamX: x }));
    if (Math.random() < 0.2) {
      ambient.push(makeBubble({ interactive: false, streamX: Math.random() * width }));
    }
  }

  function drawBubble(b, alphaMul = 1) {
    const a = b.life * alphaMul;
    if (a <= 0.02) return;

    const gradient = ctx.createRadialGradient(
      b.x - b.r * 0.35,
      b.y - b.r * 0.4,
      b.r * 0.1,
      b.x,
      b.y,
      b.r
    );

    if (b.gold) {
      gradient.addColorStop(0, `rgba(255, 248, 210, ${0.85 * a})`);
      gradient.addColorStop(0.45, `rgba(242, 184, 75, ${0.35 * a})`);
      gradient.addColorStop(1, `rgba(217, 137, 43, ${0.08 * a})`);
    } else {
      gradient.addColorStop(0, `rgba(255, 255, 255, ${0.72 * a})`);
      gradient.addColorStop(0.35, `rgba(220, 245, 255, ${0.22 * a})`);
      gradient.addColorStop(0.75, `rgba(180, 220, 230, ${0.1 * a})`);
      gradient.addColorStop(1, `rgba(140, 190, 200, ${0.02 * a})`);
    }

    ctx.beginPath();
    ctx.fillStyle = gradient;
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = b.gold
      ? `rgba(255, 220, 140, ${0.55 * a})`
      : `rgba(230, 250, 255, ${0.45 * a})`;
    ctx.lineWidth = Math.max(1, b.r * 0.06);
    ctx.arc(b.x, b.y, b.r * 0.92, 0, Math.PI * 2);
    ctx.stroke();

    const hx = b.x - b.r * (0.35 + 0.08 * Math.sin(b.shine));
    const hy = b.y - b.r * (0.4 + 0.06 * Math.cos(b.shine));
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${0.75 * a})`;
    ctx.ellipse(hx, hy, b.r * 0.22, b.r * 0.14, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * a})`;
    ctx.arc(b.x + b.r * 0.28, b.y + b.r * 0.3, Math.max(1, b.r * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTrail(b) {
    for (let i = 0; i < b.trail.length; i += 1) {
      const t = b.trail[i];
      const p = i / Math.max(1, b.trail.length - 1);
      ctx.beginPath();
      ctx.fillStyle = `rgba(210, 240, 250, ${(1 - p) * 0.18 * b.life})`;
      ctx.arc(t.x, t.y, Math.max(0.6, b.r * 0.12 * (1 - p)), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function updateBubble(b, dt) {
    b.phase += b.wobbleSpeed * dt;
    b.shine += dt * 3;
    b.x += Math.sin(b.phase) * b.wobble * (b.interactive ? 18 : 10) * dt;
    b.y -= b.vy * dt;
    if (b.interactive) {
      b.trail.push({ x: b.x, y: b.y + b.r * 0.6 });
      if (b.trail.length > 8) b.trail.shift();
    }
    if (b.y < -b.r - 20) b.life = 0;
  }

  function createBurst(x, y, r, gold) {
    const count = 10 + Math.floor(r / 3);
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 40 + Math.random() * 120;
      bursts.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        r: 1 + Math.random() * Math.max(1.5, r * 0.12),
        life: 1,
        gold,
      });
    }
    for (let i = 0; i < 4; i += 1) {
      ambient.push({
        x: x + (Math.random() - 0.5) * r,
        y: y + (Math.random() - 0.5) * r,
        r: 1 + Math.random() * 2.5,
        vy: 40 + Math.random() * 50,
        wobble: 1,
        wobbleSpeed: 2,
        phase: Math.random() * Math.PI * 2,
        life: 1,
        interactive: false,
        gold: false,
        shine: 0,
        trail: [],
        popped: false,
      });
    }
  }

  function showFloat(x, y, points, gold) {
    floatScore.textContent = `+${points}${gold ? " ★" : ""}`;
    floatScore.style.left = `${x}px`;
    floatScore.style.top = `${y}px`;
    floatScore.classList.remove("show");
    void floatScore.offsetWidth;
    floatScore.classList.add("show");
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    comboEl.textContent = `×${combo}`;
    timeEl.textContent = String(Math.max(0, Math.ceil(timeLeft)));
    const fill = Math.min(100, (score / GOAL_SCORE) * 100);
    toastFill.style.height = `${fill}%`;
  }

  function popAt(clientX, clientY) {
    if (!playing) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    let best = null;
    let bestDist = Infinity;
    for (const b of bubbles) {
      if (!b.interactive || b.popped || b.life <= 0) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      const dist = Math.hypot(dx, dy);
      const hitR = b.r + 18;
      if (dist <= hitR && dist < bestDist) {
        best = b;
        bestDist = dist;
      }
    }
    if (!best) return;

    best.popped = true;
    best.life = 0;
    createBurst(best.x, best.y, best.r, best.gold);

    const now = performance.now();
    if (now - lastPopAt <= COMBO_WINDOW_MS) {
      combo = Math.min(8, combo + 1);
    } else {
      combo = 1;
    }
    lastPopAt = now;

    const sizeBonus = Math.round(best.r);
    const base = best.gold ? 40 : 12;
    const points = (base + sizeBonus) * combo;
    score += points;
    showFloat(best.x, best.y, points, best.gold);
    updateHud();

    if (score >= GOAL_SCORE) endRound(true);
  }

  function startRound() {
    playerName = (playerNameInput.value || "").trim() || "друг";
    playerNameInput.value = playerName;
    score = 0;
    combo = 1;
    lastPopAt = 0;
    timeLeft = ROUND_SECONDS;
    roundEndsAt = performance.now() + ROUND_SECONDS * 1000;
    bubbles = [];
    bursts = [];
    spawnAcc = 0;
    playing = true;
    document.body.classList.add("playing");
    startPanel.hidden = true;
    endPanel.hidden = true;
    hud.hidden = false;
    hint.hidden = false;
    setTimeout(() => {
      hint.hidden = true;
    }, 2200);
    updateHud();
  }

  function endRound(toasted) {
    if (!playing) return;
    playing = false;
    document.body.classList.remove("playing");
    hud.hidden = true;
    hint.hidden = true;
    endPanel.hidden = false;
    endScore.textContent = String(score);

    const board = loadBoard();
    board.push({ name: playerName, score, at: Date.now() });
    saveBoard(board);
    renderBoard();

    if (toasted || score >= GOAL_SCORE) {
      endTitle.textContent = "Тост поднят!";
      endText.textContent = `${playerName}, бокал полный. Артём точно услышит.`;
    } else if (score >= 600) {
      endTitle.textContent = "Крепкий залп";
      endText.textContent = "Почти праздник. Попробуй ещё раз набить тост.";
    } else {
      endTitle.textContent = "Пузырьки сбежали";
      endText.textContent = "Друзья рядом — передай телефон и реванш.";
    }
  }

  function frame(ts) {
    const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;

    ctx.clearRect(0, 0, width, height);

    // soft champagne haze near the bottom
    const haze = ctx.createLinearGradient(0, height * 0.55, 0, height);
    haze.addColorStop(0, "rgba(242, 184, 75, 0)");
    haze.addColorStop(1, "rgba(242, 184, 75, 0.08)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, height * 0.55, width, height * 0.45);

    if (!playing && Math.random() < 0.35) spawnAmbientIdle();
    spawnInteractive(dt);

    if (playing) {
      timeLeft = Math.max(0, (roundEndsAt - ts) / 1000);
      timeEl.textContent = String(Math.max(0, Math.ceil(timeLeft)));
      if (timeLeft <= 0) endRound(score >= GOAL_SCORE);
      if (performance.now() - lastPopAt > COMBO_WINDOW_MS && combo !== 1) {
        combo = 1;
        comboEl.textContent = "×1";
      }
    }

    const lists = [ambient, bubbles];
    for (const list of lists) {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const b = list[i];
        updateBubble(b, dt);
        if (b.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        if (b.interactive) drawTrail(b);
        drawBubble(b, b.interactive ? 1 : 0.75);
      }
    }

    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const p = bursts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt;
      p.life -= dt * 1.8;
      if (p.life <= 0) {
        bursts.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.fillStyle = p.gold
        ? `rgba(255, 210, 120, ${p.life})`
        : `rgba(220, 245, 255, ${p.life})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // foam shimmer line
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 245, 220, 0.08)";
    ctx.lineWidth = 2;
    ctx.moveTo(0, height * 0.92);
    for (let x = 0; x <= width; x += 18) {
      const y =
        height * 0.92 +
        Math.sin(x * 0.03 + ts * 0.004) * 4 +
        Math.sin(x * 0.01 + ts * 0.002) * 3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    raf = requestAnimationFrame(frame);
  }

  function onPointer(e) {
    e.preventDefault();
    if (e.touches && e.touches.length) {
      for (const t of e.touches) popAt(t.clientX, t.clientY);
      return;
    }
    popAt(e.clientX, e.clientY);
  }

  startBtn.addEventListener("click", startRound);
  againBtn.addEventListener("click", startRound);
  menuBtn.addEventListener("click", () => {
    endPanel.hidden = true;
    startPanel.hidden = false;
    renderBoard();
  });

  canvas.addEventListener("pointerdown", onPointer, { passive: false });
  canvas.addEventListener("touchstart", onPointer, { passive: false });

  window.addEventListener("resize", resize);

  const savedName = localStorage.getItem("artem-bubble-player");
  if (savedName) playerNameInput.value = savedName;
  playerNameInput.addEventListener("change", () => {
    localStorage.setItem("artem-bubble-player", playerNameInput.value.trim());
  });

  updateCountdown();
  setInterval(updateCountdown, 1000);
  renderBoard();
  resize();

  if (!reduceMotion) {
    for (let i = 0; i < 40; i += 1) spawnAmbientIdle();
    lastTs = performance.now();
    raf = requestAnimationFrame(frame);
  } else {
    hint.hidden = true;
  }

  window.addEventListener("beforeunload", () => cancelAnimationFrame(raf));
})();
