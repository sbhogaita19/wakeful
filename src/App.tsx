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

const MAIN: { t: Tab; l: string; i: string }[] = [
  { t: 'home', l: 'Home', i: 'home' },
  { t: 'spend', l: 'Spending', i: 'spend' },
  { t: 'bills', l: 'Bills', i: 'bills' },
  { t: 'wealth', l: 'Wealth', i: 'wealth' },
  { t: 'aware', l: 'Insights', i: 'aware' },
];
const MORE: { t: Tab; l: string; i: string }[] = [
  { t: 'values', l: 'Values', i: 'heart' },
  { t: 'income', l: 'Income', i: 'work' },
  { t: 'import', l: 'Import', i: 'upload' },
  { t: 'settings', l: 'Settings', i: 'gear' },
];

export function App() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>('home');
  const [more, setMore] = useState(false);

  if (s.phase === 'loading') return <div className="center"><Logo /></div>;
  if (s.phase !== 'open') return <Onboarding />;

  const go = (t: Tab) => { setTab(t); setMore(false); };
  const View = { home: Home, spend: Spending, bills: Bills, wealth: Wealth, aware: Insights, values: Values, income: Income, import: Import, settings: Settings }[tab];

  return (
    <div className="app">
      <nav className="side" aria-label="Main">
        <div className="brand"><Logo /> Wakeful</div>
        {MAIN.map((n) => <button key={n.t} className={`navbtn ${tab === n.t ? 'on' : ''}`} onClick={() => go(n.t)}><Icon n={n.i} />{n.l}</button>)}
        <div className="eyebrow" style={{ padding: '16px 11px 6px' }}>Household</div>
        {MORE.map((n) => <button key={n.t} className={`navbtn ${tab === n.t ? 'on' : ''}`} onClick={() => go(n.t)}><Icon n={n.i} />{n.l}</button>)}
        <div className="grow" />
        <button className="navbtn" onClick={s.demo ? s.exit : s.lock}><Icon n="lock" />{s.demo ? 'Leave demo' : 'Lock'}</button>
      </nav>
      <main className="main">
        <div className="wrap">
          {s.demo && <div className="banner"><span>Demo with fictional data — nothing is saved or sent anywhere.</span><button className="btn sm" onClick={s.exit}>Exit</button></div>}
          <View go={go} />
        </div>
      </main>
      <nav className="tabbar" aria-label="Main">
        {MAIN.map((n) => <button key={n.t} className={tab === n.t ? 'on' : ''} onClick={() => go(n.t)}><Icon n={n.i} />{n.l}</button>)}
      </nav>
      {more && null}
      <MobileMore tab={tab} go={go} open={more} setOpen={setMore} />
    </div>
  );
}

function MobileMore({ tab, go, open, setOpen }: { tab: Tab; go: (t: Tab) => void; open: boolean; setOpen: (b: boolean) => void }) {
  const s = useStore();
  return (
    <div className="mobile-only" style={{ position: 'fixed', right: 14, top: 'calc(10px + env(safe-area-inset-top, 0px))', zIndex: 20 }}>
      <button className="btn sm" aria-label="More" onClick={() => setOpen(!open)}><Icon n="more" /></button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 40, width: 190, padding: 6 }}>
          {MORE.map((n) => <button key={n.t} className={`navbtn ${tab === n.t ? 'on' : ''}`} onClick={() => go(n.t)}><Icon n={n.i} />{n.l}</button>)}
          <button className="navbtn" onClick={s.demo ? s.exit : s.lock}><Icon n="lock" />{s.demo ? 'Leave demo' : 'Lock'}</button>
        </div>
      )}
    </div>
  );
}
