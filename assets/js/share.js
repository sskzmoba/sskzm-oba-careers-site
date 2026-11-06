// Share page: photos, PDFs or typed text, sent one by one.
(function () {
  var O = window.OBA, el = O.el, $ = O.$;
  var MAX_FILES = 10, MAX_BYTES = 8 * 1024 * 1024;
  var items = [];          // {id, kind, file, name, preview, status}
  var mode = null;         // 'photo' | 'pdf' | 'text'
  var sending = false;

  function setMode(m) {
    mode = m;
    [['photo', '#pick-photo'], ['pdf', '#pick-pdf'], ['text', '#pick-text']].forEach(function (p) {
      $(p[1]).setAttribute('aria-pressed', p[0] === m ? 'true' : 'false');
    });
    $('#text-field').hidden = m !== 'text';
    if (m === 'text') $('#text').focus();
    update();
  }

  function addFiles(list, kind) {
    var skipped = 0;
    Array.prototype.slice.call(list).forEach(function (f) {
      if (items.length >= MAX_FILES) { skipped++; return; }
      if (kind === 'pdf' && !/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { skipped++; return; }
      if (kind === 'image' && !/^image\//.test(f.type)) { skipped++; return; }
      if (kind === 'pdf' && f.size > MAX_BYTES) { O.toast(f.name + ' is over 8 MB. Please send a smaller file.'); return; }
      var it = { id: Math.random().toString(36).slice(2), kind: kind, file: f, name: f.name, status: 'ready' };
      if (kind === 'image') it.preview = URL.createObjectURL(f);
      items.push(it);
    });
    if (skipped) O.toast('Some files were skipped (up to ' + MAX_FILES + ' at a time, photos or PDFs only).');
    drawThumbs(); update();
  }

  function drawThumbs() {
    var box = O.clear($('#thumbs'));
    items.forEach(function (it) {
      var label = { ready: '', working: 'Reading…', ok: 'Done', err: 'Not sent', none: 'Not added' }[it.status];
      box.appendChild(el('div', { class: 'thumb' },
        it.preview ? el('img', { src: it.preview, alt: 'Photo ' + it.name }) : el('span', { text: '📄 ' + it.name }),
        it.status === 'ready' && !sending ? el('button', { class: 'x', type: 'button', 'aria-label': 'Remove ' + it.name, onclick: function () {
          items = items.filter(function (x) { return x !== it; }); drawThumbs(); update(); } }, '×') : null,
        label ? el('span', { class: 'st ' + (it.status === 'ok' ? 'ok' : it.status === 'err' ? 'err' : ''), text: label }) : null));
    });
  }

  function update() {
    var text = $('#text').value.trim();
    var ready = items.some(function (i) { return i.status === 'ready'; }) || (mode === 'text' && text.length >= 25);
    $('#send').disabled = !ready || sending;
    $('#hint').textContent = sending ? 'Sending, please keep this page open…' :
      ready ? '' : (mode === 'text' && text.length ? 'Please add a little more detail.' : 'Choose a photo, a PDF or type the notice first.');
  }

  // Shrinks big phone photos before sending (saves mobile data, and
  // stays under the 8 MB limit). Falls back to the original file.
  function imageToBase64(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 2200, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ base64: c.toDataURL('image/jpeg', 0.86).split(',')[1], mediaType: 'image/jpeg' });
      };
      img.onerror = function () { URL.revokeObjectURL(url); fileToBase64(file).then(resolve); };
      img.src = url;
    });
  }
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve({ base64: String(r.result).split(',')[1], mediaType: file.type || 'application/octet-stream' }); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function credit() {
    var name = $('#name').value.trim(), batch = $('#batch').value.trim();
    O.store('oba_share_name', name || null); O.store('oba_share_batch', batch || null);
    return { contributor_name: name || null, contributor_batch: batch || null };
  }

  function send(e) {
    e.preventDefault();
    if (sending) return;
    sending = true; update(); drawThumbs();
    var c = credit(), results = [], queue = [];
    items.forEach(function (it) { if (it.status === 'ready') queue.push(it); });
    var text = mode === 'text' ? $('#text').value.trim() : '';
    if (text.length >= 25) queue.push({ kind: 'text', text: text, status: 'ready', name: 'Your text' });
    var status = O.clear($('#status'));
    status.appendChild(el('div', { class: 'notice' }, el('b', { text: 'Sending ' + queue.length + ' item' + (queue.length > 1 ? 's' : '') + '…' }),
      el('p', { style: 'margin:4px 0 0;color:var(--ink-2)', text: 'Reading each one takes about 10 to 30 seconds. Please keep this page open.' })));
    status.scrollIntoView({ block: 'nearest' });

    var i = 0;
    (function next() {
      if (i >= queue.length) return done(results);
      var it = queue[i++];
      it.status = 'working'; drawThumbs();
      var prep = it.kind === 'text' ? Promise.resolve({}) : it.kind === 'image' ? imageToBase64(it.file) : fileToBase64(it.file);
      prep.then(function (f) {
        var body = Object.assign({ action: 'submitNotice', kind: it.kind === 'image' ? 'image' : it.kind, deviceId: O.deviceId() }, c);
        if (it.kind === 'text') body.text = it.text; else { body.base64 = f.base64; body.mediaType = f.mediaType; }
        return O.apiPost(body);
      }).then(function (r) {
        it.status = r.success ? ((r.published && r.published.length) || r.queued ? 'ok' : 'none') : 'err';
        results.push({ item: it, res: r });
      }).catch(function () {
        it.status = 'err';
        results.push({ item: it, res: { success: false, message: 'The internet connection dropped. Please try again.' } });
      }).then(function () { drawThumbs(); next(); });
    })();
  }

  function done(results) {
    sending = false;
    var status = O.clear($('#status'));
    var added = [], notes = [];
    results.forEach(function (r) {
      (r.res.published || []).forEach(function (p) { added.push(p); });
      if (!(r.res.published && r.res.published.length)) notes.push({ name: r.item.name, msg: r.res.message || 'Not added.', ok: r.res.success });
    });
    var queued = results.some(function (r) { return r.res.queued; });
    if (added.length || queued) {
      status.appendChild(el('div', { class: 'notice ok' },
        el('h2', { text: added.length ? 'Thank you! ' + added.length + ' item' + (added.length > 1 ? 's are' : ' is') + ' now on the bulletin.' : 'Thank you! Your notice has been received.' }),
        queued && !added.length ? el('p', { style: 'margin:6px 0 0', text: 'It will appear once it has been checked, usually within a day.' }) : null));
      if (added.length) status.appendChild(el('div', { class: 'results' }, added.map(function (p) {
        return el('a', { class: 'result-item', href: 'index.html#p=' + encodeURIComponent(p.id), style: 'display:block;text-decoration:none;color:inherit' },
          el('b', { text: p.title }), el('div', { style: 'color:var(--sky);font-size:.9em', text: 'See it on the bulletin' }));
      })));
    }
    notes.forEach(function (n) {
      status.appendChild(el('div', { class: 'notice' + (n.ok ? '' : ' err'), style: 'margin-top:10px' }, el('b', { text: n.name + ': ' }), n.msg));
    });
    status.appendChild(el('div', { style: 'display:flex;gap:10px;margin-top:14px;flex-wrap:wrap' },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: resetAll }, 'Share another'),
      el('a', { class: 'btn', href: 'index.html' }, 'Go to the bulletin')));
    items = items.filter(function (it) { return it.status === 'err'; }).map(function (it) { it.status = 'ready'; return it; });
    if (results.some(function (r) { return r.item.kind === 'text' && r.res.success; })) $('#text').value = '';
    drawThumbs(); update();
    status.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function resetAll() {
    items = []; $('#text').value = ''; O.clear($('#status')); setMode(null); drawThumbs(); update();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('#pick-photo').addEventListener('click', function () { setMode('photo'); $('#file-photo').click(); });
    $('#pick-pdf').addEventListener('click', function () { setMode('pdf'); $('#file-pdf').click(); });
    $('#pick-text').addEventListener('click', function () { setMode('text'); });
    $('#file-photo').addEventListener('change', function () { addFiles(this.files, 'image'); this.value = ''; });
    $('#file-pdf').addEventListener('change', function () { addFiles(this.files, 'pdf'); this.value = ''; });
    $('#text').addEventListener('input', update);
    $('#share-form').addEventListener('submit', send);
    $('#name').value = O.store('oba_share_name') || '';
    $('#batch').value = O.store('oba_share_batch') || '';
    // Pages that receive a shared image from the phone's share sheet could
    // be added later (needs a service worker); for now people use the buttons.
    update();
  });
})();
