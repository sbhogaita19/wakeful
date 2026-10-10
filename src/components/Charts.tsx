import { fmt0 } from '../lib/money';
import { monthLabel } from '../lib/dates';

export function Ring({ value, size = 168, stroke = 12, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const col = value >= 70 ? 'var(--good)' : value >= 45 ? 'var(--warn)' : 'var(--bad)';
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="butt" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div className="v"><b>{value}</b><span>{label}</span></div>
    </div>
  );
}

export function MiniBar({ pct, over }: { pct: number; over?: boolean }) {
  return <div className={`bar ${over ? 'over' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)}><i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>;
}

export function Bars({ data }: { data: { month: string; income: number; spend: number }[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.spend]));
  const W = 560, H = 190, pad = 26, bw = 18, gap = (W - pad * 2) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%" role="img" aria-label="Income versus spending by month">
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={H - f * (H - 10)} y2={H - f * (H - 10)} stroke="var(--line)" strokeDasharray="3 5" />)}
      {data.map((d, i) => {
        const x = pad + gap * i + gap / 2;
        const h1 = (d.income / max) * (H - 10), h2 = (d.spend / max) * (H - 10);
        return (
          <g key={d.month}>
            <rect x={x - bw - 2} y={H - h1} width={bw} height={h1} rx={4} fill="var(--accent)" opacity=".85"><title>{`Income ${fmt0(d.income)}`}</title></rect>
            <rect x={x + 2} y={H - h2} width={bw} height={h2} rx={4} fill="var(--gold)" opacity=".9"><title>{`Spent ${fmt0(d.spend)}`}</title></rect>
            <text x={x} y={H + 17} textAnchor="middle" fontSize="11" fill="var(--mute)">{monthLabel(d.month, true)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Line({ points }: { points: { date: string; net: number }[] }) {
  if (points.length < 2) return <div className="note">Add balances on two or more dates to see a trend.</div>;
  const W = 560, H = 150, pad = 8;
  const xs = points.map((p) => Date.parse(p.date));
  const ys = points.map((p) => p.net);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (x: number) => pad + ((x - x0) / Math.max(1, x1 - x0)) * (W - pad * 2);
  const Y = (y: number) => H - pad - ((y - y0) / Math.max(1, y1 - y0)) * (H - pad * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(Date.parse(p.date)).toFixed(1)},${Y(p.net).toFixed(1)}`).join(' ');
  const first = points[0], last = points[points.length - 1];
  return (
    <>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Net worth over time">
      <defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${X(x1)},${H} L${X(x0)},${H} Z`} fill="url(#lg)" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p) => <circle key={p.date} cx={X(Date.parse(p.date))} cy={Y(p.net)} r="3.5" fill="var(--bg)" stroke="var(--accent)" strokeWidth="2"><title>{`${p.date}: ${fmt0(p.net)}`}</title></circle>)}
    </svg>
    <div className="trend-labels note">
      <span>{first.date}<br />{fmt0(first.net)}</span>
      <span className="end">{last.date}<br />{fmt0(last.net)}</span>
      <span className={`chg ${last.net >= first.net ? 'pos' : 'neg'}`}>{last.net >= first.net ? '▲' : '▼'} {fmt0(Math.abs(last.net - first.net))} over this period</span>
    </div>
    </>
  );
}
