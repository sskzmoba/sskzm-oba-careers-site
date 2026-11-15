// Mentors page: email-code login, profiles, requests, inbox.
(function () {
  var O = window.OBA, el = O.el, $ = O.$;
  var TOKEN_KEY = 'oba_m_token';
  var me = null, options = null, mentors = [], pollTimer = null, openThreadId = null;

  function token() { return O.store(TOKEN_KEY); }
  function call(action, body) {
    return O.apiPost(Object.assign({ action: action, token: token() }, body || {})).then(function (r) {
      if (r && r.code === 'login') { O.store(TOKEN_KEY, null); showOut(); O.toast('Please log in again.'); throw new Error('login'); }
      return r;
    });
  }
  function initials(name) { return String(name || '?').split(/\s+/).filter(String).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''); }

  // ---------- Public stats ----------
  function loadStats() {
    O.apiPost({ action: 'm_publicStats' }).then(function (s) {
      var box = O.clear($('#m-stats'));
      if (!s || !s.success) return;
      var fields = Object.keys(s.byField || {}).length;
      var plural = function (n, one, many) { return n === 1 ? one : many; };
      box.appendChild(el('span', {}, el('b', { text: String(s.mentors) }), plural(s.mentors, 'mentor', 'mentors')));
      if (fields) box.appendChild(el('span', {}, el('b', { text: String(fields) }), plural(fields, 'area', 'areas')));
      if (s.conversations) box.appendChild(el('span', {}, el('b', { text: String(s.conversations) }), plural(s.conversations, 'conversation so far', 'conversations so far')));
    }).catch(function () {});
  }

  // ---------- Login ----------
  function showOut() {
    stopPoll();
    $('#view-out').hidden = false; $('#view-in').hidden = true;
    document.body.classList.remove('m-in');
  }
  function loginErr(msg) { var b = $('#login-err'); b.textContent = msg || ''; b.hidden = !msg; }

  function sendCode(e) {
    e.preventDefault(); loginErr('');
    var email = $('#email').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { loginErr('Please check the email address.'); return; }
    var btn = $('#send-code'); btn.disabled = true; btn.textContent = 'Sending…';
    O.apiPost({ action: 'm_requestCode', email: email }).then(function (r) {
      btn.disabled = false; btn.textContent = 'Email me a code';
      if (!r.success) { loginErr(r.message); return; }
      O.store('oba_m_email', email);
      $('#code-msg').textContent = r.message;
      $('#login-form').hidden = true; $('#code-form').hidden = false; $('#code').focus();
    }).catch(function () { btn.disabled = false; btn.textContent = 'Email me a code'; loginErr('Could not connect. Please try again.'); });
  }
  function verify(e) {
    e.preventDefault(); loginErr('');
    var code = $('#code').value.replace(/\D/g, '');
    if (code.length !== 6) { loginErr('The code has 6 digits.'); return; }
    O.apiPost({ action: 'm_verifyCode', email: $('#email').value.trim(), code: code }).then(function (r) {
      if (!r.success) { loginErr(r.message); return; }
      O.store(TOKEN_KEY, r.token);
      $('#code').value = ''; $('#code-form').hidden = true; $('#login-form').hidden = false;
      start();
    }).catch(function () { loginErr('Could not connect. Please try again.'); });
  }

  // ---------- Logged in ----------
  function start() {
    if (!token()) { showOut(); return; }
    call('m_me').then(function (r) {
      if (!r.success) { showOut(); return; }
      me = r; options = r.options;
      $('#view-out').hidden = true; $('#view-in').hidden = false;
      document.body.classList.add('m-in');
      $('#hello').textContent = 'Welcome, ' + r.member.name + (r.member.batch ? ' (' + r.member.batch + ')' : '') + '.';
      setUnread(r.unread);
      fillProfileForm();
      var want = (location.hash.match(/^#(find|inbox|profile)/) || [])[1];
      showTab(!r.profile ? 'profile' : (want || (r.unread ? 'inbox' : 'find')));
    }).catch(function () {});
  }
  function setUnread(n) { var b = $('#unread'); b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n || ''); }

  function showTab(name) {
    ['find', 'inbox', 'profile'].forEach(function (t) {
      $('#tab-' + t).setAttribute('aria-selected', t === name ? 'true' : 'false');
      $('#pane-' + t).hidden = t !== name;
    });
    history.replaceState(null, '', '#' + name);
    stopPoll();
    if (name === 'find') loadMentors();
    if (name === 'inbox') { $('#thread').hidden = true; $('#inbox').hidden = false; loadInbox(); }
  }

  // ---------- Find ----------
  function loadMentors() {
    var list = O.clear($('#mentor-list'));
    if (me && !me.profile) { list.appendChild(el('div', { class: 'empty' }, el('p', { text: 'Set up your profile first, then you can send requests.' }), el('button', { class: 'btn btn-primary', type: 'button', onclick: function () { showTab('profile'); } }, 'Set up my profile'))); return; }
    list.appendChild(el('div', { class: 'skeleton' })); list.appendChild(el('div', { class: 'skeleton' }));
    call('m_listMentors', { field: $('#m-field').value, q: $('#m-q').value.trim() }).then(function (r) {
      O.clear(list);
      mentors = r.mentors || [];
      if (!mentors.length) {
        list.appendChild(el('div', { class: 'empty' }, el('h3', { text: 'No mentors match yet' }),
          el('p', { text: 'The circle is just starting. Try another area, or offer to mentor yourself from “My profile”.' })));
        return;
      }
      mentors.forEach(function (m) { list.appendChild(mentorCard(m)); });
    }).catch(function () {});
  }

  function mentorCard(m) {
    var btn;
    if (m.my_thread) btn = el('button', { class: 'btn', type: 'button', onclick: function () { showTab('inbox'); openThread(m.my_thread.id); } }, m.my_thread.status === 'pending' ? 'Request sent: view' : 'Open conversation');
    else if (!me.profile || !me.profile.is_mentee) btn = el('button', { class: 'btn', type: 'button', onclick: function () { showTab('profile'); O.toast('Tick “I would like guidance” to send requests.'); } }, 'Ask for guidance');
    else btn = el('button', { class: 'btn btn-navy', type: 'button', disabled: !m.has_room, onclick: function () { openRequest(m); } }, m.has_room ? 'Ask for guidance' : 'Fully booked for now');
    return el('article', { class: 'mentor' },
      el('div', { class: 'top' }, el('div', { class: 'avatar', 'aria-hidden': 'true', text: initials(m.name) }),
        el('div', { class: 'who' }, el('b', { text: m.name }), el('span', { text: 'Batch ' + m.batch + (m.city ? ', ' + m.city : '') }))),
      m.headline ? el('div', { class: 'headline', text: m.headline }) : null,
      el('div', {}, m.fields.map(function (f) { return el('span', { class: 'pill', text: f }); }),
        el('span', { class: 'pill ' + (m.has_room ? 'room' : 'full'), text: m.has_room ? 'Has time' : 'Full' })),
      m.offers.length ? el('div', { style: 'color:var(--ink-2);font-size:.92em', text: 'Can help with: ' + m.offers.join(', ') }) : null,
      m.bio ? el('p', { class: 'bio', text: m.bio }) : null,
      el('div', { style: 'color:var(--ink-3);font-size:.88em', text: [m.availability, m.modes.length ? 'Prefers: ' + m.modes.join(', ') : ''].filter(String).join('. ') }),
      btn);
  }

  var requesting = null;
  function openRequest(m) {
    requesting = m;
    $('#req-who').textContent = 'To ' + m.name + ', batch ' + m.batch + (m.headline ? '. ' + m.headline : '');
    $('#req-topic').value = ''; $('#req-msg').value = me.profile && me.profile.seeking ? me.profile.seeking : '';
    $('#req-err').hidden = true;
    var kinds = O.clear($('#req-kinds'));
    Object.keys(options.kinds).forEach(function (k, i) {
      kinds.appendChild(el('label', { class: 'choice' }, el('input', { type: 'radio', name: 'kind', value: k, checked: i === 0 }), options.kinds[k]));
    });
    $('#req-dlg').showModal();
  }
  function sendRequest(e) {
    if (!e.submitter || e.submitter.value !== 'send') return;      // Cancel closes normally
    e.preventDefault();
    var kind = (document.querySelector('#req-kinds input:checked') || {}).value || 'quick';
    var btn = $('#req-send'); btn.disabled = true;
    call('m_request', { mentorId: requesting.id, topic: $('#req-topic').value.trim(), kind: kind, message: $('#req-msg').value.trim() }).then(function (r) {
      btn.disabled = false;
      if (!r.success) { var b = $('#req-err'); b.textContent = r.message; b.hidden = false; return; }
      $('#req-dlg').close();
      O.toast(r.message);
      loadMentors();
    }).catch(function () { btn.disabled = false; });
  }

  // ---------- Inbox ----------
  var STATUS = { pending: 'Waiting for reply', active: 'Active', declined: 'Declined', closed: 'Closed', withdrawn: 'Withdrawn', expired: 'No reply', left: 'Member left' };
  function loadInbox() {
    var box = O.clear($('#inbox'));
    call('m_inbox').then(function (r) {
      var threads = r.threads || [];
      setUnread(threads.reduce(function (a, t) { return a + t.unread; }, 0));
      if (!threads.length) { box.appendChild(el('div', { class: 'empty' }, el('h3', { text: 'No conversations yet' }), el('p', { text: 'Requests you send or receive will appear here.' }))); return; }
      box.appendChild(el('div', { class: 'inbox' }, threads.map(function (t) {
        return el('button', { class: 'inbox-item' + (t.unread ? ' unread' : ''), type: 'button', onclick: function () { openThread(t.id); } },
          el('div', { class: 'avatar', 'aria-hidden': 'true', text: initials(t.other.name), style: 'width:44px;height:44px;font-size:.95rem' }),
          el('div', { class: 't' }, el('b', { text: t.other.name + (t.other.batch ? ' (' + t.other.batch + ')' : '') }),
            el('span', { text: (t.role === 'mentor' ? 'You are mentoring. ' : '') + t.topic }),
            el('span', { text: t.snippet })),
          el('div', { style: 'text-align:right' }, el('span', { class: 'status ' + t.status, text: STATUS[t.status] || t.status }),
            t.unread ? el('div', {}, el('span', { class: 'badge', text: String(t.unread) })) : el('div', { style: 'font-size:.78rem;color:var(--ink-3);margin-top:4px', text: O.ago(t.updated_at) })));
      })));
    }).catch(function () {});
  }

  function openThread(id) {
    openThreadId = id;
    $('#inbox').hidden = true;
    var box = O.clear($('#thread')); box.hidden = false;
    box.appendChild(el('div', { class: 'skeleton' }));
    renderThread(id, true);
    startPoll();
  }

  function renderThread(id, scroll) {
    return call('m_thread', { threadId: id }).then(function (r) {
      if (id !== openThreadId) return;
      var box = O.clear($('#thread'));
      if (!r.success) { box.appendChild(el('p', { class: 'notice err', text: r.message })); return; }
      var t = r.thread, o = r.other;
      box.appendChild(el('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { openThreadId = null; stopPoll(); showTab('inbox'); } }, '‹ All conversations'));
      var wrap = el('div', { class: 'thread' });
      wrap.appendChild(el('div', { class: 'thread-head' },
        el('div', { class: 'avatar', 'aria-hidden': 'true', text: initials(o ? o.name : '?') }),
        el('div', { style: 'flex:1;min-width:0' }, el('b', { text: o ? o.name + ' (' + o.batch + ')' : 'Former member' }),
          el('div', { style: 'color:var(--ink-3);font-size:.9em', text: t.topic + (t.kindLabel ? '. ' + t.kindLabel : '') })),
        el('span', { class: 'status ' + t.status, text: STATUS[t.status] || t.status })));
      if (t.role === 'mentor' && o && o.seeking) wrap.appendChild(el('div', { class: 'notice', style: 'font-size:.95em' }, el('b', { text: 'Looking for: ' }), o.seeking));
      if (o && o.phone) wrap.appendChild(el('div', { class: 'phone-box' }, o.name + ' shared their mobile: ', el('a', { href: 'tel:' + o.phone.replace(/\s/g, ''), text: o.phone })));

      var msgs = el('div', { class: 'msgs', id: 'msgs' });
      r.messages.forEach(function (m) {
        msgs.appendChild(el('div', { class: 'bubble ' + (m.mine ? 'mine' : 'theirs') }, m.body, el('time', { text: O.ago(m.at) })));
      });
      wrap.appendChild(msgs);

      if (t.status === 'pending' && t.role === 'mentor') {
        var reply = el('textarea', { placeholder: 'Optional: a short reply (for example, a good time to talk)', maxlength: '2000', style: 'min-height:80px' });
        wrap.appendChild(el('div', { class: 'panel' }, el('b', { text: 'Will you take this up?' }), reply,
          el('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' },
            el('button', { class: 'btn btn-primary', type: 'button', onclick: function () { respond(id, true, reply.value); } }, 'Accept'),
            el('button', { class: 'btn', type: 'button', onclick: function () { respond(id, false, reply.value); } }, 'Not this time'))));
      } else if (t.status === 'pending') {
        wrap.appendChild(el('p', { class: 'notice', text: 'Your request has been sent. You will get an email when ' + (o ? o.name : 'the mentor') + ' replies. Requests with no reply close after 3 weeks.' }));
      } else if (t.status === 'active') {
        var ta = el('textarea', { id: 'compose', placeholder: 'Write a message', maxlength: '2000', 'aria-label': 'Message' });
        var sendBtn = el('button', { class: 'btn btn-navy', type: 'button', onclick: function () {
          var text = ta.value.trim(); if (!text) return;
          sendBtn.disabled = true;
          call('m_send', { threadId: id, body: text }).then(function (x) {
            sendBtn.disabled = false;
            if (!x.success) { O.toast(x.message); return; }
            ta.value = ''; renderThread(id, true);
          }).catch(function () { sendBtn.disabled = false; });
        } }, 'Send');
        wrap.appendChild(el('div', { class: 'composer' }, ta, sendBtn));
      }

      var actions = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });
      if (t.status === 'active') actions.appendChild(el('button', { class: 'btn', type: 'button', onclick: function () {
        call('m_sharePhone', { threadId: id, share: !t.i_shared_phone }).then(function (x) {
          if (!x.success) { O.toast(x.message); if (x.code === 'nophone') showTab('profile'); return; }
          O.toast(x.shared ? 'Your mobile number is now visible in this conversation.' : 'Your mobile number is hidden again.');
          renderThread(id);
        });
      } }, t.i_shared_phone ? 'Hide my mobile' : 'Share my mobile'));
      if (t.status === 'active' || t.status === 'pending') actions.appendChild(el('button', { class: 'btn', type: 'button', onclick: function () {
        if (!confirm(t.status === 'pending' && t.role === 'mentee' ? 'Withdraw this request?' : 'Close this conversation? You can always send a new request later.')) return;
        call('m_close', { threadId: id }).then(function () { renderThread(id); });
      } }, t.status === 'pending' && t.role === 'mentee' ? 'Withdraw request' : 'Close conversation'));
      actions.appendChild(el('button', { class: 'btn btn-ghost', type: 'button', onclick: function () {
        var why = prompt('Tell the OBA team, in confidence, what is wrong:');
        if (!why) return;
        call('m_report', { threadId: id, reason: why }).then(function (x) { O.toast(x.message); });
      } }, 'Report'));
      wrap.appendChild(actions);
      box.appendChild(wrap);
      if (scroll) msgs.scrollTop = msgs.scrollHeight;
      if (scroll) call('m_me').then(function (x) { if (x.success) setUnread(x.unread); });   // badge catches up after reading
    }).catch(function () {});
  }

  function respond(id, accept, message) {
    call('m_respond', { threadId: id, accept: accept, message: message.trim() }).then(function (r) {
      if (!r.success) { O.toast(r.message); return; }
      O.toast(accept ? 'Accepted. You can now message each other.' : 'Declined politely. Thank you for replying.');
      renderThread(id, true);
    });
  }

  // Checks for new messages every 20 seconds while a conversation is open
  // and the page is visible. Not live chat, just a gentle refresh.
  function startPoll() {
    stopPoll();
    pollTimer = setInterval(function () {
      if (document.hidden || !openThreadId) return;
      var ta = document.getElementById('compose');
      if (ta && ta === document.activeElement && ta.value) return;   // do not redraw while typing
      var msgs = document.getElementById('msgs');
      var atBottom = msgs && msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 40;
      renderThread(openThreadId, atBottom);
    }, 20000);
  }
  function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  // ---------- Profile ----------
  function checks(container, list, selected, name, max) {
    var box = O.clear($(container));
    list.forEach(function (v) {
      var cb = el('input', { type: 'checkbox', name: name, value: v, checked: selected.indexOf(v) !== -1 });
      if (max) cb.addEventListener('change', function () {
        var on = box.querySelectorAll('input:checked');
        if (on.length > max) { this.checked = false; O.toast('Please pick up to ' + max + '.'); }
      });
      box.appendChild(el('label', {}, cb, v));
    });
  }
  function picked(container) { return Array.prototype.slice.call(document.querySelectorAll(container + ' input:checked')).map(function (i) { return i.value; }); }

  function fillProfileForm() {
    var p = me.profile || { fields: [], offers: [], modes: ['Messages here'] };
    $('#profile-h').textContent = me.profile ? 'Your mentors profile' : 'Set up your profile';
    $('#p-mentor').checked = !!p.is_mentor; $('#p-mentee').checked = me.profile ? !!p.is_mentee : true;
    checks('#p-fields', options.fields, p.fields || [], 'fields', 4);
    checks('#p-offers', options.offers, p.offers || [], 'offers');
    checks('#p-modes', options.modes, p.modes || [], 'modes');
    $('#p-headline').value = p.headline || ''; $('#p-org').value = p.organisation || ''; $('#p-city').value = p.city || '';
    $('#p-bio').value = p.bio || ''; $('#p-seeking').value = p.seeking || ''; $('#p-phone').value = p.phone || '';
    $('#p-cap').value = p.capacity || 3;
    if (p.availability) $('#p-avail').value = p.availability;
    $('#p-consent').checked = !!me.profile;
    $('#profile-actions').hidden = !me.profile;
    $('#pause').textContent = me.profile && me.profile.status === 'paused' ? 'List me again' : 'Pause my listing';
    toggleSections();
  }
  function toggleSections() {
    $('#mentor-fields').hidden = !$('#p-mentor').checked;
    $('#mentee-fields').hidden = !$('#p-mentee').checked;
  }
  function saveProfile(e) {
    e.preventDefault();
    var msg = O.clear($('#profile-msg'));
    var body = {
      consent: $('#p-consent').checked,
      profile: {
        is_mentor: $('#p-mentor').checked, is_mentee: $('#p-mentee').checked,
        fields: picked('#p-fields'), offers: picked('#p-offers'), modes: picked('#p-modes'),
        headline: $('#p-headline').value, organisation: $('#p-org').value, city: $('#p-city').value, bio: $('#p-bio').value,
        availability: $('#p-avail').value, capacity: $('#p-cap').value, seeking: $('#p-seeking').value, phone: $('#p-phone').value
      }
    };
    call('m_saveProfile', body).then(function (r) {
      msg.appendChild(el('p', { class: 'notice ' + (r.success ? 'ok' : 'err'), text: r.message }));
      if (r.success) call('m_me').then(function (x) { me = x; fillProfileForm(); loadStats(); });
    }).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('#lm-link').href = O.config.LIFE_MEMBERSHIP_URL;
    $('#email').value = O.store('oba_m_email') || '';
    $('#login-form').addEventListener('submit', sendCode);
    $('#code-form').addEventListener('submit', verify);
    $('#change-email').addEventListener('click', function () { $('#code-form').hidden = true; $('#login-form').hidden = false; loginErr(''); });
    $('#logout').addEventListener('click', function () { call('m_logout').catch(function () {}); O.store(TOKEN_KEY, null); me = null; showOut(); });
    ['find', 'inbox', 'profile'].forEach(function (t) { $('#tab-' + t).addEventListener('click', function () { showTab(t); }); });
    var tq; $('#m-q').addEventListener('input', function () { clearTimeout(tq); tq = setTimeout(loadMentors, 350); });
    $('#m-field').addEventListener('change', loadMentors);
    $('#req-form').addEventListener('submit', sendRequest);
    $('#profile-form').addEventListener('submit', saveProfile);
    $('#p-mentor').addEventListener('change', toggleSections);
    $('#p-mentee').addEventListener('change', toggleSections);
    $('#pause').addEventListener('click', function () {
      var paused = me.profile && me.profile.status === 'paused';
      call('m_setStatus', { status: paused ? 'active' : 'paused' }).then(function (r) { O.toast(r.message); call('m_me').then(function (x) { me = x; fillProfileForm(); }); });
    });
    $('#delete-me').addEventListener('click', function () {
      if (!confirm('Delete your mentors profile and every message you wrote? This cannot be undone.')) return;
      call('m_deleteMe', { confirm: 'DELETE' }).then(function (r) { O.toast(r.message); O.store(TOKEN_KEY, null); showOut(); loadStats(); });
    });
    // Field filter options come from the server list, so they always match.
    O.apiPost({ action: 'm_options' }).then(function (r) {
      if (!r || !r.success) return;
      var sel = $('#m-field');
      r.fields.forEach(function (f) { sel.appendChild(el('option', { value: f, text: f })); });
    }).catch(function () {});
    loadStats();
    start();
  });
})();
