// Sermon storage. Two sources, merged by date:
//   1. seed.mjs  - sermons committed in content/sermons (bundled at build time)
//   2. Netlify Blobs - sermons published through /admin (these win on the same date)
// Series records (name + created date) and series header images live in Blobs too.
import { getStore } from '@netlify/blobs';
import seed from './seed.mjs';
import { parseSermon, validateSermon, sermonMeta, slugify, withSeries } from '../../../src/lib/parse.js';
import { defaultGoLive, parseCentralLocal } from '../../../src/lib/time.js';
import { summarizeSeries } from '../../../src/lib/series.js';

const store = () => getStore({ name: 'sermons', consistency: 'strong' });
const images = () => getStore({ name: 'series-images', consistency: 'strong' });

async function readIndex() {
  return (await store().get('index', { type: 'json' })) || [];
}
async function readSeriesRecords() {
  return (await store().get('series', { type: 'json' })) || [];
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

/** Sermons plus series in one read: { entries, live, series } */
export async function overview(now = Date.now()) {
  const entries = await allEntries();
  const series = summarizeSeries(entries, await readSeriesRecords(), now);
  return { entries, live: entries.filter((e) => isLive(e, now)), series, now };
}

export async function getMarkdown(entry) {
  if (entry.source === 'upload') return store().get('md/' + entry.slug, { type: 'text' });
  const s = seed.find((x) => x.slug === entry.slug);
  return s ? s.markdown : null;
}

// ---------- series ----------

/** Create a series. Returns { series } or { error }. */
export async function createSeries(rawName) {
  const name = String(rawName || '').replace(/\s+/g, ' ').trim();
  const slug = slugify(name);
  if (name.length < 2 || name.length > 80 || !slug) {
    return { error: 'Give the series a name of 2 to 80 characters, with at least one letter or number.' };
  }
  const { series } = await overview();
  const existing = series.find((s) => s.slug === slug);
  if (existing) return { error: `There’s already a series called “${existing.name}”.`, existing };
  const records = await readSeriesRecords();
  const record = { slug, name, createdAt: new Date().toISOString() };
  records.push(record);
  await store().setJSON('series', records);
  return { series: record };
}

/** Delete a series that has no sermons. Returns {} or { error }. */
export async function deleteSeries(slug) {
  const { series } = await overview();
  const s = series.find((x) => x.slug === slug);
  if (!s) return { error: 'That series doesn’t exist.' };
  if (s.total > 0) return { error: `“${s.name}” still has ${s.total} sermon${s.total === 1 ? '' : 's'}. Unpublish them first.` };
  await store().setJSON('series', (await readSeriesRecords()).filter((r) => r.slug !== slug));
  await images().delete(slug);
  return {};
}

// ---------- sermons ----------

/**
 * Validate and store an uploaded sermon.
 * goLive: 'default' | 'now' | 'YYYY-MM-DDTHH:mm' (Central).
 * useSeries: optional slug of an existing series to file it under, whatever the file says.
 * Returns { entry, warnings } | { errors, warnings } | { unknownSeries, series, warnings }.
 */
export async function saveSermon(markdown, goLive, useSeries) {
  let doc = parseSermon(markdown);
  const { errors, warnings } = validateSermon(doc);
  if (errors.length) return { errors, warnings };

  const { series } = await overview();
  let target;
  if (useSeries) {
    target = series.find((s) => s.slug === useSeries);
    if (!target) return { errors: ['That series no longer exists.'], warnings };
  } else {
    target = series.find((s) => s.slug === slugify(doc.fm.series));
  }
  if (!target) {
    return {
      unknownSeries: { name: doc.fm.series, slug: slugify(doc.fm.series) },
      series: series.map((s) => ({ slug: s.slug, name: s.name })),
      warnings
    };
  }
  if (doc.fm.series !== target.name) {
    markdown = withSeries(markdown, target.name);
    doc = parseSermon(markdown);
  }

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

// ---------- series images ----------

export async function saveSeriesImage(seriesSlug, bytes, contentType) {
  await images().set(seriesSlug, bytes, { metadata: { contentType } });
}

export async function getSeriesImage(seriesSlug) {
  const res = await images().getWithMetadata(seriesSlug, { type: 'arrayBuffer' });
  return res ? { data: res.data, contentType: (res.metadata && res.metadata.contentType) || 'image/jpeg' } : null;
}
