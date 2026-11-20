// /admin: one shared password, drop in a Markdown file, preview, publish.
import {
  adminCheck, adminList, adminGet, adminPublish, adminDelete, adminSeriesImage,
  adminPassword, setAdminPassword
} from '../lib/api.js';
import { parseSermon, validateSermon, slugify } from '../lib/parse.js';
import { longDate, defaultGoLive, toCentralLocal } from '../lib/time.js';
import { esc } from '../lib/html.js';
import { mountReader } from './reader.js';

const fmtWhen = (iso) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  }) + ' Central';

// Shrink a chosen image to a web-friendly JPEG before uploading.
async function toJpegDataUrl(file, maxW = 1600) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height };
}

export function mountAdmin(root) {
  document.title = 'Admin · Sermon Notes';
  let robots = document.querySelector('meta[name=robots]');
  if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
  robots.content = 'noindex';

  const S = {
    phase: adminPassword() ? 'loading' : 'login',
    error: '',
    list: [],
    draft: null,        // { md, doc, v, fileName }
    goLive: 'default',  // default | now | custom
    custom: '',
    busy: false,
    message: null,      // { kind, html }
    showPreview: false,
    previewOther: null, // a scheduled sermon opened from the list
    imgBust: Date.now(),
    imgNote: ''
  };
  let cleanupReader = null;

  async function refreshList() {
    try { S.list = (await adminList()).sermons; }
    catch (e) { if (e.status === 401) { setAdminPassword(''); S.phase = 'login'; S.error = 'Please sign in again.'; } else S.message = { kind: 'error', html: esc(e.message) }; }
  }

  async function start() {
    if (S.phase !== 'loading') return render();
    try { await adminCheck(); S.phase = 'dash'; await refreshList(); }
    catch (e) { setAdminPassword(''); S.phase = 'login'; if (e.status !== 401) S.error = e.message; }
    render();
  }

  // ---------- views ----------
  function loginView() {
    return `<div class="plain">
      <div style="display:flex;flex-direction:column;gap:8px"><p class="eyebrow">Sermon notes</p><h1>Admin</h1></div>
      <form class="card" data-form="login" autocomplete="off">
        <div class="field"><label class="label" for="pw">Password</label>
          <input id="pw" type="password" name="pw" autocomplete="current-password" required></div>
        ${S.error ? `<div class="msg error" role="alert">${esc(S.error)}</div>` : ''}
        <button class="btn" type="submit"${S.busy ? ' disabled' : ''}>${S.busy ? 'Checking…' : 'Sign in'}</button>
      </form>
      <p><a href="/" data-link>Back to the sermon notes</a></p></div>`;
  }

  function draftView() {
    const d = S.draft;
    if (!d) return '';
    const { doc, v } = d;
    const msgs = [
      v.errors.length ? `<div class="msg error" role="alert"><b>Fix these before publishing:</b><ul>${v.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '',
      v.warnings.length ? `<div class="msg warn"><b>Worth a look:</b><ul>${v.warnings.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''
    ].join('');
    if (v.errors.length) return `<div class="card"><p class="label">${esc(d.fileName)}</p>${msgs}</div>`;

    const points = doc.sections.filter((s) => s.isPoint).length;
    const dateOk = doc.fm.date;
    const seriesSlug = slugify(doc.fm.series);
    const replaces = S.list.find((s) => s.slug === doc.fm.date);
    const defTime = defaultGoLive(doc.fm.date);
    const defPast = defTime.getTime() <= Date.now();
    const customVal = S.custom || toCentralLocal(defTime);

    return `<div class="card">
      <p class="label">${esc(d.fileName)}</p>
      <div><h2>${esc(doc.title)}</h2>
        <div class="sum"><span>${esc(doc.fm.series)}</span><span>${esc(longDate(dateOk))}</span><span>${points} point${points === 1 ? '' : 's'}</span><span>${doc.blanks.length} blank${doc.blanks.length === 1 ? '' : 's'}</span></div></div>
      ${doc.reminder ? `<div class="msg ok"><b>Reminder box:</b> ${esc(doc.reminder.text)}${doc.reminder.href ? ` (button: “${esc(doc.reminder.label)}”)` : ''}</div>` : '<div class="sum"><span>No reminder box this week.</span></div>'}
      ${msgs}
      ${replaces ? `<div class="msg warn">A sermon is already posted for ${esc(longDate(dateOk))} (“${esc(replaces.title)}”). Publishing will replace it.</div>` : ''}

      <fieldset style="border:0;padding:0;margin:0"><legend class="label" style="padding:0 0 6px">When should it go live?</legend>
        <label class="radio"><input type="radio" name="golive" value="default"${S.goLive === 'default' ? ' checked' : ''}>
          <span>${defPast ? 'Right away' : 'Sunday morning'} <span style="color:var(--muted)">(${defPast ? 'its 5:00 AM Central start has already passed' : fmtWhen(defTime.toISOString())})</span></span></label>
        <label class="radio"><input type="radio" name="golive" value="now"${S.goLive === 'now' ? ' checked' : ''}><span>Publish now <span style="color:var(--muted)">(replaces what people see at the main link)</span></span></label>
        <label class="radio"><input type="radio" name="golive" value="custom"${S.goLive === 'custom' ? ' checked' : ''}><span>Pick a date and time</span></label>
        ${S.goLive === 'custom' ? `<div class="field" style="margin-left:30px"><label class="label" for="custom">Central time</label><input id="custom" type="datetime-local" value="${esc(customVal)}"></div>` : ''}
      </fieldset>

      <div class="field"><p class="label">Series header image: ${esc(doc.fm.series)}</p>
        <img class="series-thumb" src="/api/series-image/${esc(seriesSlug)}?t=${S.imgBust}" data-fallback="/series/${esc(seriesSlug)}.jpg" alt="Current header image for this series">
        <p class="sum" data-img-none hidden>No header image for this series yet. The page will show text only.</p>
        <label class="btn secondary small" style="align-self:flex-start;cursor:pointer">Choose image<input type="file" accept="image/*" data-series-image style="position:absolute;width:1px;height:1px;opacity:0"></label>
        <p class="sum">Best at 16:9, like 1600 × 900. It’s shared by every sermon in this series.${S.imgNote ? ' ' + esc(S.imgNote) : ''}</p></div>

      <div style="display:flex;flex-wrap:wrap;gap:12px">
        <button class="btn secondary" type="button" data-act="preview">${S.showPreview ? 'Hide preview' : 'Preview'}</button>
        <button class="btn" type="button" data-act="publish"${S.busy ? ' disabled' : ''}>${S.busy ? 'Publishing…' : 'Publish'}</button>
        <button class="btn secondary" type="button" data-act="cancel">Cancel</button>
      </div>
    </div>
    ${S.showPreview ? '<div class="preview-frame" data-preview></div>' : ''}`;
  }

  function listView() {
    if (!S.list.length) return '<p>No sermons yet.</p>';
    return S.list.map((s) => `<div class="admin-row">
      <div><span class="badge ${s.status === 'live' ? 'live' : ''}">${s.status === 'live' ? 'Live' : 'Scheduled · ' + esc(fmtWhen(s.publishAt))}</span>
        <div style="font-family:var(--display);font-weight:700;font-size:18px;line-height:1.3;margin-top:6px">${esc(s.title)}</div>
        <div class="sum"><span>${esc(s.series)}</span><span>${esc(longDate(s.date))}</span></div></div>
      <div class="actions">
        ${s.status === 'live' ? `<a class="btn secondary small" href="/sermons/${esc(s.slug)}" data-link>View</a>` : `<button class="btn secondary small" type="button" data-act="view" data-slug="${esc(s.slug)}">Preview</button>`}
        <button class="btn danger small" type="button" data-act="delete" data-slug="${esc(s.slug)}" data-title="${esc(s.title)}">Unpublish</button>
      </div></div>`).join('');
  }

  function dashView() {
    return `<div class="plain">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div style="display:flex;flex-direction:column;gap:8px"><p class="eyebrow">Sermon notes</p><h1>Admin</h1></div>
        <button class="btn secondary small" type="button" data-act="signout">Sign out</button></div>
      ${S.message ? `<div class="msg ${S.message.kind}" role="status">${S.message.html}</div>` : ''}
      <section class="card" aria-labelledby="up-title">
        <h2 id="up-title">Publish a sermon</h2>
        <p style="color:var(--muted)">Drop in the sermon’s app notes file (.md). The date, series and reminder come from its front matter.</p>
        <label class="dropzone" data-drop><span class="label">Choose a Markdown file</span><span style="color:var(--muted)">or drag it here</span>
          <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" data-file></label>
      </section>
      ${draftView()}
      ${S.previewOther ? `<div style="display:flex;justify-content:space-between;align-items:center"><h2>Preview: ${esc(S.previewOther.title)}</h2><button class="btn secondary small" type="button" data-act="close-other">Close</button></div><div class="preview-frame" data-preview-other></div>` : ''}
      <section class="card" aria-labelledby="list-title"><h2 id="list-title">Sermons</h2>${listView()}</section>
      <p><a href="/" data-link>Back to the sermon notes</a></p></div>`;
  }

  // ---------- render ----------
  function render() {
    if (cleanupReader) { cleanupReader(); cleanupReader = null; }
    const page = S.phase === 'login' ? loginView() : S.phase === 'loading' ? '<div class="center-msg"><p>Loading…</p></div>' : dashView();
    root.innerHTML = `<div class="page">${page}</div>`;

    const none = root.querySelector('[data-img-none]');
    if (none) root.querySelector('.series-thumb').addEventListener('error', function onErr() {
      const img = this;
      if (img.dataset.fallback) { const fb = img.dataset.fallback; img.dataset.fallback = ''; img.src = fb; }
      else { img.style.display = 'none'; none.hidden = false; }
    });

    const mounts = [];
    const prev = root.querySelector('[data-preview]');
    if (prev && S.draft && !S.draft.v.errors.length) {
      mounts.push(mountReader(prev, {
        slug: S.draft.doc.fm.date, markdown: S.draft.md, series: S.draft.doc.fm.series,
        seriesSlug: slugify(S.draft.doc.fm.series), isCurrent: true
      }, { preview: true }));
    }
    const other = root.querySelector('[data-preview-other]');
    if (other && S.previewOther) {
      mounts.push(mountReader(other, S.previewOther, { preview: true }));
    }
    if (mounts.length) cleanupReader = () => mounts.forEach((m) => m());
  }

  // ---------- actions ----------
  async function chooseFile(file) {
    if (!file) return;
    const md = await file.text();
    const doc = parseSermon(md);
    const v = validateSermon(doc);
    S.draft = { md, doc, v, fileName: file.name };
    S.goLive = 'default';
    S.custom = '';
    S.message = null;
    S.showPreview = false;
    S.imgNote = '';
    render();
    const el = root.querySelector('.card + .card, .card:nth-of-type(2)');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function publish() {
    const d = S.draft;
    if (!d || S.busy) return;
    const goLive = S.goLive === 'custom' ? (S.custom || toCentralLocal(defaultGoLive(d.doc.fm.date))) : S.goLive;
    S.busy = true; render();
    try {
      const res = await adminPublish(d.md, goLive);
      const s = res.sermon;
      const live = s.status === 'live';
      S.message = {
        kind: 'ok',
        html: live
          ? `Published “${esc(s.title)}”. It’s live now. <a href="/sermons/${esc(s.slug)}" data-link>View it</a>`
          : `Saved “${esc(s.title)}”. It goes live ${esc(fmtWhen(s.publishAt))}.`
      };
      S.draft = null;
      await refreshList();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      if (e.status === 401) { setAdminPassword(''); S.phase = 'login'; S.error = 'Please sign in again.'; }
      else S.message = { kind: 'error', html: esc((e.data && e.data.errors && e.data.errors.join(' ')) || e.message) };
    }
    S.busy = false; render();
  }

  async function uploadImage(file) {
    if (!file || !S.draft) return;
    try {
      const { dataUrl, w, h } = await toJpegDataUrl(file);
      await adminSeriesImage(S.draft.doc.fm.series, dataUrl);
      S.imgBust = Date.now();
      const ratio = w / h;
      S.imgNote = Math.abs(ratio - 16 / 9) > 0.15 ? 'Saved. Heads up: this image isn’t 16:9, so it will be cropped.' : 'Saved.';
    } catch (e) {
      S.imgNote = 'That image didn’t upload: ' + e.message;
    }
    render();
  }

  root.addEventListener('submit', async (e) => {
    if (e.target.dataset.form !== 'login') return;
    e.preventDefault();
    const pw = new FormData(e.target).get('pw');
    S.busy = true; S.error = ''; render();
    try { await adminCheck(pw); setAdminPassword(pw); S.phase = 'dash'; S.busy = false; await refreshList(); }
    catch (err) { S.busy = false; S.error = err.status === 401 ? 'That password is not right.' : err.message; }
    render();
  });

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-file]')) chooseFile(t.files[0]);
    else if (t.matches('[data-series-image]')) uploadImage(t.files[0]);
    else if (t.name === 'golive') { S.goLive = t.value; render(); }
    else if (t.id === 'custom') S.custom = t.value;
  });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'publish') publish();
    else if (act === 'cancel') { S.draft = null; render(); }
    else if (act === 'preview') { S.showPreview = !S.showPreview; render(); }
    else if (act === 'signout') { setAdminPassword(''); S.phase = 'login'; S.draft = null; S.message = null; render(); }
    else if (act === 'close-other') { S.previewOther = null; render(); }
    else if (act === 'view') {
      try { S.previewOther = await adminGet(b.dataset.slug); render(); document.querySelector('[data-preview-other]')?.scrollIntoView({ behavior: 'smooth' }); }
      catch (err) { S.message = { kind: 'error', html: esc(err.message) }; render(); }
    } else if (act === 'delete') {
      if (!window.confirm(`Unpublish “${b.dataset.title}”? People will no longer be able to open it.`)) return;
      try { await adminDelete(b.dataset.slug); S.message = { kind: 'ok', html: 'Unpublished.' }; await refreshList(); }
      catch (err) { S.message = { kind: 'error', html: esc(err.message) }; }
      render();
    }
  });

  // drag and drop a file anywhere on the drop zone
  root.addEventListener('dragover', (e) => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  root.addEventListener('dragleave', (e) => { const z = e.target.closest('[data-drop]'); if (z) z.classList.remove('over'); });
  root.addEventListener('drop', (e) => {
    const z = e.target.closest('[data-drop]');
    if (!z) return;
    e.preventDefault();
    z.classList.remove('over');
    chooseFile(e.dataTransfer.files[0]);
  });

  // thumbnail fallbacks need render() to have run first
  start();
  return function cleanup() {
    if (cleanupReader) cleanupReader();
    robots.content = '';
  };
}
