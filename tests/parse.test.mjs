import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSermon, validateSermon, slugify } from '../src/lib/parse.js';
import { refHref, refLabel, isScripture } from '../src/lib/ref.js';
import { defaultGoLive, parseCentralLocal, toCentralLocal } from '../src/lib/time.js';
import { exportModel, toText } from '../src/lib/export.js';

const dir = new URL('../content/sermons/', import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
const read = (name) => readFileSync(join(dir, name), 'utf8');

test('every bundled sermon parses and validates', () => {
  assert.ok(files.length >= 4);
  for (const f of files) {
    const doc = parseSermon(read(f));
    const { errors } = validateSermon(doc);
    assert.deepEqual(errors, [], f);
    assert.ok(doc.title && !/app notes/i.test(doc.title), f + ' title');
    assert.ok(doc.refs.length > 0, f + ' refs');
    assert.ok(doc.blanks.length > 0, f + ' blanks');
  }
});

test('Such Were Some of You: structure', () => {
  const doc = parseSermon(read('2026-11-15-such-were-some-of-you.md'));
  assert.equal(doc.title, 'Such Were Some of You');
  assert.equal(doc.fm.series, 'Church and Politics');
  assert.deepEqual(doc.refs, ['1 Corinthians 6:9-11', 'Romans 1:24-32', 'Matthew 19:4-6']);
  const points = doc.sections.filter((s) => s.isPoint);
  assert.equal(points.length, 4);
  assert.equal(points[0].kicker, 'Why should we care?');
  assert.equal(points[0].tokens.at(-2).type, 'blank');
  const altar = doc.sections.at(-1);
  assert.equal(altar.isPoint, false);
  assert.equal(altar.raw, 'Altar');
  assert.ok(altar.hasNote);
  // citation split off the end of a line
  const cited = points[0].items.find((i) => i.cite === 'J. D. Unwin, 1934');
  assert.ok(cited);
});

test('labels, bold blanks, italic citations', () => {
  const doc = parseSermon(read('2026-10-25-in-babylon-not-of-babylon.md'));
  assert.equal(doc.sections[0].kicker, 'Language');
  assert.equal(doc.sections[4].kicker, ''); // "Daniel __served__ ..." has no label
  const bold = doc.sections[0].items[2].tokens;
  assert.ok(bold.some((t) => t.type === 'em' && t.text === 'speak to'));
  assert.ok(bold.some((t) => t.type === 'blank' && t.text === 'speak for'));
  const table = parseSermon(read('2026-11-15-such-were-some-of-you.md')).sections[1].items[2];
  assert.equal(table.cite, '*After the Ball*, 1989');
  assert.ok(table.citeTokens.some((t) => t.type === 'it' && t.text === 'After the Ball'));
});

test('template guide block, image lines and {note} are ignored', () => {
  const tpl = `---
series: S
title: "T (App Notes)"
date: 2026-12-06
---
%%
# 9. This is guide text
- not content __ignored__
%%
**T**
*John 3:16*

# 1. A point with a __blank__.

- A line. (John 3:16)

<img src="https://example.com/x.png" alt="x" />{note}
`;
  const doc = parseSermon(tpl);
  assert.equal(doc.sections.length, 1);
  assert.equal(doc.blanks.length, 1);
  assert.ok(doc.sections[0].hasNote);
  assert.equal(doc.sections[0].items.length, 1);
});

test('scripture block places a card', () => {
  const doc = parseSermon(`---
series: S
title: T
date: 2026-12-06
---
**T**
*John 3:16*

# 1. Point __x__

> [!scripture] Romans 1:24-32

- line
`);
  assert.deepEqual(doc.sections[0].items[0], { type: 'scripture', ref: 'Romans 1:24-32' });
});

test('reminder comes from front matter', () => {
  const base = (fm) => parseSermon(`---\nseries: S\ntitle: T\ndate: 2026-12-06\n${fm}\n---\n**T**\n\n# 1. P __x__\n`);
  assert.equal(base('').reminder, null);
  const r = base('reminder: "Five-day devotional starts Monday."\nreminder_link: https://blog.harrisonfaith.org\nreminder_label: Go to the devotionals').reminder;
  assert.equal(r.text, 'Five-day devotional starts Monday.');
  assert.equal(r.href, 'https://blog.harrisonfaith.org');
  assert.equal(r.label, 'Go to the devotionals');
  const noLabel = base('reminder: Hi\nreminder_link: https://example.com').reminder;
  assert.equal(noLabel.label, 'Learn more');
  const text = base('reminder: Hi\nreminder_link: javascript:alert(1)').reminder;
  assert.equal(text.href, '');
  assert.equal(text.label, '');
});

test('validation catches the mistakes that matter', () => {
  const bad = validateSermon(parseSermon('# 1. Point\n'));
  assert.ok(bad.errors.length >= 3);
  const badDate = validateSermon(parseSermon('---\nseries: S\ntitle: T\ndate: Nov 15\n---\n**T**\n# 1. P __x__\n'));
  assert.ok(badDate.errors.some((e) => /YYYY-MM-DD/.test(e)));
});

test('ref.ly links', () => {
  assert.equal(refHref('John 3:16'), 'https://ref.ly/John3.16');
  assert.equal(refHref('1 Corinthians 6:9-11'), 'https://ref.ly/1%20Corinthians6.9-11');
  assert.equal(refHref('Romans 1:24–32'), 'https://ref.ly/Romans1.24-32');
  assert.equal(refHref('Psalm 23'), 'https://ref.ly/Psalm23');
  assert.equal(refHref('Luke 4:3-5:2'), 'https://ref.ly/Luke4.3-5.2');
  assert.equal(refLabel('Romans 1:24-32'), 'Romans 1:24–32');
  assert.ok(isScripture('1 Timothy 1:9-10'));
  assert.ok(!isScripture('J. D. Unwin, 1934'));
  assert.ok(!isScripture('After the Ball, 1989'));
});

test('go-live time is 5 AM Central, through daylight saving', () => {
  assert.equal(defaultGoLive('2026-11-22').toISOString(), '2026-11-22T11:00:00.000Z'); // CST, UTC-6
  assert.equal(defaultGoLive('2026-07-12').toISOString(), '2026-07-12T10:00:00.000Z'); // CDT, UTC-5
  const d = parseCentralLocal('2026-11-22T05:00');
  assert.equal(toCentralLocal(d), '2026-11-22T05:00');
});

test('export text keeps blanks until they are answered', () => {
  const doc = parseSermon(read('2026-10-25-in-babylon-not-of-babylon.md'));
  const open = toText(exportModel(doc, { status: {}, notes: {} }));
  assert.match(open, /you start using their ______\./);
  const done = toText(exportModel(doc, { status: { b1: 'correct' }, notes: { 0: 'Call Dad' } }));
  assert.match(done, /you start using their meanings\./);
  assert.match(done, /My notes: Call Dad/);
  assert.ok(slugify('Church and Politics') === 'church-and-politics');
});
