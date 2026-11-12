'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { AuditIssue, AuditSeverity, countIssues } from '@/app/jobs/new/audit';
import classNames from 'classnames';

const SEVERITY_LABEL: Record<AuditSeverity, string> = {
  error: 'Errors',
  warning: 'Warnings',
  info: 'Unused / notes',
};

const severityIcon = (severity: AuditSeverity) => {
  if (severity === 'error') return AlertCircle;
  if (severity === 'warning') return AlertTriangle;
  return Info;
};

const severityColor = (severity: AuditSeverity) => {
  if (severity === 'error') return 'text-rose-400';
  if (severity === 'warning') return 'text-amber-400';
  return 'text-sky-400';
};

const severityBadge = (severity: AuditSeverity) => {
  if (severity === 'error') return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
  if (severity === 'warning') return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
  return 'bg-sky-500/10 text-sky-300 border-sky-500/30';
};

export function ConfigAuditButton({
  issues,
  onClick,
  className,
}: {
  issues: AuditIssue[];
  onClick: () => void;
  className?: string;
}) {
  const counts = countIssues(issues);
  const hasErrors = counts.error > 0;
  const hasWarnings = counts.warning > 0 || counts.info > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'flex items-center gap-2 rounded-md border px-2 py-1 text-xs sm:text-sm transition-colors',
        hasErrors
          ? 'border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
          : hasWarnings
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
            : 'border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700',
        className,
      )}
      title="Configuration check"
    >
      {hasErrors ? (
        <ShieldAlert className="h-4 w-4" />
      ) : hasWarnings ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      )}
      <span className="hidden sm:inline">Config Check</span>
      {counts.total > 0 ? (
        <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] font-semibold">
          {hasErrors ? `${counts.error}E ` : ''}
          {counts.warning > 0 ? `${counts.warning}W ` : ''}
          {counts.info > 0 ? `${counts.info}I` : ''}
        </span>
      ) : null}
    </button>
  );
}

export function InlineIssues({ issues, className }: { issues: AuditIssue[]; className?: string }) {
  if (issues.length === 0) return null;
  return (
    <div className={classNames('space-y-1', className)}>
      {issues.map(issue => {
        const Icon = severityIcon(issue.severity);
        return (
          <div
            key={issue.id}
            className="flex items-start gap-1.5 rounded border border-gray-800 bg-gray-950/50 px-2 py-1 text-[11px]"
          >
            <Icon className={classNames('mt-0.5 h-3.5 w-3.5 shrink-0', severityColor(issue.severity))} />
            <span className="text-gray-300">
              {issue.title}: <span className="text-gray-500">{issue.message}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function ConfigAuditPanel({
  isOpen,
  onClose,
  issues,
  onJump,
}: {
  isOpen: boolean;
  onClose: () => void;
  issues: AuditIssue[];
  onJump: (target: string) => void;
}) {
  const counts = countIssues(issues);
  const grouped = issues.reduce<Record<string, AuditIssue[]>>((acc, issue) => {
    (acc[issue.section] ||= []).push(issue);
    return acc;
  }, {});

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configuration Check" size="xl">
      <div className="max-h-[75vh] overflow-y-auto pr-1">
        {issues.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            <CheckCircle2 className="h-5 w-5" />
            No configuration issues found.
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {(['error', 'warning', 'info'] as AuditSeverity[]).map(severity => {
                const Icon = severityIcon(severity);
                return (
                  <span
                    key={severity}
                    className={classNames(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                      severityBadge(severity),
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {counts[severity]} {SEVERITY_LABEL[severity]}
                  </span>
                );
              })}
            </div>

            <div className="space-y-4">
              {Object.entries(grouped).map(([section, sectionIssues]) => (
                <div key={section}>
                  <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{section}</h4>
                  <div className="space-y-1.5">
                    {sectionIssues.map(issue => {
                      const Icon = severityIcon(issue.severity);
                      return (
                        <button
                          key={issue.id}
                          type="button"
                          onClick={() => onJump(issue.target)}
                          className="flex w-full items-start gap-2 rounded-md border border-gray-800 bg-gray-950/40 px-3 py-2 text-left hover:border-gray-700 hover:bg-gray-800/60"
                        >
                          <Icon className={classNames('mt-0.5 h-4 w-4 shrink-0', severityColor(issue.severity))} />
                          <span className="min-w-0">
                            <span className="block text-sm text-gray-100">{issue.title}</span>
                            <span className="block text-xs text-gray-400">{issue.message}</span>
                            <span className="mt-0.5 block font-mono text-[10px] text-gray-600">{issue.path}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
