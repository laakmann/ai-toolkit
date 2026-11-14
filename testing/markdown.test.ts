import test from 'node:test';
import assert from 'node:assert/strict';
import { getNotesExcerpt, getNotesSummary, markdownToPlainText } from '../ui/src/utils/markdown.ts';

test('markdown syntax is stripped while content is kept', () => {
  const markdown = `# Training notes

This is **important** and has a [link](https://example.com) plus \`inline code\`.

- First item
- Second item with _emphasis_

> A quote

\`\`\`python
print("hello")
\`\`\`
`;

  const plain = markdownToPlainText(markdown);
  assert.match(plain, /Training notes/);
  assert.match(plain, /This is important and has a link plus inline code\./);
  assert.match(plain, /First item/);
  assert.match(plain, /Second item with emphasis/);
  assert.match(plain, /A quote/);
  assert.match(plain, /print\("hello"\)/);
  assert.doesNotMatch(plain, /[#*`>]/);
});

test('underscores inside words are preserved', () => {
  assert.equal(
    markdownToPlainText('Set some_variable_name to _italic_ text.'),
    'Set some_variable_name to italic text.',
  );
  assert.equal(markdownToPlainText('__bold__ and **strong**'), 'bold and strong');
});

test('tables and images keep readable text', () => {
  const markdown = `| Name | Value |\n| --- | --- |\n| lr | 0.001 |\n\n![preview](image.png)`;
  const plain = markdownToPlainText(markdown);
  assert.match(plain, /Name\s+Value/);
  assert.match(plain, /lr\s+0\.001/);
  assert.match(plain, /preview/);
  assert.doesNotMatch(plain, /\|/);
});

test('frontmatter is removed', () => {
  const plain = markdownToPlainText('---\ntitle: test\n---\n# Body');
  assert.equal(plain, 'Body');
});

test('summary uses the first meaningful non-empty line', () => {
  const markdown = '\n\n# Run notes\n\nStarted at 10:00';
  assert.equal(getNotesSummary(markdown), 'Run notes');

  assert.equal(getNotesSummary('***\n\n## Actual heading\n\nbody'), 'Actual heading');
  assert.equal(getNotesSummary('   \n\n'), '');
});

test('summary truncates without cutting mid-word', () => {
  const summary = getNotesSummary('word '.repeat(80), 30);
  assert.ok(summary.length <= 31);
  assert.match(summary, /word word/);
  assert.match(summary, /\u2026$/);
});

test('excerpt preserves paragraph breaks and bounds length', () => {
  const excerpt = getNotesExcerpt('# Title\n\nFirst paragraph.\n\nSecond paragraph.');
  assert.match(excerpt, /Title\n\nFirst paragraph\.\n\nSecond paragraph\./);

  const longExcerpt = getNotesExcerpt('a'.repeat(900), 100);
  assert.equal(longExcerpt.length, 101);
  assert.match(longExcerpt, /\u2026$/);
});

test('empty and syntax-only notes produce empty previews', () => {
  assert.equal(markdownToPlainText(''), '');
  assert.equal(getNotesSummary(''), '');
  assert.equal(getNotesExcerpt('# \n\n---\n'), '');
});
