// drawit — collaborative canvas
// One shared board (a fixed 1600x900 "world") is fitted and centered on every
// screen, so every client sees the exact same picture in full. Drawing anywhere
// on the board is visible to everyone, whatever their screen size.

const WORLD_W = 1600, WORLD_H = 900;
const CANVAS_BG = '#161822';
const BRUSH_LABELS = { pen: 'Pen', marker: 'Marker', neon: 'Neon', spray: 'Spray', rainbow: 'Rainbow', eraser: 'Eraser' };

let cv, ctx;            // p5 canvas + 2D context (the artwork)
let overlay, octx;      // separate canvas for live cursors (cleared each frame)
let stageEl;
let cw = 0, ch = 0, scale = 1, dpr = 1;

let strokes = [];       // every segment ever drawn (world coords)
let isDrawing = false;
let last = null;
let hue = Math.random() * 360;

let currentBrush = 'pen';
let currentSize = 8;
let currentColor = '#7c5cff';

let socket = null;
let myId = null;
const remote = {};      // id -> { x, y, tx, ty, color, brush }
let lastCursorSent = 0;

const PRESETS = ['#ff5c7c', '#ffd166', '#06d6a0', '#4cc9f0', '#b892ff', '#ffffff', '#0c0d13'];

// ---------- p5 lifecycle ----------

function setup() {
	stageEl = document.getElementById('stage');
	computeLayout();
	pixelDensity(Math.min(2, window.devicePixelRatio || 1));
	cv = createCanvas(cw, ch);
	cv.parent('stage');
	ctx = drawingContext;
	background(CANVAS_BG);

	overlay = document.getElementById('cursors');
	octx = overlay.getContext('2d');
	sizeOverlay();

	setupUI();
	bindPointer();
	setColor(hslHex(hue, 82, 62));   // random default color per client
	connect();
}

function windowResized() {
	computeLayout();
	resizeCanvas(cw, ch);
	sizeOverlay();
	repaint();
}

function draw() {
	// Only the cursor overlay animates each frame; the artwork is persistent.
	octx.setTransform(dpr, 0, 0, dpr, 0, 0);
	octx.clearRect(0, 0, cw, ch);
	for (const id in remote) {
		const r = remote[id];
		r.x += (r.tx - r.x) * 0.35;
		r.y += (r.ty - r.y) * 0.35;
		drawCursor(r.x * scale, r.y * scale, r.color || '#fff');
	}
}

// ---------- layout ----------

function computeLayout() {
	dpr = Math.min(2, window.devicePixelRatio || 1);
	const wrap = document.getElementById('stagewrap');
	const availW = Math.max(80, wrap.clientWidth - 24);
	const availH = Math.max(80, wrap.clientHeight - 24);
	scale = Math.min(availW / WORLD_W, availH / WORLD_H);   // contain: whole board always visible
	cw = Math.round(WORLD_W * scale);
	ch = Math.round(WORLD_H * scale);
	scale = cw / WORLD_W;
	stageEl.style.width = cw + 'px';
	stageEl.style.height = ch + 'px';
}

function sizeOverlay() {
	overlay.width = cw * dpr;
	overlay.height = ch * dpr;
	overlay.style.width = cw + 'px';
	overlay.style.height = ch + 'px';
}

// ---------- drawing ----------

function repaint() {
	background(CANVAS_BG);
	for (const s of strokes) renderSeg(s);
}

function capStrokes() {
	if (strokes.length > 9000) strokes.splice(0, strokes.length - 9000);
}

function renderSeg(s) {
	const S = scale;
	const x = s.x * S, y = s.y * S, px = s.px * S, py = s.py * S;
	const w = Math.max(0.75, s.size * S);

	push();
	strokeCap(ROUND);
	strokeJoin(ROUND);

	if (s.brush === 'eraser') {
		stroke(CANVAS_BG);
		strokeWeight(w * 1.9);
		line(px, py, x, y);

	} else if (s.brush === 'marker') {
		const c = color(s.color); c.setAlpha(70);
		stroke(c);
		strokeWeight(w * 1.8);
		line(px, py, x, y);

	} else if (s.brush === 'neon') {
		ctx.save();
		ctx.shadowBlur = Math.max(8, w * 1.4);
		ctx.shadowColor = s.color;
		stroke(s.color);
		strokeWeight(w);
		line(px, py, x, y);
		ctx.shadowBlur = 0;
		stroke(255, 255, 255, 160);
		strokeWeight(Math.max(1, w * 0.4));
		line(px, py, x, y);
		ctx.restore();

	} else if (s.brush === 'spray') {
		// Deterministic scatter (seeded by position) so every client matches.
		const seed = ((Math.floor(s.x * 10) * 73856093) ^ (Math.floor(s.y * 10) * 19349663)) >>> 0;
		const rng = mulberry32(seed);
		const rad = Math.max(3, w);
		const n = Math.max(10, Math.floor(rad * 1.4));
		const c = color(s.color); c.setAlpha(180);
		noStroke(); fill(c);
		for (let i = 0; i < n; i++) {
			const a = rng() * Math.PI * 2;
			const r = Math.sqrt(rng()) * rad;
			circle(x + Math.cos(a) * r, y + Math.sin(a) * r, Math.max(1.2, w * 0.14));
		}

	} else {
		// pen + rainbow (rainbow's color is baked per-segment on the sender)
		stroke(s.color);
		strokeWeight(w);
		line(px, py, x, y);
	}
	pop();
}

function addSeg(a, b) {
	let col = currentColor;
	if (currentBrush === 'rainbow') {
		hue = (hue + 6) % 360;
		col = hslHex(hue, 85, 62);
	}
	const seg = { x: b.x, y: b.y, px: a.x, py: a.y, size: currentSize, color: col, brush: currentBrush };
	strokes.push(seg);
	capStrokes();
	renderSeg(seg);
	if (socket) socket.emit('draw', seg);
}

// ---------- cursors overlay ----------

function drawCursor(cx, cy, col) {
	octx.save();
	octx.translate(cx, cy);
	octx.shadowBlur = 12;
	octx.shadowColor = col;
	octx.fillStyle = col;
	octx.beginPath(); octx.arc(0, 0, 6, 0, Math.PI * 2); octx.fill();
	octx.shadowBlur = 0;
	octx.fillStyle = '#fff';
	octx.beginPath(); octx.arc(0, 0, 2.2, 0, Math.PI * 2); octx.fill();
	octx.restore();
}

// ---------- input ----------

function worldFromEvent(e) {
	const r = cv.elt.getBoundingClientRect();
	return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
}

function bindPointer() {
	const el = cv.elt;
	el.style.touchAction = 'none';

	el.addEventListener('pointerdown', (e) => {
		isDrawing = true;
		last = worldFromEvent(e);
		addSeg(last, last);         // a dot on tap
		try { el.setPointerCapture(e.pointerId); } catch (_) {}
		dismissHint();
		e.preventDefault();
	});

	el.addEventListener('pointermove', (e) => {
		const p = worldFromEvent(e);
		sendCursor(p);
		if (isDrawing) {
			addSeg(last, p);
			last = p;
		}
	});

	const stop = () => { isDrawing = false; last = null; };
	el.addEventListener('pointerup', stop);
	el.addEventListener('pointercancel', stop);
}

function sendCursor(p) {
	const now = performance.now();
	if (!socket || now - lastCursorSent < 33) return;
	lastCursorSent = now;
	socket.emit('cursor', { x: p.x, y: p.y, color: currentColor, brush: currentBrush });
}

// ---------- networking ----------

function connect() {
	socket = io();
	socket.on('connect', () => { myId = socket.id; });

	socket.on('init', (d) => {
		strokes = (d.history || []).slice();
		capStrokes();
		repaint();
		setCount(d.count);
	});

	socket.on('presence', (n) => setCount(n));

	socket.on('draw', (s) => {
		strokes.push(s);
		capStrokes();
		renderSeg(s);
	});

	socket.on('clear', () => {
		strokes = [];
		background(CANVAS_BG);
	});

	socket.on('cursor', (c) => {
		let r = remote[c.id];
		if (!r) r = remote[c.id] = { x: c.x, y: c.y };
		r.tx = c.x; r.ty = c.y; r.color = c.color; r.brush = c.brush;
	});

	socket.on('leave', (id) => { delete remote[id]; });
}

// ---------- UI ----------

function setupUI() {
	// Brushes
	document.querySelectorAll('.brush').forEach((btn) => {
		btn.addEventListener('click', () => {
			document.querySelectorAll('.brush').forEach((b) => b.classList.remove('active'));
			btn.classList.add('active');
			currentBrush = btn.dataset.brush;
			updateSummary();
		});
	});

	// Color picker
	const colorInput = document.getElementById('color');
	colorInput.addEventListener('input', () => setColor(colorInput.value));

	// Random color
	document.getElementById('dice').addEventListener('click', () => {
		hue = Math.random() * 360;
		setColor(hslHex(hue, 82, 62));
	});

	// Preset swatches
	const sw = document.getElementById('swatches');
	PRESETS.forEach((hex) => {
		const c = document.createElement('button');
		c.className = 'chip';
		c.style.background = hex;
		c.title = hex;
		c.addEventListener('click', () => setColor(hex));
		sw.appendChild(c);
	});

	// Size
	const sizeInput = document.getElementById('size');
	const apply = () => {
		currentSize = parseInt(sizeInput.value, 10);
		document.getElementById('sizeval').textContent = currentSize;
		const pv = document.getElementById('preview');
		const d = Math.max(4, Math.min(26, currentSize));
		pv.style.width = d + 'px';
		pv.style.height = d + 'px';
		const pct = ((currentSize - sizeInput.min) / (sizeInput.max - sizeInput.min)) * 100;
		sizeInput.style.setProperty('--fill', pct + '%');
		updateSummary();
	};
	sizeInput.addEventListener('input', apply);
	apply();

	// Save / clear
	document.getElementById('save').addEventListener('click', () => {
		saveCanvas(cv, 'drawit-' + Date.now(), 'png');
	});
	document.getElementById('clear').addEventListener('click', () => {
		strokes = [];
		background(CANVAS_BG);
		if (socket) socket.emit('clear');
	});

	// Collapsible bottom sheet
	const sheet = document.getElementById('sheet');
	const toggle = document.getElementById('sheetToggle');
	toggle.addEventListener('click', () => {
		const collapsed = sheet.classList.toggle('collapsed');
		toggle.setAttribute('aria-expanded', String(!collapsed));
	});
}

function updateSummary() {
	document.getElementById('summaryBrush').textContent = BRUSH_LABELS[currentBrush] || 'Pen';
	document.getElementById('summarySize').textContent = currentSize;
}

function setColor(hex) {
	currentColor = hex;
	document.getElementById('color').value = hex;
	document.documentElement.style.setProperty('--accent', hex);
}

function setCount(n) {
	if (typeof n === 'number') document.getElementById('count').textContent = n;
}

function dismissHint() {
	const h = document.getElementById('hint');
	if (h) h.classList.add('gone');
}

// ---------- helpers ----------

function mulberry32(a) {
	return function () {
		a |= 0; a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function hslHex(h, s, l) {
	s /= 100; l /= 100;
	const k = (n) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n) => {
		const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
		return Math.round(255 * c).toString(16).padStart(2, '0');
	};
	return '#' + f(0) + f(8) + f(4);
}
