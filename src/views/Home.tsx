import { useMemo } from 'react';
import { useStore } from '../store';
import { Card, Empty, Head, MonthNav, Stat } from '../components/ui';
import { Bars, MiniBar, Ring } from '../components/Charts';
import { householdIncome, latestMonth, monthlySeries, months, netWorth, spendByCategory, totalSpend } from '../lib/analytics';
import { buildInsights, totalSavingPotential } from '../lib/insights';
import { pulse } from '../lib/pulse';
import { findGaps } from '../lib/gaps';
import { fmt0 } from '../lib/money';
import { daysUntil, fmtDate } from '../lib/dates';
import { CATEGORY_COLOR } from '../types';
import type { ViewProps } from '../nav';

export function Home({ go }: ViewProps) {
  const { vault: v, month, setMonth } = useStore();
  const m = month || latestMonth(v.txns) || '';
  const data = useMemo(() => {
    const income = m ? householdIncome(v, m) : 0;
    const spend = m ? totalSpend(v.txns, m) : 0;
    return { income, spend, kept: income - spend, nw: netWorth(v.accounts), p: pulse(v), ins: buildInsights(v), series: m ? monthlySeries(v.txns, m) : [], cats: m ? spendByCategory(v.txns, m) : {} };
  }, [v, m]);

  if (!v.txns.length && !v.accounts.length) {
    return (
      <>
        <Head title={v.household.name} sub="Let’s bring your household into focus." />
        <Card><Empty title="Start with a statement">
          <p>Import a Monzo, Starling or Nationwide export, add a payslip, then list your bills.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="btn primary" onClick={() => go('import')}>Import statements</button>
            <button className="btn" onClick={() => go('income')}>Add a payslip</button>
            <button className="btn" onClick={() => go('bills')}>Add bills</button>
          </div></Empty></Card>
      </>
    );
  }

  const renewals = v.bills.filter((b) => b.contractEnd && daysUntil(b.contractEnd) <= 90).sort((a, b) => a.contractEnd!.localeCompare(b.contractEnd!)).slice(0, 4);
  const topCats = Object.entries(data.cats).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = topCats[0]?.[1] ?? 1;
  const gaps = findGaps(v);
  const potential = totalSavingPotential(data.ins);
  const given = data.cats['Giving'] ?? 0;
  const target = Math.round((data.income * v.values.givingPct) / 100);

  return (
    <>
      <Head title={v.household.name} sub="How your household is doing">
        <MonthNav month={m} months={months(v.txns)} onChange={setMonth} />
      </Head>

      <div className="grid g-main">
        <Card title="Balance" sub="five pillars, equally weighted">
          {data.p ? (
            <div className="row" style={{ alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
              <Ring value={data.p.overall} label="of 100" />
              <div style={{ flex: 1, minWidth: 220 }}>
                {data.p.pillars.map((p) => (
                  <div className="pillar" key={p.key}>
                    <span style={{ fontWeight: 550 }}>{p.label}</span><MiniBar pct={p.score} over={p.score < 40} /><b>{p.score}</b>
                    <span className="n">{p.note}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <Empty title="No data yet" />}
        </Card>

        <div className="grid g2 keep2" style={{ alignContent: 'start' }}>
          <Stat label="Take-home" value={fmt0(data.income)} note="household, monthly" />
          <Stat label="Spent" value={fmt0(data.spend)} note={data.income ? `${Math.round((data.spend / data.income) * 100)}% of take-home` : undefined} />
          <Stat label="Kept" value={fmt0(data.kept)} tone={data.kept >= 0 ? 'pos' : 'neg'} note={data.income ? `${Math.round((data.kept / data.income) * 100)}% saved` : undefined} />
          <Stat label="Net worth" value={fmt0(data.nw.net)} tone={data.nw.net >= 0 ? '' : 'neg'} note={`${fmt0(data.nw.debts)} owed`} />
        </div>
      </div>

      <div className="grid g2">
        <Card title="Worth your attention" sub={potential > 0 ? `up to ${fmt0(potential)} a year` : undefined}
          action={<button className="btn sm ghost" onClick={() => go('aware')}>All insights</button>}>
          {data.ins.length ? data.ins.slice(0, 4).map((i) => (
            <div className="insight" key={i.id}>
              <span className={`badge ${i.severity}`}>{i.severity === 'high' ? 'Act' : i.severity === 'medium' ? 'Review' : 'Notice'}</span>
              <div><h3>{i.title}</h3><p>{i.detail}</p></div>
              <div className="save">{i.yearly && i.yearly > 0 ? <>{fmt0(i.yearly)}<small>per year</small></> : null}</div>
            </div>
          )) : <Empty title="All quiet">Nothing needs your attention.</Empty>}
        </Card>

        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title="Income and spending" sub="6 months"><Bars data={data.series} />
            <div className="row note" style={{ gap: 16 }}><span><i className="dot" style={{ background: 'var(--accent)' }} /> Income</span><span><i className="dot" style={{ background: 'var(--gold)' }} /> Spent</span></div>
          </Card>
        </div>
      </div>

      {gaps.length > 0 && (
        <Card title="Complete your picture" sub={`${gaps.length} thing${gaps.length > 1 ? 's' : ''} Wakeful doesn’t know yet`}>
          {gaps.slice(0, 5).map((g) => <div className="li" key={g.id}><span>{g.text}</span><button className="btn sm" onClick={() => go(g.tab)}>Add</button></div>)}
          {gaps.length > 5 && <p className="note" style={{ marginTop: 8 }}>+ {gaps.length - 5} more</p>}
        </Card>
      )}

      <div className="grid g3">
        <Card title="Where it went">
          {topCats.map(([c, val]) => (
            <div key={c} style={{ marginBottom: 10 }}>
              <div className="row between"><span><i className="dot" style={{ background: CATEGORY_COLOR[c] }} /> {c}</span><b>{fmt0(val)}</b></div>
              <div className="bar"><i style={{ width: `${(val / maxCat) * 100}%`, background: CATEGORY_COLOR[c] }} /></div>
            </div>
          ))}
          {!topCats.length && <Empty title="Nothing this month" />}
        </Card>
        <Card title="Coming up" action={<button className="btn sm ghost" onClick={() => go('bills')}>Bills</button>}>
          {renewals.length ? renewals.map((b) => {
            const d = daysUntil(b.contractEnd!);
            return <div className="li" key={b.id}><div><div className="t">{b.provider}</div><div className="s">{b.kind.replace('-', ' ')} · {fmtDate(b.contractEnd!)}</div></div>
              <span className={`badge ${d < 0 ? 'high' : d < 45 ? 'medium' : ''}`}>{d < 0 ? 'ended' : `${d} days`}</span></div>;
          }) : <Empty title="Nothing in 90 days" />}
        </Card>
        {v.values.enabled && (
          <Card title="Giving" action={<button className="btn sm ghost" onClick={() => go('values')}>Values</button>}>
            <div className="stat"><div className="val gold">{fmt0(given)}</div><div className="note">given this month{target ? ` · aim ${fmt0(target)}` : ''}</div></div>
            {target > 0 && <div style={{ marginTop: 12 }}><MiniBar pct={(given / target) * 100} /></div>}
            <p className="note" style={{ marginTop: 12 }}>Enough is a practice, not a number. Notice, adjust, continue.</p>
          </Card>
        )}
      </div>
    </>
  );
}
