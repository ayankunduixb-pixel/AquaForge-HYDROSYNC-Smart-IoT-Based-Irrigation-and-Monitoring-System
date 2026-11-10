/* HYDROSYNC PR #1 - field grid map (50x50 cm cells) + rover path */
const FieldGrid = (() => {
  const COLS = 16, ROWS = 10, CELL_CM = 50, DRY_PCT = 30, MAX_PATH = 2000;
  const cells = new Map();
  let path = [], rover = null, hover = null, cv, ctx, tip, size = 40;
  const key = (x, y) => `${x},${y}`;
  const isBad = c => !!c.hard || Number(c.soil_pct) <= DRY_PCT;
  const cx = p => (p.x + 0.5) * size, cy = p => (p.y + 0.5) * size;
  const el = id => document.getElementById(id);
 
  function resize() {
    size = Math.max(18, Math.floor(cv.parentElement.clientWidth / COLS));
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = size * COLS + "px";
    cv.style.height = size * ROWS + "px";
    cv.width = size * COLS * dpr;
    cv.height = size * ROWS * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
 
  function draw() {
    ctx.clearRect(0, 0, size * COLS, size * ROWS);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const c = cells.get(key(x, y));
      ctx.fillStyle = !c ? "#12282f" : isBad(c) ? "rgba(255,119,119,.62)" : "rgba(94,214,194,.5)";
      ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      if (hover && hover.x === x && hover.y === y) {
        ctx.strokeStyle = "#e9f2f2"; ctx.lineWidth = 2;
        ctx.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
      }
    }
    if (path.length > 1) {
      ctx.lineJoin = ctx.lineCap = "round";
      ctx.beginPath();
      path.forEach((p, i) => (i ? ctx.lineTo(cx(p), cy(p)) : ctx.moveTo(cx(p), cy(p))));
      ctx.strokeStyle = "#0b171c"; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = "#ff3b3b"; ctx.lineWidth = 3; ctx.stroke();
    }
    if (rover) {
      ctx.beginPath(); ctx.arc(cx(rover), cy(rover), size * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = "#e9f2f2"; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = "#ff3b3b"; ctx.stroke();
    }
  }
 
  function stats() {
    let bad = 0;
    cells.forEach(c => { if (isBad(c)) bad++; });
    const n = cells.size;
    el("gridVisited").textContent = `${n} / ${COLS * ROWS}`;
    el("gridBad").textContent = bad;
    el("gridOk").textContent = n - bad;
    el("gridCoverage").textContent = `${Math.round((n / (COLS * ROWS)) * 100)}%`;
    el("gridSize").textContent = `${(COLS * CELL_CM) / 100} m × ${(ROWS * CELL_CM) / 100} m`;
  }
 
  function addCell(c) {
    if (!c || !(c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS)) return;
    cells.set(key(c.x, c.y), c);
    rover = { x: c.x, y: c.y };
    const last = path[path.length - 1];
    if (!last || last.x !== c.x || last.y !== c.y) path.push({ x: c.x, y: c.y });
    if (path.length > MAX_PATH) path.shift();
    stats(); draw();
  }
 
  function load(data) {
    cells.clear(); path = (data.path || []).slice(-MAX_PATH);
    (data.cells || []).forEach(c => cells.set(key(c.x, c.y), c));
    rover = path.length ? path[path.length - 1] : null;
    stats(); draw();
  }
 
  function onMove(e) {
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / size), y = Math.floor((e.clientY - r.top) / size);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return onLeave();
    hover = { x, y };
    const c = cells.get(key(x, y));
    tip.hidden = false;
    tip.style.left = `${Math.min(e.clientX - r.left + 12, r.width - 170)}px`;
    tip.style.top = `${e.clientY - r.top + 12}px`;
    tip.textContent = !c
      ? `Cell (${x}, ${y}) · not visited`
      : `Cell (${x}, ${y}) · soil ${Number(c.soil_pct).toFixed(1)}% · ${isBad(c) ? (c.hard ? "HARD SOIL" : "DRY") : "OK"}`;
    draw();
  }
  function onLeave() { hover = null; tip.hidden = true; draw(); }
 
  function init() {
    cv = el("fieldGrid"); ctx = cv.getContext("2d"); tip = el("gridTip");
    cv.addEventListener("mousemove", onMove);
    cv.addEventListener("mouseleave", onLeave);
    window.addEventListener("resize", resize);
    resize(); stats();
  }
  return { init, load, addCell };
})();
 
