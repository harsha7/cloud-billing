import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Search, AlertTriangle, Info, Layers } from 'lucide-react';

// OCI inventory: actual billed cost per resource across every tenancy, from the parent
// tenancy's Usage API via the existing cloudspend-func ({ mode: 'inventory' }).
type OciResource = {
  tenancy: string; tenancy_ocid: string; region: string; resource_id: string; name: string;
  resource_type: string; service: string; services: Record<string, number>; skus: string[];
  compartment: string; owner: string; cost: number;
};
type OciInventory = {
  mode: string; period: 'last_month' | 'mtd'; period_start: string; period_end: string; generated_at: string;
  resources: OciResource[];
  summary: { count: number; total_cost: number; by_tenancy: Record<string, { count: number; cost: number }>;
             by_service: Record<string, { count: number; cost: number }>; owners_found: number };
  warnings: string[]; error?: string;
};

const cache = new Map<string, OciInventory>(); // per period, kept for the browser session
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortId = (id: string) => (id.startsWith('ocid1.') ? `…${id.slice(-10)}` : id);
const fmtDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default function OciInventoryTab({ endpoint }: { endpoint: string }) {
  const [period, setPeriod] = useState<'last_month' | 'mtd'>('last_month');
  const [data, setData] = useState<OciInventory | null>(cache.get('last_month') || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [tenancy, setTenancy] = useState('All');
  const [service, setService] = useState('All');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState('');
  const reqId = useRef(0);

  const load = async (p: 'last_month' | 'mtd', force = false) => {
    if (!force && cache.has(p)) { setData(cache.get(p)!); setError(null); return; }
    const id = ++reqId.current;
    setLoading(true); setError(null); setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const resp = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'oci', mode: 'inventory', period: p }),
      });
      const json: OciInventory = await resp.json();
      if (id !== reqId.current) return;
      if (!resp.ok || json.error) throw new Error(json.error || `HTTP ${resp.status}`);
      if (json.mode !== 'inventory') throw new Error('The OCI function has not been updated with inventory mode yet.');
      cache.set(p, json);
      setData(json);
    } catch (e: any) {
      if (id !== reqId.current) return;
      setError(e?.message?.includes('Failed to fetch') ? 'Could not reach the OCI function (network or CORS).' : e?.message || String(e));
    } finally {
      clearInterval(timer);
      if (id === reqId.current) setLoading(false);
    }
  };

  useEffect(() => { setTenancy('All'); setService('All'); load(period); }, [period]);

  const tenancies = useMemo(() => Object.entries(data?.summary.by_tenancy || {}), [data]);
  const services = useMemo(() => {
    const out: Record<string, number> = {};
    (data?.resources || []).filter(r => tenancy === 'All' || r.tenancy === tenancy)
      .forEach(r => { out[r.service] = (out[r.service] || 0) + r.cost; });
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  }, [data, tenancy]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => (data?.resources || [])
    .filter(r => tenancy === 'All' || r.tenancy === tenancy)
    .filter(r => service === 'All' || r.service === service)
    .filter(r => !q || [r.name, r.resource_id, r.resource_type, r.compartment, r.owner, r.region, r.tenancy, ...r.skus]
      .some(v => (v || '').toLowerCase().includes(q))),
    [data, tenancy, service, q]);
  const shownTotal = rows.reduce((s, r) => s + r.cost, 0);

  const copy = (id: string) => {
    try { navigator.clipboard.writeText(id); setCopied(id); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard blocked */ }
  };

  const chip = (active: boolean) =>
    `px-4 py-2 rounded-full text-xs font-black transition-all ${active ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-10">
      <div className="bg-white rounded-[56px] border border-slate-200 p-10 shadow-sm flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Inventory & Cleanup</h2>
          <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest mt-1">
            Actual billed cost per resource · all tenancies{data ? ` · ${fmtDate(data.period_start)} – ${fmtDate(data.period_end)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl">
            {([['last_month', 'Last month'], ['mtd', 'Month to date']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setPeriod(id)} disabled={loading}
                className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${period === id ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => load(period, true)} disabled={loading}
            className="px-6 py-3 rounded-2xl bg-rose-600 text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg disabled:opacity-60 active:scale-95 transition-transform">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? `Loading… ${elapsed}s` : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="bg-white rounded-[56px] border border-slate-200 p-20 text-center shadow-sm">
          <RefreshCw size={36} className="animate-spin text-rose-600 mx-auto mb-6" />
          <p className="text-lg font-black text-slate-900">Loading resource costs for all tenancies… {elapsed}s</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[32px] p-6 font-bold flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" /> <span>Could not load inventory: {error}</span>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm">
              <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">{period === 'mtd' ? 'Billed so far this month' : 'Billed last month'}</h3>
              <p className="text-4xl font-black text-slate-900 tracking-tighter">{money(data.summary.total_cost)}</p>
              <p className="text-xs font-bold text-slate-400 mt-2">{data.summary.count} resources with charges</p>
            </div>
            <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm">
              <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Highest-cost tenancy</h3>
              <p className="text-2xl font-black text-slate-900 tracking-tight">{tenancies[0]?.[0] ?? '—'}</p>
              {tenancies[0] && <p className="text-xl font-black text-rose-600 tracking-tight mt-1">{money(tenancies[0][1].cost)}</p>}
            </div>
            <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm">
              <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Cleanup checks</h3>
              <p className="text-lg font-black text-slate-900 tracking-tight">Coming next</p>
              <p className="text-xs font-bold text-slate-400 mt-2">Unattached volumes, stopped instances and idle resources need one-time read-only access in each child tenancy.</p>
            </div>
          </div>

          <div className="bg-white rounded-[56px] border border-slate-200 p-10 shadow-sm space-y-6">
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tenancy</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { setTenancy('All'); setService('All'); }} className={chip(tenancy === 'All')}>All · {money(data.summary.total_cost)}</button>
                {tenancies.map(([t, v]) => (
                  <button key={t} onClick={() => { setTenancy(t); setService('All'); }} className={chip(tenancy === t)}>{t} · {money(v.cost)}</button>
                ))}
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 pt-2">Service</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setService('All')} className={chip(service === 'All')}>All</button>
                {services.map(([s, c]) => (
                  <button key={s} onClick={() => setService(s)} className={chip(service === s)}>{s} · {money(c)}</button>
                ))}
              </div>
            </div>

            <div className="relative w-full md:w-96">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, OCID, type, compartment, owner, SKU…"
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold outline-none focus:ring-2 focus:ring-rose-500" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                    <th className="py-3 pr-4">Resource</th>
                    <th className="py-3 pr-4">Tenancy / region</th>
                    <th className="py-3 pr-4">Compartment</th>
                    <th className="py-3 pr-4">What it bills for</th>
                    <th className="py-3 pr-4">Created by</th>
                    <th className="py-3 text-right">{period === 'mtd' ? 'MTD $' : 'Last month $'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.tenancy_ocid + r.resource_id} className="border-b border-slate-50 align-top hover:bg-slate-50/60">
                      <td className="py-4 pr-4">
                        {r.name
                          ? <div className="font-black text-slate-900 break-all">{r.name}</div>
                          : <div className="font-mono text-[11px] font-bold text-slate-700 break-all max-w-[22rem]">{r.resource_id}</div>}
                        <button onClick={() => copy(r.resource_id)} title={`${r.resource_id} (click to copy)`}
                          className="text-[11px] font-bold text-slate-400 hover:text-rose-600">
                          {copied === r.resource_id ? 'copied ✓' : `${r.resource_type}${r.name && r.resource_id.startsWith('ocid1.') ? ' · ' + shortId(r.resource_id) : ''} · copy OCID`}
                        </button>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="font-bold text-slate-700">{r.tenancy}</div>
                        <div className="text-[11px] font-bold text-slate-400">{r.region}</div>
                      </td>
                      <td className="py-4 pr-4 text-xs font-bold text-slate-600 break-all">{r.compartment || '—'}</td>
                      <td className="py-4 pr-4">
                        <div className="font-bold text-slate-700">{Object.entries(r.services).map(([s, c]) => `${s} ${money(c)}`).join(' · ')}</div>
                        {r.skus.length > 0 && <div className="text-[11px] text-slate-400 mt-1">{r.skus.join(' · ')}</div>}
                      </td>
                      <td className={`py-4 pr-4 font-bold ${r.owner ? 'text-slate-700' : 'text-slate-300'}`}>{r.owner || 'not tagged'}</td>
                      <td className="py-4 text-right font-mono font-black text-slate-900 whitespace-nowrap">{money(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="pt-5 text-right text-[11px] font-black uppercase tracking-widest text-slate-400">
                      {rows.length} resource{rows.length === 1 ? '' : 's'} shown
                    </td>
                    <td className="pt-5 text-right font-mono font-black text-slate-900">{money(shownTotal)}</td>
                  </tr>
                </tfoot>
              </table>
              {rows.length === 0 && <p className="text-center py-16 text-slate-300 font-black uppercase tracking-widest">No matching resources</p>}
            </div>
            <p className="text-xs font-bold text-slate-400 flex items-start gap-2">
              <Info size={14} className="shrink-0 mt-0.5" />
              Actual billed cost from OCI's Usage API for the parent tenancy (consolidated across all child tenancies). Charges that are not tied to a single resource appear as "(no resource ID)". Resources without a display name are listed by their full OCID. Click "copy OCID" to copy it.
            </p>
          </div>

          {data.warnings?.length > 0 && (
            <details className="bg-amber-50 border border-amber-200 rounded-[32px] p-6">
              <summary className="font-black text-amber-800 cursor-pointer flex items-center gap-2"><Layers size={16} /> {data.warnings.length} note(s) from the scan</summary>
              <ul className="mt-3 space-y-1 text-xs font-bold text-amber-800">{data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
