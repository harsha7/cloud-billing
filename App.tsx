
import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Activity, TrendingUp, DollarSign, Globe, LayoutDashboard, History,
  ArrowUpRight, ArrowDownRight, ShieldCheck, RefreshCw,
  AlertCircle, Share2, Database, CheckCircle2, Key, Server, 
  ChevronRight, X, Copy, Terminal, Settings2, Activity as Pulse, AlertTriangle, Link2
} from 'lucide-react';
import { MonthlyData, AWSCredentials } from './types';

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Target regions in STRICT ORDER requested by user with updated project labels
const TARGET_REGIONS = [
  { key: 'ca-central-1', label: 'Canada Central (X-ray)', match: ['canada', 'ca-central-1'] },
  { key: 'us-east-1', label: 'N. Virginia (Managed services infra)', match: ['virginia', 'us-east-1'] },
  { key: 'us-east-2', label: 'Ohio (ri-commercedev)', match: ['ohio', 'us-east-2'] },
  { key: 'us-west-2', label: 'Oregon', match: ['oregon', 'us-west-2'] },
  { key: 'Global', label: 'Taxes / Global', match: ['tax', 'global', 'no region', 'n/a'] }
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
  return labels.map((month, i) => {
    const isLatest = i === labels.length - 1;
    const factor = 0.7 + (i * 0.025);
    
    const entries = [
      { region: 'Canada Central', project: 'Xray', cost: isLatest ? 6625.50 : Number((4500 * factor).toFixed(2)) },
      { region: 'N. Virginia', project: 'Managed Services', cost: isLatest ? 3277.74 : Number((2800 * factor).toFixed(2)) },
      { region: 'Ohio', project: 'Ricommerce Dev', cost: isLatest ? 1394.47 : Number((1100 * factor).toFixed(2)) },
      { region: 'Oregon', project: 'Zurchers', cost: isLatest ? 22.88 : Number((15 * factor).toFixed(2)) },
      { region: 'Global', project: 'Tax', cost: isLatest ? 1661.45 : Number((1200 * factor).toFixed(2)) }
    ];

    return { month, entries };
  });
};

const encodeState = (data: MonthlyData[]) => btoa(JSON.stringify(data));
const decodeState = (str: string): MonthlyData[] | null => {
  try { return JSON.parse(atob(str)); } catch (e) { return null; }
};

// Custom Chart Tick for Multi-line Regional Labels
const CustomRegionTick = (props: any) => {
  const { x, y, payload } = props;
  const label = payload.value;
  
  // Regex to split "Region Name (Project Name)"
  const match = label.match(/^(.*?)\s*\((.*?)\)$/);
  
  if (match) {
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={15} textAnchor="middle" fill="#1e293b" fontSize={14} fontWeight="900" className="uppercase tracking-tight">
          {match[1]}
        </text>
        <text x={0} y={35} textAnchor="middle" fill="#3b82f6" fontSize={12} fontWeight="800">
          ({match[2]})
        </text>
      </g>
    );
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={15} textAnchor="middle" fill="#1e293b" fontSize={14} fontWeight="900" className="uppercase tracking-tight">
        {label}
      </text>
    </g>
  );
};

export default function App() {
  const [billingHistory, setBillingHistory] = useState<MonthlyData[]>(generateMock12Months());
  const [activeTab, setActiveTab] = useState<'overview' | 'trends'>('overview');
  const [isFetching, setIsFetching] = useState(false);
  const [showLambdaInfo, setShowLambdaInfo] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [credentials, setCredentials] = useState<AWSCredentials>({
    accessKeyId: '',
    secretAccessKey: '',
    region: 'us-east-1',
    endpoint: ''
  });

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

  const handleCopyCode = (code: string, label: string) => {
    navigator.clipboard.writeText(code);
    showToast(`${label} copied to clipboard!`);
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
        body: JSON.stringify({
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          region: credentials.region
        })
      });

      if (!response.ok) throw new Error(`AWS Status ${response.status}`);
      const data = await response.json();
      setBillingHistory(data);
      showToast("Real-time Data Synced!");
    } catch (err: any) {
      showToast(`Sync Failed: ${err.message}`, "error");
    } finally {
      setIsFetching(false);
    }
  };

  const handleShare = () => {
    const encoded = encodeState(billingHistory);
    const url = new URL(window.location.href);
    url.searchParams.set('report', encoded);
    navigator.clipboard.writeText(url.toString());
    showToast("Dashboard link copied!");
  };

  const currentMonth = billingHistory[billingHistory.length - 1];
  
  // FILTER AND SORT REGIONS IN STRICT REQUESTED ORDER WITH DESCRIPTIVE LABELS
  const orderedRegions = useMemo(() => {
    return TARGET_REGIONS.map(target => {
      const entry = currentMonth.entries.find(e => {
        const name = e.region.toLowerCase();
        return target.match.some(keyword => name.includes(keyword));
      });
      // Return a combined object for the chart
      return {
        region: target.label,
        cost: entry?.cost || 0
      };
    });
  }, [currentMonth]);

  const totalSpend = useMemo(() => currentMonth.entries.reduce((sum, e) => sum + e.cost, 0), [currentMonth]);
  const previousMonth = billingHistory[billingHistory.length - 2];
  const prevTotalSpend = useMemo(() => previousMonth?.entries.reduce((sum, e) => sum + e.cost, 0) || 0, [previousMonth]);
  const momPercent = prevTotalSpend > 0 ? ((totalSpend - prevTotalSpend) / prevTotalSpend) * 100 : 0;

  const lambdaCode = `import json
import boto3
from datetime import datetime, timedelta

def lambda_handler(event, context):
    try:
        if event.get('requestContext', {}).get('http', {}).get('method') == 'GET':
            return {'statusCode': 200, 'body': json.dumps({"status": "online"})}

        body = json.loads(event.get('body', '{}')) if event.get('body') else {}
        ak = body.get('accessKeyId')
        sk = body.get('secretAccessKey')
        reg = body.get('region', 'us-east-1')

        client_args = {'region_name': reg}
        if ak and sk:
            client_args.update({'aws_access_key_id': ak, 'aws_secret_access_key': sk})
        
        ce = boto3.client('ce', **client_args)

        end = datetime.now().replace(day=1)
        start = (end - timedelta(days=365)).replace(day=1)
        
        res = ce.get_cost_and_usage(
            TimePeriod={'Start': start.strftime('%Y-%m-%d'), 'End': end.strftime('%Y-%m-%d')},
            Granularity='MONTHLY', 
            Metrics=['UnblendedCost'],
            GroupBy=[{'Type': 'DIMENSION', 'Key': 'REGION'}]
        )

        output = []
        for p in res['ResultsByTime']:
            lbl = datetime.strptime(p['TimePeriod']['Start'], '%Y-%m-%d').strftime('%b %Y')
            ents = []
            for g in p['Groups']:
                raw_region = g['Keys'][0]
                region_name = raw_region if raw_region and raw_region != "No Region" else "Global"
                cost = round(float(g['Metrics']['UnblendedCost']['Amount']), 2)
                ents.append({"region": region_name, "project": "Infrastructure", "cost": cost})
            output.append({"month": lbl, "entries": ents})

        return {'statusCode': 200, 'body': json.dumps(output)}

    except Exception as e:
        return {'statusCode': 500, 'body': json.dumps({"error": str(e)})}`;

  return (
    <div className="min-h-screen bg-[#f8fafc] flex font-sans text-slate-900">
      {/* Troubleshooting Diagnostic Modal */}
      {showLambdaInfo && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-2xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white rounded-[48px] w-full max-w-4xl p-12 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-start mb-10">
              <div className="flex flex-col">
                <div className="flex items-center gap-3 mb-2">
                   <div className="bg-blue-600 p-2 rounded-xl text-white"><Settings2 size={24} /></div>
                   <h2 className="text-2xl font-black tracking-tight">System Configuration</h2>
                </div>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Connectivity and Optimization</p>
              </div>
              <button onClick={() => setShowLambdaInfo(false)} className="p-3 hover:bg-slate-100 rounded-2xl transition-all"><X size={24}/></button>
            </div>
            
            <div className="space-y-8">
              <div className="bg-slate-900 p-10 rounded-[40px] text-white shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                   <h3 className="text-[12px] font-black uppercase tracking-widest flex items-center gap-2">
                     <Terminal size={18} className="text-blue-400" /> Refined Lambda Script
                   </h3>
                   <button onClick={() => handleCopyCode(lambdaCode, "Refined Lambda Code")} className="px-6 py-3 bg-blue-600 rounded-xl text-[10px] font-black uppercase flex items-center gap-2">
                     <Copy size={14} /> Copy Code
                   </button>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-2xl overflow-x-auto max-h-[300px]">
                  <pre className="text-emerald-400 font-mono text-[11px]">{lambdaCode}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] px-10 py-6 rounded-[40px] shadow-2xl flex items-center gap-5 animate-in slide-in-from-bottom duration-500 border ${
          toast.type === 'success' ? 'bg-slate-900 text-white border-slate-700' : 'bg-rose-600 text-white border-rose-500'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={24} className="text-emerald-400" /> : <AlertTriangle size={24} />}
          <span className="text-[14px] font-black tracking-tight">{toast.message}</span>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-84 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen shrink-0 shadow-sm overflow-y-auto">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-xl shadow-blue-100"><Activity size={24} strokeWidth={2.5} /></div>
            <div>
              <h1 className="text-lg font-black tracking-tight leading-none">CloudSpend</h1>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 underline decoration-blue-500 decoration-2 underline-offset-4">Enterprise Hub</span>
            </div>
          </div>

          <nav className="space-y-1">
            <button onClick={() => setActiveTab('overview')} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
              <LayoutDashboard size={20} /> Dashboard
            </button>
            <button onClick={() => setActiveTab('trends')} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-bold transition-all ${activeTab === 'trends' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
              <TrendingUp size={20} /> 12M History
            </button>
          </nav>
        </div>

        <div className="mt-auto p-6">
          <div className="bg-slate-900 rounded-[40px] p-8 shadow-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-white font-black text-[10px] uppercase tracking-widest"><Server size={14} className="text-blue-400" /> Connection</div>
              <button onClick={() => setShowLambdaInfo(true)} className="text-blue-400 hover:text-blue-300 transition-colors"><Settings2 size={14} /></button>
            </div>
            <form onSubmit={connectAWS} className="space-y-4">
              <div className="relative">
                <Key className="absolute left-4 top-4 text-slate-500" size={16} />
                <input type="text" placeholder="Access Key ID" className="w-full pl-12 pr-4 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl text-[11px] font-bold text-white outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-blue-500" value={credentials.accessKeyId} onChange={e => setCredentials({...credentials, accessKeyId: e.target.value})} />
              </div>
              <div className="relative">
                <Link2 className="absolute left-4 top-4 text-slate-500" size={16} />
                <input type="text" placeholder="Lambda URL" className="w-full pl-12 pr-4 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl text-[11px] font-bold text-white outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-blue-500" value={credentials.endpoint} onChange={e => setCredentials({...credentials, endpoint: e.target.value})} />
              </div>
              <button type="submit" disabled={isFetching} className="w-full py-5 bg-blue-600 text-white rounded-[24px] text-[11px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                {isFetching ? <RefreshCw className="animate-spin" size={16} /> : <><Pulse size={16}/> Sync Data</>}
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
          <button onClick={handleShare} className="flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-3xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-2xl">
            <Share2 size={18} /> Share Dashboard
          </button>
        </header>

        <div className={`p-12 mx-auto space-y-12 ${activeTab === 'trends' ? 'max-w-[100%]' : 'max-w-7xl'}`}>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="bg-white p-12 rounded-[64px] border border-slate-200 shadow-sm relative group overflow-hidden">
              <div className="absolute -top-6 -right-6 p-12 opacity-[0.03] text-blue-600"><DollarSign size={160} /></div>
              <div className="flex justify-between items-start mb-8">
                <div className="p-5 bg-blue-50 text-blue-600 rounded-[32px] shadow-sm"><DollarSign size={32} /></div>
                <div className={`flex items-center gap-2 text-[11px] font-black px-5 py-2.5 rounded-2xl ${momPercent >= 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {momPercent >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  {Math.abs(momPercent).toFixed(1)}% MoM
                </div>
              </div>
              <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">{currentMonth.month} Total</h3>
              <p className="text-6xl font-black text-slate-900 tracking-tighter">${totalSpend.toLocaleString()}</p>
            </div>

            <div className="bg-white p-12 rounded-[64px] border border-slate-200 shadow-sm relative overflow-hidden group">
              <div className="absolute -top-6 -right-6 p-12 opacity-[0.03] text-purple-600"><Globe size={160} /></div>
              <div className="flex justify-between items-start mb-8">
                <div className="p-5 bg-purple-50 text-purple-600 rounded-[32px] shadow-sm"><Globe size={32} /></div>
              </div>
              <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Dominant Region</h3>
              <p className="text-3xl font-black text-slate-900 tracking-tight">Canada Central</p>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-3 flex items-center gap-2">
                 <span className="w-2 h-2 bg-purple-500 rounded-full animate-ping" />
                 Peak Load • ${orderedRegions[0]?.cost.toLocaleString() || '0'}
              </p>
            </div>

            <div className="bg-white p-12 rounded-[64px] border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-8">
                <div className="p-5 bg-emerald-50 text-emerald-600 rounded-[32px] shadow-sm"><ShieldCheck size={32} /></div>
              </div>
              <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">System Insight</h3>
              <p className="text-3xl font-black text-slate-900 tracking-tight">Tracking {orderedRegions.length} Regions</p>
              <div className="w-full bg-slate-100 h-4 rounded-full mt-8 overflow-hidden shadow-inner p-1">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-1500" style={{ width: '100%' }} />
              </div>
            </div>
          </div>

          {activeTab === 'overview' && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="bg-white rounded-[72px] border border-slate-200 p-16 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-16 gap-6">
                  <div>
                    <h2 className="text-[13px] font-black uppercase tracking-[0.2em] flex items-center gap-4">
                      <span className="w-4 h-4 bg-blue-500 rounded-full animate-pulse shadow-[0_0_20px_rgba(59,130,246,0.5)]" />
                      Priority Region Load
                    </h2>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2">Hierarchy: Canada → Virginia → Ohio → Oregon → Taxes</p>
                  </div>
                </div>
                <div className="h-[550px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={orderedRegions} margin={{ bottom: 60 }}>
                      <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/><stop offset="100%" stopColor="#6366f1" stopOpacity={0.8}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="region" 
                        interval={0}
                        axisLine={false} 
                        tickLine={false} 
                        tick={<CustomRegionTick />}
                      />
                      <YAxis tickFormatter={(val) => `$${val.toLocaleString()}`} stroke="#cbd5e1" fontSize={11} axisLine={false} tickLine={false} fontWeight="black" />
                      <Tooltip cursor={{ fill: '#f8fafc', radius: 32 }} contentStyle={{ borderRadius: '48px', border: 'none', boxShadow: '0 40px 100px -20px rgb(0 0 0 / 0.3)', padding: '32px' }} />
                      <Bar dataKey="cost" fill="url(#barGradient)" radius={[24, 24, 0, 0]} barSize={80} />
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
                    <h2 className="text-[14px] font-black uppercase tracking-[0.3em] flex items-center gap-4 mb-2">
                      <Database size={24} className="text-blue-500" /> Historical Billing Ledger
                    </h2>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Enterprise-wide regional tracking • Last 12 Months</p>
                  </div>
                </div>
                
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left table-fixed">
                    <thead>
                      <tr className="text-[11px] font-black uppercase tracking-widest text-slate-400 bg-slate-50/80">
                        <th className="py-12 px-16 w-48">Fiscal Period</th>
                        <th className="py-12 px-16 w-64 text-right">Aggregate Spend</th>
                        <th className="py-12 px-16 text-center">Cost Per Region Breakdown (Full Tracking View)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...billingHistory].reverse().map((month, idx) => {
                        const total = month.entries.reduce((s, e) => s + e.cost, 0);
                        
                        // Strict ordering for ledger breakdown columns
                        const breakdown = TARGET_REGIONS.map(target => {
                          const entry = month.entries.find(e => {
                            const regionLower = e.region.toLowerCase();
                            return target.match.some(keyword => regionLower.includes(keyword));
                          });
                          return { label: target.label, cost: entry?.cost || 0 };
                        });

                        return (
                          <tr key={idx} className="group hover:bg-blue-50/10 transition-all border-b border-slate-50">
                            <td className="py-12 px-16 font-black text-slate-900 uppercase tracking-widest text-[13px]">
                              {month.month === currentMonth.month ? <span className="text-blue-600 flex items-center gap-3"><Pulse size={14} className="animate-pulse" /> {month.month}</span> : month.month}
                            </td>
                            <td className="py-12 px-16 text-right font-mono font-black text-slate-900 text-2xl">
                              ${total.toLocaleString()}
                            </td>
                            <td className="py-12 px-8">
                              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-6 w-full">
                                {breakdown.map((b, i) => {
                                  // Parse main region and project for ledger
                                  const splitMatch = b.label.match(/^(.*?)\s*\((.*?)\)$/);
                                  const mainName = splitMatch ? splitMatch[1] : b.label;
                                  const subName = splitMatch ? splitMatch[2] : '';

                                  return (
                                    <div key={i} className={`flex flex-col items-center justify-center px-6 py-6 rounded-[40px] border-2 transition-all shadow-md group/card ${b.cost > 0 ? 'bg-white border-blue-50 scale-100 hover:border-blue-300' : 'bg-slate-50/50 border-slate-100 opacity-20'}`}>
                                      <span className="text-[14px] font-black text-slate-900 uppercase tracking-tight block text-center leading-tight mb-1">{mainName}</span>
                                      {subName && (
                                        <span className="text-[12px] font-bold text-blue-500 block mb-3 text-center transition-colors">({subName})</span>
                                      )}
                                      <span className="text-[18px] font-black text-slate-900 tracking-tighter block text-center">${b.cost.toLocaleString()}</span>
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
        </div>
      </main>
    </div>
  );
}
