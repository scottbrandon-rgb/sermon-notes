// /admin: one shared password. Create series, drop in a Markdown file, preview, publish.
import {
  adminCheck, adminList, adminGet, adminPublish, adminDelete, adminSeriesList, adminCreateSeries,
  adminDeleteSeries, adminSeriesImage, adminPassword, setAdminPassword
} from '../lib/api.js';
import { parseSermon, validateSermon, slugify, withSeries } from '../lib/parse.js';
import { longDate, defaultGoLive, toCentralLocal, shortDate } from '../lib/time.js';
import { esc, icon } from '../lib/html.js';
import { seriesImageHtml, wireImageFallbacks } from '../lib/img.js';
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

const errText = (e) => (e && e.data && e.data.errors && e.data.errors.join(' ')) || (e && e.message) || 'Something went wrong.';

export function mountAdmin(root) {
  document.title = 'Admin · Sermon Notes';
  let robots = document.querySelector('meta[name=robots]');
  if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
  robots.content = 'noindex';
  wireImageFallbacks(root);

  const S = {
    phase: adminPassword() ? 'loading' : 'login',
    error: '',
    list: [],           // sermons
    series: [],         // series, including ones with no sermons yet
    draft: null,        // { md, doc, v, fileName }
    useSeries: '',      // slug chosen to override the file's series
    goLive: 'default',  // default | now | custom
    custom: '',
    busy: false,
    message: null,      // { kind, html }
    showPreview: false,
    previewOther: null, // a scheduled sermon opened from the list
    imgBust: Date.now(),
    ns: { open: false, name: '', file: null, error: '' }
  };
  let cleanupReader = null;

  const bounce = (e) => {
    if (e && e.status === 401) { setAdminPassword(''); S.phase = 'login'; S.error = 'Please sign in again.'; return true; }
    return false;
  };

  async function refresh() {
    try {
      const [a, b] = await Promise.all([adminList(), adminSeriesList()]);
      S.list = a.sermons;
      S.series = b.series;
    } catch (e) {
      if (!bounce(e)) S.message = { kind: 'error', html: esc(errText(e)) };
    }
  }

  async function start() {
    if (S.phase !== 'loading') return render();
    try { await adminCheck(); S.phase = 'dash'; await refresh(); }
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

  // The series this draft will be filed under, if any.
  function chosenSeries(doc) {
    if (S.useSeries) return S.series.find((s) => s.slug === S.useSeries) || null;
    return S.series.find((s) => s.slug === slugify(doc.fm.series)) || null;
  }

  function seriesCheckView(doc) {
    const chosen = chosenSeries(doc);
    if (chosen) {
      const moved = S.useSeries && slugify(doc.fm.series) !== chosen.slug;
      return `<div class="msg ok"><b>Series:</b> ${esc(chosen.name)}${moved ? ` <span>(the file says “${esc(doc.fm.series)}”; it will be filed under ${esc(chosen.name)})</span>` : ''}</div>`;
    }
    const options = S.series.map((s) => `<option value="${esc(s.slug)}">${esc(s.name)}</option>`).join('');
    return `<div class="msg warn"><b>There’s no series called “${esc(doc.fm.series)}” yet.</b> The file’s front matter says <code>series: ${esc(doc.fm.series)}</code>.
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px">
        <button class="btn small" type="button" data-act="create-from-file"${S.busy ? ' disabled' : ''}>Create “${esc(doc.fm.series)}”</button>
        ${S.series.length ? `<span>or</span><label class="sr-only" for="use-series">Use an existing series</label>
        <select id="use-series" data-use-series style="min-height:44px;padding:0 10px;border:1px solid var(--muted);border-radius:4px;background:#fff;font:inherit">
          <option value="">Use an existing series…</option>${options}</select>` : ''}
      </div></div>`;
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
    const chosen = chosenSeries(doc);
    const replaces = S.list.find((s) => s.slug === doc.fm.date);
    const defTime = defaultGoLive(doc.fm.date);
    const defPast = defTime.getTime() <= Date.now();
    const customVal = S.custom || toCentralLocal(defTime);

    return `<div class="card">
      <p class="label">${esc(d.fileName)}</p>
      <div><h2>${esc(doc.title)}</h2>
        <div class="sum"><span>${esc(chosen ? chosen.name : doc.fm.series)}</span><span>${esc(longDate(doc.fm.date))}</span><span>${points} point${points === 1 ? '' : 's'}</span><span>${doc.blanks.length} blank${doc.blanks.length === 1 ? '' : 's'}</span></div></div>
      ${seriesCheckView(doc)}
      ${doc.reminder ? `<div class="msg ok"><b>Reminder box:</b> ${esc(doc.reminder.text)}${doc.reminder.href ? ` (button: “${esc(doc.reminder.label)}”)` : ''}</div>` : '<div class="sum"><span>No reminder box this week.</span></div>'}
      ${msgs}
      ${replaces ? `<div class="msg warn">A sermon is already posted for ${esc(longDate(doc.fm.date))} (“${esc(replaces.title)}”). Publishing will replace it.</div>` : ''}

      <fieldset style="border:0;padding:0;margin:0"><legend class="label" style="padding:0 0 6px">When should it go live?</legend>
        <label class="radio"><input type="radio" name="golive" value="default"${S.goLive === 'default' ? ' checked' : ''}>
          <span>${defPast ? 'Right away' : 'Sunday morning'} <span style="color:var(--muted)">(${defPast ? 'its 5:00 AM Central start has already passed' : fmtWhen(defTime.toISOString())})</span></span></label>
        <label class="radio"><input type="radio" name="golive" value="now"${S.goLive === 'now' ? ' checked' : ''}><span>Publish now <span style="color:var(--muted)">(replaces what people see at the main link)</span></span></label>
        <label class="radio"><input type="radio" name="golive" value="custom"${S.goLive === 'custom' ? ' checked' : ''}><span>Pick a date and time</span></label>
        ${S.goLive === 'custom' ? `<div class="field" style="margin-left:30px"><label class="label" for="custom">Central time</label><input id="custom" type="datetime-local" value="${esc(customVal)}"></div>` : ''}
      </fieldset>

      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">
        <button class="btn secondary" type="button" data-act="preview">${S.showPreview ? 'Hide preview' : 'Preview'}</button>
        <button class="btn" type="button" data-act="publish"${S.busy || !chosen ? ' disabled' : ''}>${S.busy ? 'Publishing…' : 'Publish'}</button>
        <button class="btn secondary" type="button" data-act="cancel">Cancel</button>
        ${chosen ? '' : '<span class="sum">Choose a series to continue.</span>'}
      </div>
    </div>
    ${S.showPreview ? '<div class="preview-frame" data-preview></div>' : ''}`;
  }

  function seriesView() {
    const ns = S.ns;
    const form = ns.open ? `<form class="card" data-form="new-series" style="border:2px solid var(--ink)" autocomplete="off">
        <h3 style="margin:0;font-family:var(--display);font-size:18px">New series</h3>
        <div class="field"><label class="label" for="ns-name">Series name</label>
          <input id="ns-name" type="text" value="${esc(ns.name)}" placeholder="For example, Advent" maxlength="80" required></div>
        <div class="field"><span class="label">Header image <span style="font-weight:400;text-transform:none;letter-spacing:0">(optional, best at 16:9)</span></span>
          <label class="btn secondary small filebtn" style="align-self:flex-start">${icon('photo', 18)}<span>${ns.file ? esc(ns.file.name) : 'Choose image'}</span>
            <input type="file" accept="image/*" data-ns-file></label></div>
        ${ns.error ? `<div class="msg error" role="alert">${esc(ns.error)}</div>` : ''}
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" type="submit"${S.busy ? ' disabled' : ''}>${S.busy ? 'Creating…' : 'Create series'}</button>
          <button class="btn secondary" type="button" data-act="ns-cancel">Cancel</button></div>
      </form>` : '';
    const rows = S.series.length
      ? S.series.map((s) => `<div class="series-row">
          <span class="thumb-sm">${seriesImageHtml(s.slug, { alt: '', bust: S.imgBust })}</span>
          <div class="info"><b>${esc(s.name)}</b>
            <span class="sum"><span>${s.total === 0 ? 'No sermons yet' : s.total + ' sermon' + (s.total === 1 ? '' : 's')}</span>${s.latestDate ? `<span>Latest ${esc(shortDate(s.latestDate))}</span>` : ''}</span></div>
          <label class="btn secondary small filebtn">Change image<input type="file" accept="image/*" data-series-img="${esc(s.slug)}"></label>
          ${s.total === 0 ? `<button class="btn danger small" type="button" data-act="delete-series" data-slug="${esc(s.slug)}" data-name="${esc(s.name)}">Delete</button>` : ''}
        </div>`).join('')
      : '<p>No series yet. Create one to get started.</p>';
    return `<section class="card" aria-labelledby="series-title">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <h2 id="series-title">Series</h2>
        <button class="btn small" type="button" data-act="ns-open"${ns.open ? ' hidden' : ''}>${icon('plus', 16)}<span>New series</span></button></div>
      ${form}${rows}</section>`;
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
      ${seriesView()}
      <section class="card" aria-labelledby="list-title"><h2 id="list-title">Sermons</h2>${listView()}</section>
      <p><a href="/" data-link>Back to the sermon notes</a></p></div>`;
  }

  // ---------- render ----------
  function render() {
    if (cleanupReader) { cleanupReader(); cleanupReader = null; }
    const page = S.phase === 'login' ? loginView() : S.phase === 'loading' ? '<div class="center-msg"><p>Loading…</p></div>' : dashView();
    root.innerHTML = `<div class="page">${page}</div>`;

    const mounts = [];
    const prev = root.querySelector('[data-preview]');
    if (prev && S.draft && !S.draft.v.errors.length) {
      const chosen = chosenSeries(S.draft.doc);
      const md = chosen ? withSeries(S.draft.md, chosen.name) : S.draft.md;
      mounts.push(mountReader(prev, {
        slug: S.draft.doc.fm.date, markdown: md,
        seriesSlug: chosen ? chosen.slug : slugify(S.draft.doc.fm.series),
        seriesName: chosen ? chosen.name : S.draft.doc.fm.series, isCurrent: true
      }, { preview: true }));
    }
    const other = root.querySelector('[data-preview-other]');
    if (other && S.previewOther) mounts.push(mountReader(other, S.previewOther, { preview: true }));
    if (mounts.length) cleanupReader = () => mounts.forEach((m) => m());
  }

  // ---------- actions ----------
  async function chooseFile(file) {
    if (!file) return;
    const md = await file.text();
    const doc = parseSermon(md);
    S.draft = { md, doc, v: validateSermon(doc), fileName: file.name };
    S.useSeries = '';
    S.goLive = 'default';
    S.custom = '';
    S.message = null;
    S.showPreview = false;
    render();
    const el = root.querySelectorAll('.card')[1];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function setSeriesImage(slug, file) {
    if (!file) return;
    try {
      const { dataUrl, w, h } = await toJpegDataUrl(file);
      await adminSeriesImage(slug, dataUrl);
      S.imgBust = Date.now();
      const off = Math.abs(w / h - 16 / 9) > 0.15;
      S.message = { kind: off ? 'warn' : 'ok', html: off ? 'Image saved. Heads up: it isn’t 16:9, so it will be cropped.' : 'Image saved.' };
    } catch (e) {
      if (!bounce(e)) S.message = { kind: 'error', html: 'That image didn’t upload: ' + esc(errText(e)) };
    }
    render();
  }

  async function createSeries(name, file) {
    S.busy = true; render();
    try {
      const { series } = await adminCreateSeries(name);
      let note = '';
      if (file) {
        try { const { dataUrl } = await toJpegDataUrl(file); await adminSeriesImage(series.slug, dataUrl); S.imgBust = Date.now(); }
        catch (e) { note = ' The image didn’t upload, so add it with Change image.'; }
      }
      S.ns = { open: false, name: '', file: null, error: '' };
      S.message = { kind: 'ok', html: `Created the series “${esc(series.name)}”.${note}` };
      await refresh();
    } catch (e) {
      if (!bounce(e)) {
        if (S.ns.open) S.ns.error = errText(e); else S.message = { kind: 'error', html: esc(errText(e)) };
      }
    }
    S.busy = false; render();
  }

  async function publish() {
    const d = S.draft;
    if (!d || S.busy) return;
    const goLive = S.goLive === 'custom' ? (S.custom || toCentralLocal(defaultGoLive(d.doc.fm.date))) : S.goLive;
    S.busy = true; render();
    try {
      const res = await adminPublish(d.md, goLive, S.useSeries);
      const s = res.sermon;
      S.message = {
        kind: 'ok',
        html: s.status === 'live'
          ? `Published “${esc(s.title)}”. It’s live now. <a href="/sermons/${esc(s.slug)}" data-link>View it</a>`
          : `Saved “${esc(s.title)}”. It goes live ${esc(fmtWhen(s.publishAt))}.`
      };
      S.draft = null;
      await refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      if (!bounce(e)) {
        S.message = { kind: 'error', html: esc(errText(e)) };
        if (e.data && e.data.error === 'unknown_series') await refresh();
      }
    }
    S.busy = false; render();
  }

  root.addEventListener('submit', async (e) => {
    const form = e.target.dataset.form;
    if (!form) return;
    e.preventDefault();
    if (form === 'login') {
      const pw = new FormData(e.target).get('pw');
      S.busy = true; S.error = ''; render();
      try { await adminCheck(pw); setAdminPassword(pw); S.phase = 'dash'; S.busy = false; await refresh(); }
      catch (err) { S.busy = false; S.error = err.status === 401 ? 'That password is not right.' : err.message; }
      render();
    } else if (form === 'new-series') {
      if (S.busy) return;
      S.ns.error = '';
      await createSeries(S.ns.name, S.ns.file);
    }
  });

  root.addEventListener('input', (e) => {
    if (e.target.id === 'ns-name') S.ns.name = e.target.value;
  });

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-file]')) chooseFile(t.files[0]);
    else if (t.matches('[data-ns-file]')) { S.ns.file = t.files[0] || null; render(); }
    else if (t.matches('[data-series-img]')) setSeriesImage(t.dataset.seriesImg, t.files[0]);
    else if (t.matches('[data-use-series]')) { S.useSeries = t.value; render(); }
    else if (t.name === 'golive') { S.goLive = t.value; render(); }
    else if (t.id === 'custom') S.custom = t.value;
  });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'publish') publish();
    else if (act === 'cancel') { S.draft = null; S.useSeries = ''; render(); }
    else if (act === 'preview') { S.showPreview = !S.showPreview; render(); }
    else if (act === 'signout') { setAdminPassword(''); S.phase = 'login'; S.draft = null; S.message = null; render(); }
    else if (act === 'close-other') { S.previewOther = null; render(); }
    else if (act === 'ns-open') { S.ns = { open: true, name: '', file: null, error: '' }; render(); document.getElementById('ns-name')?.focus(); }
    else if (act === 'ns-cancel') { S.ns = { open: false, name: '', file: null, error: '' }; render(); }
    else if (act === 'create-from-file') { if (S.draft && !S.busy) await createSeries(S.draft.doc.fm.series, null); }
    else if (act === 'view') {
      try { S.previewOther = await adminGet(b.dataset.slug); render(); root.querySelector('[data-preview-other]')?.scrollIntoView({ behavior: 'smooth' }); }
      catch (err) { S.message = { kind: 'error', html: esc(err.message) }; render(); }
    } else if (act === 'delete') {
      if (!window.confirm(`Unpublish “${b.dataset.title}”? People will no longer be able to open it.`)) return;
      try { await adminDelete(b.dataset.slug); S.message = { kind: 'ok', html: 'Unpublished.' }; await refresh(); }
      catch (err) { S.message = { kind: 'error', html: esc(err.message) }; }
      render();
    } else if (act === 'delete-series') {
      if (!window.confirm(`Delete the series “${b.dataset.name}”? It has no sermons.`)) return;
      try { await adminDeleteSeries(b.dataset.slug); S.message = { kind: 'ok', html: 'Series deleted.' }; await refresh(); }
      catch (err) { S.message = { kind: 'error', html: esc(errText(err)) }; }
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

  start();
  return function cleanup() {
    if (cleanupReader) cleanupReader();
    robots.content = '';
  };
}
