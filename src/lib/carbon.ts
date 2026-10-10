import { BENCH } from './benchmarks';
import { activeBills, type Vault } from '../types';

/** Rough annual household CO2e from energy bills, in kg. Estimate from £ spend and unit rates. */
export function energyCarbon(v: Vault): { kg: number; basis: string } | null {
  let kg = 0;
  let any = false;
  for (const b of activeBills(v).filter((x) => x.kind === 'energy')) {
    const fuel = b.fuel;
    const unit = b.unitRate;
    if (!fuel || !unit) continue;
    const sc = (b.standingCharge ?? BENCH[fuel].standing) * 365;
    const annual = b.monthly * 12;
    const kwh = Math.max(0, (annual - sc) / unit);
    kg += kwh * BENCH.carbon[fuel];
    any = true;
  }
  return any ? { kg: Math.round(kg), basis: 'Estimated from your bill, unit rate and UK conversion factors.' } : null;
}
