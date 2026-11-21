/* Barreno 3D móvil — interfaz. El cálculo lo hace el motor Python (motor.js, Pyodide). */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const f2 = (v, d = 2) => (v == null || !isFinite(v)) ? "—" : Number(v).toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ------------------------------------------------------------------ motor (Web Worker) */
const motor = (() => {
  let w = null, n = 0;
  const pend = new Map();
  function arrancar() {
    w = new Worker(window.B3D_MOTOR || "motor.js");
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.tipo === "progreso") { $("#carga-txt").textContent = m.texto; return; }
      const p = pend.get(m.id); if (!p) return;
      pend.delete(m.id);
      try {
        const r = JSON.parse(m.resultado);
        r.ok ? p.ok(r.datos) : p.mal(new Error(r.error || "Error"));
      } catch (e) { p.mal(e); }
    };
    w.onerror = (e) => { for (const p of pend.values()) p.mal(new Error(e.message || "Error del motor")); pend.clear(); };
  }
  return {
    llamar(fn, arg, texto = "Calculando…") {
      if (!w) arrancar();
      cargando(true, texto);
      const id = ++n;
      return new Promise((ok, mal) => {
        pend.set(id, { ok, mal });
        w.postMessage({ id, fn, arg: arg == null ? null : JSON.stringify(arg) });
      }).finally(() => { if (!pend.size) cargando(false); });
    },
  };
})();

function cargando(on, texto) {
  $("#carga").classList.toggle("on", on);
  if (texto) $("#carga-txt").textContent = texto;
}
let tTost = 0;
function tostada(t, ms = 2600) {
  const e = $("#tostada"); e.textContent = t; e.classList.add("on");
  clearTimeout(tTost); tTost = setTimeout(() => e.classList.remove("on"), ms);
}
function msg(caja, texto, tipo = "error") { $(caja).innerHTML = texto ? `<div class="${tipo}">${tipo === "error" ? "✖" : "⚠"} ${esc(texto)}</div>` : ""; }

async function compartirArchivo(blob, nombre) {
  const file = new File([blob], nombre, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nombre }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  tostada(`Guardado: ${nombre}`);
}
async function svgAPng(svg, nombre) {
  const r = svg.getBoundingClientRect();
  const k = 2.5, W = Math.round(r.width * k), H = Math.round(r.height * k);
  const copia = svg.cloneNode(true);
  copia.setAttribute("width", W); copia.setAttribute("height", H);
  copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copia)], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise((ok, mal) => { img.onload = ok; img.onerror = mal; img.src = url; });
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"); g.fillStyle = "#101317"; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
  URL.revokeObjectURL(url);
  c.toBlob((b) => compartirArchivo(b, nombre), "image/png");
}

/* ------------------------------------------------------------------ formularios */
function leerForm(form) {
  const d = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") d[el.name] = el.checked;
    else if (el.type === "number") d[el.name] = el.value === "" ? null : Number(el.value);
    else d[el.name] = el.value;
  }
  return d;
}
function guardarForm(form, clave) {
  try { localStorage.setItem("b3d_" + clave, JSON.stringify(leerForm(form))); } catch (e) { /* sin almacenamiento */ }
}
function restaurarForm(form, clave) {
  let d = null;
  try { d = JSON.parse(localStorage.getItem("b3d_" + clave) || "null"); } catch (e) { d = null; }
  if (!d) return;
  for (const el of form.elements) {
    if (!el.name || !(el.name in d) || d[el.name] == null) continue;
    if (el.type === "checkbox") el.checked = !!d[el.name]; else el.value = d[el.name];
  }
}
function llenarListas(raiz) {
  for (const s of $$("select[data-lista]", raiz)) {
    const lista = INFO[s.dataset.lista] || [];
    const actual = s.value;
    s.innerHTML = (s.dataset.vacio ? `<option value="">${esc(s.dataset.vacio)}</option>` : "") +
      lista.map((x, i) => s.dataset.lista === "explosivos" ? `<option value="${i}">${esc(x.nombre)}</option>`
        : `<option>${esc(x)}</option>`).join("");
    if (actual !== "" && [...s.options].some((o) => o.value === actual)) s.value = actual;
  }
}
/* constructor de formularios de las herramientas */
function campos(lista) {
  return `<div class="campos">${lista.map((c) => {
    if (c.t === "sel") return `<label class="c ${c.ancho ? "ancho" : ""}">${c.l}<select name="${c.n}">${c.op.map((o) =>
      `<option ${o === c.v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    if (c.t === "chk") return `<label class="chk ancho"><input type="checkbox" name="${c.n}" ${c.v ? "checked" : ""}> ${c.l}</label>`;
    if (c.t === "txt") return `<label class="c ancho">${c.l}<textarea name="${c.n}" rows="${c.filas || 5}">${esc(c.v || "")}</textarea></label>`;
    return `<label class="c ${c.ancho ? "ancho" : ""}">${c.l}<input name="${c.n}" type="number" step="${c.paso ?? "any"}" value="${c.v}" inputmode="decimal"></label>`;
  }).join("")}</div>`;
}
const kpis = (l) => `<div class="kpis">${l.map(([t, v, n]) => `<div class="kpi"><small>${t}</small><b>${v}</b>${n ? `<i>${n}</i>` : ""}</div>`).join("")}</div>`;
const tabla = (cab, filas) => `<div class="tabla"><table><tr>${cab.map((c) => `<th>${c}</th>`).join("")}</tr>${filas.map((f) =>
  `<tr>${f.map((v) => `<td>${typeof v === "number" ? f2(v, Math.abs(v) >= 100 ? 1 : 2) : esc(v)}</td>`).join("")}</tr>`).join("")}</table></div>`;

/* ------------------------------------------------------------------ hoja de detalle */
function abrirHoja(titulo, html) {
  $("#hoja-tit").textContent = titulo;
  $("#hoja-cuerpo").innerHTML = html;
  $("#hoja-cuerpo").scrollTop = 0;
  $("#hoja").classList.add("on");
  history.pushState({ hoja: 1 }, "");
  return $("#hoja-cuerpo");
}
function cerrarHoja() { if (visor3d) { visor3d.cerrar(); visor3d = null; } $("#hoja").classList.remove("on"); }
$("#hoja-x").onclick = () => history.back();
window.addEventListener("popstate", () => { if ($("#hoja").classList.contains("on")) cerrarHoja(); });

/* ------------------------------------------------------------------ gráficos (canvas) */
function grafico(canvas, cfg) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext("2d"); g.scale(dpr, dpr);
  g.fillStyle = "#1b1f24"; g.fillRect(0, 0, W, H);
  const m = { l: 52, r: 12, t: cfg.titulo ? 26 : 12, b: 38 };
  const todos = cfg.series.flatMap((s) => s.x.map((x, i) => [x, s.y[i]])).filter(([x, y]) => isFinite(x) && isFinite(y) && (!cfg.logx || x > 0));
  if (!todos.length) return;
  let x0 = cfg.xmin ?? Math.min(...todos.map((p) => p[0])), x1 = cfg.xmax ?? Math.max(...todos.map((p) => p[0]));
  let y0 = cfg.ymin ?? Math.min(...todos.map((p) => p[1])), y1 = cfg.ymax ?? Math.max(...todos.map((p) => p[1]));
  if (cfg.cero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  if (y1 === y0) { y1 += 1; y0 -= 1; }
  if (!cfg.ymax && !cfg.ymin && !cfg.igual) { const d = (y1 - y0) * 0.06; y0 -= cfg.cero && y0 === 0 ? 0 : d; y1 += d; }
  const lx = (v) => cfg.logx ? Math.log10(v) : v;
  let X0 = lx(x0), X1 = lx(x1);
  if (cfg.igual) { // misma escala en x e y
    const ax = (W - m.l - m.r) / (X1 - X0), ay = (H - m.t - m.b) / (y1 - y0), k = Math.min(ax, ay);
    const cx = (X0 + X1) / 2, cy = (y0 + y1) / 2;
    X0 = cx - (W - m.l - m.r) / k / 2; X1 = cx + (W - m.l - m.r) / k / 2;
    y0 = cy - (H - m.t - m.b) / k / 2; y1 = cy + (H - m.t - m.b) / k / 2;
  }
  const px = (v) => m.l + (lx(v) - X0) / (X1 - X0) * (W - m.l - m.r);
  const py = (v) => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
  g.font = "11px system-ui"; g.strokeStyle = "#2a3038"; g.fillStyle = "#8f99a5"; g.lineWidth = 1;
  // marcas
  const marcas = (a, b, n) => { const p = Math.pow(10, Math.floor(Math.log10((b - a) / n))); const st = [1, 2, 5, 10].map((k) => k * p).find((s) => (b - a) / s <= n) || p * 10; const r = []; for (let v = Math.ceil(a / st) * st; v <= b + 1e-9; v += st) r.push(+v.toFixed(10)); return r; };
  const mx = cfg.logx ? (() => { const r = []; for (let e = Math.floor(X0); e <= Math.ceil(X1); e++) for (const k of [1, 2, 5]) { const v = k * 10 ** e; if (Math.log10(v) >= X0 - 1e-9 && Math.log10(v) <= X1 + 1e-9) r.push(v); } return r; })() : marcas(X0, X1, Math.max(3, W / 80));
  g.textAlign = "center";
  for (const v of mx) { const x = px(v); g.beginPath(); g.moveTo(x, m.t); g.lineTo(x, H - m.b); g.stroke(); g.fillText(fmt(v), x, H - m.b + 14); }
  g.textAlign = "right";
  for (const v of marcas(y0, y1, Math.max(3, H / 55))) { const y = py(v); g.beginPath(); g.moveTo(m.l, y); g.lineTo(W - m.r, y); g.stroke(); g.fillText(fmt(v), m.l - 5, y + 4); }
  g.textAlign = "center"; if (cfg.xlab) g.fillText(cfg.xlab, (m.l + W - m.r) / 2, H - 6);
  if (cfg.ylab) { g.save(); g.translate(12, (m.t + H - m.b) / 2); g.rotate(-Math.PI / 2); g.fillText(cfg.ylab, 0, 0); g.restore(); }
  if (cfg.titulo) { g.fillStyle = "#e8ebef"; g.font = "600 12.5px system-ui"; g.fillText(cfg.titulo, W / 2, 16); }
  g.save(); g.beginPath(); g.rect(m.l, m.t, W - m.l - m.r, H - m.t - m.b); g.clip();
  for (const v of cfg.vlineas || []) { g.strokeStyle = v.color || "#e6b84a"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(px(v.x), m.t); g.lineTo(px(v.x), H - m.b); g.stroke(); g.setLineDash([]); if (v.texto) { g.fillStyle = v.color || "#e6b84a"; g.textAlign = "left"; g.font = "11px system-ui"; g.fillText(v.texto, px(v.x) + 4, m.t + 12); } }
  for (const v of cfg.hlineas || []) { g.strokeStyle = v.color || "#e6b84a"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(m.l, py(v.y)); g.lineTo(W - m.r, py(v.y)); g.stroke(); g.setLineDash([]); }
  for (const s of cfg.series) {
    g.strokeStyle = s.color || "#2ec4b6"; g.fillStyle = s.color || "#2ec4b6"; g.lineWidth = s.ancho || 2;
    if (s.puntos) { s.x.forEach((x, i) => { g.beginPath(); g.arc(px(x), py(s.y[i]), 3.5, 0, 7); g.fill(); }); continue; }
    g.setLineDash(s.trazo || []); g.beginPath();
    let primero = true;
    s.x.forEach((x, i) => { const y = s.y[i]; if (!isFinite(y) || (cfg.logx && x <= 0)) { primero = true; return; } primero ? g.moveTo(px(x), py(y)) : g.lineTo(px(x), py(y)); primero = false; });
    g.stroke(); g.setLineDash([]);
    if (s.relleno) { g.globalAlpha = .18; g.lineTo(px(s.x[s.x.length - 1]), py(Math.max(y0, 0))); g.lineTo(px(s.x[0]), py(Math.max(y0, 0))); g.fill(); g.globalAlpha = 1; }
  }
  g.restore();
  const etq = cfg.series.filter((s) => s.nombre);
  if (etq.length) { g.font = "11px system-ui"; g.textAlign = "left"; let y = m.t + 6; for (const s of etq) { g.fillStyle = s.color || "#2ec4b6"; g.fillRect(m.l + 8, y, 12, 3); g.fillStyle = "#e8ebef"; g.fillText(s.nombre, m.l + 25, y + 5); y += 15; } }
}
function fmt(v) { const a = Math.abs(v); return a >= 10000 ? (v / 1000).toFixed(0) + "k" : a >= 100 ? v.toFixed(0) : a >= 1 ? +v.toFixed(2) + "" : a === 0 ? "0" : +v.toPrecision(2) + ""; }
function barrasH(canvas, etiquetas, valores, ref) {
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext("2d"); g.scale(dpr, dpr); g.fillStyle = "#1b1f24"; g.fillRect(0, 0, W, H);
  const l = 120, r = 46, alto = (H - 20) / valores.length, mx = Math.max(...valores) * 1.05;
  g.font = "11.5px system-ui";
  valores.forEach((v, i) => {
    const y = 10 + i * alto; const w = (W - l - r) * v / mx;
    g.fillStyle = "#e8ebef"; g.textAlign = "right"; g.fillText(etiquetas[i], l - 8, y + alto / 2 + 4);
    g.fillStyle = ref && Math.abs(v - ref) <= .2 * ref ? "#2ec4b6" : "#3d8fe0"; g.fillRect(l, y + alto * .18, w, alto * .64);
    g.fillStyle = "#e8ebef"; g.textAlign = "left"; g.fillText(f2(v), l + w + 5, y + alto / 2 + 4);
  });
  if (ref) { const x = l + (W - l - r) * ref / mx; g.strokeStyle = "#e6b84a"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x, 4); g.lineTo(x, H - 6); g.stroke(); g.setLineDash([]); }
}

/* ------------------------------------------------------------------ colores de las funciones */
const COLOR_FUN = [["alivio", "#ffffff"], ["arranque", "#e5534b"], ["ayuda", "#e6b84a"], ["cuadrador", "#f08bb0"],
  ["hastial", "#3d8fe0"], ["contorno", "#3d8fe0"], ["corona", "#b07cf0"], ["arrastre", "#7fd47a"], ["cuneta", "#9aa4af"]];
const colorFun = (f) => (COLOR_FUN.find(([k]) => (f || "").toLowerCase().includes(k)) || [0, "#2ec4b6"])[1];
function rampa(t) { // morado → naranja → amarillo (tiempo de salida)
  const c = [[64, 30, 140], [180, 50, 140], [240, 110, 70], [250, 210, 60]];
  t = Math.max(0, Math.min(1, t)) * (c.length - 1); const i = Math.min(Math.floor(t), c.length - 2), k = t - i;
  return `rgb(${c[i].map((v, j) => Math.round(v + (c[i + 1][j] - v) * k)).join(",")})`;
}

/* ------------------------------------------------------------------ SVG con zoom y desplazamiento */
function svgMalla(op, { mini = false, etiqueta = "retardo" } = {}) {
  const pts = op.contorno.concat(op.taladros.map((t) => [t.x, t.y]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const xa = Math.min(...xs), xb = Math.max(...xs), ya = Math.min(...ys), yb = Math.max(...ys);
  const m = Math.max(xb - xa, yb - ya) * 0.08 + 0.1;
  const vb = [xa - m, -(yb + m), xb - xa + 2 * m, yb - ya + 2 * m];
  const esc_ = Math.max(vb[2], vb[3]);
  const r = esc_ * (mini ? 0.022 : 0.012);
  let s = `<svg viewBox="${vb.join(" ")}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;
  s += `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#101317"/>`;
  if (!mini) { // cuadrícula de 0.5 m
    s += `<g stroke="#20262d" stroke-width="${esc_ * 0.0012}">`;
    for (let x = Math.ceil(vb[0] * 2) / 2; x < vb[0] + vb[2]; x += 0.5) s += `<line x1="${x}" y1="${vb[1]}" x2="${x}" y2="${vb[1] + vb[3]}"/>`;
    for (let y = Math.ceil(vb[1] * 2) / 2; y < vb[1] + vb[3]; y += 0.5) s += `<line x1="${vb[0]}" y1="${y}" x2="${vb[0] + vb[2]}" y2="${y}"/>`;
    s += `</g>`;
  }
  s += `<polygon points="${op.contorno.map(([x, y]) => `${x},${-y}`).join(" ")}" fill="#1a2a2c" stroke="#e8ebef" stroke-width="${esc_ * (mini ? .008 : .004)}"/>`;
  op.taladros.forEach((t, i) => {
    const alivio = t.tipo === "alivio";
    const ra = alivio ? Math.max(t.diametro / 2000, r * 1.1) : r;
    if (t.azimut_rel && !mini) { // taladro inclinado del corte en V: dirección en planta
      const a = t.azimut_rel * Math.PI / 180, L = r * 4;
      s += `<line x1="${t.x}" y1="${-t.y}" x2="${t.x + Math.sin(a) * L}" y2="${-t.y}" stroke="${colorFun(t.funcion)}" stroke-width="${r * .35}"/>`;
    }
    s += `<circle data-i="${i}" cx="${t.x}" cy="${-t.y}" r="${ra}" fill="${alivio ? "none" : colorFun(t.funcion)}" stroke="${alivio ? "#ffffff" : "#0b0e11"}" stroke-width="${r * (alivio ? .35 : .25)}"/>`;
    if (!mini && etiqueta !== "nada" && !alivio) {
      const txt = etiqueta === "kg" ? f2(t.kg, 2) : etiqueta === "cart" ? t.cartuchos : t.retardo;
      s += `<text x="${t.x + r * 1.2}" y="${-t.y - r * 1.1}" font-size="${r * 1.9}" fill="#e8ebef" font-family="system-ui">${txt}</text>`;
    }
  });
  return s + `</svg>`;
}
function zoomable(caja, alTocar) {
  const svg = $("svg", caja);
  const vb0 = svg.getAttribute("viewBox").split(" ").map(Number);
  let vb = vb0.slice();
  const poner = () => svg.setAttribute("viewBox", vb.join(" "));
  const escala = () => vb[2] / svg.clientWidth * Math.max(1, (svg.clientWidth / svg.clientHeight) / (vb[2] / vb[3]));
  const zoom = (f, cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2) => {
    const w = Math.min(Math.max(vb[2] * f, vb0[2] / 40), vb0[2] * 3), k = w / vb[2];
    vb = [cx - (cx - vb[0]) * k, cy - (cy - vb[1]) * k, w, vb[3] * k]; poner();
  };
  const ptrs = new Map(); let dist0 = 0, mov = 0;
  svg.addEventListener("pointerdown", (e) => { svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); mov = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; dist0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  svg.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
    ptrs.set(e.pointerId, [e.clientX, e.clientY]); mov += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 1) { const k = escala(); vb[0] -= dx * k; vb[1] -= dy * k; poner(); }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (dist0) zoom(dist0 / d); dist0 = d; }
  });
  const fin = (e) => {
    ptrs.delete(e.pointerId); dist0 = 0;
    if (mov < 8 && alTocar && e.target.dataset && e.target.dataset.i != null) alTocar(Number(e.target.dataset.i));
  };
  svg.addEventListener("pointerup", fin); svg.addEventListener("pointercancel", fin);
  svg.addEventListener("wheel", (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  caja.insertAdjacentHTML("beforeend", `<div class="ctl"><button data-z="in">＋</button><button data-z="out">－</button><button data-z="fit">⤢</button></div>`);
  $$(".ctl button", caja).forEach((b) => b.onclick = () => b.dataset.z === "fit" ? (vb = vb0.slice(), poner()) : zoom(b.dataset.z === "in" ? 0.75 : 1.33));
}

/* ------------------------------------------------------------------ visor 3D (three.js) */
let visor3d = null;
async function abrir3D(caja, escena) {
  caja.innerHTML = `<div class="sub">Cargando 3D…</div>`;
  let THREE, OrbitControls;
  try {
    THREE = await import("three");
    ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
  } catch (e) { caja.innerHTML = `<div class="error">✖ No se pudo cargar el visor 3D (¿sin internet la primera vez?).</div>`; return; }
  caja.innerHTML = "";
  const W = caja.clientWidth, H = caja.clientHeight;
  const ren = new THREE.WebGLRenderer({ antialias: true });
  ren.setPixelRatio(Math.min(devicePixelRatio, 2)); ren.setSize(W, H); ren.setClearColor(0x111418);
  caja.appendChild(ren.domElement);
  const sc = new THREE.Scene();
  sc.add(new THREE.AmbientLight(0xffffff, 0.75));
  const luz = new THREE.DirectionalLight(0xffffff, 1.4); luz.position.set(3, 6, 5); sc.add(luz);
  const cam = new THREE.PerspectiveCamera(45, W / H, 0.05, 5000);
  const ctl = new OrbitControls(cam, ren.domElement); ctl.enableDamping = true;
  const caja3 = new THREE.Box3();
  for (const l of escena.lineas || []) {
    const geo = new THREE.BufferGeometry().setFromPoints(l.p.map((p) => new THREE.Vector3(...p)));
    const o = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: l.color, transparent: !!l.alfa, opacity: l.alfa || 1 }));
    sc.add(o); caja3.expandByObject(o);
  }
  for (const t of escena.taladros || []) {
    const a = new THREE.Vector3(...t.a), b = new THREE.Vector3(...t.b);
    const L = a.distanceTo(b); if (L < 1e-6) continue;
    const g = new THREE.CylinderGeometry(t.r, t.r, L, 10);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: t.color, roughness: .6 }));
    m.position.copy(a.clone().add(b).multiplyScalar(.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    sc.add(m); caja3.expandByObject(m);
    if (t.carga) {
      const c0 = a.clone().lerp(b, t.carga[0]), c1 = a.clone().lerp(b, t.carga[1]);
      const gc = new THREE.CylinderGeometry(t.r * 1.35, t.r * 1.35, c0.distanceTo(c1), 10);
      const mc = new THREE.Mesh(gc, new THREE.MeshStandardMaterial({ color: 0xe5534b, roughness: .5 }));
      mc.position.copy(c0.clone().add(c1).multiplyScalar(.5)); mc.quaternion.copy(m.quaternion); sc.add(mc);
    }
  }
  for (const s of escena.superficies || []) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(s.v.flat(), 3)); geo.setIndex(s.i); geo.computeVertexNormals();
    sc.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: s.color, transparent: true, opacity: s.alfa ?? .35, side: THREE.DoubleSide, depthWrite: false })));
  }
  const c = caja3.getCenter(new THREE.Vector3()), r = caja3.getSize(new THREE.Vector3()).length() || 5;
  ctl.target.copy(c);
  cam.position.copy(c.clone().add(new THREE.Vector3(...(escena.vista || [0.6, 0.45, 1])).normalize().multiplyScalar(r * 1.1)));
  let vivo = true;
  (function bucle() { if (!vivo) return; ctl.update(); ren.render(sc, cam); requestAnimationFrame(bucle); })();
  visor3d = { cerrar() { vivo = false; ren.dispose(); } };
}

/* ================================================================== INICIO */
let INFO = { formas: [], rocas: [], explosivos: [] };
let OPCIONES = [], OP_ACTUAL = null, DATOS_MALLA = null;

function explosivosUsuario() { try { return JSON.parse(localStorage.getItem("b3d_explosivos") || "[]"); } catch (e) { return []; } }
function refrescarExplosivos() {
  INFO.explosivos = INFO.base_explosivos.concat(explosivosUsuario().map((e) => ({ ...e, personalizado: true })));
  llenarListas(document);
  const banco = $("#f-banco [name=explosivo]"); if (banco && !banco.dataset.puesto) { banco.value = "0"; banco.dataset.puesto = 1; }
  $("#lista-exp").innerHTML = explosivosUsuario().map((e, i) => `<div class="chip" style="display:flex;justify-content:space-between;margin:6px 0;padding:8px 10px;border-radius:10px">
     <span>${esc(e.nombre)} · ${e.densidad} g/cm³</span><a href="#" data-borrar="${i}">Quitar</a></div>`).join("") || `<p class="sub">Aún no agregaste explosivos propios.</p>`;
  $$("[data-borrar]").forEach((a) => a.onclick = (ev) => { ev.preventDefault(); const l = explosivosUsuario(); l.splice(+a.dataset.borrar, 1); localStorage.setItem("b3d_explosivos", JSON.stringify(l)); refrescarExplosivos(); });
}

async function iniciar() {
  try {
    const d = await motor.llamar("info", null, "Preparando el motor de cálculo…");
    INFO = { ...d, base_explosivos: d.explosivos };
    $("#ver").textContent = "v" + d.version;
    refrescarExplosivos();
    llenarListas(document);
    restaurarForm($("#f-malla"), "malla");
    const sel = $("#f-malla [name=explosivo]"); if (!localStorage.getItem("b3d_malla")) sel.value = "2";
    restaurarForm($("#f-banco"), "banco");
    montarHerramientas();
  } catch (e) {
    cargando(false);
    msg("#malla-msg", "No se pudo cargar el motor de cálculo. Revisa tu conexión la primera vez y vuelve a abrir la app. (" + e.message + ")");
  }
}

/* ------------------------------------------------------------------ navegación */
$$("nav.abajo button").forEach((b) => b.onclick = () => {
  $$("nav.abajo button").forEach((x) => x.classList.toggle("on", x === b));
  $$(".vista").forEach((v) => v.classList.toggle("on", v.id === b.dataset.v));
  window.scrollTo(0, 0);
});

/* ================================================================== FRENTE */
function datosMalla() {
  const d = leerForm($("#f-malla"));
  const ex = INFO.explosivos;
  return {
    ancho: d.ancho, alto: d.alto, forma: d.forma, flecha: d.flecha, roca: d.roca,
    rmr: d.usar_rmr ? d.rmr : null, rqd: d.usar_rmr ? d.rqd : null, densidad_roca: d.densidad_roca,
    diametro: d.diametro, diametro_alivio: d.diametro_alivio, n_alivios: d.n_alivios, pies: d.pies,
    explosivo: ex[+d.explosivo] || ex[2], explosivo_contorno: d.explosivo_contorno === "" ? null : ex[+d.explosivo_contorno],
    largo_cartucho_pulg: d.largo_cartucho_pulg, angulo_v: d.angulo_v, cuneta: d.cuneta, cuneta_lado: d.cuneta_lado,
    cuneta_ancho: d.cuneta_ancho, cuneta_prof: d.cuneta_prof,
  };
}
$("#f-malla").onsubmit = async (ev) => {
  ev.preventDefault();
  guardarForm($("#f-malla"), "malla");
  msg("#malla-msg", "");
  DATOS_MALLA = datosMalla();
  try {
    OPCIONES = await motor.llamar("opciones", DATOS_MALLA, "Generando las mallas…");
    pintarOpciones();
    $("#opciones").scrollIntoView({ behavior: "smooth" });
  } catch (e) { msg("#malla-msg", e.message); }
};
function pintarOpciones() {
  $("#opciones").innerHTML = `<h2 style="margin-top:14px">Elige una malla</h2>` + OPCIONES.map((o, i) => {
    const r = o.resumen || {};
    return `<div class="tarjeta opcion" data-op="${i}">
      ${o.taladros ? svgMalla(o, { mini: true }) : `<svg viewBox="0 0 1 1"></svg>`}
      <div><div class="fam">${esc(o.familia)}</div><h3>${esc(o.nombre)}</h3>
      ${o.error ? `<p class="err">✖ ${esc(o.error)}</p>` : `<div class="chips">
        <span class="chip">${r.taladros} taladros</span><span class="chip">${r.alivios} alivios</span>
        <span class="chip">${f2(r.kg, 1)} kg</span><span class="chip">FC ${f2(r.factor_carga, 2)}</span>
        <span class="chip">avance ${f2(r.avance, 2)} m</span></div>
        ${o.avisos.length ? `<p style="color:var(--aviso);margin-top:6px">⚠ ${o.avisos.length} aviso(s)</p>` : ""}`}
      </div></div>`;
  }).join("");
  $$("[data-op]").forEach((c) => c.onclick = () => { const o = OPCIONES[+c.dataset.op]; if (!o.error) detalleMalla(o); });
}
function detalleMalla(op) {
  OP_ACTUAL = op;
  const r = op.resumen;
  const funciones = [...new Set(op.taladros.map((t) => t.funcion))];
  const cuerpo = abrirHoja(op.nombre, `
    ${kpis([["Taladros", r.taladros, `${r.cargados} cargados · ${r.alivios} alivios`], ["Explosivo", f2(r.kg, 1) + " kg", `${f2(r.kg_por_m, 1)} kg/m`],
            ["Factor de carga", f2(r.factor_carga, 2), "kg/m³"], ["Perforación", f2(r.metros, 1) + " m", `avance ${f2(r.avance, 2)} m`],
            ["Área", f2(r.area, 2) + " m²", esc(op.familia)]])}
    ${op.avisos.map((a) => `<div class="aviso">⚠ ${esc(a)}</div>`).join("")}
    <div class="seg" id="seg-et"><button data-e="retardo" class="on">Retardo</button><button data-e="kg">kg</button><button data-e="cart">Cartuchos</button><button data-e="nada">Sin texto</button></div>
    <div class="lienzo" id="lz"></div>
    <div class="leyenda">${funciones.map((f) => `<span><i style="background:${f === "Alivio" ? "transparent" : colorFun(f)};border:1px solid ${colorFun(f)}"></i>${esc(f)}</span>`).join("")}</div>
    <div class="fila-btn"><button class="btn" id="b-3d">🧊 Ver en 3D</button><button class="btn" id="b-png">🖼 Imagen</button></div>
    <div class="fila-btn"><button class="btn" id="b-dxf">⬇ DXF del frente</button><button class="btn" id="b-dxf3">⬇ DXF 3D</button><button class="btn" id="b-danio">💥 Zona de daño</button></div>
    <div id="caja3d"></div>
    <p class="sub">${esc(op.descripcion)}</p>
    ${tabla(["N.º", "X m", "Y m", "Función", "Ret.", "Cart.", "kg", "L m"], op.taladros.map((t, i) => [i + 1, t.x, t.y, t.funcion, t.retardo || "", t.cartuchos || "", t.kg, t.longitud]))}`);
  let et = "retardo";
  const pintar = () => {
    $("#lz").innerHTML = svgMalla(op, { etiqueta: et }) + `<div class="info" id="lz-info"></div>`;
    zoomable($("#lz"), (i) => {
      const t = op.taladros[i], box = $("#lz-info");
      box.style.display = "block";
      box.innerHTML = `<b>Taladro ${i + 1}</b> · ${esc(t.funcion)}<br>X ${f2(t.x)} m · Y ${f2(t.y)} m · Ø ${t.diametro} mm · L ${f2(t.longitud)} m<br>` +
        (t.tipo === "alivio" ? "Alivio (sin carga)" : `Retardo ${t.retardo} · ${t.cartuchos} cartuchos · ${f2(t.kg, 3)} kg ${esc(t.explosivo)}`);
    });
  };
  pintar();
  $$("#seg-et button").forEach((b) => b.onclick = () => { $$("#seg-et button").forEach((x) => x.classList.toggle("on", x === b)); et = b.dataset.e; pintar(); });
  $("#b-png").onclick = () => svgAPng($("#lz svg"), `malla_${op.clave}.png`);
  const dxf = async (vista) => { try { const d = await motor.llamar("dxf_frente", { clave: op.clave, vista }, "Creando el DXF…"); compartirArchivo(new Blob([d.texto], { type: "application/dxf" }), vista === "frente" ? d.nombre : d.nombre.replace(".dxf", "_3d.dxf")); } catch (e) { tostada("✖ " + e.message, 5000); } };
  $("#b-dxf").onclick = () => dxf("frente");
  $("#b-dxf3").onclick = () => dxf("3d");
  $("#b-danio").onclick = () => herramienta("danio");
  $("#b-3d").onclick = () => {
    const caja = $("#caja3d"); caja.innerHTML = `<div id="vista3d"></div>`;
    const L = (DATOS_MALLA.pies || 6) * 0.3048;
    const taladros = op.taladros.map((t) => {
      const a = (t.azimut_rel || 0) * Math.PI / 180, l = t.longitud || L;
      const b = [t.x + Math.sin(a) * l, t.y, -Math.cos(a) * l];
      const alivio = t.tipo === "alivio";
      return { a: [t.x, t.y, 0], b, r: Math.max(t.diametro / 2000, .015), color: alivio ? 0xdddddd : colorFun(t.funcion), carga: alivio ? null : [0.25, 1] };
    });
    const c = op.contorno.concat([op.contorno[0]]);
    const lineas = [{ p: c.map(([x, y]) => [x, y, 0]), color: 0xe8ebef }];
    for (const d of [1.5, 3]) lineas.push({ p: c.map(([x, y]) => [x, y, d]), color: 0x3a424c });
    for (const [x, y] of op.contorno.filter((_, i) => i % 3 === 0)) lineas.push({ p: [[x, y, 0], [x, y, 3]], color: 0x2f363e });
    abrir3D($("#vista3d"), { taladros, lineas, vista: [0.55, 0.35, 1] });
    $("#vista3d").scrollIntoView({ behavior: "smooth" });
  };
}

/* ================================================================== BANCO */
let TOPO = null, BANCO = null;
$("#archivo-dxf").onchange = async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  msg("#banco-msg", "");
  try {
    const texto = await f.text();
    const d = await motor.llamar("cargar_dxf", { texto, nombre: f.name }, "Leyendo el DXF…");
    $("#dxf-info").innerHTML = `<b>${esc(f.name)}</b> — marca las capas de curvas de nivel o puntos con cota:`;
    $("#dxf-capas").innerHTML = d.capas.map((c) => `<label class="chk"><input type="checkbox" value="${esc(c.capa)}" ${c.con_cota ? "checked" : ""}>
       ${esc(c.capa)} <span class="sub" style="margin:0 0 0 auto">${c.polilineas} líneas · ${c.puntos} ptos${c.con_cota ? "" : " · sin cota"}</span></label>`).join("");
    $("#b-tin").style.display = "flex";
    if (d.avisos.length) msg("#banco-msg", d.avisos.join(" "), "aviso");
  } catch (e) { msg("#banco-msg", e.message); }
};
$("#b-tin").onclick = async () => {
  const capas = $$("#dxf-capas input:checked").map((i) => i.value);
  if (!capas.length) return tostada("Marca al menos una capa");
  try {
    TOPO = await motor.llamar("crear_tin", { capas }, "Creando la superficie del terreno…");
    $("#dxf-info").innerHTML += `<br>✔ Superficie: ${TOPO.triangulos.toLocaleString()} triángulos · cotas ${f2(TOPO.z[0], 1)} a ${f2(TOPO.z[1], 1)} m`;
    const fb = $("#f-banco"); fb.style.display = "block";
    fb.cx.value = ((TOPO.x[0] + TOPO.x[1]) / 2).toFixed(1); fb.cy.value = ((TOPO.y[0] + TOPO.y[1]) / 2).toFixed(1);
    fb.cota_piso.value = TOPO.z[0].toFixed(1);
    $("#sel-area").innerHTML = `<option value="rect">Rectángulo</option>` + TOPO.areas.map((a, i) => `<option value="${i}">Polilínea cerrada · ${esc(a.capa)} · ${f2(a.area, 0)} m²</option>`).join("");
    if (TOPO.areas.length) $("#sel-area").value = "0";
    fb.scrollIntoView({ behavior: "smooth" });
  } catch (e) { msg("#banco-msg", e.message); }
};
function datosBanco() {
  const d = leerForm($("#f-banco"));
  d.explosivo = INFO.explosivos[+d.explosivo] || INFO.explosivos[0];
  if (d.area !== "rect" && TOPO) d.poligono = TOPO.areas[+d.area].vertices;
  return d;
}
$("#b-detectar").onclick = async () => {
  try { const r = await motor.llamar("azimut_salida", datosBanco(), "Buscando la cara libre…");
    if (r.azimut == null) tostada("Terreno plano: indica el azimut a mano"); else { $("#f-banco").azimut.value = r.azimut; tostada(`Salida hacia ${r.azimut}°`); }
  } catch (e) { tostada("✖ " + e.message, 5000); }
};
$("#f-banco").onsubmit = async (ev) => {
  ev.preventDefault(); guardarForm($("#f-banco"), "banco"); msg("#banco-msg", "");
  try {
    BANCO = await motor.llamar("malla_topo", datosBanco(), "Calculando la malla sobre el terreno…");
    pintarBanco();
  } catch (e) { msg("#banco-msg", e.message); }
};
function svgBanco(b) {
  const pol = b.poligono, xs = pol.map((p) => p[0]), ys = pol.map((p) => p[1]);
  const sx = Math.max(...xs) - Math.min(...xs), sy = Math.max(...ys) - Math.min(...ys), m = Math.max(sx, sy) * 0.25 + 5;
  const xa = Math.min(...xs) - m, xb = Math.max(...xs) + m, ya = Math.min(...ys) - m, yb = Math.max(...ys) + m;
  const vb = [xa, -yb, xb - xa, yb - ya], E = Math.max(vb[2], vb[3]), r = E * 0.008;
  const zs = TOPO.curvas.flatMap((c) => c.map((p) => p[2])); const z0 = Math.min(...zs), z1 = Math.max(...zs);
  let s = `<svg viewBox="${vb.join(" ")}" xmlns="http://www.w3.org/2000/svg"><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#101317"/>`;
  for (const c of TOPO.curvas) {
    if (!c.some(([x, y]) => x > xa && x < xb && y > ya && y < yb)) continue;
    const t = (c[0][2] - z0) / ((z1 - z0) || 1);
    s += `<polyline points="${c.map(([x, y]) => `${x},${-y}`).join(" ")}" fill="none" stroke="hsl(${200 - 160 * t},45%,${38 + 22 * t}%)" stroke-width="${E * .0018}"/>`;
  }
  s += `<polygon points="${pol.map(([x, y]) => `${x},${-y}`).join(" ")}" fill="rgba(46,196,182,.08)" stroke="#2ec4b6" stroke-width="${E * .003}"/>`;
  const msMax = Math.max(1, ...b.taladros.map((t) => t.ms || 0));
  b.taladros.forEach((t, i) => {
    s += `<circle data-i="${i}" cx="${t.x}" cy="${-t.y}" r="${r}" fill="${rampa((t.ms || 0) / msMax)}" stroke="#fff" stroke-width="${r * .25}"/>`;
    if (b.taladros.length < 250 && t.retardo) s += `<text x="${t.x + r * 1.2}" y="${-t.y - r}" font-size="${r * 1.7}" fill="#e8ebef" font-family="system-ui">${t.retardo}</text>`;
  });
  const a = (+$("#f-banco").azimut.value || 0) * Math.PI / 180, cx = xs.reduce((p, v) => p + v, 0) / xs.length, cy = ys.reduce((p, v) => p + v, 0) / ys.length, L = Math.max(sx, sy) * .35;
  s += `<line x1="${cx}" y1="${-cy}" x2="${cx + Math.sin(a) * L}" y2="${-(cy + Math.cos(a) * L)}" stroke="#e6b84a" stroke-width="${E * .004}" marker-end="url(#fl)"/>`;
  s += `<defs><marker id="fl" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0L10,5L0,10z" fill="#e6b84a"/></marker></defs>`;
  return s + `</svg>`;
}
function pintarBanco() {
  const b = BANCO;
  $("#banco-res").innerHTML = `
    ${kpis([["Taladros", b.taladros.length, `${b.filas} filas`], ["Perforación", f2(b.metros, 0) + " m"], ["Explosivo", f2(b.kg, 0) + " kg"],
            ["Volumen", f2(b.volumen, 0) + " m³", `área ${f2(b.area, 0)} m²`], ["Factor de carga", f2(b.factor_carga, 3), "kg/m³"]])}
    ${b.avisos.map((a) => `<div class="aviso">⚠ ${esc(a)}</div>`).join("")}
    <div class="lienzo" id="lzb"></div>
    <p class="sub" style="margin-top:6px">Color = tiempo de salida · número = retardo · flecha = salida.</p>
    <div class="fila-btn"><button class="btn" id="bb-3d">🧊 3D</button><button class="btn" id="bb-png">🖼 Imagen</button><button class="btn prim" id="bb-dxf">⬇ DXF</button></div>
    <div id="caja3db"></div>
    ${tabla(["Fila", "N.º", "Este", "Norte", "Cota", "H m", "L m", "kg", "Ret.", "ms"], b.taladros.map((t) => [t.fila, t.orden, t.x, t.y, t.z, t.altura, t.longitud, t.kg, t.retardo, t.ms ?? ""]))}`;
  $("#lzb").innerHTML = svgBanco(b) + `<div class="info" id="lzb-info"></div>`;
  zoomable($("#lzb"), (i) => { const t = b.taladros[i], box = $("#lzb-info"); box.style.display = "block";
    box.innerHTML = `<b>Fila ${t.fila} · n.º ${t.orden}</b><br>E ${f2(t.x)} · N ${f2(t.y)} · cota ${f2(t.z)}<br>H ${f2(t.altura)} m · L ${f2(t.longitud)} m · ${f2(t.kg, 1)} kg · retardo ${t.retardo} (${t.ms ?? "—"} ms)`; });
  $("#bb-png").onclick = () => svgAPng($("#lzb svg"), "malla_banco.png");
  $("#bb-dxf").onclick = async () => { try { const d = await motor.llamar("dxf_topo", { topografia: true }, "Creando el DXF…"); compartirArchivo(new Blob([d.texto], { type: "application/dxf" }), d.nombre); } catch (e) { tostada("✖ " + e.message, 5000); } };
  $("#bb-3d").onclick = () => {
    $("#caja3db").innerHTML = `<div id="vista3d"></div>`;
    const fb = leerForm($("#f-banco"));
    const cx = b.taladros.reduce((p, t) => p + t.x, 0) / b.taladros.length, cy = b.taladros.reduce((p, t) => p + t.y, 0) / b.taladros.length;
    const zc = b.taladros.reduce((p, t) => p + t.z, 0) / b.taladros.length;
    const P = (x, y, z) => [x - cx, z - zc, -(y - cy)];
    const inc = (fb.inclinacion || 90) * Math.PI / 180, az = (fb.azimut || 0) * Math.PI / 180, msMax = Math.max(1, ...b.taladros.map((t) => t.ms || 0));
    const taladros = b.taladros.map((t) => { const h = Math.cos(inc) * t.longitud;
      return { a: P(t.x, t.y, t.z), b: P(t.x + Math.sin(az) * h, t.y + Math.cos(az) * h, t.z - Math.sin(inc) * t.longitud),
               r: Math.max((fb.diametro || 165) / 2000, .05), color: rampa((t.ms || 0) / msMax), carga: [(fb.taco || 0) / t.longitud, 1] }; });
    const R = Math.max(...b.poligono.map(([x, y]) => Math.hypot(x - cx, y - cy))) * 1.8;
    const zs = TOPO.curvas.flatMap((c) => c.map((p) => p[2])); const z0 = Math.min(...zs), z1 = Math.max(...zs);
    const lineas = TOPO.curvas.filter((c) => c.some(([x, y]) => Math.hypot(x - cx, y - cy) < R)).map((c) => {
      const t = (c[0][2] - z0) / ((z1 - z0) || 1); return { p: c.filter(([x, y]) => Math.hypot(x - cx, y - cy) < R * 1.2).map(([x, y, z]) => P(x, y, z)), color: `hsl(${200 - 160 * t},45%,55%)` }; })
      .filter((l) => l.p.length > 1);
    lineas.push({ p: b.poligono.concat([b.poligono[0]]).map(([x, y]) => P(x, y, zc + 0.3)), color: 0x2ec4b6 });
    abrir3D($("#vista3d"), { taladros, lineas, vista: [0.8, 0.7, 1] });
    $("#vista3d").scrollIntoView({ behavior: "smooth" });
  };
  $("#banco-res").scrollIntoView({ behavior: "smooth" });
}

/* ================================================================== ANÁLISIS */
const HERR = {
  fragmentacion: { i: "◔", t: "Fragmentación", d: "Kuz-Ram, Swebrec y ajuste a datos medidos" },
  danio: { i: "💥", t: "Zona de daño", d: "Kirsch sobre la malla elegida" },
  burden: { i: "↔", t: "Burden", d: "Siete fórmulas comparadas" },
  macizo: { i: "⛰", t: "Macizo rocoso", d: "RMR, Q, GSI, Hoek-Brown, pernos" },
  cimbra: { i: "⌒", t: "Cimbra", d: "Arco metálico con carga de Unal" },
  dinamica: { i: "〰", t: "Respuesta dinámica", d: "Newmark y espectro" },
  costos: { i: "$", t: "Costos del ciclo", d: "Por disparo, metro, m³ y t" },
};
function montarHerramientas() {
  $("#herramientas").innerHTML = Object.entries(HERR).map(([k, h]) => `<div class="tarjeta" data-h="${k}"><b>${h.i}</b><h3>${h.t}</h3><p>${h.d}</p></div>`).join("");
  $$("[data-h]").forEach((c) => c.onclick = () => herramienta(c.dataset.h));
}
function herramienta(k) {
  const h = HERR[k];
  const cuerpo = abrirHoja(h.t, `<form id="fh">${FORM[k]()}</form><div class="fila-btn"><button class="btn prim ancho" id="bh">▶ Calcular</button></div><div id="hmsg"></div><div id="hres"></div>`);
  const form = $("#fh");
  restaurarForm(form, "h_" + k);
  const correr = async () => {
    guardarForm(form, "h_" + k); msg("#hmsg", "");
    try { await CALC[k](leerForm(form)); } catch (e) { msg("#hmsg", e.message); }
  };
  $("#bh").onclick = correr;
  form.onsubmit = (e) => { e.preventDefault(); correr(); };
  if (EXTRA[k]) EXTRA[k](form, correr);
}
const n = (nm, l, v, paso) => ({ n: nm, l, v, paso });
const FORM = {
  fragmentacion: () => campos([
    { n: "rmd", l: "Macizo (RMD)", t: "sel", op: INFO.frag.rmd, v: "Diaclasada verticalmente", ancho: 1 },
    { n: "jps", l: "Espaciado de juntas", t: "sel", op: INFO.frag.jps, v: "0.1 m a tamaño de malla", ancho: 1 },
    { n: "jpa", l: "Orientación de juntas", t: "sel", op: INFO.frag.jpa, v: "Rumbo perpendicular al frente", ancho: 1 },
    n("densidad", "Densidad (t/m³)", 2.7), n("ucs", "UCS (MPa)", 100), n("e", "Módulo E (GPa)", 40),
    { n: "a_manual", l: "Ingresar A a mano", t: "chk" }, n("a", "A", 7),
    n("k", "Factor de carga (kg/m³)", 0.6), n("q", "Carga por taladro (kg)", 100), n("rws", "RWS (ANFO=100)", 100),
    n("b", "Burden (m)", 3), n("s", "Espaciamiento (m)", 3.5), n("d", "Ø (mm)", 102), n("w", "Desviación W (m)", 0.2),
    n("long_carga", "Long. de carga (m)", 8), n("bcl", "Carga de fondo (m)", 0), n("h", "Altura H (m)", 10),
    n("xmax", "xmax mm (0 = auto)", 0), n("parrilla", "Parrilla (mm)", 300),
    { n: "medidos", l: "Granulometría medida (opcional): una fila por tamiz «abertura mm, % pasante»", t: "txt", filas: 4, v: "" }]),
  danio: () => OP_ACTUAL ? `<p class="sub">Malla: <b>${esc(OP_ACTUAL.nombre)}</b></p>` + campos([
    n("ucs", "UCS (MPa)", 120), n("fd", "Factor dinámico", 1), n("t", "Tracción (MPa)", 8), n("vod", "VOD si falta (m/s)", 4500),
    { n: "modo", l: "Combinación", t: "sel", op: ["max", "suma"], v: "max" }]) : `<div class="aviso">⚠ Primero genera las mallas en «Frente» y abre una.</div>`,
  burden: () => campos([n("d", "Ø (mm)", 102), n("h", "Altura de banco (m)", 10), n("rho_e", "Densidad explosivo", 0.85),
    n("vod", "VOD (m/s)", 4000), n("rho_r", "Densidad roca", 2.7), n("vc", "Vel. sísmica (m/s)", 3500), n("kb", "Kb de Ash", 30),
    { n: "c", l: "Constante c", t: "sel", op: ["0.3", "0.4", "0.5"], v: "0.4" },
    { n: "explosivo", l: "Explosivo (Olofsson)", t: "sel", op: INFO.burden.explosivo, v: "ANFO" },
    { n: "inclinacion", l: "Inclinación", t: "sel", op: INFO.burden.inclinacion, v: "Vertical" }]),
  macizo: () => campos([n("ucs", "UCS (MPa)", 80), n("rqd", "RQD (%)", 65), n("esp", "Espaciado juntas (m)", 0.4),
    { n: "condicion", l: "Condición de juntas", t: "sel", op: INFO.macizo.condicion, v: INFO.macizo.condicion[1], ancho: 1 },
    { n: "agua", l: "Agua", t: "sel", op: INFO.macizo.agua, v: "Húmedo" },
    { n: "orientacion", l: "Orientación", t: "sel", op: INFO.macizo.orientacion, v: "Favorable" },
    n("jn", "Jn", 9), n("jr", "Jr", 1.5), n("ja", "Ja", 2), n("jw", "Jw", 1), n("srf", "SRF", 1),
    n("ei", "Ei (GPa)", 40), n("mi", "mi", 15), n("D", "D (voladura)", 0.5), n("ancho", "Luz B (m)", 4), n("gamma", "γ (kN/m³)", 27),
    { n: "esr", l: "Tipo de labor (ESR)", t: "sel", op: INFO.macizo.esr, v: "Labores permanentes", ancho: 1 }]),
  cimbra: () => campos([n("ancho", "Ancho (m)", 4), n("alto", "Alto (m)", 4),
    { n: "perfil", l: "Perfil", t: "sel", op: INFO.perfiles, v: "W6x20" }, n("esp", "Espaciamiento (m)", 1),
    n("fy", "fy (MPa)", 250), n("rmr", "RMR", 45), n("gamma", "γ (kN/m³)", 27), n("k", "Empuje lateral k", 0),
    { n: "apoyos", l: "Apoyos", t: "sel", op: ["empotrados", "articulados"], v: "empotrados" }, n("q_manual", "q manual kN/m (0 = Unal)", 0)]),
  dinamica: () => campos([{ n: "fuente", l: "Registro", t: "sel", op: ["Ejemplo sintético", "Archivo CSV (t s, a g)"], v: "Ejemplo sintético", ancho: 1 },
    n("ppv", "PPV ejemplo (mm/s)", 20), n("frec", "Frecuencia (Hz)", 30), n("nret", "N.º retardos", 8), n("interv", "Intervalo (ms)", 25),
    n("dur", "Duración (s)", 1), n("T", "Periodo T (s)", 0.1), n("xi", "Amortiguamiento (%)", 5),
    n("tmin", "T mín (s)", 0.01), n("tmax", "T máx (s)", 2), n("npt", "Puntos del espectro", 60)]) +
    `<div style="padding:0 14px 10px"><input type="file" id="reg" accept=".csv,.txt,.dat"></div>`,
  costos: () => campos([n("avance", "Avance (m)", 1.7), n("volumen", "Volumen (m³)", 20), n("toneladas", "Toneladas", 54),
    n("kg", "kg de explosivo", 30), n("detonadores", "Detonadores", 40), n("metros", "Metros perforados", 70)]) +
    `<div style="padding:0 14px"><button class="btn ancho" type="button" id="b-ej">Cargar el ejemplo con estas cantidades</button></div>
     <div id="cst"></div>`,
};
const EXTRA = {
  dinamica: (form) => { $("#reg").onchange = async (e) => { const f = e.target.files[0]; if (f) { form.dataset.reg = await f.text(); form.dataset.nreg = f.name; form.fuente.selectedIndex = 1; tostada("Registro cargado: " + f.name); } }; },
  costos: (form, correr) => {
    const pintar = (d) => { form.dataset.datos = JSON.stringify(d); $("#cst").innerHTML = editorCostos(d); };
    let d = null; try { d = JSON.parse(localStorage.getItem("b3d_costos") || "null"); } catch (e) { d = null; }
    const ej = async () => { const f = leerForm(form); pintar(await motor.llamar("costos_ejemplo", { kg: f.kg, detonadores: f.detonadores, metros: f.metros })); };
    $("#b-ej").onclick = ej;
    d ? pintar(d) : ej();
  },
};
function editorCostos(d) {
  const eq = d.equipos.map((e, i) => `<div class="tarjeta" style="padding:10px;margin:8px 0"><b>${esc(e.nombre)}</b><div class="campos" style="padding:8px 0 0">
     ${[["precio", "Precio"], ["vida_util_h", "Vida útil h"], ["anios", "Años"], ["horas_anio", "h/año"], ["neumaticos", "Neumáticos"], ["consumo_h", "Consumo/h"], ["precio_energia", "Precio energía"], ["factor_reparacion", "F. reparación"]]
       .map(([k, l]) => `<label class="c">${l}<input data-eq="${i}" data-k="${k}" type="number" step="any" value="${e[k]}" inputmode="decimal"></label>`).join("")}</div></div>`).join("");
  const ta = d.tareas.map((t, i) => `<div class="tarjeta" style="padding:10px;margin:8px 0"><b>${esc(t.nombre)}</b><div class="campos" style="padding:8px 0 0">
     ${[["horas", "Horas"], ["trabajadores", "Trabajadores"], ["salario_h", "Salario/h"]].map(([k, l]) => `<label class="c">${l}<input data-ta="${i}" data-k="${k}" type="number" step="any" value="${t[k]}" inputmode="decimal"></label>`).join("")}
     <label class="c ancho">Equipos (nombre: horas, uno por línea)<textarea data-ta="${i}" data-k="equipos" rows="2">${esc(t.equipos.map(([a, b]) => `${a}: ${b}`).join("\n"))}</textarea></label>
     <label class="c ancho">Materiales (nombre: cantidad: precio)<textarea data-ta="${i}" data-k="materiales" rows="2">${esc(t.materiales.map(([a, b, c]) => `${a}: ${b}: ${c}`).join("\n"))}</textarea></label>
     </div></div>`).join("");
  return `<details class="grupo" style="margin-top:10px"><summary>Equipos (${d.equipos.length})</summary><div style="padding:0 10px 6px">${eq}</div></details>
          <details class="grupo"><summary>Tareas del ciclo (${d.tareas.length})</summary><div style="padding:0 10px 6px">${ta}</div></details>`;
}
function leerCostos(form) {
  const d = JSON.parse(form.dataset.datos);
  $$("[data-eq]").forEach((el) => d.equipos[+el.dataset.eq][el.dataset.k] = Number(el.value));
  $$("[data-ta]").forEach((el) => {
    const t = d.tareas[+el.dataset.ta], k = el.dataset.k;
    if (k === "equipos") t.equipos = el.value.split("\n").map((l) => l.split(":").map((s) => s.trim())).filter((p) => p[0]).map(([a, b]) => [a, Number(b || 0)]);
    else if (k === "materiales") t.materiales = el.value.split("\n").map((l) => l.split(":").map((s) => s.trim())).filter((p) => p[0]).map(([a, b, c]) => [a, Number(b || 0), Number(c || 0)]);
    else t[k] = Number(el.value);
  });
  form.dataset.datos = JSON.stringify(d);
  try { localStorage.setItem("b3d_costos", JSON.stringify(d)); } catch (e) { /* */ }
  return d;
}
const lienzos = (ids) => ids.map((id) => `<canvas class="grafico" id="${id}"></canvas>`).join("");
const CALC = {
  async fragmentacion(f) {
    f.medidos = (f.medidos || "").split("\n").map((l) => l.split(/[,;\t ]+/).filter(Boolean).map(Number)).filter((p) => p.length >= 2 && p.every(isFinite));
    const r = await motor.llamar("fragmentacion", f);
    $("#hres").innerHTML = kpis([["x50", f2(r.x50 / 10, 1) + " cm", `${f2(r.x50, 0)} mm`], ["x80 Swebrec", f2(r.x80_sw / 10, 1) + " cm", `R-R ${f2(r.x80_rr / 10, 1)} cm`],
      ["n", f2(r.n, 2), "uniformidad"], ["b", f2(r.b, 2), `xmax ${f2(r.xmax / 10, 0)} cm`], ["Bajo parrilla", f2(r.bajo_parrilla, 0) + " %"], ["A", f2(r.a, 2), "factor de roca"]]) +
      lienzos(["g1"]) + (r.ajuste ? lienzos(["g2"]) + kpis([["x50 medido", f2(r.ajuste.x50, 1) + " mm", `R² ${f2(r.ajuste.r2, 4)}`], ["b ajustado", f2(r.ajuste.b, 3), `xmax ${f2(r.ajuste.xmax, 0)} mm`], ["A calibrado", f2(r.ajuste.a_calibrado, 2), "x50 ∝ A"]]) : "") +
      tabla(["Paso", "Resultado"], r.pasos);
    grafico($("#g1"), { logx: true, ymin: 0, ymax: 100, xlab: "Tamaño (mm)", ylab: "% pasante", titulo: "Curva predicha",
      series: [{ x: r.x, y: r.swebrec, nombre: "Swebrec" }, { x: r.x, y: r.rosin, color: "#3d8fe0", trazo: [6, 4], nombre: "Rosin-Rammler" }],
      vlineas: [{ x: +f.parrilla, texto: "parrilla" }] });
    if (r.ajuste) { const a = r.ajuste; grafico($("#g2"), { logx: true, ymin: 0, ymax: 100, xlab: "Tamaño (mm)", ylab: "% pasante", titulo: "Ajuste a lo medido",
      series: [{ x: a.medidos.map((m) => m[0]), y: a.medidos.map((m) => m[1]), puntos: true, color: "#fff", nombre: "Medido" }, { x: a.x, y: a.swebrec, nombre: `Swebrec R² ${f2(a.r2, 3)}` }, { x: a.x, y: a.rosin, color: "#3d8fe0", trazo: [6, 4], nombre: `R-R R² ${f2(a.r2_rr, 3)}` }] }); }
  },
  async danio(f) {
    if (!OP_ACTUAL) throw new Error("Primero abre una malla en «Frente»");
    const r = await motor.llamar("danio", { ...f, clave: OP_ACTUAL.clave }, "Calculando esfuerzos…");
    $("#hres").innerHTML = kpis([["Cobertura", f2(r.cobertura, 0) + " %", "sección con σ ≥ tracción"], ...r.radios.map((x) => [x[0].slice(0, 22), f2(x[3], 1) + " cm", `triturado · fracturado ${f2(x[4], 2)} m`])]) +
      `<canvas class="grafico" id="gd" style="height:360px"></canvas><p class="sub">Color: esfuerzo radial (escala log). Blanco: zona donde σ ≥ resistencia a tracción.</p>` +
      tabla(["Explosivo", "Ø mm", "Pb MPa", "r triturado cm", "r fracturado m"], r.radios);
    mapaCalor($("#gd"), r, OP_ACTUAL);
  },
  async burden(f) {
    const r = await motor.llamar("burden", f);
    $("#hres").innerHTML = kpis([["Mediana", f2(r.mediana) + " m", `S ≈ ${f2(1.15 * r.mediana)} m`], ["q", f2(r.q) + " kg/m"]]) +
      `<canvas class="grafico" id="gb" style="height:300px"></canvas>` + tabla(["Fórmula", "B m", "Expresión"], r.filas);
    barrasH($("#gb"), r.filas.map((x) => x[0]), r.filas.map((x) => x[1]), r.mediana);
  },
  async macizo(f) {
    const r = await motor.llamar("macizo", f);
    $("#hres").innerHTML = kpis([["RMR89", r.rmr, r.clase], ["Q", f2(r.q, 3), `RMR desde Q ${f2(r.rmr_desde_q, 0)}`], ["GSI", r.gsi],
      ["Em Hoek-Diederichs", f2(r.em["Hoek-Diederichs"], 1) + " GPa"], ["Perno", f2(r.perno) + " m", `ESR ${r.esr}`], ["Carga de roca", f2(r.hp) + " m", `${f2(r.presion, 0)} kPa`]]) +
      lienzos(["gm1", "gm2"]) +
      tabla(["Parámetro", "Valor"], [...r.puntajes, ["Q", r.q], ["mb", r.hb.mb], ["s", r.hb.s], ["a", r.hb.a], ["σcm (MPa)", r.scm],
        ...Object.entries(r.em).map(([k, v]) => ["Em " + k + " (GPa)", v ?? "—"]), ["Luz sin soporte (m)", r.luz]]);
    grafico($("#gm1"), { titulo: "Módulo de deformación", xlab: "RMR", ylab: "Em (GPa)", series: [
      { x: r.curva_em.rmr, y: r.curva_em.serafim, nombre: "Serafim-Pereira" }, { x: r.curva_em.rmr, y: r.curva_em.hoek, color: "#e6b84a", nombre: "Hoek-Diederichs" },
      { x: r.curva_em.rmr, y: r.curva_em.nicholson, color: "#3d8fe0", nombre: "Nicholson-Bieniawski" }], vlineas: [{ x: r.rmr, color: "#9aa4af" }] });
    grafico($("#gm2"), { titulo: "Hoek-Brown", xlab: "σ3 (MPa)", ylab: "σ1 (MPa)", series: [{ x: r.curva_hb.s3, y: r.curva_hb.s1, nombre: `Macizo GSI ${r.gsi}` }] });
  },
  async cimbra(f) {
    const r = await motor.llamar("cimbra", f);
    $("#hres").innerHTML = kpis([["Carga q", f2(r.q, 1) + " kN/m", `hp ${f2(r.hp)} m`], ["N máx", f2(r.n_max, 1) + " kN"], ["M máx", f2(r.m_max) + " kN·m"],
      ["σ máx", f2(r.sigma, 0) + " MPa"], ["Utilización", f2(r.util, 0) + " %", r.util <= 100 ? "✔ cumple" : "✖ no cumple"]]) +
      (r.util > 100 ? `<div class="aviso">⚠ El perfil no resiste: usa uno mayor o reduce el espaciamiento.</div>` : "") +
      `<canvas class="grafico" id="gc1" style="height:300px"></canvas>` + lienzos(["gc2", "gc3"]) + tabla(["Perfil", "kg/m", "σ MPa", "Util. %"], r.perfiles);
    const um = Math.max(...r.desp.map((d) => Math.hypot(d[0], d[1]))) || 1e-9, k = 0.12 * Math.max(+f.ancho, +f.alto) / um;
    grafico($("#gc1"), { igual: true, titulo: `Deformada ×${k.toFixed(0)} (máx ${f2(um * 1000, 2)} mm)`, series: [
      { x: r.nudos.map((p) => p[0]), y: r.nudos.map((p) => p[1]), color: "#9aa4af", ancho: 4, nombre: "Geometría" },
      { x: r.nudos.map((p, i) => p[0] + k * r.desp[i][0]), y: r.nudos.map((p, i) => p[1] + k * r.desp[i][1]), nombre: "Deformada" }] });
    grafico($("#gc2"), { titulo: "Fuerza axial N (kN)", xlab: "Desarrollo (m)", cero: true, series: [{ x: r.N.map((p) => p[0]), y: r.N.map((p) => p[1]), color: "#3d8fe0", relleno: true }] });
    grafico($("#gc3"), { titulo: "Momento M (kN·m)", xlab: "Desarrollo (m)", cero: true, series: [{ x: r.M.map((p) => p[0]), y: r.M.map((p) => p[1]), color: "#e6b84a", relleno: true }] });
  },
  async dinamica(f) {
    const form = $("#fh");
    if (f.fuente.startsWith("Archivo")) { if (!form.dataset.reg) throw new Error("Elige el archivo del registro (columnas: tiempo s, aceleración g)"); f.registro = form.dataset.reg; f.nombre_registro = form.dataset.nreg; }
    const r = await motor.llamar("dinamica", f, "Calculando respuesta y espectro…");
    $("#hres").innerHTML = kpis([["PGA", f2(r.pga, 3) + " g", esc(r.nombre)], ["u máx", f2(r.umax, 3) + " mm"], ["ü abs máx", f2(r.amax, 3) + " g"],
      ["Sa máx", f2(Math.max(...r.sa), 3) + " g"]]) + lienzos(["gt1", "gt2", "gt3", "gt4"]);
    grafico($("#gt1"), { titulo: "Aceleración del terreno (g)", xlab: "t (s)", series: [{ x: r.t, y: r.ag, ancho: 1 }] });
    grafico($("#gt2"), { titulo: "Desplazamiento relativo (mm)", xlab: "t (s)", series: [{ x: r.t, y: r.u, ancho: 1.2, color: "#3d8fe0" }] });
    grafico($("#gt3"), { titulo: "Aceleración absoluta (g)", xlab: "t (s)", series: [{ x: r.t, y: r.a, ancho: 1, color: "#e6b84a" }] });
    grafico($("#gt4"), { titulo: "Espectro de respuesta Sa (g)", logx: true, xlab: "Periodo T (s)", series: [{ x: r.T, y: r.sa, color: "#e6b84a" }], vlineas: [{ x: +f.T, color: "#9aa4af" }] });
  },
  async costos(f) {
    const form = $("#fh");
    if (!form.dataset.datos) throw new Error("Carga primero el ejemplo");
    const d = leerCostos(form);
    const r = await motor.llamar("costos", { ...d, avance: f.avance, volumen: f.volumen, toneladas: f.toneladas });
    $("#hres").innerHTML = kpis([["Por disparo", "$ " + f2(r.total, 0)], ["Por metro", r.por_m == null ? "—" : "$ " + f2(r.por_m)], ["Por m³", r.por_m3 == null ? "—" : "$ " + f2(r.por_m3)], ["Por tonelada", r.por_t == null ? "—" : "$ " + f2(r.por_t)]]) +
      `<canvas class="grafico" id="gco" style="height:260px"></canvas>` +
      tabla(["Tarea", "Personal", "Equipos", "Materiales", "Total"], r.filas.map(([n_, c]) => [n_, c.Personal, c.Equipos, c.Materiales, c.Total])) +
      tabla(["Equipo", "Amort.", "Int.+seg.", "Repar.", "Energía", "$/h"], Object.entries(r.horario).map(([n_, c]) => [n_, c["Amortización"], c["Interés y seguros"], c["Reparaciones"], c["Energía/combustible"], c.Total])) +
      `<p class="sub">Precios del ejemplo referenciales: reemplázalos por tus cotizaciones y salarios.</p>`;
    barrasH($("#gco"), r.filas.map((x) => x[0]), r.filas.map((x) => x[1].Total));
  },
};
function mapaCalor(canvas, r, op) {
  const dpr = devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext("2d"); g.scale(dpr, dpr); g.fillStyle = "#101317"; g.fillRect(0, 0, W, H);
  const anchoM = r.nx * r.paso, altoM = r.ny * r.paso, k = Math.min((W - 20) / anchoM, (H - 20) / altoM);
  const ox = (W - anchoM * k) / 2, oy = (H - altoM * k) / 2;
  const X = (x) => ox + (x - r.x0) * k, Y = (y) => H - oy - (y - r.y0) * k;
  const lmin = Math.log10(r.st / 4), lmax = Math.max(...r.log_s);
  const turbo = (t) => `hsl(${(1 - t) * 250},85%,${30 + 25 * t}%)`;
  for (let j = 0; j < r.ny; j++) for (let i = 0; i < r.nx; i++) {
    const idx = j * r.nx + i; if (!r.dentro[idx]) continue;
    const t = Math.max(0, Math.min(1, (r.log_s[idx] - lmin) / (lmax - lmin)));
    g.fillStyle = r.log_s[idx] >= Math.log10(r.st) ? turbo(t) : "#1d2228";
    g.fillRect(X(r.x0 + i * r.paso) - k * r.paso / 2, Y(r.y0 + j * r.paso) - k * r.paso / 2, k * r.paso + .6, k * r.paso + .6);
  }
  g.strokeStyle = "#e8ebef"; g.lineWidth = 1.5; g.beginPath();
  op.contorno.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.closePath(); g.stroke();
  g.fillStyle = "#fff"; for (const [x, y] of r.taladros) { g.beginPath(); g.arc(X(x), Y(y), 2.2, 0, 7); g.fill(); }
}

/* ================================================================== MÁS: explosivos e instalación */
$("#b-add-exp").onclick = () => {
  const c = $("#f-exp"); const e = {};
  for (const el of $$("input,select", c)) e[el.name] = el.type === "number" ? Number(el.value) : el.value.trim();
  if (!e.nombre) return tostada("Escribe el nombre del explosivo");
  e.id = "EXP-U" + Date.now();
  const l = explosivosUsuario(); l.push(e); localStorage.setItem("b3d_explosivos", JSON.stringify(l));
  refrescarExplosivos(); tostada("Explosivo agregado");
};
let pedidoInstalar = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedidoInstalar = e; });
$("#b-instalar").onclick = async () => {
  if (pedidoInstalar) { pedidoInstalar.prompt(); await pedidoInstalar.userChoice; pedidoInstalar = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $("#instalar-ayuda").innerHTML = ios ? "En iPhone: abre esta página en <b>Safari</b> → botón <b>Compartir</b> → <b>Agregar a pantalla de inicio</b>."
    : "En Android: menú <b>⋮</b> de Chrome → <b>Instalar aplicación</b> (o «Agregar a pantalla principal»).";
};
if (matchMedia("(display-mode: standalone)").matches) $("#instalar-caja").style.display = "none";

if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !window.B3D_MOTOR)
  navigator.serviceWorker.register("sw.js").catch(() => {});

iniciar();
