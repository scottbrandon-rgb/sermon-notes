import './styles.css';
import { getSermon } from './lib/api.js';
import { mountReader } from './views/reader.js';

const app = document.getElementById('app');
let cleanup = null;
let renderId = 0;

// Every page gets its own container, so a page's event listeners go away with it.
function freshRoot() {
  const el = document.createElement('div');
  app.replaceChildren(el);
  return el;
}

function message(html) {
  freshRoot().innerHTML = `<div class="page"><div class="center-msg">${html}</div></div>`;
}

async function reader(slug) {
  const id = renderId;
  message('<p>Loading this week’s notes…</p>');
  let sermon;
  try {
    sermon = await getSermon(slug);
  } catch (err) {
    if (id !== renderId) return;
    document.title = 'Sermon Notes · Harrison Faith Church';
    if (err.status === 404) {
      message(slug
        ? `<h1 style="font-family:var(--display);margin:0">We couldn’t find that sermon</h1><p>The link may be old or mistyped.</p><a class="btn" href="/" data-link>Go to this week’s notes</a>`
        : `<h1 style="font-family:var(--display);margin:0">No sermon is posted yet</h1><p>Check back Sunday morning.</p>`);
    } else {
      message(`<h1 style="font-family:var(--display);margin:0">We couldn’t load the notes</h1><p>Check your connection and try again.</p><button class="btn" type="button" onclick="location.reload()">Try again</button>`);
    }
    return;
  }
  if (id !== renderId) return;
  cleanup = mountReader(freshRoot(), sermon);
}

async function route() {
  renderId++;
  const id = renderId;
  if (cleanup) { cleanup(); cleanup = null; }
  window.scrollTo(0, 0);
  const path = decodeURIComponent(location.pathname).replace(/\/+$/, '') || '/';

  if (path === '/') return reader('');
  let m;
  if ((m = path.match(/^\/sermons\/([\w-]+)$/))) return reader(m[1]);
  if (path === '/sermons') {
    const { mountSermons } = await import('./views/sermons.js');
    if (id !== renderId) return;
    const c = await mountSermons(freshRoot());
    if (id === renderId) cleanup = c; else c();
    return;
  }
  if ((m = path.match(/^\/series\/([\w-]+)$/))) {
    const { mountSeries } = await import('./views/series.js');
    if (id !== renderId) return;
    const c = await mountSeries(freshRoot(), m[1]);
    if (id === renderId) cleanup = c; else c();
    return;
  }
  if (path === '/archive') { history.replaceState({}, '', '/sermons'); return route(); }
  if (path === '/admin') {
    const { mountAdmin } = await import('./views/admin.js');
    if (id !== renderId) return;
    cleanup = mountAdmin(freshRoot());
    return;
  }
  document.title = 'Not found · Sermon Notes';
  message(`<h1 style="font-family:var(--display);margin:0">Page not found</h1><a class="btn" href="/" data-link>Go to this week’s notes</a>`);
}

// In-app navigation for links marked data-link.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[data-link]');
  if (!a || a.target === '_blank') return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  if (url.pathname + url.search !== location.pathname + location.search) history.pushState({}, '', url.pathname + url.search);
  route();
});
window.addEventListener('popstate', route);

route();
