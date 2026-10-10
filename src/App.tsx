import { useState } from 'react';
import { useStore } from './store';
import { Icon, Logo } from './components/Icon';
import { Onboarding } from './views/Onboarding';
import { Home } from './views/Home';
import { Spending } from './views/Spending';
import { Bills } from './views/Bills';
import { Wealth } from './views/Wealth';
import { Insights } from './views/Insights';
import { Values } from './views/Values';
import { Income } from './views/Income';
import { Import } from './views/Import';
import { Settings } from './views/Settings';
import type { Tab } from './nav';
import { isDark, setPref } from './theme';

const ORDER: { t: Tab; l: string; i: string; main?: boolean }[] = [
  { t: 'home', l: 'Overview', i: 'home', main: true },
  { t: 'spend', l: 'Spending', i: 'spend', main: true },
  { t: 'bills', l: 'Bills', i: 'bills', main: true },
  { t: 'wealth', l: 'Wealth', i: 'wealth', main: true },
  { t: 'aware', l: 'Insights', i: 'aware', main: true },
  { t: 'values', l: 'Values', i: 'heart' },
  { t: 'income', l: 'Income', i: 'work' },
  { t: 'import', l: 'Import', i: 'upload' },
  { t: 'settings', l: 'Settings', i: 'gear' },
];

export function App() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>('home');
  const [menu, setMenu] = useState(false);
  const [, setTick] = useState(0);

  if (s.phase === 'loading') return <div className="center"><Logo /></div>;
  if (s.phase !== 'open') return <Onboarding />;

  const go = (t: Tab) => { setTab(t); setMenu(false); document.querySelector('.main')?.scrollTo(0, 0); };
  const idx = ORDER.findIndex((n) => n.t === tab);
  const prev = ORDER[idx - 1], next = ORDER[idx + 1];
  const View = { home: Home, spend: Spending, bills: Bills, wealth: Wealth, aware: Insights, values: Values, income: Income, import: Import, settings: Settings }[tab];
  const group = (main: boolean) => ORDER.filter((n) => !!n.main === main);
  const toggleTheme = () => { setPref(isDark() ? 'light' : 'dark'); setTick((x) => x + 1); };
  const exit = s.demo ? s.exit : s.lock;

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><Logo /> Wakeful</div>
        <div className="toplinks">
          {s.demo && <button className="hide-m" onClick={s.exit} style={{ color: 'var(--gold)' }}>Demo</button>}
          <button onClick={toggleTheme}>{isDark() ? 'Light' : 'Dark'}</button>
          <button onClick={exit}>{s.demo ? 'Leave' : 'Lock'}</button>
          <button className="mobile-only" aria-label="More" onClick={() => setMenu(!menu)}>More</button>
        </div>
        {menu && (
          <div className="menu">
            {group(false).map((n) => <button key={n.t} className={`navbtn ${tab === n.t ? 'on' : ''}`} onClick={() => go(n.t)}>{n.l}</button>)}
          </div>
        )}
      </header>

      <nav className="side" aria-label="Main">
        <div className="grp">Household</div>
        <div className="navlist">{group(true).map((n) => <button key={n.t} className={`navbtn ${tab === n.t ? 'on' : ''}`} onClick={() => go(n.t)}>{n.l}</button>)}</div>
        <div className="grp dim">Practice &amp; setup</div>
        <div className="navlist">{group(false).map((n) => <button key={n.t} className={`navbtn ${tab === n.t ? 'on' : ''}`} onClick={() => go(n.t)}>{n.l}</button>)}</div>
      </nav>

      <main className="main">
        <div className="wrap">
          <div className="sec">
            <span className="n">§ {String(idx + 1).padStart(2, '0')}</span><span>{ORDER[idx].l}</span><span className="rule" />
            {prev && <button onClick={() => go(prev.t)}>← {prev.l}</button>}
            {next && <button onClick={() => go(next.t)}>{next.l} →</button>}
          </div>
          {s.demo && <div className="banner"><span>Demo with fictional data — nothing is saved or sent anywhere.</span><button className="btn sm" onClick={s.exit}>Exit</button></div>}
          <View go={go} />
        </div>
      </main>

      <nav className="tabbar" aria-label="Main">
        {group(true).map((n) => <button key={n.t} className={tab === n.t ? 'on' : ''} onClick={() => go(n.t)}><Icon n={n.i} />{n.l === 'Overview' ? 'Home' : n.l}</button>)}
      </nav>
    </div>
  );
}
