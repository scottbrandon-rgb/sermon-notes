// The page people use on Sunday: fill in blanks, take notes, export.
import { parseSermon } from '../lib/parse.js';
import { refHref, refLabel, isScripture } from '../lib/ref.js';
import { longDate } from '../lib/time.js';
import { exportModel, toText, fileSafe } from '../lib/export.js';
import { loadNotes, saveNotes, storageAvailable, inAppBrowser } from '../lib/store.js';
import { esc, icon } from '../lib/html.js';
import { SHOW_ARCHIVE_LINK, CHURCH_NAME } from '../config.js';

// ---------- checking blanks ----------
const norm = (x) =>
  String(x).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// One typo is fine for words of five letters or more.
function near(a, b) {
  if (b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length] <= 1;
}

export function grade(value, answer) {
  const a = norm(value);
  const b = norm(answer);
  return a === b || near(a, b) ? 'correct' : 'corrected';
}

/**
 * @param root     element to render into
 * @param sermon   { slug, markdown, series, seriesSlug, isCurrent? }
 * @param opts     { preview: true } renders without saving anything
 * @returns cleanup function
 */
export function mountReader(root, sermon, { preview = false } = {}) {
  const doc = parseSermon(sermon.markdown);
  const slug = sermon.slug;
  const seriesSlug = sermon.seriesSlug || '';
  const saved = preview ? null : loadNotes(slug);
  const state = { vals: {}, status: {}, guesses: {}, notes: {}, ...(saved || {}) };
  const answers = Object.fromEntries(doc.blanks.map((b) => [b.id, b.ans]));
  const tokenOf = {};
  const collect = (tokens) => tokens.forEach((t) => { if (t.type === 'blank') tokenOf[t.id] = t; });
  doc.sections.forEach((s) => { collect(s.tokens || []); s.items.forEach((i) => collect(i.tokens || [])); });
  // Forget saved answers for blanks that no longer exist (the sermon file was edited).
  ['status', 'guesses', 'vals'].forEach((k) => Object.keys(state[k]).forEach((id) => { if (!(id in answers)) delete state[k][id]; }));

  const total = doc.blanks.length;
  const canShare = typeof navigator.share === 'function';

  // ---------- html ----------
  function blankHtml(tok) {
    const st = state.status[tok.id];
    if (!st) {
      const size = Math.max(tok.text.length + 1, 5);
      return `<input type="text" class="blank-input" data-blank="${tok.id}" size="${size}" value="${esc(state.vals[tok.id] || '')}" aria-label="Blank. Type the missing word." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">`;
    }
    const guess = state.guesses[tok.id];
    const sr = st === 'correct' ? ' (correct)' : guess ? ` (corrected; you wrote ${guess})` : ' (filled in)';
    const tip = st === 'corrected' ? ` title="${esc(guess ? 'You wrote: ' + guess : 'Filled in for you')}"` : '';
    return `<span class="blank-done ${st}"${tip}>${icon(st === 'correct' ? 'check' : 'undo', 12, 'currentColor', 3)}${esc(tok.text)}<span class="sr-only">${esc(sr)}</span></span>`;
  }

  const seg = (tokens) =>
    tokens
      .map((t) =>
        t.type === 'blank' ? blankHtml(t)
          : t.type === 'em' ? `<strong>${esc(t.text)}</strong>`
          : t.type === 'it' ? `<em>${esc(t.text)}</em>`
          : `<span>${esc(t.text)}</span>`)
      .join('');

  function citeHtml(it) {
    if (!it.cite) return '';
    if (isScripture(it.cite)) {
      return `<a class="cite-link" href="${esc(refHref(it.cite))}" target="_blank" rel="noopener">${icon('book', 14)}<span>${esc(refLabel(it.cite))}</span></a>`;
    }
    const parts = it.citeTokens.map((t) => (t.type === 'it' ? `<cite>${esc(t.text)}</cite>` : `<span>${esc(t.text)}</span>`)).join('');
    return `<p class="cite"><span>— </span>${parts}</p>`;
  }

  function itemHtml(it) {
    if (it.type === 'scripture') {
      return `<li class="scripture"><a class="scripture-card" href="${esc(refHref(it.ref))}" target="_blank" rel="noopener">
        <span class="ref">${icon('book', 18)}<span>${esc(refLabel(it.ref))}</span></span>
        <span class="go"><span>Read it</span>${icon('out', 16)}</span></a></li>`;
    }
    return `<li><span class="diamond" aria-hidden="true"></span><div class="line"><p>${seg(it.tokens)}</p>${citeHtml(it)}</div></li>`;
  }

  function sectionHtml(sec, si) {
    const aria = sec.isPoint ? 'Point ' + sec.n + (sec.kicker ? ': ' + sec.kicker : '') : sec.raw;
    const head = sec.isPoint
      ? `<p class="kicker"><span class="num" aria-hidden="true">${esc(sec.n)}</span><span>${esc(sec.kicker || 'Point ' + sec.n)}</span></p>`
      : `<p class="eyebrow respond">${icon('heart', 24, 'var(--muted)')}<span>Respond</span></p>`;
    const note = sec.hasNote
      ? `<div class="note"><label class="label" for="note-${si + 1}">${icon('pencil', 18, 'var(--muted)')}<span>${sec.isPoint ? 'My notes · Point ' + esc(sec.n) : 'My response'}</span></label>
          <textarea id="note-${si + 1}" data-note="${si}" rows="4" placeholder="${sec.isPoint ? 'What stood out? A question, a prayer, a next step…' : 'Write your answer to God here…'}">${esc(state.notes[si] || '')}</textarea></div>`
      : '';
    return `<section class="sec" aria-label="${esc(aria)}">
      <div class="sec-head">${head}<h2 class="point">${seg(sec.tokens)}</h2></div>
      ${sec.items.length ? `<ul class="items">${sec.items.map(itemHtml).join('')}</ul>` : ''}
      ${note}</section>`;
  }

  const reminderHtml = doc.reminder
    ? `<section class="reminder-wrap" aria-labelledby="reminder-title"><div class="reminder">
        <h2 id="reminder-title">A reminder</h2>
        <div class="row">${icon('calendar', 24, 'var(--muted)')}<p>${esc(doc.reminder.text)}</p></div>
        ${doc.reminder.href ? `<a class="btn" href="${esc(doc.reminder.href)}" target="_blank" rel="noopener"><span>${esc(doc.reminder.label)}</span>${icon('arrow')}</a>` : ''}
      </div></section>`
    : '';

  const menuItem = (action, ic, title, sub, hidden = false) =>
    `<button type="button" class="menu-item" data-action="${action}"${hidden ? ' hidden' : ''}>${icon(ic, 22, 'var(--muted)')}<span class="t"><b>${title}</b><span>${sub}</span></span></button>`;

  const notices = [];
  if (sermon.isCurrent === false) {
    notices.push(`<div class="notice" role="note"><span>This is an earlier sermon. <a href="/" data-link>Go to this week’s notes</a></span></div>`);
  }
  if (!preview && !storageAvailable()) {
    notices.push(`<div class="notice" role="alert"><span>This browser can’t save your notes (private browsing?). Export them before you leave.</span></div>`);
  } else if (!preview && inAppBrowser()) {
    notices.push(`<div class="notice" data-dismiss role="note"><span>Tip: your notes save in the browser you’re using now. For the most reliable saving, open this page in Safari or Chrome.</span><button type="button" data-action="dismiss">Got it</button></div>`);
  }

  root.innerHTML = `
    <div class="page">
      ${seriesSlug ? `<header><img class="series-img" src="/api/series-image/${esc(seriesSlug)}" data-fallback="/series/${esc(seriesSlug)}.jpg" alt="${esc(doc.fm.series || '')} sermon series"></header>` : ''}
      ${notices.join('')}
      <div class="bar">
        <div class="bar-row">
          <div class="bar-text"><span class="eyebrow">Sermon notes</span><span class="bar-count" data-count></span></div>
          <button type="button" class="btn export-btn" id="menu-btn" aria-expanded="false" aria-controls="export-menu">${icon('upload')}<span>Export</span></button>
          <div class="menu" id="export-menu" hidden>
            <p class="eyebrow menu-title">Save or send your notes</p>
            ${menuItem('share', 'share', 'Share…', 'Messages, Mail, Notes, and more', !canShare)}
            ${menuItem('email', 'mail', 'Email my notes', 'Opens your mail app, ready to send')}
            ${menuItem('sms', 'chat', 'Text them to me', 'Opens Messages with your notes')}
            ${menuItem('copy', 'copy', 'Copy to clipboard', 'Paste into Notes, Obsidian, anywhere')}
            ${menuItem('pdf', 'download', 'Save as PDF', 'A clean copy with the series graphic')}
          </div>
        </div>
        <div class="progress" role="progressbar" aria-label="Blanks filled" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="0"><div></div></div>
      </div>
      <main>
        <section class="intro">
          <div class="stack">
            <p class="eyebrow">${esc(doc.fm.series || '')}</p>
            <h1 class="title">${esc(doc.title)}</h1>
            <p class="date">${esc(longDate(doc.fm.date))}</p>
          </div>
          ${doc.refs.length ? `<div class="stack"><p class="label">Today’s scripture</p><div class="chips">${doc.refs
            .map((r) => `<a class="chip" href="${esc(refHref(r))}" target="_blank" rel="noopener">${icon('book', 16, 'var(--muted)')}<span>${esc(refLabel(r))}</span></a>`)
            .join('')}</div></div>` : ''}
        </section>
        ${reminderHtml}
        ${doc.sections.map(sectionHtml).join('')}
        <section class="band" aria-labelledby="done-title">
          <div class="stack" style="display:flex;flex-direction:column;gap:8px">
            <p class="eyebrow">Keep what you heard</p>
            <h2 id="done-title">Done taking notes?</h2>
            <p>Send them to yourself so they’re there Monday morning, or share them with your Life Group.</p>
          </div>
          <button type="button" class="btn" data-action="share"${canShare ? '' : ' hidden'}>${icon('share')}<span>Share my notes</span></button>
          <div class="band-grid">
            <button type="button" class="btn" data-action="email">${icon('mail')}<span>Email</span></button>
            <button type="button" class="btn" data-action="sms">${icon('chat')}<span>Text</span></button>
            <button type="button" class="btn ghost" data-action="copy">${icon('copy')}<span>Copy</span></button>
            <button type="button" class="btn ghost" data-action="pdf">${icon('download')}<span>PDF</span></button>
          </div>
          ${total ? '<button type="button" class="linkish" data-action="fill">Fill in any blanks I missed</button>' : ''}
          <p class="toast" aria-live="polite" data-toast></p>
        </section>
      </main>
      <footer class="foot">
        <b>${esc(CHURCH_NAME)}</b>
        <span>Your notes save automatically on this device. To keep them, export them using the options above.</span>
        ${SHOW_ARCHIVE_LINK && !preview ? '<a href="/archive" data-link>Past sermons</a>' : ''}
      </footer>
    </div>`;

  // ---------- behavior ----------
  const $ = (sel) => root.querySelector(sel);
  const bar = $('.progress > div');
  const progress = $('.progress');
  const count = $('[data-count]');
  const toastEl = $('[data-toast]');
  const menu = $('#export-menu');
  const menuBtn = $('#menu-btn');

  function updateProgress() {
    const filled = doc.blanks.filter((b) => state.status[b.id]).length;
    const pct = total ? Math.round((filled / total) * 100) : 0;
    bar.style.width = pct + '%';
    progress.setAttribute('aria-valuenow', String(filled));
    count.textContent = total ? `${filled} of ${total} blanks filled` : 'Take notes below';
    if (!total) progress.hidden = true;
  }

  let saveTimer = null;
  function persist() {
    if (preview) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    saveNotes(slug, { vals: state.vals, status: state.status, guesses: state.guesses, notes: state.notes });
  }
  function queueSave() {
    if (preview) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  }
  const flush = () => { if (saveTimer) persist(); };
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onHide);

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.textContent = ''; }, 6000);
  }

  function settle(input) {
    const id = input.dataset.blank;
    const v = input.value.trim();
    if (!v) return;
    state.status[id] = grade(v, answers[id]);
    state.guesses[id] = v;
    input.outerHTML = blankHtml(tokenOf[id]);
    updateProgress();
    persist();
  }

  root.addEventListener('focusout', (e) => {
    if (e.target.matches && e.target.matches('.blank-input')) settle(e.target);
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('.blank-input')) { state.vals[t.dataset.blank] = t.value; queueSave(); }
    else if (t.matches('textarea[data-note]')) { state.notes[t.dataset.note] = t.value; queueSave(); }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.blank-input')) { e.preventDefault(); e.target.blur(); }
    if (e.key === 'Escape' && !menu.hidden) { closeMenu(); menuBtn.focus(); }
  });

  function fillRest() {
    let filledForThem = 0;
    root.querySelectorAll('.blank-input').forEach((input) => {
      const id = input.dataset.blank;
      const v = input.value.trim();
      if (v) { state.status[id] = grade(v, answers[id]); state.guesses[id] = v; }
      else { state.status[id] = 'corrected'; filledForThem++; }
      input.outerHTML = blankHtml(tokenOf[id]);
    });
    updateProgress();
    persist();
    toast(filledForThem ? `Filled in ${filledForThem} blank${filledForThem === 1 ? '' : 's'}.` : 'Every blank is already filled.');
  }

  // ----- export -----
  const model = () => exportModel(doc, state);
  const text = () => toText(model());
  const enc = encodeURIComponent;

  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      if (!ok) throw new Error('copy failed');
    }
  }

  // The series graphic as a JPEG for the PDF, or null if it didn't load.
  function headerForPdf() {
    const img = $('.series-img');
    if (!img || !img.complete || !img.naturalWidth) return null;
    try {
      const c = document.createElement('canvas');
      c.width = Math.min(img.naturalWidth, 1000);
      c.height = Math.round(c.width * (img.naturalHeight / img.naturalWidth));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return { dataUrl: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height };
    } catch {
      return null;
    }
  }

  async function savePdf() {
    toast('Making your PDF…');
    try {
      const { buildPdf } = await import('../lib/pdf.js');
      const blob = buildPdf(model(), headerForPdf());
      const name = fileSafe(doc.title) + '-notes.pdf';
      const file = new File([blob], name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: doc.title });
          toast('');
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') { toast(''); return; }
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      toast('Your PDF is ready. Check your downloads.');
    } catch (err) {
      console.error(err);
      toast('Sorry, the PDF didn’t work. Try Copy or Email instead.');
    }
  }

  const actions = {
    async share() {
      try {
        await navigator.share({ title: doc.title + ' · Sermon Notes', text: text() });
      } catch (err) {
        if (!err || err.name !== 'AbortError') toast('Sharing didn’t work. Try Copy or Email instead.');
      }
    },
    email() { window.location.href = 'mailto:?subject=' + enc('Sermon notes: ' + doc.title) + '&body=' + enc(text()); },
    sms() { window.location.href = 'sms:?&body=' + enc(text()); },
    async copy() {
      try { await copyText(text()); toast('Notes copied. Paste them anywhere.'); }
      catch { toast('Copying didn’t work here. Try Share or Email instead.'); }
    },
    pdf: savePdf,
    fill: fillRest,
    dismiss(btn) { const n = btn.closest('.notice'); if (n) n.remove(); }
  };

  function closeMenu() { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  function toggleMenu() {
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) { closeMenu(); flush(); const fn = actions[btn.dataset.action]; if (fn) fn(btn); return; }
    if (e.target.closest('#menu-btn')) toggleMenu();
  });
  const onDocClick = (e) => { if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu(); };
  document.addEventListener('click', onDocClick);

  // Header image: uploaded one first, then the bundled one, then no image at all.
  const img = $('.series-img');
  if (img) {
    img.addEventListener('error', () => {
      const fb = img.dataset.fallback;
      if (fb && img.getAttribute('src') !== fb) { img.dataset.fallback = ''; img.setAttribute('src', fb); }
      else img.closest('header').remove();
    });
  }

  updateProgress();
  if (!preview) document.title = `${doc.title} · Sermon Notes`;

  return function cleanup() {
    flush();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onHide);
    document.removeEventListener('click', onDocClick);
    clearTimeout(toastTimer);
  };
}
