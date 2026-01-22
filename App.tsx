
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
  Search, Download, ChevronLeft, Filter, ExternalLink, Info, ChevronUp, Box
} from 'lucide-react';
import { MonthlyData, CloudCredentials, BillingEntry, CloudProvider } from './types';

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const AWS_TARGETS = [
  { key: 'ca-central-1', label: 'Canada Central (X-ray)', match: ['canada', 'ca-central-1'], color: 'blue' },
  { key: 'us-east-1', label: 'N. Virginia (Managed infra)', match: ['virginia', 'us-east-1'], color: 'indigo' },
  { key: 'us-east-2', label: 'Ohio (ri-commercedev)', match: ['ohio', 'us-east-2'], color: 'purple' },
  { key: 'us-west-2', label: 'Oregon (General)', match: ['oregon', 'us-west-2'], color: 'emerald' },
  { key: 'Global', label: 'Taxes / Global', match: ['tax', 'global', 'no region', 'n/a'], color: 'slate' }
];

const OCI_TARGETS = [
  { key: 'parent', label: 'OCI Parent Tenancy', match: ['parent', 'root'], color: 'rose' },
  { key: 'child-prod', label: 'Production Child', match: ['prod', 'production'], color: 'amber' },
  { key: 'child-dev', label: 'Dev/Test Child', match: ['dev', 'test', 'sandbox'], color: 'orange' },
  { key: 'child-shared', label: 'Shared Services', match: ['shared', 'infra'], color: 'red' },
  { key: 'Global', label: 'OCI Marketplace/Taxes', match: ['tax', 'marketplace'], color: 'slate' }
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

const generateMockData = (provider: CloudProvider): MonthlyData[] => {
  const labels = getCompleted12MonthLabels();
  const targets = provider === 'aws' ? AWS_TARGETS : OCI_TARGETS;
  const services = provider === 'aws' 
    ? ["EC2-Instances", "VPC", "RDS", "S3", "CloudWatch", "ELB"] 
    : ["Compute (OVM)", "Object Storage", "Autonomous DB", "Block Volume", "VCN Data", "Load Balancer"];

  return labels.map((month, i) => {
    const factor = 0.8 + (i * 0.03);
    const entries: BillingEntry[] = [];
    targets.forEach(target => {
      let base = provider === 'aws' ? 6200 : 8500;
      if (target.key.includes('dev')) base = 2500;
      let total = base * factor;
      services.forEach((svc, sIdx) => {
        const share = [0.4, 0.25, 0.15, 0.1, 0.05, 0.05][sIdx] || 0.01;
        entries.push({ 
          [provider === 'aws' ? 'region' : 'tenancy']: target.key, 
          service: svc, 
          cost: Number((total * share).toFixed(2)) 
        });
      });
    });
    return { month, entries };
  });
};

const encodeState = (data: MonthlyData[]) => btoa(JSON.stringify(data));
const decodeState = (str: string): MonthlyData[] | null => {
  try { return JSON.parse(atob(str)); } catch (e) { return null; }
};

const CustomTick = (props: any) => {
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
  const [provider, setProvider] = useState<CloudProvider>('aws');
  const [billingHistory, setBillingHistory] = useState<MonthlyData[]>(generateMockData('aws'));
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'comparison' | 'services'>('overview');
  const [isFetching, setIsFetching] = useState(false);
  const [showLambdaInfo, setShowLambdaInfo] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [credentials, setCredentials] = useState<CloudCredentials>({ endpoint: '' });
  
  const [serviceSearch, setServiceSearch] = useState("");
  const [baseMonthIdx, setBaseMonthIdx] = useState(0);
  const [targetMonthIdx, setTargetMonthIdx] = useState(0);
  const [drillDownTarget, setDrillDownTarget] = useState('');
  const [drillDownMonthIdx, setDrillDownMonthIdx] = useState(0);
  const [expandedComparisonTarget, setExpandedComparisonTarget] = useState<string | null>(null);

  // Initialize data on provider change
  useEffect(() => {
    const mock = generateMockData(provider);
    setBillingHistory(mock);
    setBaseMonthIdx(mock.length - 2);
    setTargetMonthIdx(mock.length - 1);
    setDrillDownMonthIdx(mock.length - 1);
    setDrillDownTarget(provider === 'aws' ? AWS_TARGETS[0].key : OCI_TARGETS[0].key);
  }, [provider]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 8000);
  };

  const syncData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentials.endpoint?.trim()) {
      showToast("Missing Lambda Endpoint", "error");
      return;
    }
    setIsFetching(true);
    try {
      const response = await fetch(credentials.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, provider })
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setBillingHistory(data);
        showToast(`${provider.toUpperCase()} Sync Success`);
      } else throw new Error("Invalid schema");
    } catch (err: any) {
      showToast(`Sync Error: ${err.message}`, "error");
    } finally { setIsFetching(false); }
  };

  const getAggregatedData = (month: MonthlyData) => {
    const targets = provider === 'aws' ? AWS_TARGETS : OCI_TARGETS;
    if (!month || !month.entries) return targets.map(t => ({ label: t.label, key: t.key, cost: 0, color: t.color, entries: [] }));
    
    return targets.map(target => {
      const filtered = month.entries.filter(e => {
        // Fix: Explicitly cast the regional value to string before calling toLowerCase() to resolve TS error on line 150
        const val = String(e.region || e.tenancy || e.Region || e.Tenancy || "").toLowerCase();
        return target.match.some(keyword => val.includes(keyword));
      });
      return { label: target.label, key: target.key, cost: filtered.reduce((sum, e) => sum + e.cost, 0), color: target.color, entries: filtered };
    });
  };

  const currentMonthData = billingHistory[billingHistory.length - 1] || { month: 'N/A', entries: [] };
  const aggLatest = useMemo(() => getAggregatedData(currentMonthData), [currentMonthData, provider]);
  const totalSpendLatest = useMemo(() => currentMonthData.entries.reduce((sum, e) => sum + e.cost, 0), [currentMonthData]);

  const comparisonData = useMemo(() => {
    const baseAgg = getAggregatedData(billingHistory[baseMonthIdx] || billingHistory[0]);
    const targetAgg = getAggregatedData(billingHistory[targetMonthIdx] || currentMonthData);
    
    return baseAgg.map((b, i) => {
      const t = targetAgg[i];
      const serviceVariance = Array.from(new Set([...b.entries.map(e => e.service), ...t.entries.map(e => e.service)]))
        .map(name => {
          const c1 = b.entries.find(e => e.service === name)?.cost || 0;
          const c2 = t.entries.find(e => e.service === name)?.cost || 0;
          return { name: name || 'Core Infra', baseCost: c1, targetCost: c2, diff: c2 - c1, percent: c1 > 0 ? ((c2 - c1) / c1) * 100 : 100 };
        })
        .filter(s => Math.abs(s.diff) > 0.01)
        .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));

      return { key: b.key, label: b.label, current: t.cost, previous: b.cost, diff: t.cost - b.cost, percent: b.cost > 0 ? ((t.cost - b.cost) / b.cost) * 100 : 0, serviceVariance };
    });
  }, [baseMonthIdx, targetMonthIdx, billingHistory, provider]);

  const serviceDrillDownData = useMemo(() => {
    const month = billingHistory[drillDownMonthIdx];
    const target = (provider === 'aws' ? AWS_TARGETS : OCI_TARGETS).find(t => t.key === drillDownTarget);
    if (!month || !target) return [];
    
    const serviceMap: Record<string, number> = {};
    month.entries.filter(e => {
       // Fix: Explicitly cast the regional value to string before calling toLowerCase() to resolve potential TS error in service filter
       const val = String(e.region || e.tenancy || e.Region || e.Tenancy || "").toLowerCase();
       return target.match.some(kw => val.includes(kw));
    }).forEach(e => {
       const name = e.service || "Uncategorized";
       serviceMap[name] = (serviceMap[name] || 0) + e.cost;
    });

    return Object.entries(serviceMap).map(([name, cost]) => ({ name, cost })).sort((a,b) => b.cost - a.cost);
  }, [drillDownMonthIdx, drillDownTarget, billingHistory, provider]);

  const ociLambdaCode = `import oci
import json
from datetime import datetime, timedelta

def lambda_handler(event, context):
    try:
        # Configuration for OCI Usage API
        # Requires user_ocid, tenancy_ocid, fingerprint, private_key
        signer = oci.signer.Signer(...) 
        usage_client = oci.usage_api.UsageApiClient(config={}, signer=signer)
        
        end = datetime.now().replace(day=1)
        start = end - timedelta(days=365)
        
        request = oci.usage_api.models.RequestSummarizedUsagesDetails(
            tenant_id=config['tenancy'],
            time_usage_started=start.isoformat(),
            time_usage_ended=end.isoformat(),
            granularity='MONTHLY',
            query_type='COST',
            group_by=['service', 'tenancyId'] # Grouping by Child Tenancies
        )
        
        response = usage_client.request_summarized_usages(request)
        # Transform OCI response into CloudSpend schema...
        return {"statusCode": 200, "body": json.dumps(results)}
    except Exception as e: return {"statusCode": 500, "body": json.dumps({"error": str(e)})}`;

  const themeColor = provider === 'aws' ? 'blue' : 'rose';
  const brandColorClass = provider === 'aws' ? 'bg-blue-600' : 'bg-rose-600';
  const brandTextClass = provider === 'aws' ? 'text-blue-600' : 'text-rose-600';

  return (
    <div className="min-h-screen bg-[#f8fafc] flex font-sans text-slate-900">
      <aside className="w-84 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen shrink-0 shadow-sm z-50">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className={`${brandColorClass} p-3 rounded-2xl text-white shadow-xl`}><Activity size={24} /></div>
            <div><h1 className="text-lg font-black tracking-tight leading-none">CloudSpend</h1><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Enterprise Hub</span></div>
          </div>

          <div className="mb-10 bg-slate-100 p-2 rounded-2xl flex gap-1">
             <button onClick={() => setProvider('aws')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${provider === 'aws' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>AWS</button>
             <button onClick={() => setProvider('oci')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${provider === 'oci' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Oracle</button>
          </div>

          <nav className="space-y-1">
            {[
              { id: 'overview', icon: LayoutDashboard, label: 'Dashboard' },
              { id: 'trends', icon: TrendingUp, label: '12M History' },
              { id: 'comparison', icon: ArrowRightLeft, label: 'MoM Comparison' },
              { id: 'services', icon: Layers, label: 'Service Explorer' }
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-bold transition-all ${activeTab === tab.id ? `${provider === 'aws' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'} shadow-sm` : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <tab.icon size={20} /> {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-6">
          <div className="bg-slate-900 rounded-[40px] p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6 text-white font-black text-[10px] uppercase tracking-widest">
              <span className="flex items-center gap-2"><Server size={14} className={brandTextClass} /> {provider.toUpperCase()} Integration</span>
              <button onClick={() => setShowLambdaInfo(true)} className={`${brandTextClass} hover:text-white transition-colors`}><Settings2 size={14} /></button>
            </div>
            <form onSubmit={syncData} className="space-y-4">
              <input type="text" placeholder={`${provider.toUpperCase()} Lambda URL`} className="w-full px-4 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl text-[11px] font-bold text-white outline-none focus:ring-2 focus:ring-blue-500" value={credentials.endpoint} onChange={e => setCredentials({...credentials, endpoint: e.target.value})} />
              <button type="submit" disabled={isFetching} className={`w-full py-5 ${brandColorClass} text-white rounded-[24px] text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-3`}>
                {isFetching ? <RefreshCw className="animate-spin" size={16} /> : <Pulse size={16}/>} Sync {provider.toUpperCase()}
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="h-24 border-b border-slate-200 bg-white/80 backdrop-blur-2xl sticky top-0 z-40 px-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-slate-400 font-bold text-[11px] uppercase tracking-widest">{provider === 'aws' ? 'AWS Global Infra' : 'OCI Tenancy Hub'}</span>
            <ChevronRight size={16} className="text-slate-200" />
            <span className={`font-black text-[11px] uppercase tracking-widest bg-slate-100 px-4 py-2 rounded-full ${brandTextClass}`}>{activeTab}</span>
          </div>
          <button onClick={() => showToast("Dashboard URL Copied")} className="flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"><Share2 size={18} /> Share Dashboard</button>
        </header>

        <div className="p-12 mx-auto space-y-12">
          {activeTab === 'overview' && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-12">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                  <div className="bg-white p-12 rounded-[64px] border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className={`absolute -top-6 -right-6 p-12 opacity-[0.03] ${brandTextClass}`}><DollarSign size={160} /></div>
                    <div className="flex justify-between items-start mb-8"><div className={`p-5 ${provider === 'aws' ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'} rounded-[32px]`}><DollarSign size={32} /></div></div>
                    <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">{currentMonthData.month} Aggregated</h3>
                    <p className="text-6xl font-black text-slate-900 tracking-tighter">${totalSpendLatest.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-12 rounded-[64px] border border-slate-200 shadow-sm relative overflow-hidden group">
                    <div className={`absolute -top-6 -right-6 p-12 opacity-[0.03] ${provider === 'aws' ? 'text-indigo-600' : 'text-amber-600'}`}><Globe size={160} /></div>
                    <div className="flex justify-between items-start mb-8"><div className={`p-5 ${provider === 'aws' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'} rounded-[32px]`}><Globe size={32} /></div></div>
                    <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Primary {provider === 'aws' ? 'Region' : 'Tenancy'}</h3>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">{aggLatest[0]?.label}</p>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-3 flex items-center gap-2"><span className={`w-2 h-2 rounded-full animate-ping ${brandColorClass}`} /> Max Usage • ${aggLatest[0]?.cost.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-12 rounded-[64px] border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-8"><div className="p-5 bg-emerald-50 text-emerald-600 rounded-[32px]"><ShieldCheck size={32} /></div></div>
                    <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Multi-Cloud Context</h3>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">{provider.toUpperCase()} Enterprise</p>
                    <div className="w-full bg-slate-100 h-4 rounded-full mt-8 overflow-hidden p-1">
                      <div className={`${brandColorClass} h-full rounded-full transition-all duration-1500`} style={{ width: '100%' }} />
                    </div>
                  </div>
               </div>
               
               <div className="bg-white rounded-[72px] border border-slate-200 p-16 shadow-sm">
                  <h2 className="text-[13px] font-black uppercase tracking-[0.2em] mb-16 flex items-center gap-4"><span className={`w-4 h-4 rounded-full animate-pulse ${brandColorClass}`} /> {provider === 'aws' ? 'Regional' : 'Tenancy'} Distribution</h2>
                  <div className="h-[550px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={aggLatest} margin={{ bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="label" interval={0} axisLine={false} tickLine={false} tick={<CustomTick />} />
                        <YAxis tickFormatter={(val) => `$${val.toLocaleString()}`} stroke="#cbd5e1" fontSize={11} axisLine={false} tickLine={false} fontWeight="black" />
                        <Tooltip cursor={{ fill: '#f8fafc', radius: 32 }} contentStyle={{ borderRadius: '48px', border: 'none' }} />
                        <Bar dataKey="cost" fill={provider === 'aws' ? '#3b82f6' : '#e11d48'} radius={[24, 24, 0, 0]} barSize={80} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'trends' && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 w-full">
              <div className="bg-white rounded-[72px] border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-16 py-16 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <div>
                    <h2 className="text-[14px] font-black uppercase tracking-[0.3em] flex items-center gap-4 mb-2"><Database size={24} className={brandTextClass} /> {provider.toUpperCase()} Billing Ledger</h2>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Enterprise Group Analysis • Parent & Child Tenancies</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead><tr className="text-[11px] font-black uppercase tracking-widest text-slate-400 bg-slate-50/80"><th className="py-12 px-16 w-48">Period</th><th className="py-12 px-16 w-64 text-right">Total Billing</th><th className="py-12 px-16 text-center">{provider === 'aws' ? 'Regional' : 'Tenancy'} Breakdown</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...billingHistory].reverse().map((month, idx) => {
                        const total = month.entries.reduce((s, e) => s + e.cost, 0);
                        const breakdown = getAggregatedData(month);
                        return (
                          <tr key={idx} className="group hover:bg-slate-50 transition-all">
                            <td className="py-12 px-16 font-black text-slate-900 text-lg uppercase">{month.month}</td>
                            <td className="py-12 px-16 text-right font-mono font-black text-slate-900 text-3xl tracking-tighter">${total.toLocaleString()}</td>
                            <td className="py-12 px-8">
                              <div className="grid grid-cols-5 gap-4">
                                {breakdown.map((b, i) => (
                                  <div key={i} className={`px-4 py-5 rounded-[40px] border-2 ${b.cost > 0 ? 'bg-white border-slate-100 shadow-md' : 'opacity-20'} transition-all hover:scale-[1.05]`}>
                                    <span className={`text-[10px] font-black uppercase tracking-tight block text-center mb-0.5 ${brandTextClass}`}>{b.label.split(' ')[0]}</span>
                                    <span className="text-lg font-black tracking-tighter block text-center">${b.cost.toLocaleString()}</span>
                                  </div>
                                ))}
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
              <div className="bg-white rounded-[72px] border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-16 py-16 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h2 className="text-[14px] font-black uppercase tracking-[0.3em] flex items-center gap-4"><ArrowRightLeft size={24} className={brandTextClass} /> {provider.toUpperCase()} Variance Engine</h2>
                  <div className="flex items-center gap-6">
                    <select value={baseMonthIdx} onChange={(e) => setBaseMonthIdx(parseInt(e.target.value))} className="bg-slate-100 px-8 py-4 rounded-2xl text-[11px] font-black uppercase text-slate-600 outline-none hover:bg-slate-200">{billingHistory.map((m, i) => <option key={i} value={i}>{m.month}</option>)}</select>
                    <ArrowRight size={24} className="text-slate-300" />
                    <select value={targetMonthIdx} onChange={(e) => setTargetMonthIdx(parseInt(e.target.value))} className={`${brandColorClass} px-8 py-4 rounded-2xl text-[11px] font-black uppercase text-white outline-none hover:opacity-90`}>{billingHistory.map((m, i) => <option key={i} value={i}>{m.month}</option>)}</select>
                  </div>
                </div>
                <div className="p-16 space-y-8">
                   {comparisonData.map((item, idx) => {
                      const isUp = item.diff > 0;
                      const isExpanded = expandedComparisonTarget === item.key;
                      return (
                        <div key={idx} className="flex flex-col gap-4 group">
                          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto] items-center gap-10">
                             <div className="bg-slate-50/50 rounded-[48px] p-8 border border-slate-100 flex items-center justify-between shadow-sm">
                                <span className="text-[13px] font-black text-slate-900 uppercase tracking-tight">{item.label}</span>
                                <span className="text-[20px] font-black text-slate-400 tracking-tighter">${item.previous.toLocaleString()}</span>
                             </div>
                             <ArrowRight size={32} className="text-slate-200 hidden lg:block" />
                             <div className="bg-white rounded-[48px] p-8 border-2 border-slate-50 shadow-xl flex items-center justify-between relative overflow-hidden group-hover:scale-[1.01] transition-all">
                                <div className="flex items-center gap-6">
                                  <div className={`p-4 rounded-2xl ${isUp ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{isUp ? <Plus size={20} /> : <Minus size={20} />}</div>
                                  <span className="text-[13px] font-black text-slate-900 uppercase tracking-tight">{item.label}</span>
                                </div>
                                <div className="text-right">
                                  <span className={`text-[10px] font-black px-4 py-1 rounded-full mb-1 inline-block ${isUp ? 'bg-rose-600 text-white shadow-lg shadow-rose-200' : 'bg-emerald-600 text-white shadow-lg shadow-emerald-200'}`}>{isUp ? '+' : ''}{item.percent.toFixed(1)}%</span>
                                  <span className="text-[24px] font-black text-slate-900 tracking-tighter block">${item.current.toLocaleString()}</span>
                                </div>
                             </div>
                             <button onClick={() => setExpandedComparisonTarget(isExpanded ? null : item.key)} className={`p-6 rounded-full transition-all ${isExpanded ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400 hover:text-slate-900'}`}>{isExpanded ? <ChevronUp size={24} /> : <Info size={24} />}</button>
                          </div>
                          {isExpanded && (
                            <div className="bg-slate-50 border-2 border-slate-100 rounded-[48px] p-10 mt-2 animate-in slide-in-from-top-4 duration-300">
                               <div className="flex justify-between items-center mb-10">
                                  <div><h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">Impact Analysis: {item.label}</h4><p className="text-slate-900 font-bold text-sm">Identifying service drivers for {provider.toUpperCase()} <span className={isUp ? 'text-rose-600' : 'text-emerald-600'}>{isUp ? 'increase' : 'decrease'}</span></p></div>
                               </div>
                               <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
                                  <table className="w-full text-left">
                                     <thead><tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400"><th className="py-6 px-10">Service Attribution</th><th className="py-6 px-10 text-right">Baseline</th><th className="py-6 px-10 text-right">Target</th><th className="py-6 px-10 text-right">Impact</th></tr></thead>
                                     <tbody className="divide-y divide-slate-50">
                                        {item.serviceVariance.map((svc, si) => (
                                           <tr key={si} className="hover:bg-slate-50">
                                              <td className="py-5 px-10"><div className="flex items-center gap-3"><div className={`w-1.5 h-6 rounded-full ${svc.diff > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} /><span className="text-sm font-black text-slate-900 uppercase tracking-tight">{svc.name}</span></div></td>
                                              <td className="py-5 px-10 text-right font-medium text-slate-400 text-sm">${svc.baseCost.toLocaleString()}</td>
                                              <td className="py-5 px-10 text-right font-black text-slate-900 text-sm">${svc.targetCost.toLocaleString()}</td>
                                              <td className="py-5 px-10 text-right"><div className="flex flex-col items-end"><span className={`text-sm font-black ${svc.diff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{svc.diff > 0 ? '+' : ''}${svc.diff.toLocaleString()}</span><span className="text-[10px] font-bold text-slate-400">{svc.percent.toFixed(1)}% change</span></div></td>
                                           </tr>
                                        ))}
                                     </tbody>
                                  </table>
                               </div>
                            </div>
                          )}
                        </div>
                      );
                   })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'services' && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 w-full space-y-12">
               <div className="bg-white rounded-[72px] border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-16 py-12 border-b border-slate-100 bg-white flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className={`${brandColorClass} p-4 rounded-2xl text-white shadow-lg`}><Layers size={28} /></div>
                    <div><h2 className="text-2xl font-black text-slate-900 tracking-tight">{provider.toUpperCase()} Usage breakdown</h2><p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">Granular analysis for {provider === 'aws' ? 'Regions' : 'Tenancies'}</p></div>
                  </div>
                  <div className="flex items-center gap-4">
                     <div className="flex items-center border border-slate-200 rounded-xl px-4 py-2 bg-slate-50">
                        <Search size={18} className="text-slate-400" /><input type="text" placeholder="Filter services..." className="bg-transparent border-none outline-none pl-3 text-sm font-bold w-64" value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} />
                     </div>
                  </div>
                </div>
                <div className="px-16 py-6 bg-slate-50/50 border-b border-slate-100 flex items-center gap-10">
                    <div className="flex items-center gap-4"><span className="text-[11px] font-black text-slate-400 uppercase">Period</span><select value={drillDownMonthIdx} onChange={(e) => setDrillDownMonthIdx(parseInt(e.target.value))} className="bg-transparent text-sm font-black text-slate-900 outline-none">{billingHistory.map((m, i) => <option key={i} value={i}>{m.month}</option>)}</select></div>
                    <div className="flex items-center gap-4"><span className="text-[11px] font-black text-slate-400 uppercase">{provider === 'aws' ? 'Region' : 'Tenancy'}</span><select value={drillDownTarget} onChange={(e) => setDrillDownTarget(e.target.value)} className={`bg-transparent text-sm font-black ${brandTextClass} outline-none`}>{(provider === 'aws' ? AWS_TARGETS : OCI_TARGETS).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
                </div>
                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                      <thead><tr className="text-[11px] font-black uppercase tracking-widest text-slate-400 bg-white border-b border-slate-100"><th className="py-6 px-16">Service</th><th className="py-6 px-16 text-right">Aggregate Cost</th></tr></thead>
                      <tbody className="divide-y divide-slate-50">
                         {serviceDrillDownData.map((s, i) => (
                           <tr key={i} className="hover:bg-slate-50 border-b border-slate-50"><td className="py-6 px-16 text-sm font-bold text-slate-900">{s.name}</td><td className="py-6 px-16 text-right text-sm font-black text-slate-900">${s.cost.toLocaleString()}</td></tr>
                         ))}
                      </tbody>
                   </table>
                </div>
               </div>
            </div>
          )}
        </div>
      </main>

      {showLambdaInfo && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-2xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white rounded-[48px] w-full max-w-4xl p-12 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-start mb-10"><div><h2 className="text-2xl font-black tracking-tight">System Configuration</h2><p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">{provider.toUpperCase()} API Connector</p></div><button onClick={() => setShowLambdaInfo(false)} className="p-3 hover:bg-slate-100 rounded-2xl"><X size={24}/></button></div>
            <div className="bg-slate-900 p-10 rounded-[40px] text-white">
              <h3 className="text-[12px] font-black uppercase tracking-widest flex items-center gap-2 mb-6"><Terminal size={18} className={brandTextClass} /> {provider.toUpperCase()} Integration Script</h3>
              <p className="text-slate-400 text-xs mb-6 italic border-l-4 border-blue-500 pl-4">Note: Use this Python template in your {provider === 'aws' ? 'Boto3' : 'OCI SDK'} Lambda to fetch cross-{provider === 'aws' ? 'regional' : 'tenancy'} data.</p>
              <pre className="bg-slate-800/50 p-6 rounded-2xl overflow-x-auto text-emerald-400 font-mono text-[11px] leading-relaxed">{provider === 'aws' ? 'Import boto3...' : ociLambdaCode}</pre>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-10 right-10 px-8 py-5 rounded-[24px] bg-slate-900 text-white shadow-2xl z-[300] flex items-center gap-4 animate-in fade-in slide-in-from-right-10 duration-500">
           <CheckCircle2 size={20} className="text-emerald-400" />
           <span className="text-sm font-bold tracking-tight">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
