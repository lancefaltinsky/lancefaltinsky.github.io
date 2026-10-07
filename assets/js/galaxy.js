/* ==========================================================================
   Particle galaxy — dependency-free WebGL 1 (works on every modern browser,
   including iOS Safari). Falls back to Canvas 2D if WebGL is unavailable.

   Public API (used by main.js):
     Galaxy.setProgress(p)   p = fractional scene index (0 = hero, 1 = about …)
     Galaxy.setPointer(x, y) x/y in -1..1, subtle parallax
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('galaxy');
  if (!canvas) return;

  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var smallScreen = Math.min(screen.width, screen.height) < 700;

  // Performance tiers: 'high' (full), 'low' (fewer particles, lower res), 'still' (one static frame, zero ongoing cost).
  // Starts from device hints, then main loop watches real frame times and steps down if the device struggles.
  var conn = navigator.connection || {};
  var mem = navigator.deviceMemory; // Chromium only; undefined elsewhere
  var cores = navigator.hardwareConcurrency || 4;
  var tier = 'high';
  if (smallScreen || cores <= 4 || (mem && mem <= 4)) tier = 'low';
  if (reduceMotion || conn.saveData || cores <= 2 || (mem && mem <= 2)) tier = 'still';
  var lowPower = tier !== 'high';

  // Camera "shots" per scene. tilt: 0 = edge-on, PI/2 = face-on.
  // ox/oy shift the galaxy on screen (clip-space) so it frames the content.
  var SHOTS = [
    { tilt: 0.36, yaw: 0.0, roll: -0.08, dist: 7.2,  ox: 0.0,   oy: -0.82, gain: 1.0 },  // hero (horizon below headline)
    { tilt: 1.35, yaw: 0.8, roll: 0.15,  dist: 7.5,  ox: 1.1,   oy: 0.15,  gain: 0.65 },  // about
    { tilt: 0.38, yaw: 1.6, roll: -0.2,  dist: 7.0,  ox: -0.6,  oy: 0.0,   gain: 0.75 }, // kraft kennedy
    { tilt: 1.0,  yaw: 2.1, roll: -0.3,  dist: 9.5,  ox: -0.75, oy: 0.25,  gain: 0.6 },  // dispatch script (featured)
    { tilt: 0.75, yaw: 2.6, roll: 0.35,  dist: 6.0,  ox: 0.6,   oy: -0.15, gain: 0.7 },  // mercy
    { tilt: 1.52, yaw: 3.4, roll: 0.0,   dist: 13.0, ox: 0.0,   oy: 0.0,   gain: 0.6 },  // skills (face-on, far)
    { tilt: 0.18, yaw: 4.4, roll: -0.12, dist: 8.0,  ox: 0.0,   oy: -0.55, gain: 0.8 },  // projects (edge-on band)
    { tilt: 1.15, yaw: 5.6, roll: 0.25,  dist: 16.0, ox: 0.0,   oy: 0.0,   gain: 0.6 }   // contact (pulled way back)
  ];
  var KEYS = ['tilt', 'yaw', 'roll', 'dist', 'ox', 'oy', 'gain'];

  function copyShot(s) { var o = {}; for (var i = 0; i < KEYS.length; i++) o[KEYS[i]] = s[KEYS[i]]; return o; }
  var cam = copyShot(SHOTS[0]);
  var target = copyShot(SHOTS[0]);
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  function smooth(t) { return t * t * t * (t * (t * 6 - 15) + 10); } // smootherstep
  function shotAt(p) {
    var max = SHOTS.length - 1;
    p = Math.max(0, Math.min(max, p));
    var i = Math.min(Math.floor(p), max - 1);
    var t = smooth(p - i);
    var a = SHOTS[i], b = SHOTS[i + 1], o = {};
    for (var k = 0; k < KEYS.length; k++) o[KEYS[k]] = a[KEYS[k]] + (b[KEYS[k]] - a[KEYS[k]]) * t;
    return o;
  }

  /* ---------- Particle generation ---------- */
  // Interleaved: x, y, z, r, g, b, size, seed, kind  (kind 0 = galaxy, 1 = background star, 2 = dust)
  var STRIDE = 9;
  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  var CORE = [1.0, 0.82, 0.62];
  var INNER = [0.78, 0.62, 1.0];
  var OUTER = [0.42, 0.62, 1.0];
  var PINK = [1.0, 0.48, 0.78];
  var ICE = [0.85, 0.95, 1.0];

  function buildParticles(nGalaxy, nDust, nStars) {
    var data = new Float32Array((nGalaxy + nDust + nStars) * STRIDE);
    var R = 6, ARMS = 3, SPIN = 0.95, o = 0;

    function push(x, y, z, c, size, kind) {
      data[o++] = x; data[o++] = y; data[o++] = z;
      data[o++] = c[0]; data[o++] = c[1]; data[o++] = c[2];
      data[o++] = size; data[o++] = Math.random(); data[o++] = kind;
    }

    for (var i = 0; i < nGalaxy; i++) {
      var x, y, z, r, c;
      if (Math.random() < 0.16) {
        // Bulge: dense, warm, slightly flattened sphere
        r = Math.abs(gauss()) * 0.75;
        var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        x = r * Math.sin(ph) * Math.cos(th);
        z = r * Math.sin(ph) * Math.sin(th);
        y = r * Math.cos(ph) * 0.55;
        c = mix(CORE, [1, 0.95, 0.85], Math.random() * 0.6);
        c = c.map(function (v) { return v * (0.4 + Math.random() * 0.4); });
        push(x, y, z, c, 0.02 + Math.random() * 0.025, 0);
        continue;
      }
      r = R * Math.pow(Math.random(), 1.4) + 0.15;
      var branch = ((i % ARMS) / ARMS) * Math.PI * 2;
      var angle = branch + r * SPIN + gauss() * 0.12;
      var spread = 0.3 * (0.35 + r * 0.22);
      x = Math.cos(angle) * r + Math.pow(Math.random(), 2.6) * (Math.random() < 0.5 ? -1 : 1) * spread * 2.2;
      z = Math.sin(angle) * r + Math.pow(Math.random(), 2.6) * (Math.random() < 0.5 ? -1 : 1) * spread * 2.2;
      y = gauss() * (0.05 + 0.12 * Math.exp(-r / 1.8));

      var t = r / R;
      c = t < 0.32 ? mix(CORE, INNER, smooth(t / 0.32)) : mix(INNER, OUTER, smooth(Math.min(1, (t - 0.32) / 0.6)));
      var roll = Math.random();
      if (roll < 0.06) c = PINK; else if (roll < 0.1) c = ICE;
      var bright = 0.45 + Math.random() * 0.65;
      c = [c[0] * bright, c[1] * bright, c[2] * bright];
      push(x, y, z, c, 0.018 + Math.pow(Math.random(), 7) * 0.08, 0);
    }

    // Nebulous dust: big, very dim, soft blobs riding the arms
    for (var d = 0; d < nDust; d++) {
      var rr = 0.8 + Math.random() * (R - 0.8);
      var a = ((d % ARMS) / ARMS) * Math.PI * 2 + rr * SPIN + gauss() * 0.25;
      var hue = Math.random();
      var dc = hue < 0.45 ? [0.55, 0.35, 1.0] : hue < 0.75 ? [1.0, 0.35, 0.7] : [0.3, 0.55, 1.0];
      var k = 0.05 + Math.random() * 0.05;
      push(Math.cos(a) * rr + gauss() * 0.3, gauss() * 0.06, Math.sin(a) * rr + gauss() * 0.3,
        [dc[0] * k, dc[1] * k, dc[2] * k], 0.5 + Math.random() * 0.9, 2);
    }

    // Distant star field (sized in screen pixels, not world units)
    for (var s = 0; s < nStars; s++) {
      var u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1), rad = 30 + Math.random() * 25;
      var tint = Math.random();
      var sc = tint < 0.15 ? [1, 0.85, 0.7] : tint < 0.35 ? [0.75, 0.85, 1] : [1, 1, 1];
      var b = 0.5 + Math.pow(Math.random(), 3) * 0.9;
      push(rad * Math.sin(v) * Math.cos(u), rad * Math.cos(v), rad * Math.sin(v) * Math.sin(u),
        [sc[0] * b, sc[1] * b, sc[2] * b], 1.0 + Math.pow(Math.random(), 4) * 2.6, 1);
    }
    return data;
  }

  /* ---------- Tiny mat4 helpers (column-major) ---------- */
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function rotX(t) { var c = Math.cos(t), s = Math.sin(t); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); }
  function rotY(t) { var c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); }
  function rotZ(t) { var c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function trans(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); }
  function persp(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  var FOV = 55 * Math.PI / 180;

  function viewMatrix(c, spin) {
    var tilt = c.tilt + pointer.y * 0.08;
    var yaw = c.yaw + pointer.x * 0.12;
    // eye space: push back, roll, tilt the disk toward camera, then spin the galaxy
    return mul(trans(0, 0, -c.dist), mul(rotZ(c.roll), mul(rotX(tilt), rotY(yaw + spin))));
  }

  /* ---------- Shared loop state ---------- */
  var start = performance.now(), last = start, running = false, rafId = 0;
  var SPIN_SPEED = 0.016; // rad/s — rigid rotation keeps the arms from winding up over time

  function step(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    var k = 1 - Math.exp(-dt * 1.3); // lower = slower, floatier camera moves
    for (var i = 0; i < KEYS.length; i++) cam[KEYS[i]] += (target[KEYS[i]] - cam[KEYS[i]]) * k;
    var pk = 1 - Math.exp(-dt * 2);
    pointer.x += (pointer.tx - pointer.x) * pk;
    pointer.y += (pointer.ty - pointer.y) * pk;
    return (now - start) / 1000;
  }

  /* ==========================================================================
     WebGL renderer
     ========================================================================== */
  var VS = [
    'attribute vec3 a_pos;',
    'attribute vec3 a_col;',
    'attribute vec3 a_misc;', // size, seed, kind
    'uniform mat4 u_proj;',
    'uniform mat4 u_view;',
    'uniform float u_time;',
    'uniform float u_focal;', // pixels per world unit at distance 1
    'uniform float u_pr;',
    'uniform vec2 u_offset;',
    'uniform float u_gain;',
    'varying vec3 v_col;',
    'varying float v_soft;',
    'void main() {',
    '  float kind = a_misc.z;',
    '  float seed = a_misc.y;',
    '  vec3 p = a_pos;',
    '  if (kind < 0.5) {',
    '    float ph = seed * 6.2831 + u_time * (0.4 + seed * 0.6);',
    '    p += vec3(cos(ph), sin(ph * 1.3) * 0.4, sin(ph)) * 0.012;',
    '  }',
    '  vec4 mv = u_view * vec4(p, 1.0);',
    '  if (kind > 0.5 && kind < 1.5) mv = vec4((u_view * vec4(p, 0.0)).xyz, 1.0);', // stars: rotate only, infinitely far
    '  gl_Position = u_proj * mv;',
    '  gl_Position.xy += u_offset * gl_Position.w;',
    '  float depth = max(-mv.z, 0.1);',
    '  float px = (kind > 0.5 && kind < 1.5) ? a_misc.x * u_pr : a_misc.x * u_focal / depth;',
    '  float ps = clamp(px, 1.0, 256.0 * u_pr);',
    '  gl_PointSize = ps;',
    '  float energy = (px * px) / (ps * ps);', // keep sub-pixel points from looking too bright
    '  float tw = (kind > 0.5 && kind < 1.5) ? 0.65 + 0.35 * sin(u_time * (0.8 + seed * 2.5) + seed * 50.0) : 1.0;',
    '  float near = smoothstep(0.4, 1.6, depth);', // fade particles that brush the camera
    '  v_col = a_col * min(energy, 1.0) * tw * near * (kind > 0.5 && kind < 1.5 ? 1.0 : u_gain);',
    '  v_soft = kind > 1.5 ? 1.0 : 0.0;',
    '}'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'varying vec3 v_col;',
    'varying float v_soft;',
    'void main() {',
    '  vec2 d = gl_PointCoord - 0.5;',
    '  float r2 = dot(d, d) * 4.0;',
    '  if (r2 > 1.0) discard;',
    '  float a = mix(exp(-r2 * 5.0), exp(-r2 * 2.2) * (1.0 - r2), v_soft);',
    '  vec3 c = v_col * a;',
    '  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));',
    '}'
  ].join('\n');

  function initWebGL() {
    var gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true, powerPreference: 'high-performance' }) ||
      canvas.getContext('experimental-webgl');
    if (!gl) return null;

    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    }

    var prog, buf, loc, counts, dpr, quality = 1, maxDpr = lowPower ? 1.25 : 1.75;
    var nGalaxy = lowPower ? (smallScreen ? 18000 : 26000) : 70000, nDust = lowPower ? 110 : 420, nStars = lowPower ? 1200 : 2800;

    function setup() {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);

      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, buildParticles(nGalaxy, nDust, nStars), gl.STATIC_DRAW);
      counts = { galaxy: nGalaxy, extra: nDust + nStars };

      var F = 4, S = STRIDE * F;
      [['a_pos', 0], ['a_col', 3], ['a_misc', 6]].forEach(function (a) {
        var l = gl.getAttribLocation(prog, a[0]);
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, 3, gl.FLOAT, false, S, a[1] * F);
      });
      loc = {};
      ['u_proj', 'u_view', 'u_time', 'u_focal', 'u_pr', 'u_offset', 'u_gain'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE); // additive light
      gl.clearColor(0, 0, 0, 0);
      resize();
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * quality;
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
    }

    function render(time) {
      var w = canvas.width, h = canvas.height;
      var aspect = w / h;
      // On portrait screens, back the camera off so the disk still fits horizontally
      var c = copyShot(cam);
      if (aspect < 1) { c.dist *= 1 + (1 - aspect) * 0.9; c.ox *= 0.4; }
      gl.uniformMatrix4fv(loc.u_proj, false, persp(FOV, aspect, 0.1, 200));
      gl.uniformMatrix4fv(loc.u_view, false, viewMatrix(c, time * SPIN_SPEED));
      gl.uniform1f(loc.u_time, time);
      gl.uniform1f(loc.u_focal, h / (2 * Math.tan(FOV / 2)));
      gl.uniform1f(loc.u_pr, dpr);
      gl.uniform2f(loc.u_offset, c.ox, c.oy);
      gl.uniform1f(loc.u_gain, c.gain);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, Math.floor(counts.galaxy * (quality < 1 ? 0.6 : 1)));
      gl.drawArrays(gl.POINTS, counts.galaxy, counts.extra);
    }

    // Software rendering or an old mobile GPU: don't animate at all.
    function weakGpu() {
      if (gl.getParameter(gl.MAX_TEXTURE_SIZE) < 4096) return true;
      var name = String(gl.getParameter(gl.RENDERER) || '');
      if (/WebKit WebGL/i.test(name)) { // Chromium masks RENDERER; ask for the real one
        var ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      }
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render|Mali-(?:[2-4]\d\d|T[67])|Adreno \(TM\) [2-4]\d\d|PowerVR SGX/i.test(name);
    }

    setup();
    return {
      weak: weakGpu(),
      render: render,
      resize: resize,
      degrade: function () { if (quality === 1) { quality = 0.75; resize(); return true; } return false; },
      onLost: function (cb) {
        canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); cb(false); });
        canvas.addEventListener('webglcontextrestored', function () { setup(); cb(true); });
      }
    };
  }

  /* ==========================================================================
     Canvas 2D fallback (no WebGL): fewer points, same look
     ========================================================================== */
  function init2D() {
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    var pts = buildParticles(3500, 0, 500), n = pts.length / STRIDE, dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    }
    function render(time) {
      var w = canvas.width, h = canvas.height, aspect = w / h;
      var c = copyShot(cam);
      if (aspect < 1) { c.dist *= 1 + (1 - aspect) * 0.9; c.ox *= 0.4; }
      var m = mul(persp(FOV, aspect, 0.1, 200), viewMatrix(c, time * SPIN_SPEED));
      var focal = h / (2 * Math.tan(FOV / 2));
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = c.gain;
      for (var i = 0; i < n; i++) {
        var o = i * STRIDE, x = pts[o], y = pts[o + 1], z = pts[o + 2], kind = pts[o + 8];
        var tw = kind === 1 ? 0 : 1; // stars are directions (w = 0): no camera translation
        var cw = m[3] * x + m[7] * y + m[11] * z + m[15] * tw;
        if (cw <= 0.3) continue;
        var cx = (m[0] * x + m[4] * y + m[8] * z + m[12] * tw) / cw + c.ox;
        var cy = (m[1] * x + m[5] * y + m[9] * z + m[13] * tw) / cw + c.oy;
        var sx = (cx * 0.5 + 0.5) * w, sy = (0.5 - cy * 0.5) * h;
        if (sx < -4 || sy < -4 || sx > w + 4 || sy > h + 4) continue;
        var size = kind === 1 ? pts[o + 6] * dpr * 0.6 : Math.max(0.6, pts[o + 6] * focal / cw * 0.6);
        ctx.fillStyle = 'rgb(' + (pts[o + 3] * 255 | 0) + ',' + (pts[o + 4] * 255 | 0) + ',' + (pts[o + 5] * 255 | 0) + ')';
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      }
    }
    resize();
    return { render: render, resize: resize, degrade: function () { return false; }, onLost: function () {}, weak: true };
  }

  /* ---------- Boot ---------- */
  var renderer = null;
  try { renderer = initWebGL(); } catch (e) { renderer = null; }
  if (!renderer) renderer = init2D(); // no WebGL: Canvas 2D, always a single still frame
  if (!renderer) return;
  if (renderer.weak) tier = 'still';
  var root = document.documentElement;
  root.classList.add('has-galaxy');
  root.classList.toggle('galaxy-lite', tier !== 'high');

  // Frame-time watchdog. 60-frame windows after a short warm-up. Average above ~24ms
  // (under ~40fps) drops quality once; above ~30ms after that, or above 40ms at any
  // point (clearly an old phone), freezes the galaxy into a still frame.
  var mon = { skip: 40, n: 0, sum: 0, degraded: false };
  function watch(dt) {
    if (mon.skip > 0) { mon.skip--; return; }
    if (dt > 250) return; // tab switch or one-off hitch, not a real frame
    mon.sum += dt; mon.n++;
    if (mon.n < 60) return;
    var avg = mon.sum / mon.n;
    mon.sum = 0; mon.n = 0; mon.skip = 20;
    if (avg > 40 || (avg > 30 && mon.degraded)) goStill();
    else if (avg > 24) { if (!mon.degraded && renderer.degrade()) mon.degraded = true; else goStill(); }
  }

  function loop(now) {
    if (!running) return;
    var dtMs = now - last;
    var time = step(now);
    renderer.render(time);
    watch(dtMs);
    if (running) rafId = requestAnimationFrame(loop);
  }
  function play() {
    if (running || tier === 'still') return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  }
  function pause() { running = false; cancelAnimationFrame(rafId); }
  var stillTime = 18;
  function drawStill() { renderer.render(stillTime); }
  function goStill() {
    stillTime = (performance.now() - start) / 1000; // freeze where it is, no visual jump
    tier = 'still';
    pause();
    root.classList.add('galaxy-still', 'galaxy-lite');
    drawStill();
  }

  renderer.onLost(function (ok) { if (ok) { tier === 'still' ? drawStill() : play(); } else pause(); });

  if (window.ResizeObserver) {
    new ResizeObserver(function () { renderer.resize(); if (!running) drawStill(); }).observe(canvas);
  } else {
    window.addEventListener('resize', function () { renderer.resize(); if (!running) drawStill(); });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause();
    else { mon.skip = 40; mon.n = 0; mon.sum = 0; play(); }
  });

  window.Galaxy = {
    tier: function () { return tier; },
    setProgress: function (p) {
      if (tier === 'still') return; // keep a single calm shot
      target = shotAt(p);
    },
    setPointer: function (x, y) { pointer.tx = x; pointer.ty = y; }
  };

  if (tier === 'still') { root.classList.add('galaxy-still'); drawStill(); } else play();
})();
