import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSermon, validateSermon } from '../src/lib/parse.js';
import { exportModel, toText } from '../src/lib/export.js';

const wrap = (body) => `---\nseries: S\ntitle: T\ndate: 2026-12-06\n---\n**T**\n*John 3:16*\n\n# 1. A point with a __blank__.\n\n${body}\n\n{note}\n`;
const scriptures = (doc) => doc.sections.flatMap((s) => s.items.filter((i) => i.type === 'scripture'));

test('a scripture block with no text stays a link only', () => {
  const [s] = scriptures(parseSermon(wrap('> [!scripture] Romans 1:24-32')));
  assert.equal(s.ref, 'Romans 1:24-32');
  assert.equal(s.text, '');
  assert.deepEqual(s.tokens, []);
});

test('quote lines under a scripture block become its passage text', () => {
  const doc = parseSermon(wrap('> [!scripture] Romans 1:32\n> Though they know God\'s righteous decree, they **give approval** to those who practice them.'));
  const [s] = scriptures(doc);
  assert.equal(s.ref, 'Romans 1:32');
  assert.match(s.text, /^Though they know God's righteous decree/);
  const kinds = s.tokens.map((t) => t.type);
  assert.ok(kinds.includes('em'), 'bold is kept');
  assert.equal(s.tokens.find((t) => t.type === 'em').text, 'give approval');
  assert.ok(s.tokens.some((t) => t.text && t.text.includes('God’s')), 'smart apostrophes');
});

test('several quote lines join into one passage, and HTML is dropped', () => {
  const [s] = scriptures(parseSermon(wrap('> [!scripture] Isaiah 5:20\n> Woe to those who call evil good\n> and <u>good</u> evil.')));
  assert.equal(s.text, 'Woe to those who call evil good and good evil.');
});

test('a blank line ends the passage, and the next block starts fresh', () => {
  const doc = parseSermon(wrap('> [!scripture] John 3:16\n> For God so loved the world.\n\nSome other line.\n\n> [!scripture] John 3:17\n> For God did not send his Son to condemn.\n> [!scripture] Acts 2:38'));
  const list = scriptures(doc);
  assert.deepEqual(list.map((x) => x.ref), ['John 3:16', 'John 3:17', 'Acts 2:38']);
  assert.equal(list[0].text, 'For God so loved the world.');
  assert.equal(list[1].text, 'For God did not send his Son to condemn.');
  assert.equal(list[2].text, '');
  // the plain line between them is still a line under the point
  assert.ok(doc.sections[0].items.some((i) => i.type === 'line' && i.raw === 'Some other line.'));
});

test('blanks inside a passage are real blanks, in document order', () => {
  const doc = parseSermon(wrap('> [!scripture] Romans 1:32\n> They not only do them but give __approval__ to those who practice them.\n\n- A later line with a __second__ blank.'));
  assert.deepEqual(doc.blanks.map((b) => b.ans), ['blank', 'approval', 'second']);
  assert.deepEqual(validateSermon(doc).errors, []);
});

test('export carries the passage text, and keeps passage blanks until answered', () => {
  const doc = parseSermon(wrap('> [!scripture] Romans 1:32\n> They give __approval__ to those who practice them.'));
  const open = toText(exportModel(doc, { status: {}, notes: {} }));
  assert.match(open, /Romans 1:32\n {3}They give ______ to those who practice them\./);
  const done = toText(exportModel(doc, { status: { b1: 'correct' }, notes: {} }));
  assert.match(done, /They give approval to those who practice them\./);
  // a link-only block exports just its reference
  const linkOnly = toText(exportModel(parseSermon(wrap('> [!scripture] John 3:16')), { status: {}, notes: {} }));
  assert.match(linkOnly, /\n {3}John 3:16\n/);
});
