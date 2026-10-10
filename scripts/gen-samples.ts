// Writes fictional sample statements (Monzo / Starling / Nationwide formats) into samples/. Run: npm run samples
import { writeFileSync } from 'node:fs';
import { demoVault } from '../src/lib/demo';

const v = demoVault();
const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nat = (d: string) => `${d.slice(8, 10)} ${mon[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
const money = (p: number) => (p / 100).toFixed(2);
const rows = (id: string) => v.txns.filter((t) => t.accountId === id).sort((a, b) => a.date.localeCompare(b.date));

const monzo = ['Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In'];
rows('a1').forEach((t, i) => monzo.push(`tx_${i},${fmt(t.date)},09:00:00,${t.transfer ? 'Pot transfer' : 'Card payment'},${t.desc},,General,${money(t.pence)},GBP,${money(t.pence)},GBP,,,,${t.desc},,${t.pence < 0 ? money(t.pence) : ''},${t.pence > 0 ? money(t.pence) : ''}`));
writeFileSync('samples/monzo-sample.csv', monzo.join('\n') + '\n');

let bal = 120000;
const starling = ['Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP),Spending Category,Notes'];
rows('a2').forEach((t) => { bal += t.pence; starling.push(`${fmt(t.date)},${t.desc},,${t.pence > 0 ? 'FASTER PAYMENT' : 'CARD PAYMENT'},${money(t.pence)},${money(bal)},GENERAL,`); });
writeFileSync('samples/starling-sample.csv', starling.join('\n') + '\n');

bal = 200000;
const nw = ['"Account Name:","Fictional Flex"', '"Balance:","£1,320.00"', '', '"Date","Transaction type","Description","Paid out","Paid in","Balance"'];
rows('a3').forEach((t) => { bal += t.pence; nw.push(`"${nat(t.date)}","${t.pence > 0 ? 'Bank credit' : 'Visa purchase'}","${t.desc}","${t.pence < 0 ? '£' + money(-t.pence) : ''}","${t.pence > 0 ? '£' + money(t.pence) : ''}","£${money(bal)}"`); });
writeFileSync('samples/nationwide-sample.csv', nw.join('\n') + '\n');
console.log('samples written');
