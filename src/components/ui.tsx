import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';
import { addMonths, monthLabel } from '../lib/dates';

export const Card = ({ title, sub, children, className = '', action }: { title?: ReactNode; sub?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) => (
  <section className={`card ${className}`}>
    {title && <h2><span>{title}{sub && <span className="sub"> · {sub}</span>}</span>{action}</h2>}
    {children}
  </section>
);

export const Stat = ({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: string }) => (
  <div className="card stat">
    <div className="label">{label}</div>
    <div className={`val ${tone ?? ''}`}>{value}</div>
    {note && <div className="note">{note}</div>}
  </div>
);

export const Head = ({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) => (
  <div className="head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div><div className="row">{children}</div></div>
);

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[] }) {
  return <div className="seg" role="tablist">{options.map((o) => <button key={o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.l}</button>)}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal aria-label={title}><h2>{title}</h2>{children}</div>
    </div>
  );
}

export const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="f">{label}{children}</label>;

export function MonthNav({ month, onChange, months }: { month: string; onChange: (m: string) => void; months: string[] }) {
  const min = months[0], max = months.at(-1);
  return (
    <div className="row" style={{ gap: 4 }}>
      <button className="btn sm ghost" aria-label="Previous month" disabled={!!min && month <= min} onClick={() => onChange(addMonths(month, -1))}><Icon n="left" /></button>
      <b style={{ minWidth: 120, textAlign: 'center' }}>{monthLabel(month)}</b>
      <button className="btn sm ghost" aria-label="Next month" disabled={!!max && month >= max} onClick={() => onChange(addMonths(month, 1))}><Icon n="right" /></button>
    </div>
  );
}

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => <div className="empty"><b>{title}</b>{children}</div>;
