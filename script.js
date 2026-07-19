(() => {
  const MONTH = 7; // August (0-based)
  const DAY = 19;

  const values = {
    days: document.querySelector('[data-unit="days"]'),
    hours: document.querySelector('[data-unit="hours"]'),
    minutes: document.querySelector('[data-unit="minutes"]'),
    seconds: document.querySelector('[data-unit="seconds"]'),
  };
  const arrived = document.getElementById("arrived");
  const countdown = document.querySelector(".countdown");

  const pad = (n) => String(n).padStart(2, "0");

  function nextBirthday(from = new Date()) {
    const year = from.getFullYear();
    let target = new Date(year, MONTH, DAY, 0, 0, 0, 0);
    if (from >= target) {
      target = new Date(year + 1, MONTH, DAY, 0, 0, 0, 0);
    }
    return target;
  }

  function isBirthdayToday(now) {
    return now.getMonth() === MONTH && now.getDate() === DAY;
  }

  let previous = { days: null, hours: null, minutes: null, seconds: null };

  function flash(el) {
    el.classList.remove("tick");
    void el.offsetWidth;
    el.classList.add("tick");
  }

  function render(diffMs, celebrate) {
    if (celebrate) {
      countdown.hidden = true;
      arrived.hidden = false;
      return;
    }

    countdown.hidden = false;
    arrived.hidden = true;

    const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const next = { days, hours, minutes, seconds };

    for (const key of Object.keys(values)) {
      const el = values[key];
      const formatted = key === "days" ? String(next[key]) : pad(next[key]);
      if (previous[key] !== next[key]) {
        el.textContent = formatted;
        flash(el);
        previous[key] = next[key];
      }
    }
  }

  function tick() {
    const now = new Date();
    if (isBirthdayToday(now)) {
      render(0, true);
      return;
    }
    const target = nextBirthday(now);
    render(target - now, false);
  }

  tick();
  setInterval(tick, 1000);

  // Soft floating sparks
  const canvas = document.getElementById("sparks");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const particles = [];
  let width = 0;
  let height = 0;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function spawn() {
    particles.push({
      x: Math.random() * width,
      y: height + Math.random() * 40,
      r: 0.6 + Math.random() * 2.2,
      vy: 0.25 + Math.random() * 0.7,
      vx: (Math.random() - 0.5) * 0.35,
      a: 0.25 + Math.random() * 0.55,
      hue: Math.random() > 0.55 ? 38 : 18,
    });
  }

  function frame() {
    ctx.clearRect(0, 0, width, height);
    if (particles.length < 48) spawn();

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx;
      p.y -= p.vy;
      p.a -= 0.0018;

      if (p.a <= 0 || p.y < -10) {
        particles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 85%, 68%, ${p.a})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  for (let i = 0; i < 24; i += 1) spawn();
  requestAnimationFrame(frame);
})();
