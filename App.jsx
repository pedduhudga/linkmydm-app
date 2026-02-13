import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, Zap, History, Settings, MessageSquare, ExternalLink, 
  CheckCircle2, XCircle, Clock, Search, Plus, MoreHorizontal, Menu, X, 
  ArrowUpRight, TrendingUp, ShieldCheck, Send, Trash2, Power, Copy, AlertCircle
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, collection, query, onSnapshot, 
  addDoc, updateDoc, deleteDoc, serverTimestamp, limit 
} from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'linkmydm-personal';

const App = () => {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isNewRuleModalOpen, setIsNewRuleModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Data State
  const [automations, setAutomations] = useState([]);
  const [logs, setLogs] = useState([]);
  const [config, setConfig] = useState({
    instagram_access_token: '',
    instagram_page_id: '',
    is_active: true
  });

  // Local Rule Form State
  const [newRule, setNewRule] = useState({
    keyword: '',
    message: '',
    link: ''
  });

  // 1. Auth Initialization
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Data Fetching (Firestore Rule 1 & 3)
  useEffect(() => {
    if (!user) return;

    // Listen to Automations
    const qAuto = collection(db, 'artifacts', appId, 'users', user.uid, 'automations');
    const unsubAuto = onSnapshot(qAuto, (snapshot) => {
      setAutomations(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Snapshot Error:", err));

    // Listen to Logs
    const qLogs = collection(db, 'artifacts', appId, 'users', user.uid, 'logs');
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Logic for sorting in memory (Rule 2)
      setLogs(data.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    });

    // Listen to Config
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'main');
    const unsubConfig = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) setConfig(docSnap.data());
    });

    return () => {
      unsubAuto();
      unsubLogs();
      unsubConfig();
    };
  }, [user]);

  // Derived Stats
  const stats = useMemo(() => {
    const total = logs.length;
    const sent = logs.filter(l => l.status === 'sent').length;
    const failed = logs.filter(l => l.status === 'failed').length;
    const saved = (sent * 1).toFixed(1); // 1 min per DM
    return { total, sent, failed, saved };
  }, [logs]);

  const chartData = useMemo(() => {
    // Basic grouping by date for last 7 days
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return last7Days.map(date => ({
      date,
      dms: logs.filter(l => {
        if (!l.timestamp) return false;
        const logDate = new Date(l.timestamp.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return logDate === date && l.status === 'sent';
      }).length
    }));
  }, [logs]);

  // Actions
  const handleAddRule = async () => {
    if (!user || !newRule.keyword) return;
    setIsSyncing(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'automations'), {
        ...newRule,
        is_active: true,
        created_at: serverTimestamp(),
        usage_count: 0
      });
      setIsNewRuleModalOpen(false);
      setNewRule({ keyword: '', message: '', link: '' });
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleRule = async (id, currentStatus) => {
    const ref = doc(db, 'artifacts', appId, 'users', user.uid, 'automations', id);
    await updateDoc(ref, { is_active: !currentStatus });
  };

  const deleteRule = async (id) => {
    const ref = doc(db, 'artifacts', appId, 'users', user.uid, 'automations', id);
    await deleteDoc(ref);
  };

  const updateSettings = async (updates) => {
    if (!user) return;
    const ref = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'main');
    await setDoc(ref, { ...config, ...updates }, { merge: true });
  };

  // Helper for Log Badge
  const StatusBadge = ({ status }) => {
    const styles = {
      sent: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      failed: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      ignored: "bg-slate-800 text-slate-500 border-slate-700"
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[status] || styles.ignored}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  if (!user) return (
    <div className="h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto animate-pulse">
          <Zap className="text-white fill-current" size={24} />
        </div>
        <p className="text-slate-400 animate-pulse">Establishing Secure Connection...</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} border-r border-slate-900 bg-slate-950 flex flex-col transition-all duration-300`}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="shrink-0 w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Zap className="text-white fill-current" size={18} />
            </div>
            {sidebarOpen && <span className="font-bold text-xl tracking-tight whitespace-nowrap">LinkMyDM</span>}
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-500 hover:text-white lg:hidden">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'automations', icon: Zap, label: 'Automations' },
            { id: 'logs', icon: History, label: 'Logs' },
            { id: 'settings', icon: Settings, label: 'Settings' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === item.id 
                ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <item.icon size={20} className="shrink-0" />
              {sidebarOpen && <span className="font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4">
          <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800 flex items-center space-x-3">
             <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold shrink-0">
               {user.uid.substring(0,2).toUpperCase()}
             </div>
             {sidebarOpen && (
               <div className="min-w-0 overflow-hidden">
                 <p className="text-xs font-mono text-slate-500 truncate">{user.uid}</p>
                 <p className="text-[10px] text-emerald-500 flex items-center gap-1">
                   <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" /> Connected
                 </p>
               </div>
             )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <header className="h-16 border-b border-slate-900 px-8 flex items-center justify-between sticky top-0 bg-slate-950/80 backdrop-blur-md z-40">
          <div className="flex items-center gap-4">
             {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-slate-900 rounded-lg"><Menu size={20}/></button>}
             <h1 className="text-lg font-semibold capitalize">{activeTab}</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 border ${config.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
              <div className={`w-2 h-2 rounded-full ${config.is_active ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
              {config.is_active ? 'LIVE' : 'PAUSED'}
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <p className="text-slate-500 text-sm font-medium">Comments Scanned</p>
                  <p className="text-3xl font-bold mt-1">{stats.total}</p>
                </div>
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <p className="text-slate-500 text-sm font-medium">DMs Delivered</p>
                  <p className="text-3xl font-bold mt-1 text-emerald-400">{stats.sent}</p>
                </div>
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <p className="text-slate-500 text-sm font-medium">Failed Attempts</p>
                  <p className="text-3xl font-bold mt-1 text-rose-400">{stats.failed}</p>
                </div>
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <p className="text-slate-500 text-sm font-medium">Time Saved</p>
                  <p className="text-3xl font-bold mt-1 text-indigo-400">{stats.saved} hr</p>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-[400px]">
                <h3 className="font-bold mb-6 flex items-center gap-2"><TrendingUp size={18} /> Engagement Activity</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="dms" stroke="#6366f1" strokeWidth={3} fill="url(#chartGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeTab === 'automations' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">Automation Rules</h2>
                  <p className="text-slate-500">Define keywords that trigger automatic DM replies.</p>
                </div>
                <button 
                  onClick={() => setIsNewRuleModalOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                >
                  <Plus size={20} /> New Rule
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {automations.map(rule => (
                  <div key={rule.id} className={`bg-slate-900 border rounded-2xl p-6 transition-all hover:shadow-xl ${rule.is_active ? 'border-slate-800' : 'border-slate-800 opacity-60'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-md text-xs font-mono font-bold tracking-widest border border-indigo-500/20 uppercase">
                        {rule.keyword}
                      </span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleRule(rule.id, rule.is_active)} className={`p-2 rounded-lg ${rule.is_active ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-slate-800'}`}>
                          <Power size={18} />
                        </button>
                        <button onClick={() => deleteRule(rule.id)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 mb-4 line-clamp-3 leading-relaxed">"{rule.message}"</p>
                    <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                      <a href={rule.link} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1">
                        <ExternalLink size={10} /> {new URL(rule.link).hostname}
                      </a>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                         <History size={10} /> {rule.usage_count || 0} Triggers
                      </span>
                    </div>
                  </div>
                ))}
                {automations.length === 0 && (
                  <div className="col-span-full py-20 border-2 border-dashed border-slate-900 rounded-3xl flex flex-col items-center justify-center text-slate-600">
                    <MessageSquare size={48} className="mb-4 opacity-20" />
                    <p>No automation rules yet.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
             <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden animate-in fade-in duration-500">
               <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                 <h2 className="font-bold">Execution History</h2>
                 <div className="relative">
                   <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                   <input type="text" placeholder="Filter logs..." className="bg-slate-950 border border-slate-800 rounded-full py-1.5 pl-8 pr-4 text-xs focus:ring-1 focus:ring-indigo-500 outline-none w-48" />
                 </div>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm">
                   <thead>
                     <tr className="bg-slate-950/50 text-slate-500 border-b border-slate-800">
                       <th className="px-6 py-4 font-medium uppercase text-[10px]">Time</th>
                       <th className="px-6 py-4 font-medium uppercase text-[10px]">User</th>
                       <th className="px-6 py-4 font-medium uppercase text-[10px]">Comment</th>
                       <th className="px-6 py-4 font-medium uppercase text-[10px]">Keyword</th>
                       <th className="px-6 py-4 font-medium uppercase text-[10px]">Status</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800">
                     {logs.map(log => (
                       <tr key={log.id} className="hover:bg-slate-800/20 group">
                         <td className="px-6 py-4 text-slate-500 whitespace-nowrap tabular-nums">
                            {log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                         </td>
                         <td className="px-6 py-4 font-bold text-slate-200">@{log.user}</td>
                         <td className="px-6 py-4 text-slate-400 max-w-xs truncate italic">"{log.comment}"</td>
                         <td className="px-6 py-4">
                           <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono border border-slate-700">{log.keyword}</span>
                         </td>
                         <td className="px-6 py-4"><StatusBadge status={log.status} /></td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-8 animate-in fade-in duration-500">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-8">
                <div className="space-y-2">
                  <h3 className="font-bold text-xl flex items-center gap-2">
                    <ShieldCheck className="text-indigo-500" /> Meta API Configuration
                  </h3>
                  <p className="text-slate-500 text-sm">Connect your Instagram Creator account via the Meta Graph API.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Access Token</label>
                    <input 
                      type="password" 
                      value={config.instagram_access_token}
                      onChange={(e) => updateSettings({ instagram_access_token: e.target.value })}
                      placeholder="Paste EAAB... long-lived token"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Instagram Page ID</label>
                    <input 
                      type="text" 
                      value={config.instagram_page_id}
                      onChange={(e) => updateSettings({ instagram_page_id: e.target.value })}
                      placeholder="e.g. 17841401..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>

                  <div className="pt-4 flex items-center justify-between p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${config.is_active ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-500'}`}>
                         <Power size={24} />
                      </div>
                      <div>
                        <p className="font-bold">System Master Switch</p>
                        <p className="text-xs text-slate-500">Toggling this off stops all automated replies.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => updateSettings({ is_active: !config.is_active })}
                      className={`relative w-14 h-7 rounded-full transition-colors ${config.is_active ? 'bg-indigo-600' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${config.is_active ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                <h3 className="font-bold mb-4 flex items-center gap-2 text-rose-400">
                  <AlertCircle size={18} /> Safety Limits
                </h3>
                <p className="text-xs text-slate-500 mb-6">These settings help protect your account from Instagram's anti-spam detection.</p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Minimum Delay (Seconds)</span>
                    <input type="number" defaultValue={5} className="bg-slate-950 border border-slate-800 rounded px-3 py-1 w-16 text-xs" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Maximum Requests / Hour</span>
                    <input type="number" defaultValue={60} className="bg-slate-950 border border-slate-800 rounded px-3 py-1 w-16 text-xs" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* New Rule Modal */}
      {isNewRuleModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden max-h-[90vh]">
            <div className="flex-1 p-8 space-y-6 overflow-y-auto">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-bold">New Automation</h3>
                <button onClick={() => setIsNewRuleModalOpen(false)} className="text-slate-500 hover:text-white"><X size={24} /></button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Trigger Keyword</label>
                  <input 
                    type="text" 
                    value={newRule.keyword}
                    onChange={(e) => setNewRule({...newRule, keyword: e.target.value.toUpperCase()})}
                    placeholder="e.g. LINK"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">DM Message Body</label>
                  <textarea 
                    value={newRule.message}
                    onChange={(e) => setNewRule({...newRule, message: e.target.value})}
                    rows={4}
                    placeholder="Type your reply..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Destination URL</label>
                  <input 
                    type="text" 
                    value={newRule.link}
                    onChange={(e) => setNewRule({...newRule, link: e.target.value})}
                    placeholder="https://yourpage.com/offer"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <button 
                onClick={handleAddRule}
                disabled={isSyncing || !newRule.keyword || !newRule.message || !newRule.link}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/30"
              >
                {isSyncing ? 'Saving...' : 'Activate Automation'}
              </button>
            </div>

            <div className="w-full md:w-[350px] bg-slate-950 p-8 border-l border-slate-800 hidden sm:flex flex-col items-center">
              <p className="text-xs font-bold text-slate-600 uppercase mb-8 tracking-tighter">Instant Preview</p>
              <div className="w-full bg-[#121212] rounded-[3rem] border border-slate-800 p-2 shadow-2xl relative">
                <div className="bg-slate-900/50 rounded-[2.5rem] h-[480px] flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-800 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold">Your Profile</p>
                      <p className="text-[8px] text-slate-500 italic">Active Now</p>
                    </div>
                  </div>
                  <div className="flex-1 p-4 space-y-4">
                     {newRule.message && (
                       <div className="bg-indigo-600 text-white p-3 rounded-2xl rounded-tr-none text-[11px] ml-auto max-w-[85%] break-words">
                         {newRule.message}
                       </div>
                     )}
                     {newRule.link && (
                        <div className="bg-slate-800 p-3 rounded-2xl rounded-tr-none text-[10px] ml-auto max-w-[85%] flex items-center gap-2 border border-slate-700">
                           <ExternalLink size={12} className="text-indigo-400" />
                           <span className="truncate underline text-indigo-400">{newRule.link}</span>
                        </div>
                     )}
                  </div>
                  <div className="p-4 border-t border-slate-800 flex gap-2">
                    <div className="flex-1 h-6 bg-slate-800 rounded-full" />
                    <Send size={14} className="text-indigo-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
