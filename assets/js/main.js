/* ==========================================================================
   lance.software — scenes, scroll choreography, live dates, résumé gate
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.SITE_CONFIG || {};
  var root = document.documentElement;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Live dates: age, tenure, © year ---------- */
  function parseYMD(s) {
    var p = String(s).split('-').map(Number);
    return { y: p[0], m: p[1] || 1, d: p[2] || 1 };
  }
  function ageOn(b, now) {
    var a = now.getFullYear() - b.y;
    var m = now.getMonth() + 1, d = now.getDate();
    if (m < b.m || (m === b.m && d < b.d)) a--;
    return a;
  }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function tenure(start, now) {
    var months = (now.getFullYear() - start.y) * 12 + (now.getMonth() + 1 - start.m);
    if (months < 1) return 'New';
    var y = Math.floor(months / 12), mo = months % 12;
    return [y ? plural(y, 'yr') : '', mo ? plural(mo, 'mo') : ''].filter(Boolean).join(' ');
  }
  function updateDates() {
    var now = new Date();
    if (cfg.birthday) {
      var age = ageOn(parseYMD(cfg.birthday), now);
      $$('[data-age]').forEach(function (el) { el.textContent = age; });
    }
    $$('[data-tenure]').forEach(function (el) { el.textContent = tenure(parseYMD(el.getAttribute('data-tenure')), now); });
    $$('[data-year]').forEach(function (el) { el.textContent = now.getFullYear(); });
  }
  updateDates();
  // Tabs left open across midnight / a birthday still roll over.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) updateDates(); });

  /* ---------- Config-driven links ---------- */
  $$('[data-linkedin]').forEach(function (a) {
    if (cfg.linkedin) a.href = cfg.linkedin;
    else a.hidden = true;
  });

  /* ---------- Liquid-glass refraction (Chromium desktop only) ---------- */
  var uad = navigator.userAgentData;
  if (!reduceMotion && uad && !uad.mobile && uad.brands && uad.brands.some(function (b) { return /Chromium/.test(b.brand); })) {
    root.classList.add('lg-refract');
  }

  /* ---------- Scenes ---------- */
  var scenes = $$('.scene');
  var stages = scenes.map(function (s) { return $('.stage', s); });
  var navLinks = $$('[data-nav]');
  var railLinks = $$('[data-rail]');
  var geo = [];
  var vh = window.innerHeight;

  $$('.skill').forEach(function (el, i) { el.style.setProperty('--i', i); });

  function measure() {
    vh = window.innerHeight;
    var y = window.scrollY;
    geo = scenes.map(function (s) {
      var r = s.getBoundingClientRect();
      return { top: r.top + y, height: r.height };
    });
    // Mandatory snapping traps content taller than the screen; loosen it when that happens.
    var overflow = geo.some(function (g) { return g.height > vh + 2; });
    root.classList.toggle('snap-loose', overflow);
    onScroll();
  }

  var lastVis = [];
  var ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY;
    var progress = 0;

    for (var i = 0; i < geo.length; i++) {
      var g = geo[i];
      var end = g.top + Math.max(0, g.height - vh); // last scroll position still fully "in" this scene
      var rel = y < g.top ? (g.top - y) / vh : y > end ? (end - y) / vh : 0;
      var vis = Math.max(0, 1 - Math.min(1, Math.abs(rel)));
      if (!reduceMotion && stages[i] && Math.abs((lastVis[i] == null ? -1 : lastVis[i]) - vis) > 0.002) {
        stages[i].style.setProperty('--vis', vis.toFixed(3));
        stages[i].style.setProperty('--dir', rel > 0 ? 1 : rel < 0 ? -1 : 0);
        lastVis[i] = vis;
      }
      if (y >= g.top) {
        var next = geo[i + 1];
        if (y <= end || !next) progress = i;
        else progress = i + Math.min(1, (y - end) / Math.max(1, next.top - end));
      }
    }

    if (window.Galaxy) window.Galaxy.setProgress(progress);
    if (!reduceMotion) {
      root.style.setProperty('--neb-x', (Math.sin(progress * 0.9) * 4).toFixed(2) + '%');
      root.style.setProperty('--neb-y', (Math.cos(progress * 0.7) * 3).toFixed(2) + '%');
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });

  var resizeTimer;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(measure, 120); });
  window.addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  measure();

  // Entrance: a scene is "in view" once it crosses the middle band of the screen,
  // and resets once it's fully off-screen so the animation replays on return.
  function setActive(id) {
    var navId = (id === 'experience-mercy' || id === 'dispatch-script') ? 'experience' : id;
    navLinks.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('data-nav') === navId); });
    railLinks.forEach(function (a) {
      var on = a.getAttribute('data-rail') === id;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }

  if ('IntersectionObserver' in window) {
    var enter = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          setActive(e.target.getAttribute('data-scene'));
        }
      });
    }, { rootMargin: '-38% 0px -38% 0px', threshold: 0 });
    var leave = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (!e.isIntersecting) e.target.classList.remove('in-view'); });
    }, { threshold: 0 });
    scenes.forEach(function (s) { enter.observe(s); leave.observe(s); });
  } else {
    scenes.forEach(function (s) { s.classList.add('in-view'); });
  }

  /* ---------- Pointer: glass sheen + galaxy parallax ---------- */
  var pointerQueued = false, lastPointer = null;
  function applyPointer() {
    pointerQueued = false;
    var e = lastPointer;
    if (window.Galaxy) window.Galaxy.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    var glass = e.target && e.target.closest ? e.target.closest('.glass') : null;
    if (glass) {
      var r = glass.getBoundingClientRect();
      glass.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      glass.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }
  }
  if (!reduceMotion) {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      lastPointer = e;
      if (!pointerQueued) { pointerQueued = true; requestAnimationFrame(applyPointer); }
    }, { passive: true });
  }

  /* ==========================================================================
     Résumé: CAPTCHA → Worker verifies server-side → PDF streamed back as a blob.
     The PDF never has a public URL, so there's nothing for a crawler to fetch.
     ========================================================================== */
  var rc = cfg.resume || {};
  var modal = $('#resume-modal');
  var panel = $('.modal__panel', modal);
  var statusEl = $('.modal__status', modal);
  var slot = $('#captcha-slot');
  var stepVerify = $('[data-step="verify"]', modal);
  var stepView = $('[data-step="view"]', modal);
  var frameWrap = $('.pdf-frame', modal);
  var frame = $('#resume-frame');
  var openBtn = $('#resume-open');
  var dlBtn = $('#resume-download');
  var lastFocus = null;
  var captchaPromise = null, widgetId = null, blobUrl = null, busy = false;

  var PROVIDERS = {
    recaptcha: {
      src: 'https://www.google.com/recaptcha/api.js?onload=__lsCaptchaReady&render=explicit',
      api: function () { return window.grecaptcha; },
      render: function (api, el, opts) {
        return api.render(el, {
          sitekey: rc.siteKey, theme: 'dark', size: window.innerWidth < 360 ? 'compact' : 'normal',
          callback: opts.ok, 'expired-callback': opts.expired, 'error-callback': opts.error
        });
      },
      reset: function (api, id) { api.reset(id); }
    },
    turnstile: {
      src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__lsCaptchaReady&render=explicit',
      api: function () { return window.turnstile; },
      render: function (api, el, opts) {
        return api.render(el, {
          sitekey: rc.siteKey, theme: 'dark', size: window.innerWidth < 360 ? 'compact' : 'normal',
          callback: opts.ok, 'expired-callback': opts.expired, 'error-callback': opts.error
        });
      },
      reset: function (api, id) { api.reset(id); }
    }
  };
  var provider = PROVIDERS[rc.provider] || PROVIDERS.recaptcha;

  function setStatus(msg, isError, spin) {
    statusEl.textContent = '';
    statusEl.classList.toggle('is-error', !!isError);
    if (spin) {
      var s = document.createElement('span');
      s.className = 'spinner';
      s.setAttribute('aria-hidden', 'true');
      statusEl.appendChild(s);
    }
    if (msg) statusEl.appendChild(document.createTextNode(msg));
  }

  function loadCaptcha() {
    if (captchaPromise) return captchaPromise;
    captchaPromise = new Promise(function (resolve, reject) {
      window.__lsCaptchaReady = function () { resolve(provider.api()); };
      var s = document.createElement('script');
      s.src = provider.src;
      s.async = true; s.defer = true;
      s.onerror = function () { captchaPromise = null; reject(new Error('captcha script failed')); };
      document.head.appendChild(s);
    });
    return captchaPromise;
  }

  function resetCaptcha() {
    var api = provider.api();
    if (api && widgetId != null) { try { provider.reset(api, widgetId); } catch (e) { /* noop */ } }
  }

  function showPdf(url) {
    blobUrl = url;
    openBtn.href = url;
    dlBtn.href = url;
    // Inline preview only where the browser can actually render PDFs in a frame
    // (Android Chrome can't; it gets the Open/Download buttons instead).
    var inline = navigator.pdfViewerEnabled !== false && window.innerWidth >= 720 &&
      !/Android/i.test(navigator.userAgent);
    frameWrap.hidden = !inline;
    if (inline) frame.src = url;
    stepVerify.hidden = true;
    stepView.hidden = false;
    modal.classList.toggle('is-viewing', inline);
  }

  function fetchResume(token) {
    if (busy) return;
    busy = true;
    setStatus('Verifying…', false, true);
    fetch(rc.endpoint || '/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token }),
      credentials: 'omit',
      cache: 'no-store'
    }).then(function (res) {
      if (res.status === 403) throw new Error('verify');
      if (!res.ok) throw new Error('http');
      return res.blob();
    }).then(function (blob) {
      if (blob.type && blob.type.indexOf('pdf') === -1) throw new Error('type');
      setStatus('');
      showPdf(URL.createObjectURL(blob));
    }).catch(function (err) {
      setStatus(err.message === 'verify'
        ? 'Verification failed — please try again.'
        : 'The résumé service is unavailable right now. Please try again later.', true);
      resetCaptcha();
    }).then(function () { busy = false; });
  }

  function openResume() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    root.classList.add('modal-open');
    requestAnimationFrame(function () { modal.classList.add('is-open'); });
    $('[data-close-resume].modal__close', modal).focus({ preventScroll: true });

    if (blobUrl) return; // already unlocked this visit
    if (!rc.siteKey) { setStatus('Résumé access isn’t configured yet.', true); return; }
    if (widgetId != null) return;

    setStatus('Loading verification…', false, true);
    loadCaptcha().then(function (api) {
      setStatus('');
      widgetId = provider.render(api, slot, {
        ok: fetchResume,
        expired: function () { setStatus('Verification expired — please check the box again.', true); },
        error: function () { setStatus('Verification hit a snag. Check your connection and try again.', true); }
      });
    }).catch(function () {
      setStatus('Couldn’t load the verification widget. An ad/tracker blocker may be blocking it.', true);
    });
  }

  function closeResume() {
    modal.classList.remove('is-open');
    root.classList.remove('modal-open');
    var done = function () { modal.hidden = true; };
    if (reduceMotion) done(); else setTimeout(done, 280);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  if (rc.enabled === false) {
    $$('[data-open-resume]').forEach(function (b) { b.hidden = true; });
  }
  $$('[data-open-resume]').forEach(function (b) { b.addEventListener('click', openResume); });
  $$('[data-close-resume]', modal).forEach(function (b) { b.addEventListener('click', closeResume); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeResume();
  });
  // Keep Tab focus inside the panel while open
  modal.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = $$('a[href]:not([hidden]), button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])', panel)
      .filter(function (el) { return el.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
})();
