import { useState } from 'react';
import { useStore } from '../store';
import { Card, Head } from '../components/ui';
import type { ViewProps } from '../nav';
import { adults, type Bill, type Payslip } from '../types';
import { PayslipEditor } from './Income';
import { BillEditor } from './Bills';
import type { Draft } from '../lib/ingest';

const KIND_LABEL = { statement: 'Bank statement', payslip: 'Payslip', bill: 'Bill', unknown: 'Unrecognised' } as const;

export function Import({ go }: ViewProps) {
  const { vault: v, ingestFiles, busy, report, undoImport, dismissReport, dismissDraft, moveBatch, reassignPayslip, update } = useStore();
  const [review, setReview] = useState<Draft | null>(null);
  const [hot, setHot] = useState(false);
  const accts = v.accounts.filter((a) => ['current', 'credit-card', 'savings'].includes(a.kind));

  return (
    <>
      <Head title="Import" sub="Drop anything — statements, payslips, bills. Wakeful works out what it is and files it. Files are read on this device and never stored or sent." />
      <label className={`drop ${hot ? 'hot' : ''}`} style={{ cursor: 'pointer', display: 'block' }}
        onDragOver={(e) => { e.preventDefault(); setHot(true); }} onDragLeave={() => setHot(false)}
        onDrop={(e) => { e.preventDefault(); setHot(false); ingestFiles(Array.from(e.dataTransfer.files)); }}>
        {busy ? <><b>Reading and filing…</b><br />Photos and scans are read on this device and can take up to a minute.</> : <><b>Drop files here</b><br />or tap to choose · CSV, PDF or a photo of a payslip or bill · as many as you like, mixed together</>}
        <input type="file" multiple accept=".csv,.pdf,.txt,image/*,text/csv,application/pdf" hidden onChange={(e) => { if (e.target.files) ingestFiles(Array.from(e.target.files)); e.target.value = ''; }} />
      </label>

      {report && (
        <Card title="Done" action={<div className="row"><button className="btn sm" onClick={undoImport}>Undo</button><button className="btn sm ghost" onClick={dismissReport}>Dismiss</button></div>}>
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="badge good">{report.txns} transaction{report.txns === 1 ? '' : 's'}</span>
            {report.dupes > 0 && <span className="badge">{report.dupes} already had</span>}
            {report.accounts > 0 && <span className="badge good">{report.accounts} account{report.accounts > 1 ? 's' : ''} created</span>}
            {report.billsAdded > 0 && <span className="badge good">{report.billsAdded} bill{report.billsAdded > 1 ? 's' : ''} found</span>}
            {report.billsUpdated > 0 && <span className="badge">{report.billsUpdated} bill{report.billsUpdated > 1 ? 's' : ''} updated</span>}
            {report.payslips > 0 && <span className="badge good">{report.payslips} payslip{report.payslips > 1 ? 's' : ''}</span>}
            {report.review > 0 && <span className="badge medium">{report.review} worth a look</span>}
          </div>
          {report.files.map((f, i) => (
            <div className="li" key={i}>
              <div><div className="t">{f.name}</div><div className={`s ${f.ok ? '' : 'warn'}`}>{KIND_LABEL[f.kind]} · {f.message}</div></div>
              {f.payslipId && adults(v).length > 1 && (
                <select defaultValue={f.memberId} onChange={(e) => reassignPayslip(f.payslipId!, e.target.value)} style={{ width: 'auto', maxWidth: 200 }} aria-label="Whose payslip">
                  {adults(v).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
              {f.batch && f.accountId && accts.length > 1 && (
                <select value={f.accountId} onChange={(e) => moveBatch(f.batch!, e.target.value)} style={{ width: 'auto', maxWidth: 200 }} aria-label="Move to account">
                  {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </div>
          ))}
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={() => go('home')}>See the dashboard</button>
            {report.review > 0 && <button className="btn" onClick={() => go('spend')}>Review {report.review}</button>}
            {report.billsAdded > 0 && <button className="btn" onClick={() => go('bills')}>Check bills</button>}
          </div>
        </Card>
      )}

      {report && report.drafts.length > 0 && (
        <Card title="Check these before saving" sub="read from a photo or scan, so double-check the figures">
          {report.drafts.map((d) => (
            <div className="li" key={d.id}>
              <div><div className="t">{d.fileName}</div><div className="s">{d.kind === 'payslip' ? 'Payslip' : 'Bill'} · {d.found.length ? `found ${d.found.join(', ')}` : 'nothing recognised — fill it in by hand'}</div></div>
              <button className="btn primary sm" onClick={() => setReview(d)}>Review &amp; save</button>
            </div>
          ))}
        </Card>
      )}

      {review?.kind === 'payslip' && review.payslip && (
        <PayslipEditor p={review.payslip} isNew onClose={() => setReview(null)} onDelete={() => { dismissDraft(review.id); setReview(null); }}
          onSave={(p: Payslip) => { update((x) => ({ ...x, payslips: [...x.payslips, p] })); dismissDraft(review.id); setReview(null); }} />
      )}
      {review?.kind === 'bill' && review.bill && (
        <BillEditor bill={review.bill} isNew onClose={() => setReview(null)} onDelete={() => { dismissDraft(review.id); setReview(null); }} onSwitch={() => {}}
          onSave={(b: Bill) => { update((x) => ({ ...x, bills: [...x.bills, b] })); dismissDraft(review.id); setReview(null); }} />
      )}

      <Card title="How it works">
        <ul className="note" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li><b>Bank files</b> (Monzo, Starling, Nationwide CSV or PDF): matched to the right account, or a new one is created. Categorised automatically; your past corrections are remembered. Duplicates are skipped, and transfers between your own accounts are ignored.</li>
          <li><b>Photos and scans</b> of a payslip or bill are read with on-device text recognition. Because it can misread digits, you check the figures before they’re saved. Bank statements should be CSV or a real PDF.</li>
          <li><b>Payslips</b> add to your take-home. <b>Bills</b> (energy, water, broadband, mobile, alarm…) are added or updated, with price changes tracked.</li>
          <li><b>Recurring payments</b> in your bank data become bills automatically; new rises and cancellations are flagged.</li>
          <li>Wrong account? Use the menu on the file above. Not happy? <b>Undo</b>. Anything uncertain is listed under “worth a look”.</li>
          <li>Getting the files: look for “Statements” or “Export” in your bank’s app or website and choose CSV (or PDF). Menus change, so check your bank’s help if you can’t find it.</li>
        </ul>
      </Card>
    </>
  );
}
