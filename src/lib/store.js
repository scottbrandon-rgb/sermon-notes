// A person's notes live in their own browser (localStorage), one record per sermon.
// Nothing about what they type is sent to a server.

const PREFIX = 'sn:v1:';

export function loadNotes(slug) {
  try {
    const raw = localStorage.getItem(PREFIX + slug);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

export function saveNotes(slug, state) {
  try {
    localStorage.setItem(PREFIX + slug, JSON.stringify({ ...state, updatedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** { slug: {filled, notes, updatedAt} } for every sermon this device has notes for. */
export function savedSummary() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const slug = key.slice(PREFIX.length);
      const data = loadNotes(slug);
      if (!data) continue;
      const filled = Object.keys(data.status || {}).length;
      const notes = Object.values(data.notes || {}).filter((n) => String(n).trim()).length;
      if (filled || notes) out[slug] = { filled, notes, updatedAt: data.updatedAt || 0 };
    }
  } catch { /* storage unavailable */ }
  return out;
}

export function storageAvailable() {
  try {
    const k = PREFIX + 'probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** Browsers that open links from other apps with their own, sometimes temporary, storage. */
export function inAppBrowser() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|GSA\/|; wv\)/i.test(ua);
}
