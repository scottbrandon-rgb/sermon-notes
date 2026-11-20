async function request(url, opts = {}) {
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const err = new Error((data && (data.message || (data.errors && data.errors[0]))) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const getSermons = () => request('/api/sermons');
export const getSermon = (slug) => request('/api/sermons/' + encodeURIComponent(slug || 'current'));

// ---- admin (password held in sessionStorage for this tab only) ----
const KEY = 'sn-admin';
export const adminPassword = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setAdminPassword = (pw) => { try { pw ? sessionStorage.setItem(KEY, pw) : sessionStorage.removeItem(KEY); } catch { /* ignore */ } };

function admin(path, { method = 'GET', body, password } = {}) {
  return request('/api/admin/' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + (password ?? adminPassword()),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

export const adminCheck = (password) => admin('session', { password });
export const adminList = () => admin('sermons');
export const adminGet = (slug) => admin('sermons/' + encodeURIComponent(slug));
export const adminPublish = (markdown, goLive) => admin('sermons', { method: 'POST', body: { markdown, goLive } });
export const adminDelete = (slug) => admin('sermons/' + encodeURIComponent(slug), { method: 'DELETE' });
export const adminSeriesImage = (series, dataUrl) => admin('series-image', { method: 'POST', body: { series, dataUrl } });
