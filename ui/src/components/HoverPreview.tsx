'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';

type Props = {
  text: string;
  /** Text shown in the hover panel. Defaults to `text`. */
  preview?: string;
  onClick?: () => void;
  openLabel?: string;
  emptyLabel?: string;
  className?: string;
  textClassName?: string;
  previewClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

const PANEL_MAX_WIDTH = 460;
const VIEWPORT_MARGIN = 8;
const CLOSE_DELAY_MS = 120;

export default function HoverPreview({
  text,
  preview,
  onClick,
  openLabel = 'Open full',
  emptyLabel = '\u2014',
  className,
  textClassName,
  previewClassName,
  ariaLabel,
  disabled,
}: Props) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipID = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  }, [cancelClose]);

  const openPreview = useCallback(() => {
    if (disabled || !text) return;
    cancelClose();

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
    const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.left), maxLeft);

    setPosition({ top: rect.bottom + VIEWPORT_MARGIN, left, width });
    setOpen(true);
  }, [cancelClose, disabled, text]);

  // If the panel would run off the bottom, flip it above the trigger.
  useLayoutEffect(() => {
    if (!open || !position || !panelRef.current || !triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const panelHeight = panelRef.current.getBoundingClientRect().height;
    if (position.top + panelHeight > window.innerHeight - VIEWPORT_MARGIN) {
      const flippedTop = Math.max(VIEWPORT_MARGIN, triggerRect.top - panelHeight - VIEWPORT_MARGIN);
      if (flippedTop !== position.top) {
        setPosition(current => (current ? { ...current, top: flippedTop } : current));
      }
    }
  }, [open, position]);

  // A fixed panel can become detached while the page scrolls or resizes.
  // Closing is less surprising than leaving it floating over the wrong row.
  useEffect(() => {
    if (!open) return;

    const close = (event?: Event) => {
      // Scrolling inside the preview should not dismiss the preview itself.
      if (event?.target instanceof Node && panelRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  if (!text) {
    return <span className={classNames('text-gray-600', textClassName)}>{emptyLabel}</span>;
  }

  const visiblePreview = preview && preview.trim() ? preview : text;
  const triggerClasses = classNames(
    'block w-full min-w-0 truncate text-left',
    onClick && 'cursor-pointer hover:text-gray-100',
    disabled && 'cursor-default opacity-60',
    textClassName,
  );

  return (
    <div
      ref={triggerRef}
      className={classNames('min-w-0', className)}
      onMouseEnter={openPreview}
      onMouseLeave={scheduleClose}
    >
      {onClick ? (
        <button
          type="button"
          aria-label={ariaLabel}
          aria-describedby={open ? tooltipID : undefined}
          disabled={disabled}
          className={triggerClasses}
          onFocus={openPreview}
          onBlur={scheduleClose}
          onClick={() => {
            setOpen(false);
            onClick();
          }}
        >
          {text}
        </button>
      ) : (
        <span aria-label={ariaLabel} aria-describedby={open ? tooltipID : undefined} className={triggerClasses}>
          {text}
        </span>
      )}

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            id={tooltipID}
            role="tooltip"
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: position.width,
            }}
            className="z-[80] max-h-[min(18rem,50vh)] overflow-auto rounded-lg border border-gray-700 bg-gray-900 p-3 text-left text-xs text-gray-200 shadow-2xl shadow-black/50"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div className={classNames('whitespace-pre-wrap break-words', previewClassName)}>{visiblePreview}</div>
            {onClick && <div className="mt-2 border-t border-gray-700 pt-2 text-[10px] text-gray-500">{openLabel}</div>}
          </div>,
          document.body,
        )}
    </div>
  );
}
