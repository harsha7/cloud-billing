
import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { 
  Activity, TrendingUp, DollarSign, Globe, LayoutDashboard, History,
  ArrowUpRight, ArrowDownRight, ShieldCheck, RefreshCw,
  AlertCircle, Share2, Database, CheckCircle2, Key, Server, 
  ChevronRight, X, Copy, Terminal, Settings2, Activity as Pulse, AlertTriangle, Link2,
  ArrowRightLeft, Minus, Plus, Calendar, ChevronDown, ArrowRight, Layers,
  Search, Download, ChevronLeft, Filter, ExternalLink
} from 'lucide-react';
import { MonthlyData, AWSCredentials, BillingEntry } from './types';

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const TARGET_REGIONS = [
  { key: 'ca-central-1', label: 'Canada Central (X-ray)', match: ['canada', 'ca-central-1'], color: 'blue' },
  { key: 'us-east-1', label: 'N. Virginia (Managed infra)', match: ['virginia', 'us-east-1'], color: 'indigo' },
  { key: 'us-east-2', label: 'Ohio (ri-commercedev)', match: ['ohio', 'us-east-2'], color: 'purple' },
  { key: 'us-west-2', label: 'Oregon (General)', match: ['oregon', 'us-west-2'], color: 'emerald' },
  { key: 'Global', label: 'Taxes / Global', match: ['tax', 'global', 'no region', 'n/a'], color: 'slate' }
];

const getCompleted12MonthLabels = () => {
  const labels = [];
  for (let i = 12; i >= 1; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    labels.push(`${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`);
  }
  return labels;
};

const generateMock12Months = (): MonthlyData[] => {
  const labels = getCompleted12MonthLabels();
  const BASE_SERVICES = ["EC2-Instances", "VPC", "Relational Database Service", "S3", "CloudWatch", "Elastic Load Balancing"];

  return labels.map((month, i) => {
    const factor = 0.8 + (i * 0.03);
    const entries: BillingEntry[] = [];
    TARGET_REGIONS.forEach(reg => {
      let regionalBase = reg.key === 'ca-central-1' ? 6200 : reg.key === 'us-east-1' ? 3100 : 1400;
      let regionalTotal = regionalBase * factor;
      BASE_SERVICES.forEach((svc, sIdx) => {
        const share = [0.4, 0.25, 0.15, 0.1, 0.05, 0.05][sIdx] || 0.01;
        entries.push({ region: reg.key, service: svc, cost: Number((regionalTotal * share).toFixed(2)) });
      });
    });
    return { month, entries };
  });
};

const encodeState = (data: MonthlyData[]) => btoa(JSON.stringify(data));
const decodeState = (str: string): MonthlyData[] | null => {
  try { return JSON.parse(atob(str)); } catch (e) { return null; }
};

const CustomRegionTick = (props: any) => {
  const { x, y, payload } = props;
  const label = payload.value;
  const match = label.match(/^(.*?)\s*\((.*?)\)$/);
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={15} textAnchor="middle" fill="#1e293b" fontSize={14} fontWeight="900" className="uppercase tracking-tight font-black">
        {match ? match[1] : label}
      </text>
      {match && <text x={0} y={35} textAnchor="middle" fill="#3b82f6" fontSize={12} fontWeight="800">({match[2]})</text>}
    </g>
  );
};

export default function App() {
  const [billingHistory, setBillingHistory] = useState<MonthlyData[]>(generateMock12Months());
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'comparison' | 'services'>('overview');
  const [isFetching, setIsFetching] = useState(false);
  const [showLambdaInfo, setShowLambdaInfo] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [credentials, setCredentials] = useState<AWSCredentials>({ accessKeyId: '', secretAccessKey: '', region: 'us-east-1', endpoint: '' });
  
  const [serviceSearch, setServiceSearch] = useState("");
  const [baseMonthIdx, setBaseMonthIdx] = useState(billingHistory.length - 2);
  const [targetMonthIdx, setTargetMonthIdx] = useState(billingHistory.length - 1);
  const [drillDownRegion, setDrillDownRegion] = useState(TARGET_REGIONS[0].key);
  const [drillDownMonthIdx, setDrillDownMonthIdx] = useState(billingHistory.length - 1);

  useEffect(() => {
    if (billingHistory.length > 0) {
      setBaseMonthIdx(Math.max(0, billingHistory.length - 2));
      setTargetMonthIdx(billingHistory.length - 1);
      setDrillDownMonthIdx(billingHistory.length - 1);
    }
  }, [billingHistory.length]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedData = params.get('report');
    if (sharedData) {
      const decoded = decodeState(sharedData);
      if (decoded) setBillingHistory(decoded);
    }
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 8000);
  };

  const connectAWS = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEndpoint = credentials.endpoint?.trim();
    if (!cleanEndpoint) {
      showToast("Please enter your Lambda Function URL.", "error");
      return;
    }
    setIsFetching(true);
    try {
      const response = await fetch(cleanEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey, region: credentials.region })
      });
      if (!response.ok) throw new Error(`Server Response: ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        setBillingHistory(data);
        showToast("CloudSync: Success");
      } else {
        throw new Error("Invalid response schema from Lambda");
      }
    } catch (err: any) {
      showToast(`Sync Error: ${err.message}`, "error");
    } finally { setIsFetching(false); }
  };

  const getAggregatedRegions = (month: MonthlyData) => {
    if (!month || !month.entries) return TARGET_REGIONS.map(t => ({ region: t.label, key: t.key, cost: 0, color: t.color }));
    return TARGET_REGIONS.map(target => {
      const regionEntries = month.entries.filter(e => {
        const regName = (e.region || e.Region || (e.Keys && e.Keys[0]) || "").toLowerCase();
        return target.match.some(keyword => regName.includes(keyword));
      });
      return { region: target.label, key: target.key, cost: regionEntries.reduce((sum, e) => sum + e.cost, 0), color: target.color };
    });
  };

  const currentMonth = billingHistory[billingHistory.length - 1] || { month: 'N/A', entries: [] };
  const activeBaseMonth = billingHistory[baseMonthIdx] || billingHistory[0] || { month: 'N/A', entries: [] };
  const activeTargetMonth = billingHistory[targetMonthIdx] || currentMonth;
  
  const orderedRegions = useMemo(() => getAggregatedRegions(currentMonth), [currentMonth]);
  const totalSpendLatest = useMemo(() => currentMonth.entries.reduce((sum, e) => sum + e.cost, 0), [currentMonth]);
  const momPercentLatest = useMemo(() => {
    const prevMonth = billingHistory[billingHistory.length - 2];
    const prev = prevMonth?.entries.reduce((s, e) => s + e.cost, 0) || 0;
    return prev > 0 ? ((totalSpendLatest - prev) / prev) * 100 : 0;
  }, [totalSpendLatest, billingHistory]);

  const comparisonData = useMemo(() => {
    const baseAgg = getAggregatedRegions(activeBaseMonth);
    const targetAgg = getAggregatedRegions(activeTargetMonth);
    return TARGET_REGIONS.map((target, idx) => {
      const cur = targetAgg[idx]?.cost || 0;
      const prev = baseAgg[idx]?.cost || 0;
      return { label: target.label, current: cur, previous: prev, diff: cur - prev, percent: prev > 0 ? ((cur - prev) / prev) * 100 : 0 };
    });
  }, [activeTargetMonth, activeBaseMonth]);

  const serviceDrillDownData = useMemo(() => {
    const month = billingHistory[drillDownMonthIdx];
    const regionTarget = TARGET_REGIONS.find(t => t.key === drillDownRegion);
    if (!month || !month.entries || !regionTarget) return [];

    const entries = month.entries.filter(e => {
      const regName = (e.region || e.Region || (e.Keys && e.Keys[0]) || "").toLowerCase();
      return regionTarget.match.some(keyword => regName.includes(keyword));
    });

    const serviceMap: Record<string, number> = {};
    entries.forEach(e => {
      let svcName = e.service || e.Service || e.usageType || e.UsageType || e.svc;
      if (!svcName && e.Keys && Array.isArray(e.Keys)) {
        svcName = e.Keys.length > 1 ? e.Keys[1] : e.Keys[0];
      }
      if (!svcName) {
        const potentialKeys = Object.entries(e).find(([k, v]) => 
          typeof v === 'string' && 
          !['region', 'Region', 'month', 'Keys', 'time'].includes(k.toLowerCase()) &&
          !regionTarget.match.some(kw => v.toLowerCase().includes(kw))
        );
        svcName = potentialKeys ? (potentialKeys[1] as string) : null;
      }
      const finalName = svcName || "Core Infrastructure";
      serviceMap[finalName] = (serviceMap[finalName] || 0) + e.cost;
    });

    return Object.entries(serviceMap)
      .map(([name, cost]) => ({ name, cost }))
      .filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()))
      .sort((a, b) => b.cost - a.cost);
  }, [drillDownMonthIdx, drillDownRegion, billingHistory, serviceSearch]);

  const drillDownTotal = useMemo(() => serviceDrillDownData.reduce((s, e) => s + e.cost, 0), [serviceDrillDownData]);
  const isDataAggregated = serviceDrillDownData.length === 1 && (serviceDrillDownData[0].name.toLowerCase().includes('resource') || serviceDrillDownData[0].name.toLowerCase().includes('infra'));

  const lambdaCode = `import json
import boto3
from datetime import datetime, timedelta

def lambda_handler(event, context):
    try:
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}
        ak, sk, reg = body.get('accessKeyId'), body.get('secretAccessKey'), body.get('region', 'us-east-1')
        client_args = {'region_name': reg}
        if ak and sk: client_args.update({'aws_access_key_id': ak, 'aws_secret_access_key': sk})
        ce = boto3.client('ce', **client_args)
        end = datetime.now().replace(day=1)
        start = (end - timedelta(days=365)).replace(day=1)
        res = ce.get_cost_and_usage(
            TimePeriod={'Start': start.strftime('%Y-%m-%d'), 'End': end.strftime('%Y-%m-%d')},
            Granularity='MONTHLY', Metrics=['UnblendedCost'],
            GroupBy=[{'Type': 'DIMENSION', 'Key': 'REGION'}, {'Type': 'DIMENSION', 'Key': 'SERVICE'}]
        )
        output = []
        for p in res['ResultsByTime']:
            lbl = datetime.strptime(p['TimePeriod']['Start'], '%Y-%m-%d').strftime('%b %Y')
            ents = []
            for g in p['Groups']:
                raw_reg, raw_svc = g['Keys'][0], g['Keys'][1]
                ents.append({
                    "region": raw_reg if raw_reg != "No Region" else "Global",
                    "service": raw_svc, 
                    "cost": round(float(g['Metrics']['UnblendedCost']['Amount']), 2)
                })
            output.append({"month": lbl, "entries": ents})
        return {'statusCode': 200, 'body': json.dumps(output)}
    except Exception as e: return {'statusCode': 500, 'body': json.dumps({"error": str(e)})}`;

  return (
    <div className="min-h-screen bg-[#f8fafc] flex font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-84 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen shrink-0 shadow-sm z-50">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-xl shadow-blue-100"><Activity size={24} /></div>
            <div><h1 className="text-lg font-black tracking-tight leading-none">CloudSpend</h1><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Enterprise Hub</span></div>
          </div>
          <nav className="space-y-1">
            {[
              { id: 'overview', icon: LayoutDashboard, label: 'Dashboard' },
              { id: 'trends', icon: TrendingUp, label: '12M History' },
              { id: 'comparison', icon: ArrowRightLeft, label: 'MoM Comparison' },
              { id: 'services', icon: Layers, label: 'Service Explorer' }
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <tab.icon size={20} /> {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-6">
          <div className="bg-slate-900 rounded-[40px] p-8 shadow-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-6 text-white font-black text-[10px] uppercase tracking-widest">
              <span className="flex items-center gap-2"><Server size={14} className="text-blue-400" /> Connection</span>
              <button onClick={() => setShowLambdaInfo(true)} className="text-blue-400 hover:text-white transition-colors"><Settings2 size={14} /></button>
            </div>
            <form onSubmit={connectAWS} className="space-y-4">
              <input type="text" placeholder="https://..." className="w-full px-4 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl text-[11px] font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600" value={credentials.endpoint} onChange={e => setCredentials({...credentials, endpoint: e.target.value})} />
              <button type="submit" disabled={isFetching} className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-blue-900/40">
                {isFetching ? <RefreshCw className="animate-spin" size={16} /> : <Pulse size={16}/>} Sync Data
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="h-24 border-b border-slate-200 bg-white/80 backdrop-blur-2xl sticky top-0 z-40 px-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-slate-400 font-bold text-[11px] uppercase tracking-widest">Enterprise Analytics</span>
            <ChevronRight size={16} className="text-slate-200" />
            <span className="text-slate-900 font-black text-[11px] uppercase tracking-widest bg-slate-100 px-4 py-2 rounded-full">{activeTab}</span>
          </div>
          <button onClick={() => { const url = new URL(window.location.href); url.searchParams.set('report', encodeState(billingHistory)); navigator.clipboard.writeText(url.toString()); showToast("Shareable link copied!"); }} className="flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-3xl text-[11px] font-black uppercase tracking-widest shadow-2xl transition-all active:scale-95"><Share2 size={18} /> Share Dashboard</button>
        </header>

        <div className="p-12 mx-auto space-y-12">
          {activeTab === 'overview' && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-12">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                  <div className="bg-white p-12 rounded-[64px] border border-slate-200 shadow-sm relative group overflow-hidden">
                    <div className="absolute -top-6 -right-6 p-12 opacity-[0.03] text-blue-600"><DollarSign size={160} /></div>
                    <div className="flex justify-between items-start mb-8">
                      <div className="p-5 bg-blue-50 text-blue-600 rounded-[32px] shadow-sm"><DollarSign size={32} /></div>
                      <div className={`flex items-center gap-2 text-[11px] font-black px-5 py-2.5 rounded-2xl ${momPercentLatest >= 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {momPercentLatest >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                        {Math.abs(momPercentLatest).toFixed(1)}% MoM
                      </div>
                    </div>
                    <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">{currentMonth.month} Total</h3>
                    <p className="text-6xl font-black text-slate-900 tracking-tighter">${totalSpendLatest.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-12 rounded-[64px] border border-slate-200 shadow-sm relative overflow-hidden group">
                    <div className="absolute -top-6 -right-6 p-12 opacity-[0.03] text-purple-600"><Globe size={160} /></div>
                    <div className="flex justify-between items-start mb-8">
                      <div className="p-5 bg-purple-50 text-purple-600 rounded-[32px] shadow-sm"><Globe size={32} /></div>
                    </div>
                    <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Dominant Region</h3>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">Canada Central</p>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-3 flex items-center gap-2"><span className="w-2 h-2 bg-purple-500 rounded-full animate-ping" /> Peak Load • ${orderedRegions[0]?.cost.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-12 rounded-[64px] border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-8"><div className="p-5 bg-emerald-50 text-emerald-600 rounded-[32px] shadow-sm"><ShieldCheck size={32} /></div></div>
                    <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">System Insight</h3>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">Granular Drill-down</p>
                    <div className="w-full bg-slate-100 h-4 rounded-full mt-8 overflow-hidden shadow-inner p-1">
                      <div className="bg-emerald-500 h-full rounded-full transition-all duration-1500" style={{ width: '100%' }} />
                    </div>
                  </div>
               </div>
               <div className="bg-white rounded-[72px] border border-slate-200 p-16 shadow-sm">
                  <h2 className="text-[13px] font-black uppercase tracking-[0.2em] mb-16 flex items-center gap-4"><span className="w-4 h-4 bg-blue-500 rounded-full animate-pulse" /> Regional Cost Distribution</h2>
                  <div className="h-[550px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={orderedRegions} margin={{ bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="region" interval={0} axisLine={false} tickLine={false} tick={<CustomRegionTick />} />
                        <YAxis tickFormatter={(val) => `$${val.toLocaleString()}`} stroke="#cbd5e1" fontSize={11} axisLine={false} tickLine={false} fontWeight="black" />
                        <Tooltip cursor={{ fill: '#f8fafc', radius: 32 }} contentStyle={{ borderRadius: '48px', border: 'none' }} />
                        <Bar dataKey="cost" fill="#3b82f6" radius={[24, 24, 0, 0]} barSize={80} onClick={(d) => { const t = TARGET_REGIONS.find(tr => tr.label === d.region); if(t) { setDrillDownRegion(t.key); setActiveTab('services'); }}} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'trends' && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 w-full">
              <div className="bg-white rounded-[72px] border border-slate-200 overflow-hidden shadow-sm w-full">
                <div className="px-16 py-16 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <div>
                    <h2 className="text-[14px] font-black uppercase tracking-[0.3em] flex items-center gap-4 mb-2"><Database size={24} className="text-blue-500" /> Historical Billing Ledger</h2>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Enterprise-wide regional tracking • Last 12 Months</p>
                  </div>
                </div>
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left table-fixed">
                    <thead><tr className="text-[11px] font-black uppercase tracking-widest text-slate-400 bg-slate-50/80"><th className="py-12 px-16 w-48">Fiscal Period</th><th className="py-12 px-16 w-64 text-right">Aggregate Spend</th><th className="py-12 px-16 text-center">Regional Breakdown</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...billingHistory].reverse().map((month, idx) => {
                        const total = month.entries.reduce((s, e) => s + e.cost, 0);
                        const breakdown = getAggregatedRegions(month);
                        return (
                          <tr key={idx} className="group hover:bg-blue-50/10 transition-all border-b border-slate-50">
                            <td className="py-12 px-16 font-black text-slate-900 uppercase tracking-widest text-lg">{month.month}</td>
                            <td className="py-12 px-16 text-right font-mono font-black text-slate-900 text-3xl tracking-tighter">${total.toLocaleString()}</td>
                            <td className="py-12 px-8">
                              <div className="grid grid-cols-5 gap-4">
                                {breakdown.map((b, i) => {
                                  const nameMatch = b.region.match(/^(.*?)\s*\((.*?)\)$/);
                                  const mainName = nameMatch ? nameMatch[1] : b.region;
                                  const bracketName = nameMatch ? nameMatch[2] : '';
                                  const colorMap: Record<string, string> = {
                                    blue: 'bg-blue-50 text-blue-800 border-blue-200',
                                    indigo: 'bg-indigo-50 text-indigo-800 border-indigo-200',
                                    purple: 'bg-purple-50 text-purple-800 border-purple-200',
                                    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                                    slate: 'bg-slate-100 text-slate-700 border-slate-300'
                                  };
                                  const activeStyle = colorMap[b.color || 'blue'];
                                  
                                  return (
                                    <div key={i} className={`px-4 py-5 rounded-[40px] border-2 ${b.cost > 0 ? activeStyle + ' shadow-md' : 'opacity-20 bg-slate-100 border-transparent'} transition-all hover:scale-[1.05] hover:z-10 relative overflow-hidden`}>
                                      <div className="absolute top-0 left-0 w-1 h-full bg-current opacity-20" />
                                      <span className="text-[10px] font-black uppercase tracking-tight block text-center mb-0.5 leading-none">{mainName}</span>
                                      {bracketName && <span className="text-[9px] font-bold uppercase tracking-widest block text-center mb-2 opacity-60 leading-none">({bracketName})</span>}
                                      <span className="text-lg font-black tracking-tighter block text-center leading-none">${b.cost.toLocaleString()}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'comparison' && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 w-full space-y-12">
              <div className="bg-white rounded-[72px] border border-slate-200 overflow-hidden shadow-sm w-full">
                <div className="px-16 py-16 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                  <div><h2 className="text-[14px] font-black uppercase tracking-[0.3em] flex items-center gap-4 mb-2"><ArrowRightLeft size={24} className="text-blue-500" /> Parallel Variance Engine</h2></div>
                  <div className="flex items-center gap-6">
                    <select value={baseMonthIdx} onChange={(e) => setBaseMonthIdx(parseInt(e.target.value))} className="bg-slate-100 px-8 py-4 rounded-2xl text-[11px] font-black uppercase text-slate-600 outline-none">{billingHistory.map((m, i) => <option key={i} value={i}>{m.month}</option>)}</select>
                    <ArrowRight size={24} className="text-slate-300" />
                    <select value={targetMonthIdx} onChange={(e) => setTargetMonthIdx(parseInt(e.target.value))} className="bg-blue-600 px-8 py-4 rounded-2xl text-[11px] font-black uppercase text-white outline-none">{billingHistory.map((m, i) => <option key={i} value={i}>{m.month}</option>)}</select>
                  </div>
                </div>
                <div className="p-16 space-y-8">
                   {comparisonData.map((item, idx) => {
                      const isUp = item.diff > 0;
                      return (
                        <div key={idx} className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-10 group transition-all">
                           <div className="bg-slate-50/50 rounded-[48px] p-8 border border-slate-100 flex items-center justify-between w-full"><span className="text-[13px] font-black text-slate-900 uppercase tracking-tight">{item.label}</span><span className="text-[20px] font-black text-slate-400 tracking-tighter">${item.previous.toLocaleString()}</span></div>
                           <div className="text-slate-200 hidden lg:block"><ArrowRight size={32} /></div>
                           <div className="bg-white rounded-[48px] p-8 border-2 border-blue-50 shadow-xl flex items-center justify-between group-hover:scale-[1.01] transition-transform w-full">
                              <div className="flex items-center gap-6"><div className={`p-4 rounded-2xl ${isUp ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{isUp ? <Plus size={20} /> : <Minus size={20} />}</div><span className="text-[13px] font-black text-slate-900 uppercase tracking-tight">{item.label}</span></div>
                              <div className="text-right"><span className={`text-[10px] font-black px-4 py-1 rounded-full mb-1 inline-block ${isUp ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>{isUp ? '+' : ''}{item.percent.toFixed(1)}%</span><span className="text-[24px] font-black text-slate-900 tracking-tighter block">${item.current.toLocaleString()}</span></div>
                           </div>
                        </div>
                      );
                   })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'services' && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 w-full space-y-12">
               {isDataAggregated && (
                 <div className="bg-amber-50 border-2 border-amber-200 p-8 rounded-[40px] flex items-center gap-6 animate-pulse">
                    <AlertTriangle className="text-amber-600" size={32} />
                    <div>
                       <p className="text-amber-900 font-black text-sm uppercase tracking-tight">Partial Data Sync Detected</p>
                       <p className="text-amber-700 text-xs font-bold leading-relaxed mt-1">Your Lambda returned a region total, but not the service breakdown. Please update your Lambda code using the template in the <b>System Configuration</b> settings below.</p>
                    </div>
                 </div>
               )}

               <div className="bg-white rounded-[72px] border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-16 py-12 border-b border-slate-100 bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                  <div className="flex items-center gap-6">
                    <div className="bg-blue-600 p-4 rounded-2xl text-white shadow-lg shadow-blue-100"><Layers size={28} /></div>
                    <div><h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-4">Cost and usage breakdown <span className="text-slate-400 font-bold text-sm bg-slate-100 px-3 py-1 rounded-full">{serviceDrillDownData.length}</span></h2><p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">Granular analysis for regional expenditures</p></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                     <button className="flex items-center gap-2 px-6 py-3 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-black uppercase hover:bg-slate-50 transition-colors"><Download size={16} /> Download as CSV</button>
                     <div className="flex items-center border border-slate-200 rounded-xl px-4 py-2 bg-slate-50 group focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                        <Search size={18} className="text-slate-400" /><input type="text" placeholder="Find cost and usage data" className="bg-transparent border-none outline-none pl-3 text-sm font-bold w-64" value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} />
                     </div>
                  </div>
                </div>
                <div className="px-16 py-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between overflow-x-auto gap-10">
                   <div className="flex items-center gap-10">
                      <div className="flex items-center gap-4"><span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Period</span><select value={drillDownMonthIdx} onChange={(e) => setDrillDownMonthIdx(parseInt(e.target.value))} className="bg-transparent text-sm font-black text-slate-900 outline-none cursor-pointer hover:text-blue-600">{billingHistory.map((m, i) => <option key={i} value={i}>{m.month}</option>)}</select></div>
                      <div className="flex items-center gap-4"><span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Region</span><select value={drillDownRegion} onChange={(e) => setDrillDownRegion(e.target.value)} className="bg-transparent text-sm font-black text-blue-600 outline-none cursor-pointer hover:underline">{TARGET_REGIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
                   </div>
                   <div className="flex items-center gap-4 text-slate-400"><ChevronLeft size={20} className="hover:text-slate-900 cursor-pointer" /><span className="text-xs font-bold">1</span><ArrowRight size={20} className="hover:text-slate-900 cursor-pointer" /><Settings2 size={18} className="ml-4 hover:text-slate-900 cursor-pointer" /></div>
                </div>
                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                      <thead><tr className="text-[11px] font-black uppercase tracking-widest text-slate-400 bg-white border-b border-slate-100"><th className="py-6 px-16">Service</th><th className="py-6 px-16 text-right">Service total</th><th className="py-6 px-16 text-right">{(billingHistory[drillDownMonthIdx] || {month:''}).month}</th></tr></thead>
                      <tbody className="divide-y divide-slate-50">
                         <tr className="bg-blue-50/30 group"><td className="py-6 px-16 font-black text-slate-900 text-sm">Total costs</td><td className="py-6 px-16 text-right font-black text-slate-900 text-sm">${drillDownTotal.toLocaleString()}</td><td className="py-6 px-16 text-right font-black text-slate-900 text-sm">${drillDownTotal.toLocaleString()}</td></tr>
                         {serviceDrillDownData.length > 0 ? serviceDrillDownData.map((s, i) => (
                           <tr key={i} className="hover:bg-slate-50 transition-all border-b border-slate-50"><td className="py-6 px-16 text-sm font-bold text-blue-600 cursor-pointer hover:underline flex items-center gap-2 group">{s.name} <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" /></td><td className="py-6 px-16 text-right text-sm font-bold text-slate-900">${s.cost.toLocaleString()}</td><td className="py-6 px-16 text-right text-sm font-bold text-slate-900">${s.cost.toLocaleString()}</td></tr>
                         )) : (
                           <tr><td colSpan={3} className="py-24 text-center text-slate-400 font-bold italic bg-white">No detailed breakdown available for this region/month.</td></tr>
                         )}
                      </tbody>
                   </table>
                </div>
               </div>
            </div>
          )}
        </div>
      </main>

      {/* Settings Modal */}
      {showLambdaInfo && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-2xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white rounded-[48px] w-full max-w-4xl p-12 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-start mb-10"><div><h2 className="text-2xl font-black tracking-tight">System Configuration</h2><p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">Multi-Dimensional Cost API</p></div><button onClick={() => setShowLambdaInfo(false)} className="p-3 hover:bg-slate-100 rounded-2xl transition-all"><X size={24}/></button></div>
            <div className="bg-slate-900 p-10 rounded-[40px] text-white shadow-2xl">
              <div className="flex items-center justify-between mb-6"><h3 className="text-[12px] font-black uppercase tracking-widest flex items-center gap-2"><Terminal size={18} className="text-blue-400" /> Essential Lambda Script for Service Breakdown</h3><button onClick={() => { navigator.clipboard.writeText(lambdaCode); showToast("Copied to clipboard!"); }} className="px-6 py-3 bg-blue-600 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-blue-500"><Copy size={14} /> Copy Code</button></div>
              <p className="text-slate-400 text-xs mb-6 leading-relaxed italic border-l-4 border-blue-500 pl-4">Note: Your Lambda function MUST use the 'GroupBy' block with 'REGION' and 'SERVICE' keys to populate the breakdown view correctly.</p>
              <pre className="bg-slate-800/50 p-6 rounded-2xl overflow-x-auto max-h-[400px] text-emerald-400 font-mono text-[11px] leading-relaxed select-all">{lambdaCode}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-10 right-10 px-8 py-5 rounded-[24px] shadow-2xl z-[300] flex items-center gap-4 animate-in fade-in slide-in-from-right-10 duration-500 ${toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'}`}>
           {toast.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} className="text-emerald-400" />}
           <span className="text-sm font-bold tracking-tight">{toast.message}</span>
           <button onClick={() => setToast(null)} className="ml-4 opacity-50 hover:opacity-100"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}
