import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Copy, Download, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { MonthlyData, BillingEntry } from './types';

// "Email Report": build a cost email from the billing data already loaded on the dashboard.
// AWS: overall bill or by region. OCI: overall or by tenancy. GCP: overall or by project.
// Nothing is sent from here: the report is copied (formatted) and the person's own mail app opens.
type Cloud = 'aws' | 'oci' | 'gcp';

const CLOUD_NAME: Record<Cloud, string> = { aws: 'AWS', oci: 'Oracle Cloud (OCI)', gcp: 'Google Cloud' };
const UNIT: Record<Cloud, string> = { aws: 'Region', oci: 'Tenancy', gcp: 'Project' };
const UNITS: Record<Cloud, string> = { aws: 'regions', oci: 'tenancies', gcp: 'projects' };
const THEME: Record<Cloud, { btn: string; text: string; chipOn: string; ring: string; hex: string }> = {
  aws: { btn: 'bg-blue-600', text: 'text-blue-600', chipOn: 'bg-blue-600 text-white border-blue-600', ring: 'focus:ring-blue-500', hex: '#2563eb' },
  oci: { btn: 'bg-rose-600', text: 'text-rose-600', chipOn: 'bg-rose-600 text-white border-rose-600', ring: 'focus:ring-rose-500', hex: '#e11d48' },
  gcp: { btn: 'bg-emerald-600', text: 'text-emerald-600', chipOn: 'bg-emerald-600 text-white border-emerald-600', ring: 'focus:ring-emerald-500', hex: '#059669' },
};
const AWS_REGION_NAMES: Record<string, string> = {
  'us-east-1': 'N. Virginia', 'us-east-2': 'Ohio', 'us-west-1': 'N. California', 'us-west-2': 'Oregon',
  'ca-central-1': 'Canada Central', 'ca-west-1': 'Calgary', 'eu-west-1': 'Ireland', 'eu-west-2': 'London',
  'eu-west-3': 'Paris', 'eu-central-1': 'Frankfurt', 'eu-north-1': 'Stockholm', 'ap-south-1': 'Mumbai',
  'ap-northeast-1': 'Tokyo', 'ap-northeast-2': 'Seoul', 'ap-northeast-3': 'Osaka', 'ap-southeast-1': 'Singapore',
  'ap-southeast-2': 'Sydney', 'sa-east-1': 'São Paulo',
};
const TOP_SERVICES = 10;

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`;
const pct = (cur: number, prev: number) => prev > 0.005 ? `${cur >= prev ? '+' : '−'}${Math.abs(((cur - prev) / prev) * 100).toFixed(1)}%` : (cur > 0.005 ? 'new' : '—');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Which group a billing line belongs to: the AWS region code, or the OCI tenancy / GCP project
const groupOf = (cloud: Cloud, e: BillingEntry) => cloud === 'aws'
  ? String(e.region || e.Region || 'NoRegion')
  : String(e.tenancy || e.Tenancy || 'Unknown');
const groupLabel = (cloud: Cloud, g: string) => {
  if (cloud !== 'aws') return g;
  if (/^noregion$/i.test(g)) return 'Tax (no region)';
  if (/^global$/i.test(g)) return 'Global services';
  return AWS_REGION_NAMES[g] ? `${AWS_REGION_NAMES[g]} (${g})` : g;
};

type Group = { key: string; label: string; cost: number; prev: number; services: { name: string; cost: number; prev: number }[]; regions: { name: string; cost: number }[] };

function summarize(cloud: Cloud, month: MonthlyData | undefined, prevMonth: MonthlyData | undefined): Group[] {
  const map = new Map<string, Group>();
  const get = (k: string) => {
    let g = map.get(k);
    if (!g) { g = { key: k, label: groupLabel(cloud, k), cost: 0, prev: 0, services: [], regions: [] }; map.set(k, g); }
    return g;
  };
  const svc = new Map<string, Map<string, { cost: number; prev: number }>>();
  const reg = new Map<string, Map<string, number>>();
  const add = (e: BillingEntry, isPrev: boolean) => {
    const k = groupOf(cloud, e); const g = get(k); const c = Number(e.cost) || 0;
    if (isPrev) g.prev += c; else g.cost += c;
    const s = String(e.service || 'Other');
    if (!svc.has(k)) svc.set(k, new Map());
    const sm = svc.get(k)!; const cur = sm.get(s) || { cost: 0, prev: 0 };
    if (isPrev) cur.prev += c; else cur.cost += c;
    sm.set(s, cur);
    if (!isPrev && cloud !== 'aws') {
      const r = String(e.region || e.Region || 'Global');
      if (!reg.has(k)) reg.set(k, new Map());
      reg.get(k)!.set(r, (reg.get(k)!.get(r) || 0) + c);
    }
  };
  (month?.entries || []).forEach(e => add(e, false));
  (prevMonth?.entries || []).forEach(e => add(e, true));
  map.forEach((g, k) => {
    g.services = Array.from(svc.get(k)?.entries() || []).map(([name, v]) => ({ name, ...v }))
      .filter(s => s.cost >= 0.005 || s.prev >= 0.005).sort((a, b) => b.cost - a.cost);
    g.regions = Array.from(reg.get(k)?.entries() || []).map(([name, cost]) => ({ name, cost }))
      .filter(r => r.cost >= 0.005).sort((a, b) => b.cost - a.cost);
  });
  return Array.from(map.values()).filter(g => g.cost >= 0.005 || g.prev >= 0.005).sort((a, b) => b.cost - a.cost);
}

// Top N services, the rest folded into one line
function topServices(list: { name: string; cost: number; prev: number }[]) {
  const sorted = [...list].sort((a, b) => b.cost - a.cost);
  const top = sorted.slice(0, TOP_SERVICES);
  const rest = sorted.slice(TOP_SERVICES);
  if (rest.length) top.push({ name: `Other services (${rest.length})`, cost: rest.reduce((s, x) => s + x.cost, 0), prev: rest.reduce((s, x) => s + x.prev, 0) });
  return top;
}

const readSaved = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

export default function EmailReportTab({ cloud, history, isRealData, loading }: { cloud: Cloud; history: MonthlyData[]; isRealData: boolean; loading: boolean }) {
  const th = THEME[cloud];
  const months = history.filter(m => m && m.entries);
  const [monthIdx, setMonthIdx] = useState(Math.max(0, months.length - 1));
  const [scope, setScope] = useState<'overall' | 'by'>('overall');
  const [compare, setCompare] = useState(true);
  const [showServices, setShowServices] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [to, setTo] = useState(() => readSaved(`cloudspend.email.to.${cloud}`));
  const [cc, setCc] = useState(() => readSaved(`cloudspend.email.cc.${cloud}`));
  const [subjectEdit, setSubjectEdit] = useState<string | null>(null);
  const [noteEdit, setNoteEdit] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; err?: boolean } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMonthIdx(Math.max(0, months.length - 1)); }, [months.length, cloud]);
  useEffect(() => { save(`cloudspend.email.to.${cloud}`, to); }, [to, cloud]);
  useEffect(() => { save(`cloudspend.email.cc.${cloud}`, cc); }, [cc, cloud]);

  const month = months[monthIdx];
  const prevMonth = monthIdx > 0 ? months[monthIdx - 1] : undefined;
  const withPrev = compare && !!prevMonth;
  const groups = useMemo(() => summarize(cloud, month, prevMonth), [cloud, month, prevMonth]);
  const active = groups.filter(g => g.cost >= 0.005);

  // Default selection: the biggest group, kept valid when the month changes
  useEffect(() => {
    setPicked(prev => {
      const keep = new Set(Array.from(prev).filter(k => groups.some(g => g.key === k)));
      if (keep.size === 0 && active.length) keep.add(active[0].key);
      return keep;
    });
  }, [groups]);

  const chosen = scope === 'overall' ? groups : groups.filter(g => picked.has(g.key));
  const total = chosen.reduce((s, g) => s + g.cost, 0);
  const prevTotal = chosen.reduce((s, g) => s + g.prev, 0);
  const allTotal = groups.reduce((s, g) => s + g.cost, 0);
  const monthName = month?.month || '';
  const scopeText = scope === 'overall' ? 'overall bill'
    : chosen.length === 1 ? chosen[0].label : `${chosen.length} ${UNITS[cloud]}`;
  const subject = subjectEdit ?? `${CLOUD_NAME[cloud]} costs – ${monthName} – ${scope === 'overall' ? 'overall bill' : `by ${UNIT[cloud].toLowerCase()} (${scopeText})`}`;
  const note = noteEdit ?? `Hi team,\n\nPlease find the ${CLOUD_NAME[cloud]} costs for ${monthName} below${scope === 'overall' ? '' : ` (${scopeText})`}.`;
  const currencyNote = cloud === 'gcp' ? 'Amounts are in the billing account’s currency (CAD), net of credits.' : 'Amounts are as reported by the cloud provider’s billing data.';

  const overallServices = useMemo(() => {
    const m = new Map<string, { cost: number; prev: number }>();
    groups.forEach(g => g.services.forEach(s => { const c = m.get(s.name) || { cost: 0, prev: 0 }; c.cost += s.cost; c.prev += s.prev; m.set(s.name, c); }));
    return topServices(Array.from(m.entries()).map(([name, v]) => ({ name, ...v })));
  }, [groups]);

  // ---------- email HTML (inline styles so it survives Outlook / Gmail) ----------
  const html = useMemo(() => {
    const F = "font-family:Segoe UI,Arial,Helvetica,sans-serif;";
    const cell = `${F}font-size:13px;padding:6px 12px;border-bottom:1px solid #e5e7eb;`;
    const num = `${cell}text-align:right;white-space:nowrap;`;
    const head = `${F}font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;padding:6px 12px;border-bottom:2px solid #d1d5db;text-align:left;`;
    const headR = `${head}text-align:right;`;
    const chg = (c: number, p: number) => {
      const d = c - p; const color = d > 0.005 ? '#b91c1c' : d < -0.005 ? '#047857' : '#6b7280';
      return `<td style="${num}color:${color};">${signed(d)}</td><td style="${num}color:${color};">${pct(c, p)}</td>`;
    };
    const cols = (first: string) => `<tr><th style="${head}">${first}</th><th style="${headR}">${esc(monthName)}</th>${withPrev ? `<th style="${headR}">${esc(prevMonth!.month)}</th><th style="${headR}">Change</th><th style="${headR}">%</th>` : ''}</tr>`;
    const row = (name: string, c: number, p: number, bold = false) => `<tr><td style="${cell}${bold ? 'font-weight:700;' : ''}">${esc(name)}</td><td style="${num}${bold ? 'font-weight:700;' : ''}">${money(c)}</td>${withPrev ? `<td style="${num}">${money(p)}</td>${chg(c, p)}` : ''}</tr>`;
    const table = (inner: string) => `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 18px 0;min-width:420px;">${inner}</table>`;
    const h = (t: string) => `<p style="${F}font-size:15px;font-weight:700;color:#111827;margin:18px 0 4px 0;">${esc(t)}</p>`;
    const sub = (t: string) => `<p style="${F}font-size:12px;color:#6b7280;margin:0 0 4px 0;">${esc(t)}</p>`;

    let out = note.split('\n').map(l => `<p style="${F}font-size:14px;color:#111827;margin:0 0 ${l ? '2px' : '8px'} 0;">${esc(l) || '&nbsp;'}</p>`).join('');
    out += `<p style="${F}font-size:22px;font-weight:700;color:${th.hex};margin:16px 0 0 0;">${money(total)}</p>`;
    out += sub(`${CLOUD_NAME[cloud]} · ${scope === 'overall' ? 'Overall bill' : scopeText} · ${monthName}${withPrev ? ` · ${signed(total - prevTotal)} (${pct(total, prevTotal)}) vs ${prevMonth!.month}` : ''}`);

    if (scope === 'overall') {
      out += h(`Cost by ${UNIT[cloud].toLowerCase()}`);
      out += table(cols(UNIT[cloud]) + groups.map(g => row(g.label, g.cost, g.prev)).join('') + row('Total', total, prevTotal, true));
      if (showServices) {
        out += h('Top services');
        out += table(cols('Service') + overallServices.map(s => row(s.name, s.cost, s.prev)).join(''));
      }
    } else {
      if (chosen.length > 1) {
        out += h(`Summary by ${UNIT[cloud].toLowerCase()}`);
        out += table(cols(UNIT[cloud]) + chosen.map(g => row(g.label, g.cost, g.prev)).join('') + row('Total', total, prevTotal, true));
      }
      chosen.forEach(g => {
        out += h(`${g.label} – ${money(g.cost)}`);
        if (cloud !== 'aws' && g.regions.length) out += sub(`Regions: ${g.regions.map(r => `${r.name} ${money(r.cost)}`).join(' · ')}`);
        if (showServices) out += table(cols('Service') + topServices(g.services).map(s => row(s.name, s.cost, s.prev)).join('') + row('Total', g.cost, g.prev, true));
      });
    }
    out += `<p style="${F}font-size:11px;color:#9ca3af;margin:14px 0 0 0;">${esc(currencyNote)} Generated from the CloudSpend dashboard on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.</p>`;
    return `<div>${out}</div>`;
  }, [cloud, groups, chosen, scope, withPrev, showServices, note, monthName, total, prevTotal, overallServices, prevMonth, scopeText, currencyNote, th.hex]);

  // ---------- plain text (fallback for clients that paste text only) ----------
  const text = useMemo(() => {
    const L: string[] = [note, '', `${CLOUD_NAME[cloud]} – ${scope === 'overall' ? 'Overall bill' : scopeText} – ${monthName}: ${money(total)}${withPrev ? ` (${signed(total - prevTotal)}, ${pct(total, prevTotal)} vs ${prevMonth!.month})` : ''}`, ''];
    const line = (n: string, c: number, p: number) => `  ${n}: ${money(c)}${withPrev ? `  (${signed(c - p)}, ${pct(c, p)})` : ''}`;
    if (scope === 'overall') {
      L.push(`By ${UNIT[cloud].toLowerCase()}:`); groups.forEach(g => L.push(line(g.label, g.cost, g.prev)));
      if (showServices) { L.push('', 'Top services:'); overallServices.forEach(s => L.push(line(s.name, s.cost, s.prev))); }
    } else {
      chosen.forEach(g => {
        L.push(`${g.label}: ${money(g.cost)}${withPrev ? ` (${signed(g.cost - g.prev)}, ${pct(g.cost, g.prev)})` : ''}`);
        if (cloud !== 'aws' && g.regions.length) L.push(`  Regions: ${g.regions.map(r => `${r.name} ${money(r.cost)}`).join(', ')}`);
        if (showServices) topServices(g.services).forEach(s => L.push(line(s.name, s.cost, s.prev)));
        L.push('');
      });
    }
    L.push('', currencyNote);
    return L.join('\n');
  }, [cloud, groups, chosen, scope, withPrev, showServices, note, monthName, total, prevTotal, overallServices, prevMonth, scopeText, currencyNote]);

  const show = (msg: string, err = false) => { setFlash({ msg, err }); setTimeout(() => setFlash(null), 7000); };

  const copyRich = async (): Promise<boolean> => {
    try {
      if ((window as any).ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new (window as any).ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
        return true;
      }
    } catch { /* fall back below */ }
    // Fallback: select the rendered preview and copy it (keeps formatting in most browsers)
    try {
      const el = previewRef.current; if (!el) return false;
      const range = document.createRange(); range.selectNodeContents(el);
      const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
      const ok = document.execCommand('copy'); sel?.removeAllRanges(); return ok;
    } catch { return false; }
  };

  const openEmail = async () => {
    const ok = await copyRich();
    const params: string[] = [];
    if (cc.trim()) params.push(`cc=${encodeURIComponent(cc.trim())}`);
    params.push(`subject=${encodeURIComponent(subject)}`);
    params.push(`body=${encodeURIComponent(ok ? '' : text)}`);
    window.location.href = `mailto:${encodeURIComponent(to.trim()).replace(/%2C/gi, ',').replace(/%40/g, '@')}?${params.join('&')}`;
    show(ok ? 'Report copied. In the new email, click in the body and press Ctrl+V (Cmd+V on Mac) to paste it.'
            : 'Could not copy the formatted report, so a plain-text version was put in the email body.', !ok);
  };

  const copyOnly = async () => { show((await copyRich()) ? 'Report copied. Paste it into any email with Ctrl+V (Cmd+V on Mac).' : 'Copy failed: select the preview and copy it by hand.', false); };

  const downloadCsv = () => {
    const rows: (string | number)[][] = [];
    const hdr = ['Cloud', 'Month', UNIT[cloud], 'Region', 'Service', `Cost (${monthName})`];
    if (withPrev) hdr.push(`Cost (${prevMonth!.month})`, 'Change');
    rows.push(hdr);
    const want = new Set(chosen.map(g => g.key));
    const agg = new Map<string, { g: string; r: string; s: string; c: number; p: number }>();
    const add = (e: BillingEntry, isPrev: boolean) => {
      const g = groupOf(cloud, e); if (!want.has(g)) return;
      const r = cloud === 'aws' ? g : String(e.region || e.Region || 'Global'); const s = String(e.service || 'Other');
      const k = `${g}|${r}|${s}`; const v = agg.get(k) || { g, r, s, c: 0, p: 0 };
      if (isPrev) v.p += Number(e.cost) || 0; else v.c += Number(e.cost) || 0; agg.set(k, v);
    };
    (month?.entries || []).forEach(e => add(e, false));
    if (withPrev) (prevMonth?.entries || []).forEach(e => add(e, true));
    Array.from(agg.values()).filter(v => v.c >= 0.005 || v.p >= 0.005)
      .sort((a, b) => a.g.localeCompare(b.g) || b.c - a.c)
      .forEach(v => {
        const r: (string | number)[] = [CLOUD_NAME[cloud], monthName, groupLabel(cloud, v.g), v.r, v.s, v.c.toFixed(2)];
        if (withPrev) r.push(v.p.toFixed(2), (v.c - v.p).toFixed(2));
        rows.push(r);
      });
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${cloud}-costs-${monthName.replace(/\s+/g, '-').toLowerCase()}-${scope === 'overall' ? 'overall' : 'by-' + UNIT[cloud].toLowerCase()}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    show('CSV downloaded. Attach it to the email if the team wants the line-by-line detail.');
  };

  if (!isRealData) {
    return (
      <div className="bg-white rounded-[56px] border border-slate-200 p-20 text-center shadow-sm">
        <Mail size={56} className="mx-auto text-slate-200 mb-6 animate-pulse" />
        <h2 className="text-2xl font-black text-slate-900 mb-3">{loading ? `Loading ${CLOUD_NAME[cloud]} billing data…` : `${CLOUD_NAME[cloud]} billing data not loaded`}</h2>
        <p className="text-slate-500 font-bold max-w-md mx-auto">The email report is built from the same billing data as the dashboard. {loading ? 'It will appear here in a moment.' : 'Use Sync Now in the sidebar, then come back to this tab.'}</p>
      </div>
    );
  }

  const chip = (on: boolean) => `px-4 py-2 rounded-xl text-xs font-black border transition-all ${on ? th.chipOn : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`;
  const input = `w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ${th.ring}`;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 grid grid-cols-1 xl:grid-cols-5 gap-8">
      {/* ---------- settings ---------- */}
      <div className="xl:col-span-2 space-y-6">
        <div className="bg-white rounded-[48px] border border-slate-200 p-10 shadow-sm space-y-7">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3"><Mail className={th.text} /> Email a cost report</h2>
            <p className="text-xs font-bold text-slate-400 mt-1">Pick what to send, check the preview, then open it in your email app.</p>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Report</p>
            <div className="flex flex-wrap gap-2">
              <button className={chip(scope === 'overall')} onClick={() => setScope('overall')}>Overall bill</button>
              <button className={chip(scope === 'by')} onClick={() => setScope('by')}>By {UNIT[cloud].toLowerCase()}</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Month</span>
              <select className={`${input} mt-2`} value={monthIdx} onChange={e => setMonthIdx(Number(e.target.value))}>
                {months.map((m, i) => <option key={m.month} value={i}>{m.month}</option>)}
              </select>
            </label>
            <div className="space-y-2 pt-6">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={compare} disabled={!prevMonth} onChange={e => setCompare(e.target.checked)} /> Compare with {prevMonth?.month || 'previous month'}</label>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={showServices} onChange={e => setShowServices(e.target.checked)} /> Include service breakdown</label>
            </div>
          </div>

          {scope === 'by' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{UNITS[cloud]} to include ({picked.size} of {active.length})</p>
                <div className="flex gap-3 text-[11px] font-black">
                  <button className={th.text} onClick={() => setPicked(new Set(active.map(g => g.key)))}>All</button>
                  <button className="text-slate-400" onClick={() => setPicked(new Set())}>None</button>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-2xl divide-y divide-slate-50">
                {groups.map(g => (
                  <label key={g.key} className={`flex items-center justify-between gap-3 px-4 py-3 text-sm cursor-pointer hover:bg-slate-50 ${g.cost < 0.005 ? 'opacity-50' : ''}`}>
                    <span className="flex items-center gap-3 font-bold text-slate-700 min-w-0">
                      <input type="checkbox" checked={picked.has(g.key)} onChange={e => setPicked(prev => { const n = new Set(prev); e.target.checked ? n.add(g.key) : n.delete(g.key); return n; })} />
                      <span className="truncate">{g.label}</span>
                    </span>
                    <span className="font-mono font-black text-slate-900 text-xs">{money(g.cost)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">To</span>
              <input className={`${input} mt-2`} placeholder="name@redirontech.com, team@redirontech.com" value={to} onChange={e => setTo(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cc (optional)</span>
              <input className={`${input} mt-2`} value={cc} onChange={e => setCc(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Subject</span>
              <input className={`${input} mt-2`} value={subject} onChange={e => setSubjectEdit(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Message</span>
              <textarea rows={4} className={`${input} mt-2 font-medium`} value={note} onChange={e => setNoteEdit(e.target.value)} />
            </label>
            {(subjectEdit !== null || noteEdit !== null) && (
              <button className="text-[11px] font-black text-slate-400 hover:text-slate-700" onClick={() => { setSubjectEdit(null); setNoteEdit(null); }}>Reset subject and message</button>
            )}
          </div>

          <div className="space-y-3">
            <button disabled={scope === 'by' && chosen.length === 0} onClick={openEmail} className={`w-full py-4 ${th.btn} text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform disabled:opacity-40`}>
              <Mail size={16} /> Copy report & open email
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button disabled={scope === 'by' && chosen.length === 0} onClick={copyOnly} className="py-3 bg-slate-100 text-slate-700 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-200 disabled:opacity-40"><Copy size={14} /> Copy only</button>
              <button disabled={scope === 'by' && chosen.length === 0} onClick={downloadCsv} className="py-3 bg-slate-100 text-slate-700 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-200 disabled:opacity-40"><Download size={14} /> CSV</button>
            </div>
            {flash && (
              <p className={`text-xs font-bold flex items-start gap-2 ${flash.err ? 'text-amber-700' : 'text-emerald-700'}`}>
                {flash.err ? <AlertTriangle size={14} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={14} className="shrink-0 mt-0.5" />} {flash.msg}
              </p>
            )}
            <p className="text-[11px] font-bold text-slate-400 flex items-start gap-2"><Info size={13} className="shrink-0 mt-0.5" /> Your email app opens with the recipients and subject filled in. Paste into the body (Ctrl+V) to drop in the formatted tables. Nothing is sent until you press Send.</p>
          </div>
        </div>
      </div>

      {/* ---------- preview ---------- */}
      <div className="xl:col-span-3">
        <div className="bg-white rounded-[48px] border border-slate-200 p-10 shadow-sm sticky top-32">
          <div className="flex items-center justify-between mb-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email preview</p>
            {scope === 'by' && <p className="text-[11px] font-bold text-slate-400">{money(total)} of {money(allTotal)} total bill</p>}
          </div>
          <div className="border border-slate-100 rounded-3xl p-8 bg-white overflow-x-auto">
            <p className="text-xs font-bold text-slate-400 mb-1">To: <span className="text-slate-700">{to || '—'}</span>{cc ? <> · Cc: <span className="text-slate-700">{cc}</span></> : null}</p>
            <p className="text-sm font-black text-slate-900 mb-6 pb-4 border-b border-slate-100">{subject}</p>
            {scope === 'by' && chosen.length === 0
              ? <p className="text-sm font-bold text-slate-400 py-10 text-center">Tick at least one {UNIT[cloud].toLowerCase()} on the left.</p>
              : <div ref={previewRef} dangerouslySetInnerHTML={{ __html: html }} />}
          </div>
        </div>
      </div>
    </div>
  );
}
