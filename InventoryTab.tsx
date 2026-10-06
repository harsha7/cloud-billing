import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Search, AlertTriangle, Server, Trash2, Layers, Info, Settings2 } from 'lucide-react';

// Read-only AWS inventory + cleanup scan (Lambda: cloudspend-aws-inventory).
// The Function URL is NOT stored in this public repo: it is entered once on the tab
// and kept only in this browser's localStorage.
const STORAGE_KEY = 'cloudspend.inventoryEndpoint';
const readEndpoint = () => { try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; } };

const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: 'ca-central-1', label: 'Canada Central (X-ray)' },
  { value: 'us-east-1', label: 'N. Virginia (Managed infra)' },
  { value: 'us-east-2', label: 'Ohio (ri-commercedev)' },
  { value: 'us-west-2', label: 'Oregon (General)' },
  { value: 'all', label: 'All enabled regions' },
];

type Resource = {
  region: string; service: string; resource_type: string; resource_id: string; name: string;
  owner: string; labels?: Record<string, string>; details: string; size: string;
  est_monthly_usd: number | null; price_basis: string; not_included: string;
};
type Finding = {
  region: string; resource_type: string; resource_id: string; name: string; owner: string;
  labels?: Record<string, string>; created: string; age_days: number | string; size_gb: number | string;
  confidence: string; evidence: string; est_monthly_cost_usd: number; cost_basis: string; recommendation: string;
};
type ScanResult = {
  generated_at: string; account_id: string; regions_scanned: string[];
  summary: { findings: number; est_monthly_usd: number; high_confidence_usd: number };
  findings: Finding[]; resources: Resource[];
  resources_summary: { count: number; est_monthly_usd: number; by_service: Record<string, { count: number; cost: number }>; note: string };
  errors: string[]; error?: string;
};

// Results survive tab switches for the whole browser session
const scanCache = new Map<string, ScanResult>();

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const regionLabel = (r: string) => REGION_OPTIONS.find(o => o.value === r)?.label || r;

export default function InventoryTab() {
  const [region, setRegion] = useState('ca-central-1');
  const [data, setData] = useState<ScanResult | null>(scanCache.get('ca-central-1') || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [view, setView] = useState<'inventory' | 'cleanup'>('inventory');
  const [service, setService] = useState<string>('All');
  const [query, setQuery] = useState('');
  const reqId = useRef(0);
  const [endpoint, setEndpoint] = useState(readEndpoint());
  const [draft, setDraft] = useState(readEndpoint());
  const [editing, setEditing] = useState(!readEndpoint());

  const saveEndpoint = () => {
    const v = draft.trim();
    if (!v.startsWith('https://')) { setError('The Function URL must start with https://'); return; }
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* storage blocked: keep for this session only */ }
    scanCache.clear();
    setError(null); setEndpoint(v); setEditing(false);
  };

  const scan = async (r: string, force = false) => {
    if (!endpoint) return;
    if (!force && scanCache.has(r)) { setData(scanCache.get(r)!); setError(null); return; }
    const id = ++reqId.current;
    setLoading(true); setError(null); setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const resp = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r === 'all' ? {} : { regions: [r] }),
      });
      const json: ScanResult = await resp.json();
      if (id !== reqId.current) return; // a newer scan replaced this one
      if (!resp.ok || json.error) throw new Error(json.error || `HTTP ${resp.status}`);
      scanCache.set(r, json);
      setData(json);
    } catch (e: any) {
      if (id !== reqId.current) return;
      setError(e?.message?.includes('Failed to fetch') ? 'Could not reach the inventory Lambda (network or CORS).' : e?.message || String(e));
    } finally {
      clearInterval(timer);
      if (id === reqId.current) setLoading(false);
    }
  };

  useEffect(() => { setService('All'); setQuery(''); scan(region); }, [region, endpoint]);

  const multiRegion = (data?.regions_scanned?.length || 0) > 1;

  const services = useMemo(() => {
    const by = data?.resources_summary?.by_service || {};
    return Object.entries(by).filter(([, v]) => v.cost >= 0.005).sort((a, b) => b[1].cost - a[1].cost);
  }, [data]);

  const q = query.trim().toLowerCase();
  const matches = (parts: (string | undefined)[]) => !q || parts.some(p => (p || '').toLowerCase().includes(q));

  const resources = useMemo(() => (data?.resources || [])
    .filter(r => (r.est_monthly_usd ?? 0) >= 0.005 || r.est_monthly_usd === null)
    .filter(r => service === 'All' || r.service === service)
    .filter(r => matches([r.name, r.resource_id, r.details, r.owner, r.resource_type, r.region, ...Object.values(r.labels || {})])),
    [data, service, q]);

  const findings = useMemo(() => (data?.findings || [])
    .filter(f => matches([f.name, f.resource_id, f.resource_type, f.owner, f.evidence, f.region, ...Object.values(f.labels || {})])),
    [data, q]);

  const filteredTotal = resources.reduce((s, r) => s + (r.est_monthly_usd || 0), 0);
  const labelText = (l?: Record<string, string>) => Object.entries(l || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-10">
      {/* Header */}
      <div className="bg-white rounded-[56px] border border-slate-200 p-10 shadow-sm flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Inventory & Cleanup</h2>
          <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest mt-1">
            Live read-only scan{data ? ` · Account ${data.account_id} · scanned ${new Date(data.generated_at).toLocaleString()}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={region} onChange={e => setRegion(e.target.value)} disabled={loading}
            className="px-5 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
            {REGION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={() => { setDraft(endpoint); setEditing(e => !e); }} title="Inventory Lambda URL"
            className="p-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-900">
            <Settings2 size={16} />
          </button>
          <button onClick={() => scan(region, true)} disabled={loading || !endpoint}
            className="px-6 py-3 rounded-2xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg disabled:opacity-60 active:scale-95 transition-transform">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? `Scanning… ${elapsed}s` : 'Re-scan'}
          </button>
        </div>
      </div>

      {editing && (
        <div className="bg-white rounded-[40px] border border-blue-200 p-8 shadow-sm space-y-4">
          <h3 className="text-lg font-black text-slate-900">Inventory Lambda URL</h3>
          <p className="text-sm font-bold text-slate-500">Paste the Function URL of <span className="font-mono">cloudspend-aws-inventory</span>. It is saved only in this browser, not in the site's code.</p>
          <div className="flex flex-col md:flex-row gap-3">
            <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="https://xxxx.lambda-url.us-east-1.on.aws/"
              className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={saveEndpoint} className="px-6 py-3 rounded-2xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest">Save & scan</button>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="bg-white rounded-[56px] border border-slate-200 p-20 text-center shadow-sm">
          <RefreshCw size={36} className="animate-spin text-blue-600 mx-auto mb-6" />
          <p className="text-lg font-black text-slate-900">Scanning {regionLabel(region)}… {elapsed}s</p>
          <p className="text-slate-500 font-bold mt-2">A single region takes about 20–30 seconds; all regions can take a few minutes.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[32px] p-6 font-bold flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" /> <span>Scan failed: {error}</span>
        </div>
      )}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm">
              <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Est. fixed charges / month</h3>
              <p className="text-4xl font-black text-slate-900 tracking-tighter">{money(data.resources_summary?.est_monthly_usd)}</p>
              <p className="text-xs font-bold text-slate-400 mt-2">{data.resources_summary?.count ?? 0} billable resources</p>
            </div>
            <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm">
              <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Possible cleanup savings / month</h3>
              <p className="text-4xl font-black text-amber-600 tracking-tighter">{money(data.summary?.est_monthly_usd)}</p>
              <p className="text-xs font-bold text-slate-400 mt-2">{data.summary?.findings ?? 0} items to review · {money(data.summary?.high_confidence_usd)} high-confidence</p>
            </div>
            <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm">
              <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Scope</h3>
              <p className="text-2xl font-black text-slate-900 tracking-tight">{multiRegion ? `${data.regions_scanned.length} regions` : regionLabel(data.regions_scanned[0])}</p>
              <p className="text-xs font-bold text-slate-400 mt-2">{data.errors?.length ? `${data.errors.length} scan warning(s)` : 'No scan errors'}</p>
            </div>
          </div>

          {/* View switch + search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit">
              {([['inventory', 'Inventory', Server], ['cleanup', 'Cleanup findings', Trash2]] as const).map(([id, label, Icon]) => (
                <button key={id} onClick={() => setView(id)}
                  className={`px-6 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${view === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
            <div className="relative w-full md:w-80">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, ID, owner, tag…"
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {view === 'inventory' && (
            <div className="bg-white rounded-[56px] border border-slate-200 p-10 shadow-sm space-y-8">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setService('All')}
                  className={`px-4 py-2 rounded-full text-xs font-black transition-all ${service === 'All' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  All · {money(data.resources_summary?.est_monthly_usd)}
                </button>
                {services.map(([s, v]) => (
                  <button key={s} onClick={() => setService(s)}
                    className={`px-4 py-2 rounded-full text-xs font-black transition-all ${service === s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {s} · {money(v.cost)}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <th className="py-3 pr-4">Resource</th>
                      {multiRegion && <th className="py-3 pr-4">Region</th>}
                      <th className="py-3 pr-4">Details</th>
                      <th className="py-3 pr-4">Size</th>
                      <th className="py-3 pr-4">Owner / tags</th>
                      <th className="py-3 text-right">Est. $/mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resources.map(r => (
                      <tr key={r.region + r.resource_id} className="border-b border-slate-50 align-top hover:bg-slate-50/60">
                        <td className="py-4 pr-4">
                          <div className="font-black text-slate-900">{r.name || r.resource_id}</div>
                          <div className="text-[11px] font-bold text-slate-400">{r.resource_type}{r.name ? ` · ${r.resource_id}` : ''}</div>
                        </td>
                        {multiRegion && <td className="py-4 pr-4 text-xs font-bold text-slate-500 whitespace-nowrap">{r.region}</td>}
                        <td className="py-4 pr-4">
                          <div className="font-bold text-slate-700">{r.details}</div>
                          <div className="text-[11px] text-slate-400 mt-1" title={r.not_included ? `Not included: ${r.not_included}` : ''}>
                            {r.price_basis}{r.not_included ? ` · excl. ${r.not_included}` : ''}
                          </div>
                        </td>
                        <td className="py-4 pr-4 font-bold text-slate-600 whitespace-nowrap">{r.size}</td>
                        <td className="py-4 pr-4">
                          <div className={`font-bold ${r.owner ? 'text-slate-700' : 'text-slate-300'}`}>{r.owner || 'untagged'}</div>
                          {labelText(r.labels) && <div className="text-[11px] font-bold text-slate-400">{labelText(r.labels)}</div>}
                        </td>
                        <td className="py-4 text-right font-mono font-black text-slate-900 whitespace-nowrap">{money(r.est_monthly_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={multiRegion ? 5 : 4} className="pt-5 text-right text-[11px] font-black uppercase tracking-widest text-slate-400">
                        {resources.length} resource{resources.length === 1 ? '' : 's'} shown
                      </td>
                      <td className="pt-5 text-right font-mono font-black text-slate-900">{money(filteredTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
                {resources.length === 0 && <p className="text-center py-16 text-slate-300 font-black uppercase tracking-widest">No matching resources</p>}
              </div>
              <p className="text-xs font-bold text-slate-400 flex items-start gap-2"><Info size={14} className="shrink-0 mt-0.5" /> {data.resources_summary?.note}</p>
            </div>
          )}

          {view === 'cleanup' && (
            <div className="bg-white rounded-[56px] border border-slate-200 p-10 shadow-sm space-y-6">
              <p className="text-sm font-bold text-slate-500">Resources flagged as possibly unused or idle. Nothing is changed by this scan; confirm with the owning team before removing anything.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <th className="py-3 pr-4">Resource</th>
                      {multiRegion && <th className="py-3 pr-4">Region</th>}
                      <th className="py-3 pr-4">Age</th>
                      <th className="py-3 pr-4">Confidence</th>
                      <th className="py-3 pr-4">Why flagged → action</th>
                      <th className="py-3 pr-4">Owner / tags</th>
                      <th className="py-3 text-right">Est. $/mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map(f => (
                      <tr key={f.region + f.resource_id} className="border-b border-slate-50 align-top hover:bg-slate-50/60">
                        <td className="py-4 pr-4">
                          <div className="font-black text-slate-900 break-all">{f.name || f.resource_id}</div>
                          <div className="text-[11px] font-bold text-slate-400 break-all">{f.resource_type}{f.name ? ` · ${f.resource_id}` : ''}</div>
                        </td>
                        {multiRegion && <td className="py-4 pr-4 text-xs font-bold text-slate-500 whitespace-nowrap">{f.region}</td>}
                        <td className="py-4 pr-4 font-bold text-slate-600 whitespace-nowrap">{f.age_days !== '' ? `${f.age_days} d` : '—'}</td>
                        <td className="py-4 pr-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black ${f.confidence === 'HIGH' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{f.confidence}</span>
                        </td>
                        <td className="py-4 pr-4">
                          <div className="font-bold text-slate-700">{f.evidence}</div>
                          <div className="text-[11px] font-bold text-blue-700 mt-1">→ {f.recommendation}</div>
                          <div className="text-[11px] text-slate-400 mt-1">{f.cost_basis}</div>
                        </td>
                        <td className="py-4 pr-4">
                          <div className={`font-bold ${f.owner ? 'text-slate-700' : 'text-slate-300'}`}>{f.owner || 'untagged'}</div>
                          {labelText(f.labels) && <div className="text-[11px] font-bold text-slate-400">{labelText(f.labels)}</div>}
                        </td>
                        <td className="py-4 text-right font-mono font-black text-slate-900 whitespace-nowrap">{money(f.est_monthly_cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {findings.length === 0 && <p className="text-center py-16 text-slate-300 font-black uppercase tracking-widest">No cleanup findings</p>}
              </div>
            </div>
          )}

          {data.errors?.length > 0 && (
            <details className="bg-amber-50 border border-amber-200 rounded-[32px] p-6">
              <summary className="font-black text-amber-800 cursor-pointer flex items-center gap-2"><Layers size={16} /> {data.errors.length} scan warning(s), usually a missing permission or a region not enabled</summary>
              <ul className="mt-3 space-y-1 text-xs font-bold text-amber-800">{data.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
