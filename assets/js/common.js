// Shared helpers for all pages. Everything from the server is shown
// with textContent (never innerHTML), so shared content can never run
// as code on this site.
(function () {
  var C = window.OBA_CONFIG;

  // ---------- API ----------
  function apiGet(params) {
    var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(C.API_URL + '?' + q, { credentials: 'omit' }).then(function (r) { return r.json(); });
  }
  // text/plain avoids a CORS preflight, which Apps Script cannot answer.
  function apiPost(body) {
    return fetch(C.API_URL, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  // ---------- DOM ----------
  // el('div', {class:'x', onclick: fn}, 'text', childEl, ...)
  function el(tag, attrs) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function $(sel, root) { return (root || document).querySelector(sel); }

  // Only plain web links may become clickable.
  function safeUrl(u) {
    if (!u) return null;
    try { var x = new URL(String(u)); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : null; } catch (e) { return null; }
  }

  // ---------- Storage (never required for the page to work) ----------
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (e) {}
    return null;
  }
  function deviceId() {
    var id = store('oba_device');
    if (!id) { id = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); store('oba_device', id); }
    return id || 'unknown';
  }

  // ---------- Dates ----------
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function todayISO() {
    var d = new Date(Date.now() + 5.5 * 3600000); // India time
    return d.toISOString().slice(0, 10);
  }
  function daysUntil(iso) {
    if (!iso) return null;
    return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(todayISO() + 'T00:00:00Z')) / 86400000);
  }
  function niceDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1].charAt(0) + MONTHS[parseInt(p[1], 10) - 1].slice(1).toLowerCase() + ' ' + p[0];
  }
  function ago(ms) {
    var s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' hr ago';
    var d = new Date(ms);
    return d.getDate() + ' ' + MONTHS[d.getMonth()].charAt(0) + MONTHS[d.getMonth()].slice(1).toLowerCase();
  }

  // ---------- Labels (same sections as the old bulletin) ----------
  var SECTIONS = {
    job: { label: 'Jobs', long: 'Jobs and vacancies' },
    b1: { label: 'Exams', long: 'Competitive exam notifications' },
    b2: { label: 'Admissions', long: 'Training programmes and university admissions' },
    b3: { label: 'Scholarships', long: 'Scholarships and fellowships' },
    b4: { label: 'Internships', long: 'Internships and skill development' },
    c1: { label: 'Exam prep', long: 'Exam preparation information' },
    c2: { label: 'Career guidance', long: 'Career path guidance' },
    c3: { label: 'New fields', long: 'Emerging fields and technologies' },
    d1: { label: 'News', long: 'News and general articles' }
  };
  var DOMAINS = {
    banking: 'Banking and finance', govt: 'Government and PSU', defence: 'Defence and security', health: 'Health and medical',
    infra: 'Infrastructure and engineering', it: 'IT, data and AI', education: 'Education and research', intl: 'International',
    legal: 'Legal and compliance', rural: 'Agriculture and rural', creative: 'Creative and media'
  };
  var EXP = {
    fresher: 'Fresher (0 to 1 yr)', early: 'Early career (1 to 3 yrs)', mid: 'Mid career (4 to 9 yrs)',
    senior: 'Senior (10+ yrs)', postret: 'Retired and deputation'
  };

  // ---------- Toast ----------
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    if (!t) { t = el('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  // ---------- Text size (A / A+) ----------
  function initTextSize() {
    var btn = $('#textsize');
    var apply = function (big) {
      document.documentElement.setAttribute('data-text', big ? 'large' : 'normal');
      if (btn) { btn.setAttribute('aria-pressed', big ? 'true' : 'false'); btn.textContent = big ? 'A−' : 'A+'; btn.setAttribute('aria-label', big ? 'Make text smaller' : 'Make text bigger'); }
    };
    apply(store('oba_text') === 'large');
    if (btn) btn.addEventListener('click', function () {
      var big = document.documentElement.getAttribute('data-text') !== 'large';
      store('oba_text', big ? 'large' : 'normal'); apply(big);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var ta = el('textarea', {}); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta); return Promise.resolve();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTextSize();
    var y = $('#year'); if (y) y.textContent = new Date().getFullYear();
    Array.prototype.slice.call(document.querySelectorAll('[data-help-email]')).forEach(function (h) { h.textContent = C.HELP_EMAIL; h.href = 'mailto:' + C.HELP_EMAIL; });
  });

  window.OBA = { apiGet: apiGet, apiPost: apiPost, el: el, clear: clear, $: $, safeUrl: safeUrl, store: store, deviceId: deviceId,
    todayISO: todayISO, daysUntil: daysUntil, niceDate: niceDate, ago: ago, MONTHS: MONTHS, SECTIONS: SECTIONS, DOMAINS: DOMAINS,
    EXP: EXP, toast: toast, copyText: copyText, config: C };
})();
