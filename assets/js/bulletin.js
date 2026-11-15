// Bulletin page: loads open posts once, then filters on the phone.
(function () {
  var O = window.OBA, el = O.el, $ = O.$;
  var KERALA = /kerala|thiruvananthapuram|trivandrum|kochi|cochin|ernakulam|kozhikode|calicut|thrissur|kannur|kollam|palakkad|malappuram|kottayam|alappuzha|alleppey|idukki|wayanad|pathanamthitta|kasaragod|technopark|infopark|cyberpark|kseb|ksrtc|kpsc|kerala psc|cusat|sctimst|e-grantz/i;
  var NEWSY = ['c1', 'c2', 'c3', 'd1'];   // these show "posted" date, not a closing date

  // Chips group the nine old sections into eight easy buttons.
  var CHIPS = [
    { key: 'all', label: 'All' },
    { key: 'job', label: 'Jobs', match: ['job'] },
    { key: 'exams', label: 'Exams', match: ['b1'] },
    { key: 'admissions', label: 'Admissions', match: ['b2'] },
    { key: 'scholarships', label: 'Scholarships', match: ['b3'] },
    { key: 'internships', label: 'Internships', match: ['b4'] },
    { key: 'guidance', label: 'Guidance', match: ['c1', 'c2', 'c3'] },
    { key: 'news', label: 'News', match: ['d1'] }
  ];

  var stripNode = null;
  var state = { all: [], chip: 'all', q: '', kerala: false, exp: [], domain: '', sort: 'closing', shown: O.config.PAGE_SIZE };

  function readHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    var m = h.match(/^p=(.+)$/);
    if (m) return { post: m[1] };
    if (CHIPS.some(function (c) { return c.key === h; })) state.chip = h;
    return {};
  }

  function load() {
    var want = readHash();
    O.apiGet({ action: 'read' }).then(function (data) {
      if (!data || !data.success) throw new Error((data && data.message) || 'No data');
      state.all = data.entries || [];
      var when = data.published_at ? O.ago(Date.parse(data.published_at)) : null;
      $('#meta').textContent = state.all.length + ' open post' + (state.all.length === 1 ? '' : 's') + (when ? ', last added ' + when : '') + '.';
      buildFilters();
      render();
      if (want.post) focusPost(want.post);
    }).catch(function () {
      $('#meta').textContent = '';
      var list = O.clear($('#list'));
      list.appendChild(el('div', { class: 'empty' },
        el('h3', { text: 'The posts could not be loaded' }),
        el('p', { text: 'Please check your internet connection and try again.' }),
        el('button', { class: 'btn btn-navy', type: 'button', onclick: function () { location.reload(); } }, 'Try again')));
    });
  }

  function chipCount(c) {
    if (c.key === 'all') return state.all.length;
    return state.all.filter(function (e) { return c.match.indexOf(e.section) !== -1; }).length;
  }

  function buildFilters() {
    var chips = O.clear($('#chips'));
    CHIPS.forEach(function (c) {
      var n = chipCount(c);
      if (c.key !== 'all' && !n) return;
      chips.appendChild(el('button', { class: 'chip', type: 'button', 'aria-pressed': state.chip === c.key ? 'true' : 'false',
        onclick: function () { state.chip = c.key; state.shown = O.config.PAGE_SIZE; history.replaceState(null, '', c.key === 'all' ? location.pathname : '#' + c.key); syncChips(); render(); } },
        c.label, el('span', { class: 'n', text: String(n) })));
    });
    var exp = $('#f-exp');
    Array.prototype.slice.call(exp.querySelectorAll('label')).forEach(function (l) { l.remove(); });
    Object.keys(O.EXP).forEach(function (k) {
      var cb = el('input', { type: 'checkbox', value: k, onchange: function () {
        state.exp = Array.prototype.slice.call(exp.querySelectorAll('input:checked')).map(function (i) { return i.value; }); render(); } });
      exp.appendChild(el('label', { class: 'opt' }, cb, ' ' + O.EXP[k]));
    });
    var dom = $('#domain');
    Object.keys(O.DOMAINS).forEach(function (k) {
      if (!state.all.some(function (e) { return e.domain === k; })) return;
      dom.appendChild(el('option', { value: k, text: O.DOMAINS[k] }));
    });
  }
  function syncChips() {
    Array.prototype.slice.call(document.querySelectorAll('#chips .chip')).forEach(function (b, i) {
      var key = CHIPS.filter(function (c) { return c.key === 'all' || chipCount(c); })[i].key;
      b.setAttribute('aria-pressed', key === state.chip ? 'true' : 'false');
    });
  }

  function filtered() {
    var chip = CHIPS.filter(function (c) { return c.key === state.chip; })[0];
    var words = state.q.toLowerCase().split(/\s+/).filter(String);
    var list = state.all.filter(function (e) {
      if (chip && chip.match && chip.match.indexOf(e.section) === -1) return false;
      if (state.domain && e.domain !== state.domain) return false;
      if (state.exp.length && (e.section !== 'job' || state.exp.indexOf(e.exp_level) === -1)) return false;
      var hay = [e.title, e.org, e.description, (e.tags || []).join(' ')].join(' ');
      if (state.kerala && !KERALA.test(hay)) return false;
      if (words.length) { var low = hay.toLowerCase(); if (!words.every(function (w) { return low.indexOf(w) !== -1; })) return false; }
      return true;
    });
    list.sort(function (a, b) {
      if (state.sort === 'newest') return (b.added_date || '').localeCompare(a.added_date || '');
      var an = NEWSY.indexOf(a.section) !== -1, bn = NEWSY.indexOf(b.section) !== -1;
      if (an !== bn) return an ? 1 : -1;                      // deadlines first, articles after
      return (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999');
    });
    return list;
  }

  function render() {
    var keep = $('#share-strip'); if (keep && keep.parentNode) keep.parentNode.removeChild(keep);
    stripNode = keep || stripNode;
    var list = O.clear($('#list'));
    var items = filtered();
    if (!items.length) {
      list.appendChild(el('div', { class: 'empty' },
        el('h3', { text: state.all.length ? 'Nothing matches these filters' : 'No open posts right now' }),
        el('p', { text: state.all.length ? 'Try fewer words, or clear the filters.' : 'New posts are added every morning. You can also share one yourself.' }),
        state.all.length ? el('button', { class: 'btn', type: 'button', onclick: resetFilters }, 'Clear filters') : el('a', { class: 'btn btn-primary', href: 'share.html' }, 'Share a notice')));
      $('#more').hidden = true;
      return;
    }
    var strip = stripNode;
    items.slice(0, state.shown).forEach(function (e, i) {
      list.appendChild(card(e));
      if (i === 2 && strip) list.appendChild(strip);          // invite to share after a few posts
    });
    if (strip && strip.parentNode !== list) list.appendChild(strip);
    var more = $('#more');
    more.hidden = items.length <= state.shown;
    more.textContent = 'Show ' + Math.min(O.config.PAGE_SIZE, items.length - state.shown) + ' more of ' + (items.length - state.shown);
  }

  function dueBlock(e) {
    var newsy = NEWSY.indexOf(e.section) !== -1;
    var iso = newsy ? e.added_date : e.expiry_date;
    if (!iso) return el('div', { class: 'due' }, el('span', { class: 'label', text: 'Open' }));
    var p = iso.split('-');
    var left = O.daysUntil(e.expiry_date);
    var leftText = newsy ? 'posted' : left <= 0 ? 'last day today' : left === 1 ? '1 day left' : left + ' days left';
    return el('div', { class: 'due', 'aria-label': (newsy ? 'Posted ' : 'Closes ') + O.niceDate(iso) },
      el('span', { class: 'label', text: newsy ? 'Posted' : 'Closes' }),
      el('span', { class: 'd', text: String(parseInt(p[2], 10)) }),
      el('span', { class: 'm', text: O.MONTHS[parseInt(p[1], 10) - 1] }),
      el('span', { class: 'left', text: leftText }));
  }

  function card(e) {
    var newsy = NEWSY.indexOf(e.section) !== -1;
    var left = O.daysUntil(e.expiry_date);
    var soon = !newsy && left !== null && left <= 3;
    var sec = O.SECTIONS[e.section] || { long: '' };
    var link = O.safeUrl(e.link);
    var desc = el('p', { class: 'desc clamp', text: e.description || '' });
    var moreBtn = (e.description || '').length > 180 ? el('button', { class: 'more', type: 'button', 'aria-expanded': 'false', onclick: function () {
      var open = desc.classList.toggle('clamp') === false;
      this.setAttribute('aria-expanded', open ? 'true' : 'false'); this.textContent = open ? 'Show less' : 'Read more';
    } }, 'Read more') : null;

    var node = el('article', { class: 'post' + (soon ? ' soon' : ''), 'data-section': e.section, id: 'p-' + e.id },
      dueBlock(e),
      el('div', { class: 'post-body' },
        el('div', { class: 'kind' }, el('span', { text: sec.long }), e.exp_level && O.EXP[e.exp_level] ? el('span', { class: 'exp', text: O.EXP[e.exp_level] }) : null),
        el('h3', { text: e.title }),
        e.org ? el('div', { class: 'org', text: e.org }) : null,
        desc, moreBtn,
        (e.tags && e.tags.length) ? el('div', { class: 'tags' }, e.tags.map(function (t) { return el('span', { class: 'tag', text: t }); })) : null,
        e.contributor_credit ? el('div', { class: 'credit', text: 'Shared by ' + e.contributor_credit }) : null,
        el('div', { class: 'actions' },
          link ? el('a', { class: 'btn btn-navy', href: link, target: '_blank', rel: 'noopener nofollow' }, 'Official page') : null,
          // Phones get their own share sheet (WhatsApp, SMS, email...). Computers get WhatsApp and Copy link.
          canNativeShare ? el('button', { class: 'btn', type: 'button', onclick: function () { nativeShare(e); } }, 'Share') :
            el('a', { class: 'btn wa', href: waLink(e), target: '_blank', rel: 'noopener' }, 'WhatsApp'),
          canNativeShare ? null : el('button', { class: 'btn', type: 'button', onclick: function () { O.copyText(postUrl(e)).then(function () { O.toast('Link copied'); }); } }, 'Copy link'),
          el('button', { class: 'btn btn-ghost report', type: 'button', onclick: function () { openReport(e); } }, 'Report'))));
    return node;
  }

  var canNativeShare = !!navigator.share && matchMedia('(pointer: coarse)').matches;
  function shareText(e) {
    var lines = [e.title];
    if (e.org && e.title.indexOf(e.org) === -1) lines.push(e.org);
    if (NEWSY.indexOf(e.section) === -1 && e.expiry_date) lines.push('Closes: ' + O.niceDate(e.expiry_date));
    var link = O.safeUrl(e.link);
    if (link) lines.push('Official: ' + link);
    return lines.join('\n');
  }
  function nativeShare(e) {
    navigator.share({ title: e.title, text: shareText(e) + '\n\nVia SSKZM OBA Careers:', url: postUrl(e) }).catch(function () {});
  }
  function postUrl(e) { return location.origin + location.pathname + '#p=' + encodeURIComponent(e.id); }
  function waLink(e) {
    return 'https://wa.me/?text=' + encodeURIComponent(shareText(e) + '\n\nVia SSKZM OBA Careers: ' + postUrl(e));
  }

  function focusPost(id) {
    state.chip = 'all'; state.shown = 1000; syncChips(); render();
    var node = document.getElementById('p-' + id);
    if (!node) { O.toast('That post has closed or been removed.'); return; }
    node.scrollIntoView({ block: 'center' });
    node.style.outline = '3px solid var(--focus)';
    setTimeout(function () { node.style.outline = ''; }, 2500);
  }

  // ---------- Report ----------
  var reporting = null;
  function openReport(e) {
    reporting = e;
    $('#report-title').textContent = e.title;
    var dlg = $('#report-dlg');
    $('#report-form').reset();
    if (dlg.showModal) dlg.showModal(); else if (confirm('Report this post as wrong or fake?')) sendReport('Reported (no reason)');
  }
  function sendReport(reason) {
    O.apiPost({ action: 'report', id: reporting.id, reason: reason, deviceId: O.deviceId() })
      .then(function (r) { O.toast(r.message || 'Thank you.'); })
      .catch(function () { O.toast('Could not send. Please try again.'); });
  }

  function resetFilters() {
    state.chip = 'all'; state.q = ''; state.kerala = false; state.exp = []; state.domain = ''; state.sort = 'closing';
    $('#q').value = ''; $('#f-kerala').checked = false; $('#domain').value = '';
    Array.prototype.slice.call(document.querySelectorAll('#f-exp input')).forEach(function (i) { i.checked = false; });
    document.querySelector('input[name=sort][value=closing]').checked = true;
    history.replaceState(null, '', location.pathname);
    syncChips(); render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var t;
    $('#q').addEventListener('input', function () { clearTimeout(t); var v = this.value; t = setTimeout(function () { state.q = v.trim(); state.shown = O.config.PAGE_SIZE; render(); }, 180); });
    $('#f-kerala').addEventListener('change', function () { state.kerala = this.checked; render(); });
    $('#domain').addEventListener('change', function () { state.domain = this.value; render(); });
    Array.prototype.slice.call(document.querySelectorAll('input[name=sort]')).forEach(function (r) { r.addEventListener('change', function () { state.sort = this.value; render(); }); });
    $('#reset').addEventListener('click', resetFilters);
    $('#more').addEventListener('click', function () { state.shown += O.config.PAGE_SIZE; render(); });
    $('#filter-toggle').addEventListener('click', function () {
      var f = $('#filters'), open = f.classList.toggle('open');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) f.scrollIntoView({ block: 'nearest' });
    });
    $('#report-dlg').addEventListener('close', function () {
      if (this.returnValue !== 'send' || !reporting) return;
      var why = document.querySelector('#report-form input[name=why]:checked');
      sendReport(why ? why.value : 'No reason');
    });
    window.addEventListener('hashchange', function () { var w = readHash(); if (w.post) focusPost(w.post); else { syncChips(); render(); } });
    load();
  });
})();
