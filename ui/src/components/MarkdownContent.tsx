'use client';

import { createElement, useMemo, type ReactNode } from 'react';
import {
  parseMarkdownDocument,
  type MarkdownAlign,
  type MarkdownBlock,
  type MarkdownInline,
} from '@/utils/markdownDoc';

function renderInline(nodes: MarkdownInline[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case 'text':
        return node.value;
      case 'code':
        return (
          <code key={key} className="rounded bg-gray-800 px-1 py-0.5 font-mono text-[0.85em] text-gray-200">
            {node.value}
          </code>
        );
      case 'strong':
        return <strong key={key}>{renderInline(node.children, key)}</strong>;
      case 'em':
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case 'del':
        return <del key={key}>{renderInline(node.children, key)}</del>;
      case 'link':
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 underline hover:text-sky-300"
          >
            {renderInline(node.children, key)}
          </a>
        );
      case 'image':
        return <img key={key} src={node.src} alt={node.alt} className="my-3 max-w-full rounded" />;
      case 'break':
        return <br key={key} />;
      default:
        return null;
    }
  });
}

const headingClasses = [
  '',
  'mt-4 mb-2 text-lg font-semibold text-gray-100 first:mt-0',
  'mt-4 mb-2 text-base font-semibold text-gray-100',
  'mt-3 mb-1.5 text-sm font-semibold text-gray-100',
  'mt-3 mb-1.5 text-sm font-semibold text-gray-200',
  'mt-3 mb-1.5 text-sm font-semibold text-gray-200',
  'mt-3 mb-1.5 text-sm font-semibold text-gray-200',
];

function alignmentClass(align: MarkdownAlign): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

function renderBlocks(blocks: MarkdownBlock[], keyPrefix = 'block'): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (block.type) {
      case 'heading': {
        const level = Math.min(6, Math.max(1, block.level));
        return createElement(`h${level}`, { key, className: headingClasses[level] }, renderInline(block.children, key));
      }
      case 'paragraph':
        return (
          <p key={key} className="my-2 leading-relaxed">
            {renderInline(block.children, key)}
          </p>
        );
      case 'code':
        return (
          <pre
            key={key}
            className="my-3 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-3 text-xs leading-relaxed"
          >
            <code className="font-mono text-[0.85em] text-gray-200">{block.value}</code>
          </pre>
        );
      case 'blockquote':
        return (
          <blockquote key={key} className="my-2 border-l-2 border-gray-600 pl-3 text-gray-400">
            {renderBlocks(block.children, key)}
          </blockquote>
        );
      case 'list': {
        const items = block.items.map((item, itemIndex) => {
          const itemKey = `${key}-${itemIndex}`;
          return (
            <li key={itemKey} className="pl-0.5">
              {item.checked !== null && (
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled
                  readOnly
                  className="mr-1 align-middle accent-sky-500"
                />
              )}
              {renderInline(item.children, itemKey)}
              {item.nested.length > 0 && <div className="mt-1">{renderBlocks(item.nested, itemKey)}</div>}
            </li>
          );
        });

        if (block.ordered) {
          return (
            <ol key={key} className="my-2 list-decimal space-y-1 pl-5">
              {items}
            </ol>
          );
        }
        return (
          <ul key={key} className="my-2 list-disc space-y-1 pl-5">
            {items}
          </ul>
        );
      }
      case 'hr':
        return <hr key={key} className="my-4 border-gray-700" />;
      case 'table':
        return (
          <div key={key} className="my-3 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-gray-800/70">
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    <th
                      key={`${key}-h-${cellIndex}`}
                      className={`border border-gray-700 px-2 py-1 font-semibold ${alignmentClass(
                        block.align[cellIndex],
                      )}`}
                    >
                      {renderInline(cell, `${key}-h-${cellIndex}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={`${key}-r-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${key}-r-${rowIndex}-${cellIndex}`}
                        className={`border border-gray-700 px-2 py-1 align-top ${alignmentClass(
                          block.align[cellIndex],
                        )}`}
                      >
                        {renderInline(cell, `${key}-r-${rowIndex}-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return null;
    }
  });
}

export default function MarkdownContent({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseMarkdownDocument(markdown ?? ''), [markdown]);
  return <div className="text-sm text-gray-200">{renderBlocks(blocks)}</div>;
}
