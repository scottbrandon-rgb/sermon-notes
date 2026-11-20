// Sermon storage. Two sources, merged by date:
//   1. seed.mjs  - sermons committed in content/sermons (bundled at build time)
//   2. Netlify Blobs - sermons published through /admin (these win on the same date)
import { getStore } from '@netlify/blobs';
import seed from './seed.mjs';
import { parseSermon, validateSermon, sermonMeta } from '../../../src/lib/parse.js';
import { defaultGoLive, parseCentralLocal } from '../../../src/lib/time.js';

const store = () => getStore({ name: 'sermons', consistency: 'strong' });
const images = () => getStore({ name: 'series-images', consistency: 'strong' });

async function readIndex() {
  return (await store().get('index', { type: 'json' })) || [];
}

/** Every sermon (live and scheduled), newest first. */
export async function allEntries() {
  const index = await readIndex();
  const map = new Map();
  for (const s of seed) {
    const { markdown, ...meta } = s; // eslint-disable-line no-unused-vars
    map.set(s.slug, { ...meta, source: 'seed' });
  }
  for (const e of index) {
    if (e.deleted) map.delete(e.slug);
    else map.set(e.slug, { ...e, source: 'upload' });
  }
  return [...map.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || b.publishAt.localeCompare(a.publishAt)
  );
}

export const isLive = (entry, now = Date.now()) => Date.parse(entry.publishAt) <= now;

export async function getMarkdown(entry) {
  if (entry.source === 'upload') return store().get('md/' + entry.slug, { type: 'text' });
  const s = seed.find((x) => x.slug === entry.slug);
  return s ? s.markdown : null;
}

/** Validate and store an uploaded sermon. goLive: 'default' | 'now' | 'YYYY-MM-DDTHH:mm' (Central). */
export async function saveSermon(markdown, goLive) {
  const doc = parseSermon(markdown);
  const { errors, warnings } = validateSermon(doc);
  if (errors.length) return { errors, warnings };

  const meta = sermonMeta(doc);
  let publishAt;
  if (goLive === 'now') publishAt = new Date();
  else if (goLive && goLive !== 'default') publishAt = parseCentralLocal(goLive);
  else publishAt = defaultGoLive(meta.date);
  if (!publishAt || isNaN(publishAt)) return { errors: ['That go-live date and time is not valid.'], warnings };

  const entry = { ...meta, publishAt: publishAt.toISOString(), updatedAt: new Date().toISOString() };
  await store().set('md/' + entry.slug, markdown);
  const index = (await readIndex()).filter((e) => e.slug !== entry.slug);
  index.push(entry);
  await store().setJSON('index', index);
  return { entry: { ...entry, source: 'upload' }, warnings };
}

export async function deleteSermon(slug) {
  const index = (await readIndex()).filter((e) => e.slug !== slug);
  // A bundled sermon can't be removed from the repo here, so hide it instead.
  if (seed.some((s) => s.slug === slug)) index.push({ slug, deleted: true });
  await store().setJSON('index', index);
  await store().delete('md/' + slug);
}

export async function saveSeriesImage(seriesSlug, bytes, contentType) {
  await images().set(seriesSlug, bytes, { metadata: { contentType } });
}

export async function getSeriesImage(seriesSlug) {
  const res = await images().getWithMetadata(seriesSlug, { type: 'arrayBuffer' });
  return res ? { data: res.data, contentType: (res.metadata && res.metadata.contentType) || 'image/jpeg' } : null;
}
