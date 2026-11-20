import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSermon, validateSermon, withSeries, slugify } from '../src/lib/parse.js';
import { summarizeSeries, neighbors } from '../src/lib/series.js';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const e = (date, series, live = true) => ({
  slug: date, date, series, seriesSlug: slugify(series), title: 'T ' + date,
  publishAt: live ? date + 'T11:00:00.000Z' : '2099-01-01T11:00:00.000Z'
});
const entries = [
  e('2026-11-15', 'Church and Politics'), e('2026-11-01', 'Church and Politics'),
  e('2026-10-18', 'Church and Politics'), e('2027-01-10', 'Romans', false)
];

test('series summary counts only live sermons for dates and live count', () => {
  const s = summarizeSeries(entries, [], NOW);
  const cp = s.find((x) => x.slug === 'church-and-politics');
  assert.equal(cp.total, 3);
  assert.equal(cp.live, 3);
  assert.equal(cp.latestDate, '2026-11-15');
  assert.equal(cp.firstDate, '2026-10-18');
  const romans = s.find((x) => x.slug === 'romans');
  assert.equal(romans.total, 1);
  assert.equal(romans.live, 0);
  assert.equal(romans.latestDate, '');
});

test('stored series with no sermons still appear, and keep their canonical name', () => {
  const s = summarizeSeries(entries, [
    { slug: 'church-and-politics', name: 'Church and Politics', createdAt: '2026-10-01T00:00:00Z' },
    { slug: 'advent', name: 'Advent', createdAt: '2026-11-19T00:00:00Z' }
  ], NOW);
  const advent = s.find((x) => x.slug === 'advent');
  assert.equal(advent.total, 0);
  assert.equal(advent.name, 'Advent');
  assert.equal(s.filter((x) => x.slug === 'church-and-politics').length, 1);
  assert.equal(s[0].slug, 'advent'); // a just-created empty series is listed first
  assert.deepEqual(s.slice(1).map((x) => x.slug), ['romans', 'church-and-politics']); // then newest sermon first
});

test('previous is older, next is newer, within the same series only', () => {
  const live = entries.filter((x) => Date.parse(x.publishAt) <= NOW);
  assert.deepEqual(neighbors(live, '2026-11-01'), {
    prev: { slug: '2026-10-18', title: 'T 2026-10-18', date: '2026-10-18' },
    next: { slug: '2026-11-15', title: 'T 2026-11-15', date: '2026-11-15' }
  });
  assert.equal(neighbors(live, '2026-11-15').next, null);
  assert.equal(neighbors(live, '2026-10-18').prev, null);
  assert.deepEqual(neighbors(live, 'nope'), { prev: null, next: null });
});

test('withSeries replaces or adds the series line and keeps the rest', () => {
  const md = '---\ntype: sermon-resource\nseries: Old Name\ntitle: "T"\ndate: 2026-12-06\n---\n**T**\n';
  const out = withSeries(md, 'Church and Politics');
  assert.match(out, /^series: Church and Politics$/m);
  assert.equal(parseSermon(out).fm.series, 'Church and Politics');
  assert.equal(parseSermon(out).fm.date, '2026-12-06');
  assert.ok(out.endsWith('---\n**T**\n'));
  const noSeries = withSeries('---\ntitle: "T"\ndate: 2026-12-06\n---\n**T**\n', 'Romans');
  assert.equal(parseSermon(noSeries).fm.series, 'Romans');
  assert.equal(parseSermon(withSeries(md, 'Advent: Hope')).fm.series, 'Advent: Hope');
  assert.equal(withSeries('no front matter', 'X'), 'no front matter');
});

test('a series name with no letters or numbers is rejected', () => {
  const doc = parseSermon('---\nseries: "!!!"\ntitle: T\ndate: 2026-12-06\n---\n**T**\n# 1. P __x__\n');
  assert.ok(validateSermon(doc).errors.some((m) => /series name/.test(m)));
});
