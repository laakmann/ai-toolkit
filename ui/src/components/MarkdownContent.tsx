'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components: Components = {
  h1: ({ children }) => <h1 className="mt-4 mb-2 text-lg font-semibold text-gray-100 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-4 mb-2 text-base font-semibold text-gray-100">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold text-gray-100">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-3 mb-1.5 text-sm font-semibold text-gray-200">{children}</h4>,
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-gray-600 pl-3 text-gray-400">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-gray-700" />,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-sky-400 underline hover:text-sky-300">
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = typeof className === 'string' && className.startsWith('language-');
    return (
      <code
        className={
          isBlock
            ? 'font-mono text-[0.85em] text-gray-200'
            : 'rounded bg-gray-800 px-1 py-0.5 font-mono text-[0.85em] text-gray-200'
        }
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-3 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-800/70">{children}</thead>,
  th: ({ children }) => <th className="border border-gray-700 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-gray-700 px-2 py-1 align-top">{children}</td>,
  img: ({ src, alt }) => <img src={src} alt={alt ?? ''} className="my-3 max-w-full rounded" />,
  input: props => <input {...props} disabled className="mr-1 align-middle accent-sky-500" />,
};

export default function MarkdownContent({ markdown }: { markdown: string }) {
  return (
    <div className="text-sm text-gray-200">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
