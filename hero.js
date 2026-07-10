/* ============================================================
   HELICYN - hero field
   A fine vector/dot field (terrain) overlaid with a sparse node
   network (coordination) and traveling signal pulses (telemetry).
   Deflects + brightens under the cursor. Monochrome with rare
   signal-blue. Not sci-fi - an instrument surface.
   ============================================================ */
(function () {
  const canvas = document.getElementById('field');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // tunables (read from CSS-driven globals if present)
  const STATE = (window.__helicyn = window.__helicyn || {});
  STATE.motion = STATE.motion ?? 0.6;   // 0..1
  STATE.signal = '#3f7dff';

  // field "ink" (dots/edges) flips with the theme so it stays
  // visible against either a near-black or a near-white canvas
  let ink = document.documentElement.getAttribute('data-theme') === 'light' ? '20,21,26' : '232,238,246';
  window.addEventListener('helicyn:theme', (e) => {
    ink = e.detail.theme === 'light' ? '20,21,26' : '232,238,246';
  });

  let W = 0, H = 0, dpr = 1;
  let grid = [];           // fine field points
  let nodes = [];          // sparse network nodes
  let edges = [];          // node connections
  let pulses = [];         // traveling signals
  const SP = 50;           // grid spacing (px)
  const R = 150;           // cursor influence radius

  const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false };
  const reticle = document.querySelector('.reticle');

  // ---- seeded rng for stable node layout -------------------
  let seed = 20260601;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

  function build() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // fine grid
    grid = [];
    const cols = Math.ceil(W / SP) + 2;
    const rows = Math.ceil(H / SP) + 2;
    const ox = (W - (cols - 1) * SP) / 2;
    const oy = (H - (rows - 1) * SP) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = ox + c * SP, y = oy + r * SP;
        grid.push({ x0: x, y0: y, x, y, ph: (c * 0.6 + r * 0.9) });
      }
    }

    // sparse node network - jittered loose lattice
    seed = 20260601;
    nodes = [];
    const NC = Math.max(3, Math.round(W / 360));
    const NR = Math.max(2, Math.round(H / 320));
    const gx = W / (NC + 1), gy = H / (NR + 1);
    for (let i = 1; i <= NC; i++) {
      for (let j = 1; j <= NR; j++) {
        nodes.push({
          x: gx * i + (rnd() - 0.5) * gx * 0.55,
          y: gy * j + (rnd() - 0.5) * gy * 0.55,
          r: 1.6 + rnd() * 1.4,
          accent: rnd() > 0.78,
          ph: rnd() * Math.PI * 2,
        });
      }
    }

    // edges: connect each node to nearest 2
    edges = [];
    const seen = new Set();
    nodes.forEach((n, i) => {
      const d = nodes.map((m, k) => ({ k, dist: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
        .filter(o => o.k !== i).sort((a, b) => a.dist - b.dist).slice(0, 2);
      d.forEach(o => {
        const key = i < o.k ? i + '-' + o.k : o.k + '-' + i;
        if (seen.has(key)) return; seen.add(key);
        edges.push({ a: i, b: o.k, len: Math.sqrt(o.dist) });
      });
    });

    pulses = [];
  }

  function spawnPulse() {
    if (!edges.length) return;
    const e = edges[(Math.random() * edges.length) | 0];
    pulses.push({ edge: e, t: 0, speed: 0.12 + Math.random() * 0.16, dir: Math.random() > 0.5 ? 1 : -1 });
  }

  // ---- render ----------------------------------------------
  let t = 0;
  let lastSpawn = 0;

  function frame(now) {
    t = now * 0.001;
    // ease cursor
    if (mouse.active) {
      mouse.x += (mouse.tx - mouse.x) * 0.14;
      mouse.y += (mouse.ty - mouse.y) * 0.14;
    }
    if (reticle) {
      reticle.style.transform = `translate(${mouse.x}px, ${mouse.y}px) translate(-50%,-50%)`;
    }

    ctx.clearRect(0, 0, W, H);
    const m = STATE.motion;

    // parallax of whole field toward cursor (very subtle)
    let px = 0, py = 0;
    if (mouse.active) {
      px = (mouse.x - W / 2) * 0.012;
      py = (mouse.y - H / 2) * 0.012;
    }

    // ---- edges (coordination lines) ----
    ctx.lineWidth = 1;
    for (const e of edges) {
      const a = nodes[e.a], b = nodes[e.b];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dm = Math.hypot(mx - mouse.x, my - mouse.y);
      const near = mouse.active ? Math.max(0, 1 - dm / 280) : 0;
      ctx.strokeStyle = `rgba(${ink},${0.05 + near * 0.10})`;
      ctx.beginPath();
      ctx.moveTo(a.x + px, a.y + py);
      ctx.lineTo(b.x + px, b.y + py);
      ctx.stroke();
    }

    // ---- fine field (terrain) ----
    for (const p of grid) {
      // breathing drift
      const drift = reduce ? 0 : Math.sin(t * 0.5 + p.ph) * 1.1 * m;
      let x = p.x0 + px, y = p.y0 + py + drift;
      let a = 0.14;
      let rad = 0.9;

      if (mouse.active) {
        const dx = x - mouse.x, dy = y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < R) {
          const f = 1 - d / R;          // 0..1
          const push = f * f * 14 * m;  // lens deflection outward
          const inv = d || 0.001;
          x += (dx / inv) * push;
          y += (dy / inv) * push;
          a = 0.14 + f * 0.55;
          rad = 0.9 + f * 1.3;
        }
      }
      ctx.fillStyle = `rgba(${ink},${a})`;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- nodes (network) ----
    for (const n of nodes) {
      const x = n.x + px, y = n.y + py;
      const dm = mouse.active ? Math.hypot(x - mouse.x, y - mouse.y) : 9999;
      const near = Math.max(0, 1 - dm / 220);
      const breath = reduce ? 0.5 : (0.5 + 0.5 * Math.sin(t * 0.8 + n.ph));
      const col = n.accent ? STATE.signal : '232,238,246';
      // ring
      ctx.strokeStyle = n.accent
        ? `rgba(63,125,255,${0.30 + near * 0.5})`
        : `rgba(${ink},${0.14 + near * 0.4})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, n.r + 2.5 + breath * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      // core
      ctx.fillStyle = n.accent
        ? `rgba(63,125,255,${0.55 + near * 0.4})`
        : `rgba(${ink},${0.30 + near * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, n.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- pulses (signal flow) ----
    if (!reduce && m > 0.02) {
      if (now - lastSpawn > (1400 - m * 900) && pulses.length < 6 + m * 6) {
        spawnPulse(); lastSpawn = now;
      }
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pl = pulses[i];
      pl.t += pl.speed * (reduce ? 0 : 0.016) * (0.6 + m);
      if (pl.t >= 1) { pulses.splice(i, 1); continue; }
      const a = nodes[pl.edge.a], b = nodes[pl.edge.b];
      const tt = pl.dir > 0 ? pl.t : 1 - pl.t;
      const x = a.x + (b.x - a.x) * tt + px;
      const y = a.y + (b.y - a.y) * tt + py;
      // trail
      const tail = 0.10;
      const t2 = Math.max(0, tt - tail * pl.dir);
      const x2 = a.x + (b.x - a.x) * t2 + px;
      const y2 = a.y + (b.y - a.y) * t2 + py;
      const grad = ctx.createLinearGradient(x2, y2, x, y);
      grad.addColorStop(0, 'rgba(63,125,255,0)');
      grad.addColorStop(1, 'rgba(63,125,255,0.7)');
      ctx.strokeStyle = grad; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke();
      // head
      ctx.fillStyle = 'rgba(196,215,255,0.95)';
      ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(63,125,255,0.25)';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }

    requestAnimationFrame(frame);
  }

  // ---- input -----------------------------------------------
  // .hero (homepage) or .control-head (/control-plane) - both
  // render the same #field canvas and should get the same cursor
  // deflection/reticle instead of only the homepage reacting.
  const hero = document.querySelector('.hero, .control-head');
  function onMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.tx = e.clientX - rect.left;
    mouse.ty = e.clientY - rect.top;
    if (!mouse.active) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
    mouse.active = true;
    if (reticle) reticle.style.opacity = '0.6';
  }
  function onLeave() {
    mouse.active = false;
    mouse.tx = -9999; mouse.ty = -9999; mouse.x = -9999; mouse.y = -9999;
    if (reticle) reticle.style.opacity = '0';
  }
  if (hero) {
    hero.addEventListener('pointermove', onMove);
    hero.addEventListener('pointerleave', onLeave);
  }

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 160); });

  build();
  // seed a couple pulses
  for (let i = 0; i < 3; i++) spawnPulse();
  requestAnimationFrame(frame);
})();

/* ============================================================
   HELICYN - hero logo tilt
   The big wordmark leans into the cursor (a self-contained 3D
   perspective on the element itself, so it composes with the
   independent `translate`-based idle float in CSS without either
   one clobbering the other's transform).
   ============================================================ */
(function () {
  const logo = document.getElementById('heroLogo');
  const hero = document.querySelector('.hero');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!logo || !hero || reduce) return;
  function onMove(e) {
    const r = logo.getBoundingClientRect();
    const px = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const py = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const rx = Math.max(-1, Math.min(1, px));
    const ry = Math.max(-1, Math.min(1, py));
    logo.style.transform = `perspective(900px) rotateX(${(ry * -7).toFixed(2)}deg) rotateY(${(rx * 9).toFixed(2)}deg)`;
  }
  function onLeave() { logo.style.transform = ''; }
  hero.addEventListener('pointermove', onMove);
  hero.addEventListener('pointerleave', onLeave);
})();
