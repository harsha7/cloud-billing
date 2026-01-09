
import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  Activity, TrendingUp, DollarSign, Globe, LayoutDashboard, History,
  ArrowUpRight, ArrowDownRight, ShieldCheck, RefreshCw,
  AlertCircle, Share2, Sparkles, ShieldAlert, FileText, ExternalLink,
  Zap, Database, CheckCircle2
} from 'lucide-react';
import { MonthlyData, AIReportData } from './types';
import { GoogleGenAI, Type } from "@google/genai";

const COLORS = ['#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'];

const INITIAL_HISTORY: MonthlyData[] = [
  { month: 'Oct 2025', entries: [
    { region: 'Canada Central', project: 'Xray', cost: 5800 },
    { region: 'N. Virginia', project: 'Managed Services', cost: 3100.5 },
    { region: 'Ohio', project: 'Ricommerce Dev', cost: 1200 },
    { region: 'Oregon', project: 'Zurchers', cost: 18.5 },
    { region: 'Global', project: 'Tax', cost: 1450 }
  ]},
  { month: 'Nov 2025', entries: [
    { region: 'Canada Central', project: 'Xray', cost: 6625.50 },
    { region: 'N. Virginia', project: 'Managed Services', cost: 3277.74 },
    { region: 'Ohio', project: 'Ricommerce Dev', cost: 1394.47 },
    { region: 'Oregon', project: 'Zurchers', cost: 22.88 },
    { region: 'Global', project: 'Tax', cost: 1661.45 }
  ]}
];

interface SectionProps {
  title: string;
  children?: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
          <FileText size={18} className="text-slate-400" /> {title}
        </h2>
      </div>
      <div className="p-8">{children}</div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number;
  type?: 'default' | 'danger' | 'success';
  icon: React.ReactNode;
}

function StatCard({ title, value, subtitle, trend, type = 'default', icon }: StatCardProps) {
  return (
    <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm transition-all hover:shadow-xl duration-300">
      <div className="flex justify-between items-start mb-6">
        <div className={`p-4 rounded-2xl ${type === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-sky-600'}`}>{icon}</div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${trend >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div>
        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">{title}</h3>
        <p className="text-2xl font-black text-slate-900 mb-1">{value}</p>
        {subtitle && <p className="text-[10px] text-slate-400 font-bold uppercase">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function App() {
  const [billingHistory] = useState<MonthlyData[]>(INITIAL_HISTORY);
  const [activeTab, setActiveTab] = useState<'overview' | 'mom' | 'ai'>('overview');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState<AIReportData | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const currentMonth = billingHistory[billingHistory.length - 1];
  const previousMonth = billingHistory[billingHistory.length - 2];
  
  const totalSpend = useMemo(() => currentMonth.entries.reduce((sum, e) => sum + e.cost, 0), [currentMonth]);
  const prevTotalSpend = useMemo(() => previousMonth?.entries.reduce((sum, e) => sum + e.cost, 0) || 0, [previousMonth]);
  const momPercent = prevTotalSpend > 0 ? ((totalSpend - prevTotalSpend) / prevTotalSpend) * 100 : 0;

  const regionalMoM = useMemo(() => {
    return currentMonth.entries.map(curr => {
      const prev = previousMonth?.entries.find(p => p.region === curr.region);
      const diff = prev ? curr.cost - prev.cost : 0;
      const pct = prev ? (diff / prev.cost) * 100 : 0;
      return { ...curr, diff, pct };
    });
  }, [currentMonth, previousMonth]);

  const generateAIReport = async () => {
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Perform a deep Month-Over-Month (MoM) analysis on this AWS Billing data: ${JSON.stringify(billingHistory)}. 
      Highlight Canada Central ($6,625.50), N. Virginia ($3,277.74), and Ohio ($1,394.47). 
      Identify why costs spiked in Canada, find any anomalies, and provide 3 priority cost-saving actions.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              varianceSummary: { type: Type.STRING },
              regionalDrivers: { 
                type: Type.ARRAY, 
                items: { 
                  type: Type.OBJECT,
                  properties: { region: { type: Type.STRING }, reason: { type: Type.STRING } }
                }
              },
              anomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendations: { 
                type: Type.ARRAY, 
                items: { 
                  type: Type.OBJECT,
                  properties: { 
                    action: { type: Type.STRING }, 
                    priority: { type: Type.STRING },
                    impact: { type: Type.STRING }
                  }
                } 
              },
              optimizationScore: { type: Type.NUMBER }
            },
            required: ["varianceSummary", "regionalDrivers", "anomalies", "recommendations", "optimizationScore"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      setAiReport(result);
      showToast("AI Intelligence Report Generated");
    } catch (err) {
      console.error(err);
      showToast("AI analysis failed.", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {toast && (
        <div className={`fixed top-20 right-4 z-[200] px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 border ${
          toast.type === 'success' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-rose-600 text-white border-rose-500'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      )}

      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-slate-900 p-2 rounded-xl text-white shadow-lg shadow-slate-200">
              <Activity size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">CloudSpend AI</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Enterprise Hub</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95">
              <Share2 size={16} /> Share Report
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="flex gap-1 bg-slate-200/50 p-1 rounded-2xl w-fit mb-8 shadow-inner">
          {[
            { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
            { id: 'mom', icon: History, label: 'Trend Hub' },
            { id: 'ai', icon: Sparkles, label: 'AI Intelligence' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold transition-all ${
                activeTab === tab.id ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon size={18} /> {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard title="Nov Total" value={`$${totalSpend.toLocaleString()}`} trend={momPercent} icon={<DollarSign />} />
              <StatCard title="MoM Variance" value={`$${(totalSpend - prevTotalSpend).toLocaleString()}`} type={totalSpend > prevTotalSpend ? 'danger' : 'success'} icon={<TrendingUp />} />
              <StatCard title="Peak Region" value="Canada Central" subtitle="Xray Project" icon={<Globe />} />
              <StatCard title="Active Regions" value="5" subtitle="Service Footprint" icon={<Database />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Section title="Spend Distribution by Region">
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={currentMonth.entries}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="region" fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} />
                      <YAxis tickFormatter={(val) => `$${val}`} stroke="#94a3b8" fontSize={11} axisLine={false} tickLine={false} />
                      <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="cost" fill="#0ea5e9" radius={[6, 6, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>

              <Section title="Cost Allocation Overview">
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={currentMonth.entries}
                        dataKey="cost"
                        nameKey="region"
                        cx="50%"
                        cy="50%"
                        innerRadius={90}
                        outerRadius={120}
                        paddingAngle={5}
                      >
                        {currentMonth.entries.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '16px', border: 'none' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </div>
          </div>
        )}

        {activeTab === 'mom' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <Section title="Month-Over-Month Variance (Oct vs Nov)">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                      <th className="py-6 px-4">Region / Project</th>
                      <th className="py-6 px-4 text-right">Oct Cost</th>
                      <th className="py-6 px-4 text-right">Nov Cost</th>
                      <th className="py-6 px-4 text-right">Variance ($)</th>
                      <th className="py-6 px-4 text-right">Variance (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {regionalMoM.map((row, idx) => {
                      const prev = previousMonth.entries.find(p => p.region === row.region)?.cost || 0;
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-5 px-4">
                            <div className="font-bold text-slate-700">{row.region}</div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase">{row.project}</div>
                          </td>
                          <td className="py-5 px-4 text-right font-mono font-bold text-slate-400">${prev.toLocaleString()}</td>
                          <td className="py-5 px-4 text-right font-mono font-bold text-slate-900">${row.cost.toLocaleString()}</td>
                          <td className={`py-5 px-4 text-right font-mono font-bold ${row.diff >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {row.diff >= 0 ? '+' : ''}${Math.abs(row.diff).toLocaleString()}
                          </td>
                          <td className="py-5 px-4 text-right">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black ${row.pct >= 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                              {row.pct >= 0 ? '+' : ''}{row.pct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {!aiReport && !isAnalyzing ? (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-[40px] p-20 flex flex-col items-center text-center">
                <div className="bg-sky-50 p-6 rounded-[32px] text-sky-600 mb-6">
                  <Sparkles size={48} />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">Run Intelligence Scan</h3>
                <p className="text-slate-500 max-w-md mb-8 font-medium">Detect regional drivers, anomalies, and cost-saving opportunities.</p>
                <button 
                  onClick={generateAIReport}
                  className="px-10 py-4 bg-sky-600 text-white rounded-[20px] font-bold hover:bg-sky-700 transition-all shadow-xl shadow-sky-600/20 active:scale-95 flex items-center gap-3"
                >
                  <Sparkles size={20} /> Analyze Now
                </button>
              </div>
            ) : isAnalyzing ? (
              <div className="bg-white rounded-[40px] p-20 flex flex-col items-center text-center">
                <RefreshCw className="animate-spin text-sky-600 mb-6" size={48} />
                <h3 className="text-xl font-black text-slate-900 mb-2">AI is Thinking...</h3>
                <p className="text-slate-500 font-medium">Processing regional data points.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  <Section title="AI Summary">
                    <p className="text-slate-700 leading-relaxed font-bold bg-slate-50 p-6 rounded-2xl border border-slate-100 italic">
                      "{aiReport?.varianceSummary}"
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                      <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl">
                        <div className="flex items-center gap-2 text-rose-600 font-black text-[10px] uppercase tracking-widest mb-4">
                          <ShieldAlert size={16} /> Anomalies detected
                        </div>
                        <ul className="space-y-3">
                          {aiReport?.anomalies.map((a, i) => (
                            <li key={i} className="text-sm font-bold text-rose-900 flex items-start gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                              {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="p-6 bg-sky-50 border border-sky-100 rounded-3xl">
                        <div className="flex items-center gap-2 text-sky-600 font-black text-[10px] uppercase tracking-widest mb-4">
                          <TrendingUp size={16} /> regional drivers
                        </div>
                        <ul className="space-y-4">
                          {aiReport?.regionalDrivers.map((d, i) => (
                            <li key={i} className="space-y-1">
                              <div className="text-[10px] font-black text-sky-900 uppercase">{d.region}</div>
                              <div className="text-[11px] font-bold text-sky-700">{d.reason}</div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </Section>
                </div>
                <div className="space-y-8">
                  <div className="bg-slate-950 rounded-[32px] p-10 text-white relative overflow-hidden shadow-2xl">
                    <div className="relative z-10">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Optimization Score</h4>
                      <div className="text-7xl font-black mb-4 tracking-tighter">{aiReport?.optimizationScore}%</div>
                      <p className="text-sm text-slate-400 font-bold leading-relaxed">Account efficiency has shifted since last month. Follow the actions below.</p>
                    </div>
                    <Sparkles className="absolute -right-20 -bottom-20 text-slate-900 opacity-50" size={300} />
                  </div>
                  <Section title="Recommended Actions">
                    <div className="space-y-4">
                      {aiReport?.recommendations.map((r, i) => (
                        <div key={i} className="p-4 bg-white border border-slate-100 rounded-2xl hover:border-sky-500 transition-all shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                              r.priority === 'High' ? 'bg-rose-600 text-white' : 'bg-sky-600 text-white'
                            }`}>{r.priority}</span>
                            <span className="text-[10px] font-black text-emerald-600 uppercase">{r.impact} impact</span>
                          </div>
                          <div className="text-sm font-bold text-slate-900 leading-tight">{r.action}</div>
                        </div>
                      ))}
                    </div>
                  </Section>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
             <div className="p-2 bg-slate-900 rounded-lg text-white"><ShieldCheck size={18} /></div>
             <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Enterprise Shield • Google Gemini 3.0</p>
          </div>
          <a href="https://ai.google.dev" target="_blank" rel="noreferrer" className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-sky-600 flex items-center gap-2">Gemini Engine <ExternalLink size={12} /></a>
        </div>
      </footer>
    </div>
  );
}
