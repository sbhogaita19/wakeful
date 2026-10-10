/** Indicative UK (England/Wales/NI) income tax and employee NI, 2026/27 thresholds (frozen). Annual pounds in, pounds out. */
export function incomeTax(income: number): number {
  const pa = income > 100000 ? Math.max(0, 12570 - (income - 100000) / 2) : 12570;
  const t = Math.max(0, income - pa);
  const basic = Math.min(t, 37700);
  const higher = Math.max(0, Math.min(t, 125140) - 37700);
  const addl = Math.max(0, t - 125140);
  return basic * 0.2 + higher * 0.4 + addl * 0.45;
}

export function employeeNI(gross: number): number {
  return Math.max(0, Math.min(gross, 50270) - 12570) * 0.08 + Math.max(0, gross - 50270) * 0.02;
}
