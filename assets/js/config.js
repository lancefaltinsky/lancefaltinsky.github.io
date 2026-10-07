/* Site configuration — the only file you should need to edit for day-to-day changes. */
window.SITE_CONFIG = {
  // YYYY-MM-DD. Age on the page is computed from this in the visitor's local time.
  birthday: '2000-07-15',

  // While empty, LinkedIn links are hidden.
  linkedin: 'https://www.linkedin.com/in/lancefaltinsky',

  resume: {
    // false hides every résumé button. Flip to true once the Cloudflare Worker is deployed
    // and siteKey below is your real reCAPTCHA key.
    enabled: false,

    // The Cloudflare Worker route that verifies the CAPTCHA and streams the PDF.
    endpoint: '/api/resume',

    // 'recaptcha' (Google reCAPTCHA v2 checkbox) or 'turnstile' (Cloudflare Turnstile).
    provider: 'recaptcha',

    // PUBLIC site key (safe to commit). The SECRET key lives only in the Worker.
    // The key below is Google's documented always-pass TEST key — replace it before going live.
    siteKey: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'
    // Turnstile test key (always passes): '1x00000000000000000000AA'
  }
};
