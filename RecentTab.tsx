import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Search, AlertTriangle, Info, Layers, Clock, User, Tag } from 'lucide-react';
import { readEndpoint, REGION_OPTIONS } from './InventoryTab';

// "Recently Created": resources created in the last N days, with a monthly estimate, creator and tags.
// AWS: inventory Lambda {mode:'recent'} (creation time from the APIs, creator from CloudTrail or tags).
// OCI / GCP: their billing functions {mode:'recent'} (first billed day, run-rate estimate; creator where readable).
type Cloud = 'aws' | 'oci' | 'gcp';
type Row = {
  region: string; resource_id: string; name: string; resource_type: string; service?: string;
  created: string; created_source?: string; created_by: string; created_by_source: string;
  tags: Record<string, string>; est_monthly_usd: number | null; price_basis?: string;
  cost_so_far?: number; details?: string; size?: string;
  tenancy?: string; compartment?: string; not_included?: string;
  status?: 'active' | 'ended'; last_billed?: string;
};
type Recent = {
  mode: string; days: number; since: string; generated_at: string; resources: Row[];
  summary: { count: number; est_monthly_usd: number; creators_found: number };
  regions_scanned?: string[]; note?: string; warnings?: string[]; errors?: string[]; error?: string;
};

const DAY_OPTIONS = [7, 14, 30];
const AWS_USED = REGION_OPTIONS.filter(o => o.value !== 'all').map(o => o.value);
const cache = new Map<string, Recent>();
const money = (n: number | null | undefined) => n == null ? '—' :
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return isNaN(d) ? '' : d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
};

const THEME: Record<Cloud, { btn: string; active: string; text: string; chipOn: string; ring: string }> = {
  aws: { btn: 'bg-blue-600', active: 'bg-white text-blue-700 shadow-sm', text: 'text-blue-600', chipOn: 'bg-blue-600 text-white', ring: 'focus:ring-blue-500' },
  oci: { btn: 'bg-rose-600', active: 'bg-white text-rose-700 shadow-sm', text: 'text-rose-600', chipOn: 'bg-rose-600 text-white', ring: 'focus:ring-rose-500' },
  gcp: { btn: 'bg-emerald-600', active: 'bg-white text-emerald-700 shadow-sm', text: 'text-emerald-600', chipOn: 'bg-emerald-600 text-white', ring: 'focus:ring-emerald-500' },
};
const SCOPE: Record<Cloud, string> = { aws: 'Region', oci: 'Tenancy', gcp: 'Project' };
// Automatic backups/snapshots are created every day by backup policies: hidden unless asked for
const isBackup = (r: Row) => /backup|snapshot/i.test(r.resource_type || '');
const isEnded = (r: Row) => r.status === 'ended';

export default function RecentTab({ cloud, endpoint }: { cloud: Cloud; endpoint: string }) {
  const th = THEME[cloud];
  const [days, setDays] = useState(14);
  const [region, setRegion] = useState('used');
  const [data, setData] = useState<Recent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [scope, setScope] = useState('All');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState('');
  const [showBackups, setShowBackups] = useState(false);
  const [showEnded, setShowEnded] = useState(true);
  const reqId = useRef(0);
  const url = cloud === 'aws' ? readEndpoint() : endpoint;

  const load = async (force = false) => {
    const key = `${cloud}|${days}|${cloud === 'aws' ? region : ''}`;
    if (!force && cache.has(key)) { setData(cache.get(key)!); setError(null); return; }
    const id = ++reqId.current;
    setLoading(true); setError(null); setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const body: any = { mode: 'recent', days };
      if (cloud === 'aws') body.regions = region === 'used' ? AWS_USED : region === 'all' ? 'all' : [region];
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json: Recent = await resp.json();
      if (id !== reqId.current) return;
      if (!resp.ok || json.error) throw new Error(json.error || `HTTP ${resp.status}`);
      if (json.mode !== 'recent') throw new Error('This cloud\'s function has not been updated with the "recent" mode yet.');
      cache.set(key, json);
      setData(json);
    } catch (e: any) {
      if (id !== reqId.current) return;
      setError(e?.message?.includes('Failed to fetch') ? 'Could not reach the function (network, CORS or timeout).' : e?.message || String(e));
    } finally {
      clearInterval(timer);
      if (id === reqId.current) setLoading(false);
    }
  };

  useEffect(() => { setScope('All'); load(); }, [days, region]);

  const scopeOf = (r: Row) => cloud === 'aws' ? r.region : (r.tenancy || '');
  const all = data?.resources || [];
  const backups = all.filter(isBackup);
  const ended = all.filter(r => isEnded(r) && (showBackups || !isBackup(r)));
  const base = useMemo(() => all.filter(r => (showBackups || !isBackup(r)) && (showEnded || !isEnded(r))),
    [data, showBackups, showEnded]);
  const live = base.filter(r => !isEnded(r));
  const kpi = {
    count: base.length,
    cost: live.reduce((s, r) => s + (r.est_monthly_usd || 0), 0),
    creators: base.filter(r => r.created_by).length,
  };
  const scopes = useMemo(() => {
    const out: Record<string, { count: number; cost: number }> = {};
    base.forEach(r => {
      const k = scopeOf(r) || '—';
      const o = out[k] = out[k] || { count: 0, cost: 0 };
      o.count++; o.cost += r.est_monthly_usd || 0;
    });
    return Object.entries(out).sort((a, b) => b[1].cost - a[1].cost);
  }, [base]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => base
    .filter(r => scope === 'All' || (scopeOf(r) || '—') === scope)
    .filter(r => !q || [r.name, r.resource_id, r.resource_type, r.created_by, r.region, r.tenancy, r.compartment,
      ...Object.entries(r.tags || {}).map(([k, v]) => `${k}=${v}`)].some(v => (v || '').toLowerCase().includes(q))),
    [base, scope, q]);
  const shownTotal = rows.reduce((s, r) => s + (r.est_monthly_usd || 0), 0);
  const notes = [...(data?.warnings || []), ...(data?.errors || [])];

  const copy = (id: string) => {
    try { navigator.clipboard.writeText(id); setCopied(id); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard blocked */ }
  };
  const chip = (on: boolean) => `px-4 py-2 rounded-full text-xs font-black transition-all ${on ? th.chipOn : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`;
  const isEstimate = cloud !== 'aws';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-10">
      <div className="bg-white rounded-[56px] border border-slate-200 p-10 shadow-sm flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter flex items-center gap-3"><Clock className={th.text} size={28} /> Recently Created</h2>
          <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest mt-1">
            Resources created in the last {days} days{data ? ` · since ${fmtDay(data.since)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl">
            {DAY_OPTIONS.map(d => (
              <button key={d} onClick={() => setDays(d)} disabled={loading}
                className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${days === d ? th.active : 'text-slate-500 hover:text-slate-900'}`}>
                {d} days
              </button>
            ))}
          </div>
          {cloud === 'aws' && (
            <select value={region} onChange={e => setRegion(e.target.value)} disabled={loading}
              className={`px-4 py-3 rounded-2xl border border-slate-200 bg-white text-xs font-black outline-none focus:ring-2 ${th.ring}`}>
              <option value="used">Main regions ({AWS_USED.length})</option>
              {REGION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <button onClick={() => load(true)} disabled={loading}
            className={`px-6 py-3 rounded-2xl ${th.btn} text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg disabled:opacity-60 active:scale-95 transition-transform`}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? `Loading… ${elapsed}s` : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="bg-white rounded-[56px] border border-slate-200 p-20 text-center shadow-sm">
          <RefreshCw size={36} className={`animate-spin ${th.text} mx-auto mb-6`} />
          <p className="text-lg font-black text-slate-900">Finding resources created in the last {days} days… {elapsed}s</p>
          {cloud === 'aws' && <p className="text-slate-500 font-bold mt-2">Scanning several regions and CloudTrail usually takes 1–2 minutes.</p>}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[32px] p-6 font-bold flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" /> <span>Could not load recent resources: {error}</span>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm">
              <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">New resources</h3>
              <p className="text-4xl font-black text-slate-900 tracking-tighter">{kpi.count}</p>
              <p className="text-xs font-bold text-slate-400 mt-2">created in the last {data.days} days{ended.length && showEnded ? ` · ${ended.length} already gone` : ''}</p>
            </div>
            <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm">
              <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Added to the monthly bill</h3>
              <p className={`text-4xl font-black tracking-tighter ${th.text}`}>{money(kpi.cost)}</p>
              <p className="text-xs font-bold text-slate-400 mt-2">{isEstimate ? 'estimated from their daily cost so far' : 'on-demand list price, fixed charges'}</p>
            </div>
            <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm">
              <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Creator known</h3>
              <p className="text-4xl font-black text-slate-900 tracking-tighter">{kpi.creators} <span className="text-xl text-slate-400">/ {kpi.count}</span></p>
              <p className="text-xs font-bold text-slate-400 mt-2">{cloud === 'aws' ? 'from CloudTrail or owner tags' : cloud === 'gcp' ? 'from audit logs or labels' : 'from Oracle-Tags.CreatedBy'}</p>
            </div>
          </div>

          <div className="bg-white rounded-[56px] border border-slate-200 p-10 shadow-sm space-y-6">
            {scopes.length > 1 && (
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{SCOPE[cloud]}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setScope('All')} className={chip(scope === 'All')}>All · {money(kpi.cost)}</button>
                  {scopes.map(([s, v]) => (
                    <button key={s} onClick={() => setScope(s)} className={chip(scope === s)}>{s} · {v.count} · {money(v.cost)}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="relative w-full md:w-96">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, ID, type, creator, tag…"
                  className={`w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold outline-none focus:ring-2 ${th.ring}`} />
              </div>
              {backups.length > 0 && (
                <label className="flex items-center gap-2 text-xs font-black text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={showBackups} onChange={e => setShowBackups(e.target.checked)} />
                  Show automatic backups &amp; snapshots ({backups.length})
                </label>
              )}
              {all.some(isEnded) && (
                <label className="flex items-center gap-2 text-xs font-black text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={showEnded} onChange={e => setShowEnded(e.target.checked)} />
                  Show resources that are already gone
                </label>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                    <th className="py-3 pr-4">Resource</th>
                    <th className="py-3 pr-4">{SCOPE[cloud]}</th>
                    <th className="py-3 pr-4">Created</th>
                    <th className="py-3 pr-4">Created by</th>
                    <th className="py-3 pr-4">Tags</th>
                    <th className="py-3 text-right">Est. $ / month</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const tags = Object.entries(r.tags || {}).filter(([k]) => k !== 'Name');
                    return (
                      <tr key={r.region + r.resource_id} className={`border-b border-slate-50 align-top hover:bg-slate-50/60 ${isEnded(r) ? 'opacity-50' : ''}`}>
                        <td className="py-4 pr-4 max-w-xs">
                          {r.name
                            ? <div className="font-black text-slate-900 break-all">{r.name}</div>
                            : <div className="font-mono text-[11px] font-bold text-slate-700 break-all">{r.resource_id}</div>}
                          <button onClick={() => copy(r.resource_id)} title={`${r.resource_id} (click to copy)`}
                            className="text-[11px] font-bold text-slate-400 hover:text-slate-700 text-left">
                            {copied === r.resource_id ? 'copied ✓' : `${r.resource_type}${r.name ? ' · copy ID' : ''}`}
                          </button>
                          {r.details && <div className="text-[11px] text-slate-400 mt-1">{r.details}</div>}
                          {isEnded(r) && <div className="mt-1"><span className="px-2 py-0.5 rounded-full bg-slate-200 text-[10px] font-black uppercase text-slate-600">no longer billing{r.last_billed ? ` since ${fmtDay(r.last_billed + 'T00:00:00Z')}` : ''}</span></div>}
                        </td>
                        <td className="py-4 pr-4">
                          <div className="font-bold text-slate-700">{cloud === 'aws' ? r.region : r.tenancy}</div>
                          <div className="text-[11px] font-bold text-slate-400 break-all">{cloud === 'aws' ? r.service : cloud === 'oci' ? [r.compartment, r.region].filter(Boolean).join(' · ') : r.region}</div>
                        </td>
                        <td className="py-4 pr-4 whitespace-nowrap">
                          <div className="font-bold text-slate-700">{(r.created_source || '').startsWith('first billed') ? fmtDay(r.created) : fmtWhen(r.created)}</div>
                          <div className="text-[11px] font-bold text-slate-400">{ago(r.created)}{r.created_source && r.created_source !== 'Resource Search' && r.created_source !== 'audit log' ? ` · ${r.created_source}` : ''}</div>
                        </td>
                        <td className="py-4 pr-4">
                          {r.created_by
                            ? <><div className="font-bold text-slate-700 break-all flex items-start gap-1"><User size={12} className="mt-1 shrink-0 text-slate-400" />{r.created_by}</div>
                                <div className="text-[11px] font-bold text-slate-400">{r.created_by_source}</div></>
                            : <span className="font-bold text-slate-300">unknown</span>}
                        </td>
                        <td className="py-4 pr-4 max-w-xs">
                          {tags.length === 0 ? <span className="text-[11px] font-bold text-slate-300">no tags</span> : (
                            <div className="flex flex-wrap gap-1">
                              {tags.slice(0, 5).map(([k, v]) => (
                                <span key={k} title={`${k}=${v}`} className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 max-w-[14rem] truncate">
                                  <Tag size={9} className="inline mr-1" />{k}{v ? `: ${v}` : ''}
                                </span>
                              ))}
                              {tags.length > 5 && <span title={tags.slice(5).map(([k, v]) => `${k}=${v}`).join('\n')} className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">+{tags.length - 5}</span>}
                            </div>
                          )}
                        </td>
                        <td className="py-4 text-right whitespace-nowrap">
                          <div className="font-mono font-black text-slate-900">{money(r.est_monthly_usd)}</div>
                          {r.cost_so_far != null && <div className="text-[11px] font-bold text-slate-400">{money(r.cost_so_far)} so far</div>}
                          {r.price_basis && <div className="text-[10px] text-slate-400 max-w-[16rem] ml-auto whitespace-normal">{r.price_basis}</div>}
                        </td>
                      </tr>
                    );
                  })}
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
              {rows.length === 0 && <p className="text-center py-16 text-slate-300 font-black uppercase tracking-widest">No resources created in this window</p>}
            </div>
            <p className="text-xs font-bold text-slate-400 flex items-start gap-2">
              <Info size={14} className="shrink-0 mt-0.5" />
              {cloud === 'aws'
                ? 'Billable resources that exist now and were created in the window (EC2, EBS, RDS, ElastiCache, EFS, S3, load balancers, NAT, Elastic IPs, VPN, Transit Gateway, VPC endpoints). Monthly estimate is the on-demand list price x 730 h for fixed charges; usage-based charges are not included. Creator comes from CloudTrail event history, otherwise from owner tags.'
                : cloud === 'oci'
                  ? 'Resources first billed in the window, across every tenancy. Monthly estimate is the average daily cost on full days so far x 30.4. Parent-tenancy resources show their real creation time and creator; child tenancies show the first billed day (exact time and creator need cross-tenancy read access).'
                  : 'Resources first billed in the window, from the BigQuery billing export (billing account currency). Monthly estimate is the average daily net cost on full days so far x 30.4. Creator comes from Admin Activity audit logs, otherwise from owner labels.'}
            </p>
          </div>

          {notes.length > 0 && (
            <details className="bg-amber-50 border border-amber-200 rounded-[32px] p-6">
              <summary className="font-black text-amber-800 cursor-pointer flex items-center gap-2"><Layers size={16} /> {notes.length} note(s) from the scan</summary>
              <ul className="mt-3 space-y-1 text-xs font-bold text-amber-800">{notes.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
