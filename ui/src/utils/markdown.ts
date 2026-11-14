// Pure text helpers for showing job notes outside the markdown editor. Keeping
// this module dependency-free lets the server, client, and node tests share it.

const TRUNCATION_ELLIPSIS = '\u2026';

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

/**
 * Convert markdown to readable plain text. This is intentionally conservative:
 * it strips syntax but keeps the human-readable content (including code block
 * contents) so summaries and previews are useful.
 */
export function markdownToPlainText(markdown: string): string {
  if (!markdown) return '';

  let text = normalizeNewlines(markdown);

  // YAML frontmatter at the very start of the note.
  text = text.replace(/^---\n[\s\S]*?\n---\n?/, '');

  // Fenced code blocks: remove the fences, keep the code content.
  text = text.replace(/^[ \t]*(```|~~~)[^\n]*\n?/gm, '');
  text = text.replace(/^[ \t]*(```|~~~)[ \t]*$/gm, '');

  // Images and links: keep the visible label.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
  text = text.replace(/<((?:https?|mailto):[^>]+)>/gi, '$1');

  // Raw HTML tags are not rendered in the summary.
  text = text.replace(/<[^>]+>/g, '');

  // Block syntax.
  text = text.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');
  text = text.replace(/^[ \t]{0,3}>[ \t]?/gm, '');
  text = text.replace(/^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/gm, '');
  text = text.replace(/^[ \t]*[-*+][ \t]+/gm, '');
  text = text.replace(/^[ \t]*\d+[.)][ \t]+/gm, '');
  text = text.replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '');

  // Tables: drop separator rows and reduce cell pipes to spaces.
  text = text.replace(/^[ \t]*\|?[ \t:|-]+\|[ \t:|-]*$/gm, '');
  text = text.replace(/\|/g, ' ');

  // Emphasis and escapes. Underscores inside words (snake_case) are preserved.
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/\*([^*\n]+)\*/g, '$1');
  text = text.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1$2');
  text = text.replace(/~~(.*?)~~/g, '$1');
  text = text.replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, '$1');
  text = text.replace(/`([^`]+)`/g, '$1');

  // Normalize whitespace without throwing away paragraph breaks.
  text = text
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const slice = text.slice(0, Math.max(0, maxLength));
  const breakAt = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\n'));
  const cut = breakAt > Math.floor(maxLength * 0.6) ? slice.slice(0, breakAt) : slice;
  return `${cut.trimEnd()}${TRUNCATION_ELLIPSIS}`;
}

/** First meaningful line of the note, suitable for a one-line table cell. */
export function getNotesSummary(markdown: string, maxLength = 140): string {
  const plain = markdownToPlainText(markdown);
  if (!plain) return '';

  const firstLine = plain
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0);

  if (!firstLine) return '';
  return truncate(firstLine.replace(/\s+/g, ' '), maxLength);
}

/** A multi-line plain-text excerpt for the hover preview. */
export function getNotesExcerpt(markdown: string, maxLength = 700): string {
  const plain = markdownToPlainText(markdown);
  if (!plain) return '';
  return truncate(plain, maxLength);
}
