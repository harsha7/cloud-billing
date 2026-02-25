
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
  Search, Download, ChevronLeft, Filter, ExternalLink, Info, ChevronUp, Box,
  ShieldAlert, FileText, Lock, ListOrdered, MousePointer2, Cpu
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
  { key: 'us-ashburn-1', label: 'Ashburn (redirontechnologies)', match: ['ashburn', 'us-ashburn-1'], color: 'rose' },
  { key: 'us-phoenix-1', label: 'Phoenix (redirontechnologies)', match: ['phoenix', 'us-phoenix-1'], color: 'amber' },
  { key: 'ca-toronto-1', label: 'Toronto (redirontechnologies)', match: ['toronto', 'ca-toronto-1'], color: 'orange' },
  { key: 'uk-london-1', label: 'London (redirontechnologies)', match: ['london', 'uk-london-1'], color: 'red' },
  { key: 'Global', label: 'Marketplace / Taxes', match: ['tax', 'marketplace'], color: 'slate' }
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
      let base = provider === 'aws' ? 6200 : 9400;
      if (target.key.includes('Global')) base = 1200;
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
  
  const [isRealData, setIsRealData] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");

  const currentTargets = useMemo(() => {
    if (provider === 'aws') return AWS_TARGETS;
    if (isRealData && billingHistory.length > 0) {
      // Create unique targets based on Tenancy + Region combination
      const pairs = new Set<string>();
      billingHistory.forEach(m => {
        m.entries.forEach(e => {
          const t = String(e.tenancy || e.Tenancy || "Unknown");
          const r = String(e.region || e.Region || "Global");
          pairs.add(`${t}|${r}`);
        });
      });

      const sortedPairs = Array.from(pairs).sort();
      return sortedPairs.map((pair, idx) => {
        const [tenancy, region] = pair.split('|');
        const label = region === 'Global' ? tenancy : `${region.toUpperCase().replace(/-/g, ' ')} (${tenancy})`;
        return {
          key: pair,
          label: label,
          match: [tenancy.toLowerCase(), region.toLowerCase()],
          color: ['rose', 'amber', 'orange', 'red', 'blue', 'indigo', 'purple', 'emerald'][idx % 8]
        };
      });
    }
    // Show redirontechnologies regions for OCI if not synced or no data found
    return OCI_TARGETS;
  }, [provider, isRealData, billingHistory]);
  const [baseMonthIdx, setBaseMonthIdx] = useState(0);
  const [targetMonthIdx, setTargetMonthIdx] = useState(0);
  const [drillDownTarget, setDrillDownTarget] = useState('');
  const [drillDownMonthIdx, setDrillDownMonthIdx] = useState(0);
  const [expandedComparisonTarget, setExpandedComparisonTarget] = useState<string | null>(null);

  useEffect(() => {
    const mock = generateMockData(provider);
    setBillingHistory(mock);
    setIsRealData(false);
    setBaseMonthIdx(mock.length - 2);
    setTargetMonthIdx(mock.length - 1);
    setDrillDownMonthIdx(mock.length - 1);
    setDrillDownTarget(provider === 'aws' ? AWS_TARGETS[0].key : OCI_TARGETS[0].key);
  }, [provider]);

  useEffect(() => {
    if (provider === 'oci' && isRealData && billingHistory.length > 0 && !drillDownTarget) {
      const lastMonth = billingHistory[billingHistory.length - 1];
      const allTenancies = Array.from(new Set(lastMonth.entries.map(e => e.tenancy || e.Tenancy).filter(Boolean)));
      if (allTenancies.length > 0) {
        setDrillDownTarget(String(allTenancies[0]));
      } else {
        setDrillDownTarget(OCI_TARGETS[0].key);
      }
    }
  }, [billingHistory, isRealData, provider, drillDownTarget]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 8000);
  };

  const syncData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentials.endpoint?.trim()) {
      showToast("Missing Endpoint URL", "error");
      return;
    }
    if (!credentials.endpoint.startsWith('https://')) {
      showToast("Security Error: URL must start with https://", "error");
      return;
    }
    setIsFetching(true);
    try {
      const response = await fetch(credentials.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server Error (${response.status}): ${errorText.substring(0, 50)}`);
      }

      const data = await response.json();
      if (Array.isArray(data)) {
        setBillingHistory(data);
        setIsRealData(true);
        showToast(`${provider.toUpperCase()} Data Sync Success`);
      } else throw new Error(data.error || "Invalid response format");
    } catch (err: any) {
      console.error("Sync Error Details:", err);
      const isCors = err.message.includes('Failed to fetch') || err.name === 'TypeError';
      showToast(isCors 
        ? "CORS/Network Error: Check API Gateway CORS settings & URL" 
        : `Sync Error: ${err.message}`, "error");
    } finally { setIsFetching(false); }
  };

  const getAggregatedData = (month: MonthlyData) => {
    const targets = currentTargets;
    if (!month || !month.entries) return targets.map(t => ({ label: t.label, key: t.key, cost: 0, color: t.color, entries: [] }));
    
    return targets.map(target => {
      const filtered = month.entries.filter(e => {
        // For OCI real data, we match on the combined key
        if (provider === 'oci' && isRealData && target.key.includes('|')) {
          const [t, r] = target.key.split('|');
          return String(e.tenancy || e.Tenancy || "Unknown") === t && 
                 String(e.region || e.Region || "Global") === r;
        }
        
        const val = String(e.region || e.tenancy || e.Region || e.Tenancy || "").toLowerCase();
        return target.match.some(keyword => val.includes(keyword));
      });
      return { label: target.label, key: target.key, cost: filtered.reduce((sum, e) => sum + e.cost, 0), color: target.color, entries: filtered };
    });
  };

  const currentMonthData = billingHistory[billingHistory.length - 1] || { month: 'N/A', entries: [] };
  const aggLatest = useMemo(() => getAggregatedData(currentMonthData), [currentMonthData, provider]);
  const totalSpendLatest = currentMonthData.entries.reduce((sum, e) => sum + e.cost, 0);

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
    const target = currentTargets.find(t => t.key === drillDownTarget);
    if (!month || !target) return [];
    
    const serviceMap: Record<string, number> = {};
    month.entries.filter(e => {
       const val = String(e.region || e.tenancy || e.Region || e.Tenancy || "").toLowerCase();
       return target.match.some(kw => val.includes(kw));
    }).forEach(e => {
       const name = e.service || "Uncategorized";
       serviceMap[name] = (serviceMap[name] || 0) + e.cost;
    });

    return Object.entries(serviceMap).map(([name, cost]) => ({ name, cost })).sort((a,b) => b.cost - a.cost);
  }, [drillDownMonthIdx, drillDownTarget, billingHistory, provider]);

  const ociFunctionScript = `import io
import json
import oci
from fdk import response
from datetime import datetime, timedelta

# API KEY CONFIGURATION
# Replace these with your actual OCI credentials from User Settings > API Keys
CONFIG = {
    "user": "ocid1.user.oc1..aaaaaaaavmpy6fyc3tbv4tr2poakl6autqbaqwkjkgtn5pgv4k4wrlqh6v2a",
    "key_content": """-----BEGIN RSA PRIVATE KEY-----
<PASTE_YOUR_PRIVATE_KEY_HERE>
-----END RSA PRIVATE KEY-----""",
    "fingerprint": "59:69:d3:0b:bd:f7:c0:b7:d6:01:87:cd:ef:74:2b:99",
    "tenancy": "ocid1.tenancy.oc1..aaaaaaaapeao7bqexo4hm2nmliv7rdzc7zoefhaf5fnbjr4yey7cts2sqwfq",
    "region": "us-ashburn-1"
}

def handler(ctx, data: io.BytesIO = None):
    try:
        usage_client = oci.usage_api.UsageApiClient(CONFIG)
        
        # Calculate date range (last 12 months)
        # We use a slightly wider range to ensure we catch all data
        now = datetime.now()
        start = now - timedelta(days=365)
        
        request_details = oci.usage_api.models.RequestSummarizedUsagesDetails(
            tenant_id=CONFIG['tenancy'],
            time_usage_started=start.strftime('%Y-%m-%dT00:00:00.000Z'),
            time_usage_ended=now.strftime('%Y-%m-%dT00:00:00.000Z'),
            granularity='MONTHLY',
            query_type='COST',
            group_by=['service', 'region', 'tenancyId']
        )
        
        usage_response = usage_client.request_summarized_usages(request_details)
        
        # Transform OCI response to CloudSpend format
        formatted = {}
        for item in usage_response.data.items:
            # Parse start date to "MMM YYYY" format
            dt = datetime.strptime(item.time_usage_started[:10], "%Y-%m-%d")
            m_str = dt.strftime("%b %Y")
            
            if m_str not in formatted: 
                formatted[m_str] = []
            
            formatted[m_str].append({
                "tenancy": "redirontechnologies", # Requested display name
                "region": item.region if item.region else "Global",
                "service": item.service,
                "cost": float(item.computed_amount) if item.computed_amount else 0.0
            })
            
        # Ensure we have a list of months sorted by date
        sorted_months = sorted(formatted.keys(), key=lambda x: datetime.strptime(x, "%b %Y"))
        final_list = [{"month": m, "entries": formatted[m]} for m in sorted_months]
        
        return response.Response(
            ctx, response_data=json.dumps(final_list),
            headers={"Content-Type": "application/json"}
        )
    except Exception as e:
        return response.Response(
            ctx, response_data=json.dumps({"error": str(e)}),
            headers={"Content-Type": "application/json"},
            status=500
        )`;

  const ociVmScript = `from flask import Flask, jsonify, request
import oci
import json
from datetime import datetime, timedelta

app = Flask(__name__)

# OCI VM CONFIGURATION
CONFIG = {
    "user": "ocid1.user.oc1..aaaaaaaakuo4bvkuvuha67jqelmplexbdsemhgevub5ekbc544iwmjqycaqa",
    "key_file": "/home/opc/private_key.pem", # <--- UPDATE THIS ON YOUR VM
    "fingerprint": "3a:6c:43:dc:9d:12:65:ae:6b:3a:71:9e:a1:8b:4f:10",
    "tenancy": "ocid1.tenancy.oc1..aaaaaaaapeao7bqexo4hm2nmliv7rdzc7zoefhaf5fnbjr4yey7cts2sqwfq",
    "region": "ca-toronto-1"
}

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

@app.route('/', methods=['GET'])
def health():
    return "OCI Billing API is Running on Port 5000!"

@app.route('/sync', methods=['POST'])
def sync_billing():
    try:
        usage_client = oci.usage_api.UsageApiClient(CONFIG)
        end = datetime.now().replace(day=1)
        start = end - timedelta(days=365)
        
        request_details = oci.usage_api.models.RequestSummarizedUsagesDetails(
            tenant_id=CONFIG['tenancy'],
            time_usage_started=start.isoformat(),
            time_usage_ended=end.isoformat(),
            granularity='MONTHLY',
            query_type='COST',
            group_by=['service', 'tenancyId']
        )
        
        response = usage_client.request_summarized_usages(request_details)
        
        # TRANSFORMATION LOGIC
        formatted = {}
        for item in response.data.items:
            m_str = datetime.strptime(item.time_usage_started[:10], "%Y-%m-%d").strftime("%b %Y")
            if m_str not in formatted: formatted[m_str] = []
            formatted[m_str].append({
                "tenancy": item.tenancy_id,
                "service": item.service,
                "cost": float(item.computed_amount)
            })
            
        final_list = [{"month": k, "entries": v} for k, v in formatted.items()]
        return jsonify(final_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)`;

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
          <div className="bg-slate-900 rounded-[40px] p-8 shadow-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-6 text-white font-black text-[10px] uppercase tracking-widest">
              <span className="flex items-center gap-2"><Cpu size={14} className={brandTextClass} /> {provider === 'aws' ? 'LAMBDA BRIDGE' : 'FUNCTION BRIDGE'}</span>
              <button onClick={() => setShowLambdaInfo(true)} className={`${brandTextClass} hover:text-white transition-colors`}><Settings2 size={14} /></button>
            </div>
            <form onSubmit={syncData} className="space-y-4">
              <input type="text" placeholder={provider === 'aws' ? "https://<LAMBDA_URL>/sync" : "https://<FUNCTION_URL>/sync"} className="w-full px-4 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl text-[11px] font-bold text-white outline-none focus:ring-2 focus:ring-blue-500" value={credentials.endpoint} onChange={e => setCredentials({...credentials, endpoint: e.target.value})} />
              <button type="submit" disabled={isFetching} className={`w-full py-5 ${brandColorClass} text-white rounded-[24px] text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform`}>
                {isFetching ? <RefreshCw className="animate-spin" size={16} /> : <Pulse size={16}/>} SYNC NOW
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="h-24 border-b border-slate-200 bg-white/80 backdrop-blur-2xl sticky top-0 z-40 px-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-slate-400 font-bold text-[11px] uppercase tracking-widest">{provider === 'aws' ? 'AWS Global Infra' : 'OCI Cloud Functions'}</span>
            <ChevronRight size={16} className="text-slate-200" />
            <span className={`font-black text-[11px] uppercase tracking-widest bg-slate-100 px-4 py-2 rounded-full ${brandTextClass}`}>{activeTab}</span>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">System Status</p>
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">v1.0.5 • Functions Ready</p>
          </div>
        </header>

        <div className="p-12 mx-auto space-y-12 max-w-[1600px]">
          {activeTab === 'overview' && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-12">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                  <div className="bg-white p-12 rounded-[64px] border border-slate-200 shadow-sm relative overflow-hidden group">
                    <div className={`absolute -top-6 -right-6 p-12 opacity-[0.03] ${brandTextClass}`}><DollarSign size={160} /></div>
                    <div className="flex justify-between items-start mb-8"><div className={`p-5 ${provider === 'aws' ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'} rounded-[32px]`}><DollarSign size={32} /></div></div>
                    <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">{currentMonthData.month} Spending</h3>
                    <p className="text-6xl font-black text-slate-900 tracking-tighter">${totalSpendLatest.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-12 rounded-[64px] border border-slate-200 shadow-sm relative overflow-hidden group">
                    <div className={`absolute -top-6 -right-6 p-12 opacity-[0.03] ${provider === 'aws' ? 'text-indigo-600' : 'text-amber-600'}`}><Globe size={160} /></div>
                    <div className="flex justify-between items-start mb-8"><div className={`p-5 ${provider === 'aws' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'} rounded-[32px]`}><Globe size={32} /></div></div>
                    <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Primary {provider === 'aws' ? 'Region' : 'Tenancy'}</h3>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">{aggLatest[0]?.label}</p>
                  </div>
                  <div className="bg-white p-12 rounded-[64px] border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-8"><div className="p-5 bg-emerald-50 text-emerald-600 rounded-[32px]"><ShieldCheck size={32} /></div></div>
                    <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-2">Integration Status</h3>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">{provider === 'aws' ? 'Lambda Ready' : 'Functions Ready'}</p>
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
                        <Tooltip cursor={{ fill: '#f8fafc', radius: 32 }} contentStyle={{ borderRadius: '48px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '20px' }} />
                        <Bar dataKey="cost" radius={[24, 24, 0, 0]} barSize={80}>
                          {aggLatest.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={
                              entry.color === 'blue' ? '#3b82f6' : 
                              entry.color === 'indigo' ? '#6366f1' : 
                              entry.color === 'purple' ? '#a855f7' : 
                              entry.color === 'emerald' ? '#10b981' : 
                              entry.color === 'rose' ? '#f43f5e' : 
                              entry.color === 'amber' ? '#f59e0b' : 
                              entry.color === 'orange' ? '#fb8c00' : 
                              entry.color === 'red' ? '#ef4444' : '#64748b'
                            } />
                          ))}
                        </Bar>
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
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Enterprise VM Aggregation Analysis</p>
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
                              {breakdown.length === 0 && provider === 'oci' && !isRealData ? (
                                <div className="text-center py-4 text-slate-300 font-black uppercase text-[10px] tracking-widest border-2 border-dashed border-slate-100 rounded-3xl">Sync Required</div>
                              ) : (
                                <div className="grid grid-cols-5 gap-4">
                                  {breakdown.map((b, i) => {
                                    const colorClass = 
                                      b.color === 'blue' ? 'text-blue-600' : 
                                      b.color === 'indigo' ? 'text-indigo-600' : 
                                      b.color === 'purple' ? 'text-purple-600' : 
                                      b.color === 'emerald' ? 'text-emerald-600' : 
                                      b.color === 'rose' ? 'text-rose-600' : 
                                      b.color === 'amber' ? 'text-amber-600' : 
                                      b.color === 'orange' ? 'text-orange-600' : 
                                      b.color === 'red' ? 'text-red-600' : 'text-slate-600';
                                    
                                    return (
                                      <div key={i} className={`px-4 py-5 rounded-[40px] border-2 ${b.cost > 0 ? 'bg-white border-slate-100 shadow-md' : 'opacity-20'} transition-all hover:scale-[1.05]`}>
                                        <span className={`text-[10px] font-black uppercase tracking-tight block text-center mb-0.5 ${colorClass}`}>{String(b.label).split(' ')[0]}</span>
                                        <span className="text-lg font-black tracking-tighter block text-center">${b.cost.toLocaleString()}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
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
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-12">
               {currentTargets.length === 0 && provider === 'oci' && !isRealData ? (
                 <div className="bg-white rounded-[72px] border border-slate-200 p-32 text-center shadow-sm">
                    <ArrowRightLeft size={64} className="mx-auto text-slate-200 mb-8 animate-pulse" />
                    <h2 className="text-2xl font-black text-slate-900 mb-4">OCI Sync Required</h2>
                    <p className="text-slate-500 font-bold max-w-md mx-auto">Please connect your OCI Function to compare costs across tenancies.</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 gap-8">
                    {comparisonData.map((item, idx) => (
                      <div key={idx} className="bg-white rounded-[48px] border border-slate-200 p-12 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-6">
                            <div className={`w-4 h-16 rounded-full ${item.diff > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                            <div>
                              <h3 className="text-2xl font-black text-slate-900">{item.label}</h3>
                              <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest">Month-over-Month Variance</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`flex items-center gap-2 text-2xl font-black ${item.diff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {item.diff > 0 ? <ArrowUpRight size={24}/> : <ArrowDownRight size={24}/>}
                              {Math.abs(item.percent).toFixed(1)}%
                            </div>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{item.diff > 0 ? 'Increase' : 'Decrease'} vs Prev Month</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-12">
                          <div className="bg-slate-50 p-8 rounded-[32px]">
                            <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Current Month</p>
                            <p className="text-4xl font-black text-slate-900">${item.current.toLocaleString()}</p>
                          </div>
                          <div className="bg-slate-50 p-8 rounded-[32px]">
                            <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Previous Month</p>
                            <p className="text-4xl font-black text-slate-900">${item.previous.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                 </div>
               )}
            </div>
          )}

          {activeTab === 'services' && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-12">
               {currentTargets.length === 0 && provider === 'oci' && !isRealData ? (
                 <div className="bg-white rounded-[72px] border border-slate-200 p-32 text-center shadow-sm">
                    <Layers size={64} className="mx-auto text-slate-200 mb-8 animate-pulse" />
                    <h2 className="text-2xl font-black text-slate-900 mb-4">Service Explorer Locked</h2>
                    <p className="text-slate-500 font-bold max-w-md mx-auto">Sync your OCI account to explore costs by service and tenancy.</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    <div className="lg:col-span-1 space-y-4">
                      <h3 className="text-[11px] font-black uppercase text-slate-400 tracking-widest px-4">Select {provider === 'aws' ? 'Region' : 'Tenancy'}</h3>
                      <div className="space-y-2">
                        {currentTargets.map(t => (
                          <button key={t.key} onClick={() => setDrillDownTarget(String(t.key))} className={`w-full text-left px-6 py-4 rounded-2xl font-bold transition-all ${drillDownTarget === t.key ? `${brandColorClass} text-white shadow-lg scale-[1.02]` : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'}`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="lg:col-span-3 bg-white rounded-[56px] border border-slate-200 p-12 shadow-sm">
                      <div className="flex items-center justify-between mb-12">
                        <div>
                          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">{currentTargets.find(t => t.key === drillDownTarget)?.label}</h2>
                          <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest mt-1">Service Cost Breakdown</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input type="text" placeholder="Search services..." className="pl-12 pr-6 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 w-64" value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-6">
                        {serviceDrillDownData.length === 0 ? (
                          <div className="py-20 text-center text-slate-300 font-black uppercase tracking-widest">No service data found</div>
                        ) : (
                          serviceDrillDownData.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase())).map((svc, idx) => (
                            <div key={idx} className="group">
                              <div className="flex justify-between items-end mb-3 px-2">
                                <span className="font-black text-slate-900 text-sm uppercase tracking-tight">{svc.name}</span>
                                <span className="font-mono font-black text-slate-900 text-lg">${svc.cost.toLocaleString()}</span>
                              </div>
                              <div className="h-4 bg-slate-100 rounded-full overflow-hidden p-1">
                                <div className={`${brandColorClass} h-full rounded-full transition-all duration-1000`} style={{ width: `${(svc.cost / serviceDrillDownData[0].cost) * 100}%` }} />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                 </div>
               )}
            </div>
          )}
        </div>
      </main>

      {showLambdaInfo && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-2xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white rounded-[48px] w-full max-w-[1500px] p-12 shadow-2xl overflow-y-auto max-h-[95vh] border border-slate-200">
            <div className="flex justify-between items-start mb-10">
              <div>
                <h2 className="text-4xl font-black tracking-tighter">{provider === 'aws' ? 'AWS Lambda Setup' : 'OCI Cloud Function Setup'}</h2>
                <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.2em] mt-2">Deploy this script to your {provider === 'aws' ? 'Lambda' : 'OCI Function'} to sync real billing data</p>
              </div>
              <button onClick={() => setShowLambdaInfo(false)} className="p-4 hover:bg-slate-100 rounded-2xl transition-all shadow-sm"><X size={28}/></button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="bg-slate-50 p-10 rounded-[48px] border border-slate-200 shadow-sm space-y-8">
                <h3 className="text-[13px] font-black uppercase tracking-widest flex items-center gap-3 text-slate-900"><MousePointer2 size={20} className="text-blue-600" /> 1. Cloud Shell Deployment</h3>
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200">
                    <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Deployment Commands</p>
                    <ol className="text-xs text-slate-600 font-bold space-y-2 list-decimal pl-4">
                      <li>Open <b>OCI Cloud Shell</b></li>
                      <li>Run <code className="text-blue-600">fn init --runtime python [func-name]</code></li>
                      <li>Paste the script into <code className="text-blue-600">func.py</code></li>
                      <li>Run: <br/>
                        <code className="text-blue-600 block bg-slate-50 p-2 mt-2 rounded-lg">fn deploy --app cloudspend-ash-x86</code>
                      </li>
                    </ol>
                  </div>
                  <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100">
                    <p className="text-[10px] font-black uppercase text-rose-800 tracking-widest mb-2 flex items-center gap-2"><ShieldAlert size={14}/> Fix: Access Denied Error</p>
                    <p className="text-[10px] text-rose-700 font-bold leading-relaxed space-y-2">
                      Your Cloud Shell is trying to push to Docker Hub instead of OCI. Run these commands:
                      <code className="block bg-white/50 p-2 mt-1 rounded">
                        fn update context registry iad.ocir.io/[tenancy-namespace]/cloudspend<br/>
                        docker login iad.ocir.io
                      </code>
                      <span className="block mt-1 italic font-normal">Use your <b>Auth Token</b> as the password (User Settings &gt; Auth Tokens).</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 p-10 rounded-[48px] text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform"><Terminal size={140} /></div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-[13px] font-black uppercase tracking-widest flex items-center gap-3"><Terminal size={20} className={brandTextClass} /> 2. Python Script (func.py)</h3>
                    <div className="flex gap-2">
                      <button onClick={() => { navigator.clipboard.writeText(ociFunctionScript); showToast("Script Copied!"); }} className={`px-4 py-2 ${brandColorClass} rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:opacity-90 transition-all shadow-lg`}><Copy size={14} /> func.py</button>
                      <button onClick={() => { navigator.clipboard.writeText("fdk\noci"); showToast("Requirements Copied!"); }} className="px-4 py-2 bg-slate-700 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-slate-600 transition-all text-white shadow-lg"><Copy size={14} /> reqs.txt</button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <pre className="bg-slate-800/40 p-6 rounded-3xl overflow-x-auto text-emerald-400 font-mono text-[10px] leading-relaxed max-h-[300px] border border-slate-700/50 whitespace-pre-wrap select-all">
                      {ociFunctionScript}
                    </pre>
                    <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700">
                      <p className="text-[10px] font-black uppercase text-slate-500 mb-2">requirements.txt content:</p>
                      <code className="text-emerald-400 font-mono text-xs">fdk<br/>oci</code>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-10 rounded-[48px] border-2 border-slate-100 shadow-sm relative overflow-hidden group">
                <div className="relative z-10">
                   <h3 className="text-[13px] font-black uppercase tracking-widest mb-8 text-slate-900">3. Fix Connection (CORS/Gateway)</h3>
                   <div className="space-y-6">
                      <div className="p-6 bg-rose-50 rounded-3xl border border-rose-100">
                        <p className="text-[10px] font-black uppercase text-rose-800 tracking-widest mb-2">CORS & Gateway Checklist</p>
                        <p className="text-[10px] text-rose-700 font-bold leading-relaxed">
                          If you see "CORS Blocked", check these 3 things in your <b>Deployment</b>:
                          <ol className="list-decimal pl-4 mt-2 space-y-2">
                            <li><b>CORS Section:</b> Do NOT add a manual OPTIONS route. Instead, go to the <b>CORS</b> section in the wizard and click <b>Enable CORS</b>.</li>
                            <li><b>Allowed Headers:</b> You must type <code className="bg-white/50 px-1">Content-Type</code> in the "Allowed Headers" box.</li>
                            <li><b>Route Path:</b> If your route is <code className="bg-white/50 px-1">/</code>, your URL must end with a slash. If it's <code className="bg-white/50 px-1">/sync</code>, add <code className="bg-white/50 px-1">/sync</code> to your URL.</li>
                          </ol>
                        </p>
                      </div>
                      <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
                        <p className="text-[10px] font-black uppercase text-emerald-800 tracking-widest mb-2">New Sync Endpoint</p>
                        <p className="text-xs text-emerald-700 leading-relaxed font-bold">Use the <b>Gateway Endpoint</b> URL instead:<br/><span className="select-all">https://...apigateway.../sync</span></p>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-10 right-10 px-8 py-5 rounded-[24px] ${toast.type === 'error' ? 'bg-rose-600' : 'bg-slate-900'} text-white shadow-2xl z-[300] flex items-center gap-4 animate-in fade-in slide-in-from-right-10 duration-500`}>
           {toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20} />}
           <span className="text-sm font-bold tracking-tight uppercase tracking-widest">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
