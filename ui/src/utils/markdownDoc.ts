// Small, dependency-free markdown parser for job notes. It covers the GFM
// features the notes modal needs without pulling in a renderer dependency, so
// stale node_modules directories cannot break the production build.

export type MarkdownAlign = 'left' | 'center' | 'right' | null;

export type MarkdownInline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: MarkdownInline[] }
  | { type: 'em'; children: MarkdownInline[] }
  | { type: 'del'; children: MarkdownInline[] }
  | { type: 'link'; href: string; children: MarkdownInline[] }
  | { type: 'image'; src: string; alt: string }
  | { type: 'break' };

export interface MarkdownListItem {
  children: MarkdownInline[];
  checked: boolean | null;
  nested: MarkdownBlock[];
}

export type MarkdownBlock =
  | { type: 'heading'; level: number; children: MarkdownInline[] }
  | { type: 'paragraph'; children: MarkdownInline[] }
  | { type: 'code'; language: string | null; value: string }
  | { type: 'blockquote'; children: MarkdownBlock[] }
  | { type: 'list'; ordered: boolean; items: MarkdownListItem[] }
  | { type: 'hr' }
  | { type: 'table'; header: MarkdownInline[][]; align: MarkdownAlign[]; rows: MarkdownInline[][][] };

function safeLinkUrl(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  if (/^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(value)) return value;
  // Relative paths without a scheme are fine; reject javascript:, data:, etc.
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? null : value;
}

function safeImageUrl(url: string): string | null {
  const value = url.trim();
  if (/^data:image\//i.test(value)) return value;
  return safeLinkUrl(value);
}

export function parseMarkdownInline(text: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let buffer = '';
  let i = 0;

  const flush = () => {
    if (buffer) {
      nodes.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };

  while (i < text.length) {
    const ch = text[i];
    const rest = text.slice(i);

    if (ch === '\\' && i + 1 < text.length && /[\\`*{}\[\]()#+\-.!_>~|]/.test(text[i + 1])) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (ch === '`') {
      const match = /^`([^`\n]+)`/.exec(rest);
      if (match) {
        flush();
        nodes.push({ type: 'code', value: match[1] });
        i += match[0].length;
        continue;
      }
    }

    if (ch === '!' && text[i + 1] === '[') {
      const match = /^!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/.exec(rest);
      if (match) {
        flush();
        const src = safeImageUrl(match[2]);
        if (src) nodes.push({ type: 'image', src, alt: match[1] });
        else nodes.push({ type: 'text', value: match[1] });
        i += match[0].length;
        continue;
      }
    }

    if (ch === '[') {
      const match = /^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/.exec(rest);
      if (match) {
        flush();
        const href = safeLinkUrl(match[2]);
        const children = parseMarkdownInline(match[1]);
        if (href) nodes.push({ type: 'link', href, children });
        else nodes.push(...children);
        i += match[0].length;
        continue;
      }
    }

    if (ch === '<') {
      const br = /^<br\s*\/?>/i.exec(rest);
      if (br) {
        flush();
        nodes.push({ type: 'break' });
        i += br[0].length;
        continue;
      }

      const autolink = /^<((?:https?|mailto):[^>]+)>/i.exec(rest);
      if (autolink) {
        flush();
        nodes.push({
          type: 'link',
          href: autolink[1],
          children: [{ type: 'text', value: autolink[1] }],
        });
        i += autolink[0].length;
        continue;
      }
    }

    if ((ch === '*' || ch === '_') && text[i + 1] === ch && text[i + 2] === ch) {
      const marker = ch + ch + ch;
      const end = text.indexOf(marker, i + 3);
      if (end !== -1) {
        flush();
        nodes.push({
          type: 'strong',
          children: [{ type: 'em', children: parseMarkdownInline(text.slice(i + 3, end)) }],
        });
        i = end + 3;
        continue;
      }
    }

    if ((ch === '*' || ch === '_') && text[i + 1] === ch) {
      if (ch === '_' && i > 0 && /\w/.test(text[i - 1])) {
        buffer += ch;
        i += 1;
        continue;
      }
      const marker = ch + ch;
      const end = text.indexOf(marker, i + 2);
      if (end !== -1) {
        flush();
        nodes.push({ type: 'strong', children: parseMarkdownInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (ch === '*' || ch === '_') {
      const prev = i > 0 ? text[i - 1] : '';
      if (ch === '_' && /\w/.test(prev)) {
        buffer += ch;
        i += 1;
        continue;
      }
      const end = text.indexOf(ch, i + 1);
      if (end !== -1 && !(ch === '_' && /\w/.test(text[end + 1] ?? ''))) {
        flush();
        nodes.push({ type: 'em', children: parseMarkdownInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (ch === '~' && text[i + 1] === '~') {
      const end = text.indexOf('~~', i + 2);
      if (end !== -1) {
        flush();
        nodes.push({ type: 'del', children: parseMarkdownInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    buffer += ch === '\n' ? ' ' : ch;
    i += 1;
  }

  flush();
  return nodes;
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  if (!/^\|?[\s:|-]+\|?$/.test(trimmed)) return false;
  return trimmed.split('|').some(cell => /^\s*:?-{1,}:?\s*$/.test(cell));
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map(cell => cell.trim());
}

function parseTableAlign(line: string): MarkdownAlign[] {
  return splitTableRow(line).map(cell => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index];
  if (/^ {0,3}(`{3,}|~{3,})/.test(line)) return true;
  if (/^ {0,3}#{1,6}\s+/.test(line)) return true;
  if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) return true;
  if (/^ {0,3}>/.test(line)) return true;
  if (/^(\s*)([-*+]|\d+[.)])\s+/.test(line)) return true;
  if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) return true;
  return false;
}

export function parseMarkdownDocument(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const language = fence[2].trim() || null;
      const code: string[] = [];
      i += 1;
      const closing = new RegExp(`^ {0,3}${marker}{3,}\\s*$`);
      while (i < lines.length && !closing.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: 'code', language, value: code.join('\n') });
      continue;
    }

    const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        children: parseMarkdownInline(heading[2]),
      });
      i += 1;
      continue;
    }

    if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (/^ {0,3}>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length) {
        if (/^ {0,3}>/.test(lines[i])) {
          quote.push(lines[i].replace(/^ {0,3}> ?/, ''));
          i += 1;
        } else if (!lines[i].trim()) {
          let next = i + 1;
          while (next < lines.length && !lines[next].trim()) next += 1;
          if (next < lines.length && /^ {0,3}>/.test(lines[next])) {
            quote.push('');
            i += 1;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      blocks.push({ type: 'blockquote', children: parseMarkdownDocument(quote.join('\n')) });
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line).map(cell => parseMarkdownInline(cell));
      const align = parseTableAlign(lines[i + 1]);
      i += 2;
      const rows: MarkdownInline[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i]).map(cell => parseMarkdownInline(cell)));
        i += 1;
      }
      blocks.push({ type: 'table', header, align, rows });
      continue;
    }

    const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (listItem) {
      const ordered = /^\d/.test(listItem[2]);
      const baseIndent = listItem[1].length;
      const items: MarkdownListItem[] = [];

      while (i < lines.length) {
        const match = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!match || match[1].length !== baseIndent || /^\d/.test(match[2]) !== ordered) break;

        let content = match[3];
        let checked: boolean | null = null;
        const task = /^\[([ xX])\]\s+(.*)$/.exec(content);
        if (task) {
          checked = task[1].toLowerCase() === 'x';
          content = task[2];
        }
        i += 1;

        const continuation: string[] = [content];
        const nestedLines: string[] = [];

        while (i < lines.length) {
          const next = lines[i];
          if (!next.trim()) {
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j += 1;
            if (j >= lines.length) break;
            const nextIndent = /^\s*/.exec(lines[j])?.[0].length ?? 0;
            if (nextIndent <= baseIndent) break;
            i = j;
            continue;
          }

          const nextItem = /^(\s*)([-*+]|\d+[.)])\s+/.exec(next);
          if (nextItem) {
            if (nextItem[1].length <= baseIndent) break;
            nestedLines.push(next);
            i += 1;
            continue;
          }

          const indent = /^\s*/.exec(next)?.[0].length ?? 0;
          if (indent <= baseIndent) break;
          continuation.push(next.trim());
          i += 1;
        }

        items.push({
          children: parseMarkdownInline(continuation.join(' ')),
          checked,
          nested: nestedLines.length > 0 ? parseMarkdownDocument(nestedLines.join('\n')) : [],
        });
      }

      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', children: parseMarkdownInline(paragraph.join(' ')) });
  }

  return blocks;
}
