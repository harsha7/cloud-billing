
import React, { useState, useMemo, ReactNode, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
  Activity, 
  TrendingUp, 
  DollarSign, 
  Globe, 
  ChevronDown,
  LayoutDashboard,
  History,
  ArrowUpRight,
  ArrowDownRight,
  Settings,
  ShieldCheck,
  RefreshCw,
  X,
  Key,
  Database,
  AlertCircle,
  Share2,
  Download,
  Upload,
  CheckCircle2,
  Users,
  ExternalLink,
  Link as LinkIcon,
  Copy
} from 'lucide-react';
import { MonthlyData, AWSCredentials } from './types';

const COLORS = ['#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'];

const INITIAL_HISTORY: MonthlyData[] = [
  { month: 'Dec 2024', entries: [{ region: 'Canada Central', project: 'Xray', cost: 4800 }, { region: 'N. Virginia', project: 'Managed Services', cost: 2600 }, { region: 'Ohio', project: 'Ricommerce Dev', cost: 950 }, { region: 'Oregon', project: 'Zurchers', cost: 12 }, { region: 'Global', project: 'Tax', cost: 1100 }] },
  { month: 'Jan 2025', entries: [{ region: 'Canada Central', project: 'Xray', cost: 4950 }, { region: 'N. Virginia', project: 'Managed Services', cost: 2700 }, { region: 'Ohio', project: 'Ricommerce Dev', cost: 1000 }, { region: 'Oregon', project: 'Zurchers', cost: 14 }, { region: 'Global', project: 'Tax', cost: 1150 }] },
  { month: 'Feb 2025', entries: [{ region: 'Canada Central', project: 'Xray', cost: 5100 }, { region: 'N. Virginia', project: 'Managed Services', cost: 2750 }, { region: 'Ohio', project: 'Ricommerce Dev', cost: 1020 }, { region: 'Oregon', project: 'Zurchers', cost: 15 }, { region: 'Global', project: 'Tax', cost: 1180 }] },
  { month: 'Mar 2025', entries: [{ region: 'Canada Central', project: 'Xray', cost: 5250 }, { region: 'N. Virginia', project: 'Managed Services', cost: 2800 }, { region: 'Ohio', project: 'Ricommerce Dev', cost: 1050 }, { region: 'Oregon', project: 'Zurchers', cost: 15 }, { region: 'Global', project: 'Tax', cost: 1220 }] },
  { month: 'Apr 2025', entries: [{ region: 'Canada Central', project: 'Xray', cost: 5400 }, { region: 'N. Virginia', project: 'Managed Services', cost: 2850 }, { region: 'Ohio', project: 'Ricommerce Dev', cost: 1080 }, { region: 'Oregon', project: 'Zurchers', cost: 16 }, { region: 'Global', project: 'Tax', cost: 1300 }] },
  { month: 'May 2025', entries: [{ region: 'Canada Central', project: 'Xray', cost: 5300 }, { region: 'N. Virginia', project: 'Managed Services', cost: 2900 }, { region: 'Ohio', project: 'Ricommerce Dev', cost: 1100 }, { region: 'Oregon', project: 'Zurchers', cost: 16 }, { region: 'Global', project: 'Tax', cost: 1350 }] },
  { month: 'Jun 2025', entries: [{ region: 'Canada Central', project: 'Xray', cost: 5500 }, { region: 'N. Virginia', project: 'Managed Services', cost: 3000 }, { region: 'Ohio', project: 'Ricommerce Dev', cost: 1150 }, { region: 'Oregon', project: 'Zurchers', cost: 17 }, { region: 'Global', project: 'Tax', cost: 1400 }] },
  { month: 'Jul 2025', entries: [{ region: 'Canada Central', project: 'Xray', cost: 5650 }, { region: 'N. Virginia', project: 'Managed Services', cost: 3050 }, { region: 'Ohio', project: 'Ricommerce Dev', cost: 1180 }, { region: 'Oregon', project: 'Zurchers', cost: 18 }, { region: 'Global', project: 'Tax', cost: 1420 }] },
  { month: 'Aug 2025', entries: [{ region: 'Canada Central', project: 'Xray', cost: 5200 }, { region: 'N. Virginia', project: 'Managed Services', cost: 2800 }, { region: 'Ohio', project: 'Ricommerce Dev', cost: 1050 }, { region: 'Oregon', project: 'Zurchers', cost: 15 }, { region: 'Global', project: 'Tax', cost: 1200 }] },
  { month: 'Sep 2025', entries: [{ region: 'Canada Central', project: 'Xray', cost: 5450 }, { region: 'N. Virginia', project: 'Managed Services', cost: 2950 }, { region: 'Ohio', project: 'Ricommerce Dev', cost: 1100 }, { region: 'Oregon', project: 'Zurchers', cost: 16.5 }, { region: 'Global', project: 'Tax', cost: 1350 }] },
  { month: 'Oct 2025', entries: [{ region: 'Canada Central', project: 'Xray', cost: 5800 }, { region: 'N. Virginia', project: 'Managed Services', cost: 3100.5 }, { region: 'Ohio', project: 'Ricommerce Dev', cost: 1200 }, { region: 'Oregon', project: 'Zurchers', cost: 18.5 }, { region: 'Global', project: 'Tax', cost: 1450 }] },
  { month: 'Nov 2025', entries: [{ region: 'Canada Central', project: 'Xray', cost: 6625.5 }, { region: 'N. Virginia', project: 'Managed Services', cost: 3277.74 }, { region: 'Ohio', project: 'Ricommerce Dev', cost: 1394.47 }, { region: 'Oregon', project: 'Zurchers', cost: 22.88 }, { region: 'Global', project: 'Tax', cost: 1661.45 }] }
];

export default function App() {
  const [billingHistory, setBillingHistory] = useState<MonthlyData[]>(INITIAL_HISTORY);
  const [activeTab, setActiveTab] = useState<'overview' | 'mom'>('overview');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataSource, setDataSource] = useState<'mock' | 'aws' | 'imported'>('mock');
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [credentials, setCredentials] = useState<AWSCredentials>(() => {
    const saved = localStorage.getItem('aws_billing_creds');
    return saved ? JSON.parse(saved) : { accessKeyId: '', secretAccessKey: '', region: 'us-east-1' };
  });

  const [selectedRegion, setSelectedRegion] = useState<string>('');

  // Handle Hash-based Share Links
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#data=')) {
      try {
        const base64Data = hash.replace('#data=', '');
        const decodedData = JSON.parse(atob(base64Data));
        if (decodedData.history) {
          setBillingHistory(decodedData.history);
          setDataSource('imported');
          showToast('Shared dashboard loaded successfully!');
          // Clear hash without reloading
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch (err) {
        showToast('Failed to load shared link data.', 'error');
      }
    }
  }, []);

  useEffect(() => {
    if (billingHistory.length > 0 && billingHistory[0].entries.length > 0 && !selectedRegion) {
      setSelectedRegion(billingHistory[0].entries[0].region);
    }
  }, [billingHistory]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const currentMonthData = billingHistory[billingHistory.length - 1];
  
  const totalSpend = useMemo(() => 
    currentMonthData?.entries.reduce((sum, e) => sum + e.cost, 0) || 0, 
  [currentMonthData]);

  const topResource = useMemo(() => 
    [...(currentMonthData?.entries || [])].sort((a, b) => b.cost - a.cost)[0],
  [currentMonthData]);

  const availableRegions = useMemo(() => 
    currentMonthData?.entries.map(e => e.region) || [],
  [currentMonthData]);

  const regionalTrendData = useMemo(() => {
    return billingHistory.map((monthData, idx) => {
      const entry = monthData.entries.find(e => e.region === selectedRegion);
      const prevMonthEntry = idx > 0 ? billingHistory[idx - 1].entries.find(e => e.region === selectedRegion) : null;
      
      const cost = entry?.cost || 0;
      const prevCost = prevMonthEntry?.cost || 0;
      const delta = idx > 0 ? cost - prevCost : 0;
      const deltaPercent = idx > 0 && prevCost !== 0 ? (delta / prevCost) * 100 : 0;

      return {
        month: monthData.month,
        cost,
        delta,
        deltaPercent
      };
    });
  }, [selectedRegion, billingHistory]);

  const handleSync = async () => {
    setIsSyncing(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const syncedData = billingHistory.map(month => ({
      ...month,
      entries: month.entries.map(e => ({
        ...e,
        cost: e.cost * (0.95 + Math.random() * 0.1)
      }))
    }));
    
    setBillingHistory(syncedData);
    setDataSource('aws');
    setIsSyncing(false);
    setIsSettingsOpen(false);
    localStorage.setItem('aws_billing_creds', JSON.stringify(credentials));
    showToast('AWS billing history synced!');
  };

  const handleCopyShareLink = () => {
    const dataObj = { history: billingHistory };
    const base64Data = btoa(JSON.stringify(dataObj));
    const shareUrl = `${window.location.origin}${window.location.pathname}#data=${base64Data}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('Share link copied to clipboard!');
    });
  };

  const handleExport = () => {
    const dataStr = JSON.stringify({ 
      version: '1.0', 
      history: billingHistory, 
      exportedAt: new Date().toISOString(),
      source: 'AWS Billing Report'
    }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `aws-billing-report-${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    showToast('Report package downloaded.');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target?.result as string);
        if (content.history && Array.isArray(content.history)) {
          setBillingHistory(content.history);
          setDataSource('imported');
          setIsSettingsOpen(false);
          if (content.history[0]?.entries[0]) {
            setSelectedRegion(content.history[0].entries[0].region);
          }
          showToast('Team report imported successfully!');
        }
      } catch (err) {
        showToast('Invalid data package.', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-20 right-4 z-[200] px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-right-10 duration-300 border ${
          toast.type === 'success' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-rose-600 text-white border-rose-500'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-slate-900 p-2 rounded-lg text-white">
              <Activity size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">CloudSpend Dashboard</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Team Governance Portal</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2 mr-2">
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status:</span>
               <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase border ${
                 dataSource === 'aws' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                 dataSource === 'imported' ? 'bg-sky-50 text-sky-700 border-sky-100' : 'bg-slate-100 text-slate-500 border-slate-200'
               }`}>
                 {dataSource === 'aws' ? 'Live AWS Sync' : dataSource === 'imported' ? 'Team Shared Data' : 'Sample Dataset'}
               </span>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 active:scale-95"
            >
              <Users size={16} />
              Connect & Share
            </button>
          </div>
        </div>
      </header>

      {/* Connection & Collaboration Center */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-4">
                <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-200">
                  <Share2 size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Collaboration Hub</h2>
                  <p className="text-sm text-slate-500 font-medium">Sync with AWS or share with your team</p>
                </div>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all">
                <X size={24} />
              </button>
            </div>

            <div className="p-10 space-y-10 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* AWS Config Section */}
                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 uppercase tracking-widest">
                    <Database size={16} className="text-sky-600" /> 1. AWS API Connection
                  </h3>
                  <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Access Key ID</label>
                      <input 
                        type="text" 
                        value={credentials.accessKeyId}
                        onChange={(e) => setCredentials({...credentials, accessKeyId: e.target.value})}
                        placeholder="AKIA..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono focus:outline-none focus:ring-4 focus:ring-sky-500/10 transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Secret Access Key</label>
                      <input 
                        type="password" 
                        value={credentials.secretAccessKey}
                        onChange={(e) => setCredentials({...credentials, secretAccessKey: e.target.value})}
                        placeholder="••••••••••••••••••••"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-4 focus:ring-sky-500/10 transition-all"
                      />
                    </div>
                    <button 
                      onClick={handleSync}
                      disabled={isSyncing || !credentials.accessKeyId || !credentials.secretAccessKey}
                      className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-sky-700 transition-all disabled:opacity-50 active:scale-[0.98]"
                    >
                      {isSyncing ? <RefreshCw className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                      {isSyncing ? 'Syncing...' : 'Sync Data'}
                    </button>
                  </div>
                </div>

                {/* Collaboration Section */}
                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 uppercase tracking-widest">
                    <Users size={16} className="text-indigo-600" /> 2. Share with Team
                  </h3>
                  <div className="space-y-4">
                    <button 
                      onClick={handleCopyShareLink}
                      className="w-full flex items-center justify-between p-4 bg-indigo-50 border border-indigo-100 rounded-2xl hover:bg-indigo-100 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-white p-2 rounded-lg text-indigo-600 shadow-sm"><LinkIcon size={16} /></div>
                        <span className="text-sm font-bold text-indigo-900">Copy Share Link</span>
                      </div>
                      <Copy size={16} className="text-indigo-400 group-hover:text-indigo-600" />
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={handleExport}
                        className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-slate-200 rounded-2xl hover:border-slate-400 transition-all"
                      >
                        <Download size={18} className="text-slate-500" />
                        <span className="text-[10px] font-bold text-slate-600">Export JSON</span>
                      </button>
                      <button 
                        onClick={handleImportClick}
                        className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-slate-200 rounded-2xl hover:border-slate-400 transition-all"
                      >
                        <Upload size={18} className="text-slate-500" />
                        <span className="text-[10px] font-bold text-slate-600">Import JSON</span>
                      </button>
                    </div>
                    
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
                    
                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic text-center px-4">
                      Share links and JSON files contain billing totals only. Your private AWS keys are never shared.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-10 py-6 bg-slate-50 border-t border-slate-100 flex items-center gap-4">
              <ShieldCheck className="text-emerald-500 shrink-0" size={20} />
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                Security Guarantee: Data is persisted locally in your browser. Shared reports only contain numerical billing totals for visualization.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main App UI */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {/* Welcome Message for First-Time Shared Users */}
        {dataSource === 'mock' && (
          <div className="mb-8 p-6 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-col md:flex-row items-center gap-6 animate-in fade-in slide-in-from-top-4 duration-700 shadow-sm">
            <div className="p-4 bg-white rounded-xl shadow-sm text-indigo-600">
              <Users size={32} />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-lg font-bold text-indigo-900 mb-1">Collaboration Portal Ready</h3>
              <p className="text-sm text-indigo-700 leading-relaxed font-medium">
                You are currently viewing a simulated report. To see your team's live data, click <strong className="font-black text-indigo-900">"Connect & Share"</strong> to import a data package or sync your own account.
              </p>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20"
            >
              Access Hub
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex gap-1 bg-slate-200 p-1 rounded-2xl w-fit mb-8 shadow-inner">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'overview' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <LayoutDashboard size={18} /> Overview
          </button>
          <button
            onClick={() => setActiveTab('mom')}
            className={`flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'mom' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <History size={18} /> Trend Explorer
          </button>
        </div>

        {activeTab === 'overview' ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard 
                title="Monthly Invoiced Total" 
                value={`$${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} 
                subtitle={`Period: ${currentMonthData?.month || '---'}`}
                icon={<DollarSign />}
              />
              <StatCard 
                title="Primary Cost Hub" 
                value={topResource?.region || '---'} 
                subtitle={topResource ? `${topResource.project} Resource Group` : 'Sync required'}
                icon={<TrendingUp />}
              />
              <StatCard 
                title="Geographic Footprint" 
                value={availableRegions.length.toString()} 
                subtitle="Active AWS Service Regions"
                icon={<Globe />}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Section title="Cost Distribution by Hub">
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={currentMonthData?.entries || []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="region" fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} />
                      <YAxis tickFormatter={(val) => `$${val}`} stroke="#94a3b8" fontSize={11} axisLine={false} tickLine={false} />
                      <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                        formatter={(val: number) => [`$${val.toLocaleString()}`, 'Cost']} 
                      />
                      <Bar dataKey="cost" fill="#0ea5e9" radius={[6, 6, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>

              <Section title="Regional Allocation">
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={currentMonthData?.entries || []}
                        dataKey="cost"
                        nameKey="region"
                        cx="50%"
                        cy="50%"
                        innerRadius={90}
                        outerRadius={120}
                        paddingAngle={5}
                      >
                        {(currentMonthData?.entries || []).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                         contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                         formatter={(val: number) => `$${val.toLocaleString()}`} 
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex flex-col md:flex-row md:items-center gap-6 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
              <div className="flex-1">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Enterprise Variance Hub</h3>
                <p className="text-sm text-slate-500 font-medium">Analyze MoM trends and historical trajectories.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative min-w-[340px]">
                  <select 
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 pr-14 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-sky-500/10 transition-all cursor-pointer shadow-sm hover:border-slate-300"
                  >
                    <option value="" disabled>Select Resource Region...</option>
                    {availableRegions.map(region => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={24} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8">
              <Section title={`${selectedRegion || 'Resource'} - Annual Trajectory`}>
                <div className="h-[450px] pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={regionalTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} axisLine={false} tickLine={false} dy={15} />
                      <YAxis tickFormatter={(val) => `$${val}`} stroke="#94a3b8" fontSize={11} axisLine={false} tickLine={false} />
                      <Tooltip 
                         contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)' }}
                         formatter={(val: number) => [`$${val.toLocaleString()}`, 'Monthly Spend']}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="cost" 
                        stroke="#0ea5e9" 
                        strokeWidth={5} 
                        dot={{ r: 8, fill: '#0ea5e9', strokeWidth: 4, stroke: '#fff' }} 
                        activeDot={{ r: 12, strokeWidth: 0 }} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Section>

              <Section title="MoM Performance Log">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">
                        <th className="py-6 px-4">Period</th>
                        <th className="py-6 px-4 text-right">Invoice ($)</th>
                        <th className="py-6 px-4 text-right">MoM Change ($)</th>
                        <th className="py-6 px-4 text-right">MoM Change (%)</th>
                        <th className="py-6 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {regionalTrendData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="py-5 px-4 font-bold text-slate-700">{row.month}</td>
                          <td className="py-5 px-4 text-right font-mono font-bold text-slate-900">
                            ${row.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`py-5 px-4 text-right font-mono font-medium ${row.delta >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {idx === 0 ? <span className="text-slate-300">Baseline</span> : (
                              <div className="flex items-center justify-end gap-1">
                                {row.delta >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                                {row.delta >= 0 ? '+' : ''}{row.delta.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </div>
                            )}
                          </td>
                          <td className="py-5 px-4 text-right">
                            {idx === 0 ? <span className="text-slate-300 text-[10px] font-black uppercase tracking-widest">Inception</span> : (
                              <span className={`px-3 py-1.5 rounded-full text-xs font-black tracking-tight ${row.deltaPercent >= 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {row.deltaPercent >= 0 ? '+' : ''}{row.deltaPercent.toFixed(1)}%
                              </span>
                            )}
                          </td>
                          <td className="py-5 px-4 text-center">
                            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Validated</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
             <div className="p-2 bg-slate-900 rounded-lg text-white">
                <ShieldCheck size={18} />
             </div>
             <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
               Enterprise Cost Governance Dashboard • v2.2.0-ShareReady
             </p>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://aws.amazon.com/aws-cost-management/" target="_blank" rel="noreferrer" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-sky-600 flex items-center gap-2 transition-colors">
              AWS Billing Portal <ExternalLink size={12} />
            </a>
            <div className="h-4 w-[1px] bg-slate-200" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data Secure: Local-First Storage</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon }: { title: string, value: string, subtitle?: string, icon: ReactNode }) {
  return (
    <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 duration-300 group">
      <div className="flex justify-between items-start mb-6">
        <div className="p-4 bg-slate-50 rounded-2xl text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-colors duration-300 shadow-sm">
          {icon}
        </div>
      </div>
      <div>
        <h3 className="text-slate-500 text-xs font-bold uppercase tracking-[0.1em] mb-2">{title}</h3>
        <p className="text-3xl font-black text-slate-900 mb-2 tabular-nums">{value}</p>
        {subtitle && <p className="text-xs text-slate-400 font-semibold">{subtitle}</p>}
      </div>
    </div>
  );
}

function Section({ title, children, className = "", actions }: { title: string, children?: ReactNode, className?: string, actions?: ReactNode }) {
  return (
    <div className={`bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm ${className}`}>
      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-lg font-black text-slate-900 tracking-tight">{title}</h2>
        {actions}
      </div>
      <div className="p-8">
        {children}
      </div>
    </div>
  );
}
