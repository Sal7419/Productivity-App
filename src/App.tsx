/**
 * Chance Productivity v4
 * NEW: Dashboard home, hashtags, edit task/habit, custom pomodoro timer,
 *      deadline progress bar (angry animation), calendar day panel,
 *      kanban auto-archive, accent color picker, multi-device sync via account,
 *      custom task categories, archive viewer.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Timer, ListTodo, Trello, Flame, BarChart3, Home,
  Play, Pause, RotateCcw, Plus, ChevronRight, ChevronLeft,
  CheckCircle2, Circle, Clock, AlertCircle, BookOpen,
  Search, Briefcase, X, Trash2, GripVertical,
  Coffee, Brain, Zap, Wallet, Tag, Archive,
  LogIn, LogOut, User, Hash,
  RefreshCw, Pencil, Check, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:Error|null}> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{padding:'2rem',fontFamily:'monospace'}}>
        <h2 style={{color:'red',marginBottom:'1rem'}}>⚠️ Lỗi render component</h2>
        <pre style={{fontSize:'12px',background:'#f4f4f4',padding:'1rem',borderRadius:'8px',whiteSpace:'pre-wrap'}}>
          {(this.state.error as Error).message}
        </pre>
        <button onClick={()=>this.setState({error:null})} style={{marginTop:'1rem',padding:'8px 16px',background:'#000',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer'}}>
          Thử lại
        </button>
      </div>
    );
    return this.props.children;
  }
}


function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue] as const;
}

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
}

function todayIndex() { return (new Date().getDay() + 6) % 7; } // 0=Mon … 6=Sun
function todayStr()  { return new Date().toISOString().split('T')[0]; }

// ─── Types ────────────────────────────────────────────────────────────────────
type Priority = 'high' | 'medium' | 'low';
type Status   = 'todo' | 'in-progress' | 'done';

interface Task {
  id: string; title: string; status: Status; priority: Priority;
  category: string; deadline: string; createdAt: string; tags: string[];
}
interface Habit {
  id: string; name: string; streak: number; completed: boolean[]; group: 'study' | 'life';
}
interface Transaction {
  id: string; type: 'income' | 'expense' | 'reward'; amount: number;
  note: string; date: string; taskTitle?: string;
}
interface FinanceState { rewardPerTask: number; transactions: Transaction[]; }
interface AuthUser    { email: string; token: string; }
interface AppSettings {
  accentColor: string;
  pomoDurations: { work: number; short: number; long: number };
  customCategories: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = ['Study', 'Work', 'Life', 'Health'];
const CAT_COLORS: Record<string, string> = {
  Study: 'bg-card-pink', Work: 'bg-card-orange', Life: 'bg-card-purple',
  Health: 'bg-card-green', Personal: 'bg-card-blue',
};
const CAT_ICONS: Record<string, React.ReactNode> = {
  Study: <BookOpen className="w-5 h-5"/>, Work: <Briefcase className="w-5 h-5"/>,
  Life: <Coffee className="w-5 h-5"/>, Health: <Brain className="w-5 h-5"/>,
  Personal: <User className="w-5 h-5"/>,
};
const getCatColor = (c: string) => CAT_COLORS[c] ?? 'bg-zinc-100';
const getCatIcon  = (c: string) => CAT_ICONS[c] ?? <Tag className="w-5 h-5"/>;

const ACCENT_COLORS: Record<string, { hex: string; tw: string; light: string }> = {
  black:   { hex: '#18181b', tw: 'bg-zinc-900', light: '#f4f4f5' },
  indigo:  { hex: '#6366f1', tw: 'bg-indigo-500', light: '#eef2ff' },
  emerald: { hex: '#10b981', tw: 'bg-emerald-500', light: '#ecfdf5' },
  rose:    { hex: '#f43f5e', tw: 'bg-rose-500', light: '#fff1f2' },
  amber:   { hex: '#f59e0b', tw: 'bg-amber-500', light: '#fffbeb' },
};

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INIT_TASKS: Task[] = [
  { id:'1', title:'CCNA 2020 200-125 Video Boot Camp', status:'todo', priority:'high', category:'Study', deadline:'2026-04-20', createdAt:'2026-04-01', tags:['#networking','#cert'] },
  { id:'2', title:'Powerful Business Writing', status:'in-progress', priority:'medium', category:'Work', deadline:'2026-04-14', createdAt:'2026-04-05', tags:['#writing'] },
  { id:'3', title:'Six Sigma Yellow Belt', status:'done', priority:'high', category:'Study', deadline:'2026-04-08', createdAt:'2026-04-01', tags:['#cert'] },
  { id:'4', title:'How to Design a Room in 10 Steps', status:'todo', priority:'low', category:'Life', deadline:'2026-04-25', createdAt:'2026-04-03', tags:[] },
  { id:'5', title:'Flutter Masterclass (Dart, Firebase)', status:'todo', priority:'high', category:'Study', deadline:'2026-04-13', createdAt:'2026-04-04', tags:['#flutter','#mobile'] },
];
const INIT_HABITS: Habit[] = [
  { id:'s1', name:'Đọc sách 30 phút', streak:5, completed:[true,true,true,true,true,false,false], group:'study' },
  { id:'s2', name:'Luyện code', streak:12, completed:[true,true,true,true,true,true,true], group:'study' },
  { id:'s3', name:'Học từ mới', streak:3, completed:[false,false,true,true,true,false,false], group:'study' },
  { id:'l1', name:'Tập thể dục sáng', streak:7, completed:[true,true,true,true,true,true,true], group:'life' },
  { id:'l2', name:'Uống 2L nước', streak:20, completed:[true,true,true,true,true,true,true], group:'life' },
  { id:'l3', name:'Thiền định', streak:2, completed:[false,false,false,false,true,true,false], group:'life' },
];
const INIT_FINANCE: FinanceState = {
  rewardPerTask: 10000,
  transactions: [
    { id:'d1', type:'reward', amount:10000, note:'Hoàn thành task', date:'2026-04-08', taskTitle:'Six Sigma Yellow Belt' },
    { id:'d2', type:'income', amount:500000, note:'Lương tuần', date:'2026-04-07' },
    { id:'d3', type:'expense', amount:75000, note:'Cà phê + ăn sáng', date:'2026-04-07' },
  ],
};
const INIT_SETTINGS: AppSettings = {
  accentColor: 'black',
  pomoDurations: { work: 25, short: 5, long: 15 },
  customCategories: [],
};
const STATS_DATA = {
  completionRate: [
    {name:'T2',completed:5,planned:8},{name:'T3',completed:7,planned:7},
    {name:'T4',completed:4,planned:10},{name:'T5',completed:8,planned:9},
    {name:'T6',completed:6,planned:6},{name:'T7',completed:3,planned:4},{name:'CN',completed:2,planned:2},
  ],
  weeklyData: [
    {name:'Tuần 1',created:20,completed:15},{name:'Tuần 2',created:25,completed:22},
    {name:'Tuần 3',created:18,completed:20},{name:'Tuần 4',created:30,completed:25},
  ],
};

// ─── Global CSS injection ─────────────────────────────────────────────────────
function useAccentCSS(color: string) {
  useEffect(() => {
    const ac = ACCENT_COLORS[color] ?? ACCENT_COLORS.black;
    let el = document.getElementById('chance-accent') as HTMLStyleElement | null;
    if (!el) { el = document.createElement('style'); el.id = 'chance-accent'; document.head.appendChild(el); }
    el.textContent = `:root{--ac:${ac.hex};--ac-light:${ac.light};}
    @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
    .shake{animation:shake 0.4s ease infinite;}
    @keyframes pulsered{0%,100%{opacity:1}50%{opacity:0.5}}
    .pulsered{animation:pulsered 1s ease infinite;}`;
  }, [color]);
}

// ─── Toast ────────────────────────────────────────────────────────────────────
interface ToastMsg { id: number; text: string; emoji: string; }
function ToastContainer({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div key={t.id} initial={{opacity:0,y:-16,scale:0.9}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,scale:0.9}}
            className="bg-black text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-2xl pointer-events-auto flex items-center gap-2">
            {t.emoji} {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const add = useCallback((text: string, emoji = '✓') => {
    const id = Date.now();
    setToasts(p => [...p, { id, text, emoji }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);
  return { toasts, add };
}

// ─── Accent button helper ─────────────────────────────────────────────────────
function AccentBtn({ className, style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props}
      className={cn('transition-all active:scale-95', className)}
      style={{ ...style, backgroundColor: 'var(--ac)' }} />
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id:'home',     icon:Home,    label:'Home'     },
  { id:'pomodoro', icon:Timer,   label:'Pomodoro' },
  { id:'tasks',    icon:ListTodo,label:'Tasks'    },
  { id:'kanban',   icon:Trello,  label:'Kanban'   },
  { id:'habits',   icon:Flame,   label:'Habits'   },
  { id:'finance',  icon:Wallet,  label:'Finance'  },
  { id:'stats',    icon:BarChart3,label:'Stats'   },
];

function Sidebar({ activePage, setActivePage, settings, setSettings, user, onLogout, onSyncClick, syncing }:
  { activePage:string; setActivePage:(p:string)=>void; settings:AppSettings; setSettings:(s:AppSettings)=>void;
    user:AuthUser|null; onLogout:()=>void; onSyncClick:()=>void; syncing:boolean; }) {
  return (
    <aside className="hidden md:flex w-56 h-screen bg-sidebar-dark text-zinc-400 p-4 flex-col gap-4 sticky top-0 z-50 shrink-0">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{backgroundColor:'var(--ac)'}}>
          <CheckCircle2 className="w-4 h-4 text-white"/>
        </div>
        <span className="text-lg font-bold text-white tracking-tight">chance</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => setActivePage(item.id)}
            className={cn('flex items-center gap-2.5 px-3 py-2 rounded-2xl text-sm font-semibold transition-all duration-200',
              activePage===item.id ? 'text-black shadow-xl bg-white' : 'hover:text-white hover:bg-white/5')}>
            <item.icon className="w-4 h-4 shrink-0"/>{item.label}
          </button>
        ))}
      </nav>

      {/* Accent color picker */}
      <div className="border-t border-white/10 pt-3">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Màu chủ đạo</p>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(ACCENT_COLORS).map(([k, v]) => (
            <button key={k} onClick={() => setSettings({...settings, accentColor:k})}
              className={cn('w-6 h-6 rounded-full transition-all hover:scale-110 border-2',
                settings.accentColor===k ? 'border-white scale-110' : 'border-transparent')}
              style={{backgroundColor:v.hex}}/>
          ))}
        </div>
      </div>

      {/* Sync / User */}
      <div className="mt-auto border-t border-white/10 pt-3 flex flex-col gap-2">
        {user ? (
          <>
            <div className="flex items-center gap-2 px-1">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <User className="w-4 h-4 text-white"/>
              </div>
              <span className="text-xs text-zinc-300 font-semibold truncate flex-1">{user.email}</span>
            </div>
            <button onClick={onSyncClick}
              className={cn('flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-bold text-emerald-400 hover:bg-white/5 transition-colors',syncing&&'opacity-60')}>
              <RefreshCw className={cn('w-3.5 h-3.5',syncing&&'animate-spin')}/>{syncing?'Đang đồng bộ...':'Đồng bộ ngay'}
            </button>
            <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-bold text-red-400 hover:bg-red-400/10 transition-colors">
              <LogOut className="w-3.5 h-3.5"/>Đăng xuất
            </button>
          </>
        ) : (
          <button onClick={onSyncClick}
            className="flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/5 transition-colors">
            <LogIn className="w-3.5 h-3.5"/>Đồng bộ đa thiết bị
          </button>
        )}
      </div>
    </aside>
  );
}

function BottomNav({ activePage, setActivePage }: { activePage:string; setActivePage:(p:string)=>void }) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-100 z-50 flex overflow-x-auto no-scrollbar">
      {NAV_ITEMS.map(item => (
        <button key={item.id} onClick={() => setActivePage(item.id)}
          className={cn('flex-1 min-w-[44px] flex flex-col items-center gap-0.5 py-2 transition-colors',
            activePage===item.id ? 'text-black' : 'text-zinc-400')}>
          <item.icon className="w-4 h-4"/>
          <span className="text-[8px] font-semibold">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────
function AuthModal({ onClose, onLogin }: { onClose:()=>void; onLogin:(u:AuthUser)=>void }) {
  const [tab, setTab] = useState<'login'|'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email.trim() || !password.trim()) { setError('Vui lòng điền đầy đủ thông tin.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/auth/${tab}`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Đã có lỗi xảy ra.'); return; }
      onLogin({ email: data.email, token: data.token });
      onClose();
    } catch {
      setError('Không kết nối được với server. Hãy chắc chắn đang dùng npm run dev.');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.95}}
        className="bg-white rounded-[2rem] p-7 w-full max-w-sm shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Đồng bộ đa thiết bị</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><X className="w-4 h-4"/></button>
        </div>

        <div className="flex gap-2 mb-5">
          {(['login','register'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('flex-1 py-2 rounded-2xl text-sm font-bold transition-all',
                tab===t ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-500')}>
              {t==='login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
            className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>
          <input type="password" placeholder="Mật khẩu" value={password} onChange={e=>setPassword(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&submit()}
            className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>
          {error && <p className="text-xs text-red-500 font-semibold px-1">{error}</p>}
        </div>

        <button onClick={submit} disabled={loading}
          className="mt-5 w-full bg-black text-white py-3.5 rounded-2xl font-bold hover:bg-zinc-800 transition-colors disabled:opacity-60">
          {loading ? 'Đang xử lý...' : tab==='login' ? 'Đăng nhập & Đồng bộ' : 'Tạo tài khoản'}
        </button>

        <p className="text-center text-[11px] text-zinc-400 mt-4">
          Dữ liệu được lưu trên server cục bộ của bạn.<br/>Cùng WiFi = đồng bộ giữa các thiết bị.
        </p>
      </motion.div>
    </div>
  );
}

// ─── Home / Dashboard ─────────────────────────────────────────────────────────
function HomePage({ tasks, habits, setHabits, finance, setActivePage }:
  { tasks:Task[]; habits:Habit[]; setHabits:(h:Habit[])=>void; finance:FinanceState; setActivePage:(p:string)=>void }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const today = todayIndex();
  const todayTasks = tasks.filter(t => t.deadline === todayStr() && t.status !== 'done');
  const doneTodayCount = tasks.filter(t => t.status === 'done').length;

  const toggleHabitToday = (id: string) => {
    setHabits(habits.map(h => {
      if (h.id !== id) return h;
      const c = [...h.completed]; c[today] = !c[today];
      return { ...h, completed:c, streak: c.filter(Boolean).length };
    }));
  };

  const balance = finance.transactions.reduce((a, t) => t.type==='expense' ? a-t.amount : a+t.amount, 0);

  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar pb-24 md:pb-10">
      {/* Greeting */}
      <header className="mb-8">
        <p className="text-zinc-400 text-sm font-semibold mb-1">{new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'long'})}</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">{greeting} 👋</h1>
      </header>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label:'Tasks xong', value:doneTodayCount, color:'bg-card-green' },
          { label:'Số dư ví',   value:formatVND(balance), color:'bg-card-orange', small:true },
          { label:'Quá hạn',    value:tasks.filter(t=>t.status!=='done'&&new Date(t.deadline)<new Date()).length, color:'bg-card-pink' },
        ].map(s => (
          <div key={s.label} className={cn('p-4 rounded-[1.5rem] flex flex-col gap-1',s.color)}>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{s.label}</p>
            <p className={cn('font-black',s.small?'text-sm leading-tight':'text-3xl')}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Today's tasks */}
      {todayTasks.length > 0 && (
        <section className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">📋 Task hôm nay</h2>
            <button onClick={()=>setActivePage('tasks')} className="text-xs font-bold text-zinc-400 hover:text-black transition-colors flex items-center gap-1">
              Xem tất cả <ChevronRight className="w-3 h-3"/>
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {todayTasks.slice(0,4).map(t => (
              <div key={t.id} className={cn('flex items-center gap-3 p-3 rounded-2xl',getCatColor(t.category))}>
                <div className="w-8 h-8 bg-white/70 rounded-xl flex items-center justify-center shrink-0">{getCatIcon(t.category)}</div>
                <p className="font-bold text-sm flex-1 truncate">{t.title}</p>
                {t.priority==='high' && <span className="bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0">Hot</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Today's habits */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">🔥 Habit hôm nay</h2>
          <button onClick={()=>setActivePage('habits')} className="text-xs font-bold text-zinc-400 hover:text-black transition-colors flex items-center gap-1">
            Quản lý <ChevronRight className="w-3 h-3"/>
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {habits.map(h => (
            <div key={h.id} className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex items-center gap-4">
              <div className="flex-1">
                <p className="font-bold text-sm">{h.name}</p>
                <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">{h.streak} ngày liên tiếp 🔥</p>
              </div>
              <button onClick={() => toggleHabitToday(h.id)}
                className={cn('w-10 h-10 rounded-full flex items-center justify-center transition-all font-bold text-sm border-2',
                  h.completed[today] ? 'bg-black text-white border-black' : 'bg-white text-zinc-400 border-zinc-200 hover:border-black')}>
                {h.completed[today] ? '✓' : '?'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Pomodoro ─────────────────────────────────────────────────────────────────
type PomMode = 'work' | 'short' | 'long';
const MODE_LBL: Record<PomMode,string> = { work:'Tập trung', short:'Nghỉ ngắn', long:'Nghỉ dài' };

function PomodoroPage({ settings, setSettings }:
  { settings:AppSettings; setSettings:(s:AppSettings)=>void }) {
  const dur = useMemo(() => ({
    work:  settings.pomoDurations.work  * 60,
    short: settings.pomoDurations.short * 60,
    long:  settings.pomoDurations.long  * 60,
  }), [settings.pomoDurations]);

  const [mode, setMode] = useState<PomMode>('work');
  const [timeLeft, setTimeLeft] = useState(dur.work);
  const [isActive, setIsActive] = useState(false);
  const [sessions, setSessions] = useLocalStorage('pomo-sessions', 0);
  const [showSettings, setShowSettings] = useState(false);
  const [draftDur, setDraftDur] = useState(settings.pomoDurations);
  const intRef = useRef<ReturnType<typeof setInterval>|null>(null);

  const modeColor: Record<PomMode,string> = { work:'#000', short:'#10b981', long:'#6366f1' };
  const modeBg: Record<PomMode,string>    = { work:'bg-bg-chance', short:'bg-emerald-50', long:'bg-indigo-50' };
  const r = 108; const circ = 2*Math.PI*r;
  const offset = circ * (timeLeft / dur[mode]);

  const switchMode = (m: PomMode) => { setMode(m); setIsActive(false); setTimeLeft(dur[m]); };

  useEffect(() => {
    if (intRef.current) clearInterval(intRef.current);
    if (isActive && timeLeft > 0) intRef.current = setInterval(() => setTimeLeft(t=>t-1), 1000);
    else if (isActive && timeLeft===0) { setIsActive(false); if(mode==='work') setSessions(s=>s+1); }
    return () => { if(intRef.current) clearInterval(intRef.current); };
  }, [isActive, timeLeft, mode, setSessions]);

  useEffect(() => { if(!isActive) setTimeLeft(dur[mode]); }, [dur, mode]);

  const fmt = (s:number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  const saveDurations = () => {
    setSettings({...settings, pomoDurations: draftDur});
    setIsActive(false);
    setShowSettings(false);
  };

  return (
    <div className={cn('flex flex-col items-center justify-center min-h-screen gap-7 p-6 pb-24 md:pb-6 transition-colors duration-700', modeBg[mode])}>
      <div className="flex gap-2 bg-white/70 p-1.5 rounded-[2rem] shadow-sm flex-wrap justify-center">
        {(Object.keys(dur) as PomMode[]).map(m => (
          <button key={m} onClick={()=>switchMode(m)}
            className={cn('px-5 py-2 rounded-[1.5rem] text-sm font-bold transition-all', mode===m?'text-white shadow-lg':'text-zinc-500 hover:bg-white')}
            style={mode===m?{backgroundColor:'var(--ac)'}:{}}>
            {MODE_LBL[m]}
          </button>
        ))}
      </div>

      <div className="relative flex items-center justify-center">
        <svg width="260" height="260" className="-rotate-90">
          <circle cx="130" cy="130" r={r} fill="none" stroke="#e4e4e7" strokeWidth="10"/>
          <circle cx="130" cy="130" r={r} fill="none" stroke={modeColor[mode]} strokeWidth="10"
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
            style={{transition:'stroke-dashoffset 0.6s ease,stroke 0.4s ease'}}/>
        </svg>
        <div className="absolute flex flex-col items-center select-none">
          <span className="text-5xl font-black tracking-tighter">{fmt(timeLeft)}</span>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.4em] mt-2">{MODE_LBL[mode]}</span>
        </div>
      </div>

      <div className="flex gap-5 items-center">
        <button onClick={()=>{setIsActive(false);setTimeLeft(dur[mode]);}}
          className="w-14 h-14 bg-white border-2 border-zinc-200 rounded-full flex items-center justify-center hover:bg-zinc-50 active:scale-95">
          <RotateCcw className="w-5 h-5 text-zinc-400"/>
        </button>
        <button onClick={()=>setIsActive(a=>!a)}
          className="w-20 h-20 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-transform"
          style={{backgroundColor:'var(--ac)'}}>
          {isActive?<Pause className="w-8 h-8 fill-white"/>:<Play className="w-8 h-8 fill-white ml-1"/>}
        </button>
        <button onClick={()=>setShowSettings(s=>!s)}
          className="w-14 h-14 bg-white border-2 border-zinc-200 rounded-full flex flex-col items-center justify-center gap-0.5 hover:bg-zinc-50">
          <Zap className="w-4 h-4 text-zinc-400"/>
          <span className="text-[10px] font-black text-zinc-500">{sessions}</span>
        </button>
      </div>

      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{sessions} phiên xong hôm nay</p>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:16}}
            className="bg-white rounded-[2rem] p-6 shadow-xl w-full max-w-xs">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold">Tùy chỉnh thời gian</h3>
              <button onClick={()=>setShowSettings(false)} className="w-7 h-7 bg-zinc-100 rounded-full flex items-center justify-center"><X className="w-3.5 h-3.5"/></button>
            </div>
            {([
              {key:'work', label:'Tập trung (phút)', min:5, max:90},
              {key:'short',label:'Nghỉ ngắn (phút)', min:1, max:30},
              {key:'long', label:'Nghỉ dài (phút)',  min:5, max:60},
            ] as const).map(({key,label,min,max}) => (
              <div key={key} className="mb-4">
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-bold text-zinc-500">{label}</label>
                  <span className="text-sm font-black">{draftDur[key]}</span>
                </div>
                <input type="range" min={min} max={max} value={draftDur[key]}
                  onChange={e=>setDraftDur({...draftDur,[key]:Number(e.target.value)})}
                  className="w-full accent-black"/>
              </div>
            ))}
            <button onClick={saveDurations} className="w-full bg-black text-white py-3 rounded-2xl font-bold text-sm hover:bg-zinc-800">
              Lưu & Áp dụng
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Deadline Progress Bar ────────────────────────────────────────────────────
function DeadlineBar({ createdAt, deadline }: { createdAt:string; deadline:string }) {
  const start  = new Date(createdAt).getTime();
  const end    = new Date(deadline).getTime();
  const now    = Date.now();
  const pct    = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  const msleft = end - now;
  const dLeft  = Math.ceil(msleft / 86400000);
  const isOver = now > end;
  const isNear = !isOver && dLeft <= 2;

  const barColor = isOver ? '#ef4444' : isNear ? '#f97316' : 'var(--ac)';
  const label    = isOver ? `Quá hạn ${Math.abs(dLeft)} ngày` : dLeft===0 ? 'Hết hạn hôm nay!' : `Còn ${dLeft} ngày`;

  return (
    <div className="w-full mt-1">
      <div className="w-full h-2 bg-white/50 rounded-full relative overflow-visible">
        <div className="h-full rounded-full transition-all duration-1000" style={{width:`${pct}%`,backgroundColor:barColor}}/>
        <div
          className={cn('absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-white -translate-y-1/2 shadow',
            isOver ? 'pulsered' : isNear ? 'shake' : '')}
          style={{left:`calc(${pct}% - 7px)`, backgroundColor:barColor}}/>
      </div>
      <p className={cn('text-[10px] font-bold mt-1.5', isOver?'text-red-500':isNear?'text-orange-500':'text-zinc-400')}>
        {label}
      </p>
    </div>
  );
}

// ─── Edit Task Modal ──────────────────────────────────────────────────────────
function EditTaskModal({ task, categories, onSave, onClose }: {
  task:Task; categories:string[]; onSave:(t:Task)=>void; onClose:()=>void;
}) {
  const [t, setT] = useState({...task});
  const [tagInput, setTagInput] = useState((task.tags??[]).join(' '));

  const save = () => {
    const tags = tagInput.split(/[\s,]+/).filter(s=>s.startsWith('#')).map(s=>s.toLowerCase());
    onSave({...t, tags});
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-[100] p-4">
      <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}}
        className="bg-white rounded-[2rem] p-7 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold">Chỉnh sửa task</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><X className="w-4 h-4"/></button>
        </div>
        <div className="flex flex-col gap-4">
          <input type="text" value={t.title} onChange={e=>setT({...t,title:e.target.value})}
            className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Độ ưu tiên</p>
              {(['high','medium','low'] as Priority[]).map(p => (
                <button key={p} onClick={()=>setT({...t,priority:p})}
                  className={cn('w-full mb-1 px-3 py-2 rounded-xl text-sm font-bold transition-all text-left',
                    t.priority===p?'bg-black text-white':'bg-zinc-50 text-zinc-500 hover:bg-zinc-100')}>
                  {p==='high'?'Cao':p==='medium'?'Trung bình':'Thấp'}
                </button>
              ))}
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Danh mục</p>
              <div className="overflow-y-auto max-h-[120px] flex flex-col gap-1">
                {categories.map(c => (
                  <button key={c} onClick={()=>setT({...t,category:c})}
                    className={cn('w-full px-3 py-2 rounded-xl text-sm font-bold transition-all text-left',
                      t.category===c?'bg-black text-white':'bg-zinc-50 text-zinc-500 hover:bg-zinc-100')}>{c}</button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Deadline</p>
            <input type="date" value={t.deadline} onChange={e=>setT({...t,deadline:e.target.value})}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>
          </div>

          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Hashtags <span className="normal-case text-zinc-300">(cách nhau bằng dấu cách)</span></p>
            <input type="text" placeholder="#work #urgent #learning" value={tagInput} onChange={e=>setTagInput(e.target.value)}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold text-sm outline-none focus:border-black"/>
          </div>

          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Trạng thái</p>
            <div className="flex gap-2">
              {(['todo','in-progress','done'] as Status[]).map(s => (
                <button key={s} onClick={()=>setT({...t,status:s})}
                  className={cn('flex-1 py-2 rounded-xl text-xs font-bold transition-all',
                    t.status===s?'bg-black text-white':'bg-zinc-50 text-zinc-500 hover:bg-zinc-100')}>
                  {s==='todo'?'Chưa':s==='in-progress'?'Đang làm':'Xong'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button onClick={save} className="mt-5 w-full bg-black text-white py-3.5 rounded-2xl font-bold hover:bg-zinc-800">Lưu thay đổi</button>
      </motion.div>
    </div>
  );
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────
function AddTaskModal({ categories, onAdd, onClose }: { categories:string[]; onAdd:(t:Task)=>void; onClose:()=>void }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [category, setCategory] = useState(categories[0] ?? 'Study');
  const [deadline, setDeadline] = useState(todayStr());
  const [tagInput, setTagInput] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    const tags = tagInput.split(/[\s,]+/).filter(s=>s.startsWith('#')).map(s=>s.toLowerCase());
    onAdd({ id:Date.now().toString(), title:title.trim(), status:'todo', priority, category, deadline, createdAt:todayStr(), tags });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-[100] p-4">
      <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}}
        className="bg-white rounded-[2rem] p-7 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold">Task mới</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><X className="w-4 h-4"/></button>
        </div>
        <div className="flex flex-col gap-4">
          <input autoFocus type="text" placeholder="Tên task..." value={title}
            onChange={e=>setTitle(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}
            className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Ưu tiên</p>
              {(['high','medium','low'] as Priority[]).map(p => (
                <button key={p} onClick={()=>setPriority(p)}
                  className={cn('w-full mb-1 px-3 py-2 rounded-xl text-sm font-bold transition-all text-left',
                    priority===p?'bg-black text-white':'bg-zinc-50 text-zinc-500 hover:bg-zinc-100')}>
                  {p==='high'?'Cao':p==='medium'?'Trung bình':'Thấp'}
                </button>
              ))}
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Danh mục</p>
              <div className="overflow-y-auto max-h-[120px] flex flex-col gap-1">
                {categories.map(c => (
                  <button key={c} onClick={()=>setCategory(c)}
                    className={cn('w-full px-3 py-2 rounded-xl text-sm font-bold transition-all text-left',
                      category===c?'bg-black text-white':'bg-zinc-50 text-zinc-500 hover:bg-zinc-100')}>{c}</button>
                ))}
              </div>
            </div>
          </div>
          <input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}
            className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>
          <input type="text" placeholder="#hashtag1 #hashtag2" value={tagInput} onChange={e=>setTagInput(e.target.value)}
            className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold text-sm outline-none focus:border-black"/>
        </div>
        <button onClick={submit} className="mt-5 w-full bg-black text-white py-3.5 rounded-2xl font-bold hover:bg-zinc-800">Thêm task</button>
      </motion.div>
    </div>
  );
}

// ─── Task List ────────────────────────────────────────────────────────────────
function TaskListPage({ tasks, setTasks, categories, onTaskDone }: {
  tasks:Task[]; setTasks:(t:Task[])=>void; categories:string[]; onTaskDone:(t:Task)=>void;
}) {
  const [activeCat, setActiveCat] = useState<string>('All');
  const [activeTag, setActiveTag] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'cat'|'tag'>('cat');
  const [showAdd, setShowAdd] = useState(false);
  const [editTask, setEditTask] = useState<Task|null>(null);
  const [search, setSearch] = useState('');

  const allTags = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach(t => (t.tags ?? []).forEach(g => s.add(g)));
    return [...s].sort();
  }, [tasks]);

  const filtered = useMemo(() => tasks.filter(t => {
    const tags = t.tags ?? [];
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) || tags.some(g=>g.includes(search.toLowerCase()));
    const matchCat = filterMode==='cat' ? (activeCat==='All' || t.category===activeCat) : true;
    const matchTag = filterMode==='tag' ? tags.includes(activeTag) : true;
    return matchSearch && matchCat && matchTag;
  }), [tasks, search, activeCat, activeTag, filterMode]);

  const toggleDone = (id: string) => {
    const task = tasks.find(t=>t.id===id)!;
    const wasNotDone = task.status !== 'done';
    setTasks(tasks.map(t => t.id===id ? {...t, status:t.status==='done'?'todo':'done'} : t));
    if (wasNotDone) onTaskDone(task);
  };

  const saveEdit = (updated: Task) => setTasks(tasks.map(t => t.id===updated.id ? updated : t));

  return (
    <div className="p-6 md:p-8 min-h-screen no-scrollbar pb-24 md:pb-10">
      <header className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-1">Tasks</h1>
          <p className="text-zinc-400 text-sm">{tasks.filter(t=>t.status!=='done').length} còn lại · {tasks.filter(t=>t.status==='done').length} xong</p>
        </div>
        <button onClick={()=>setShowAdd(true)}
          className="text-white px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg hover:opacity-90 text-sm shrink-0"
          style={{backgroundColor:'var(--ac)'}}>
          <Plus className="w-4 h-4"/> Thêm
        </button>
      </header>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"/>
        <input type="text" placeholder="Tìm task hoặc #hashtag..." value={search} onChange={e=>setSearch(e.target.value)}
          className="w-full bg-white border border-zinc-100 rounded-2xl pl-11 pr-4 py-2.5 font-semibold text-sm outline-none focus:border-black shadow-sm"/>
      </div>

      {/* Filter toggle */}
      <div className="flex gap-2 mb-3">
        <button onClick={()=>setFilterMode('cat')}
          className={cn('px-3 py-1.5 rounded-xl text-xs font-bold transition-all',filterMode==='cat'?'bg-black text-white':'bg-white text-zinc-500 border border-zinc-200')}>
          Danh mục
        </button>
        <button onClick={()=>setFilterMode('tag')}
          className={cn('px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1',filterMode==='tag'?'bg-black text-white':'bg-white text-zinc-500 border border-zinc-200')}>
          <Hash className="w-3 h-3"/> Hashtag
        </button>
      </div>

      {/* Category or Tag chips */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 no-scrollbar">
        {filterMode==='cat' ? (
          ['All',...categories].map(cat => (
            <button key={cat} onClick={()=>setActiveCat(cat)}
              className={cn('px-4 py-2 rounded-2xl text-sm font-bold transition-all shrink-0',
                activeCat===cat?'text-white':'bg-white text-zinc-500 hover:bg-zinc-100')}
              style={activeCat===cat?{backgroundColor:'var(--ac)'}:{}}>{cat}</button>
          ))
        ) : allTags.length===0 ? (
          <p className="text-xs text-zinc-400 py-2">Chưa có hashtag nào. Thêm khi tạo task.</p>
        ) : (
          allTags.map(tag => (
            <button key={tag} onClick={()=>setActiveTag(tag)}
              className={cn('px-4 py-2 rounded-2xl text-sm font-bold transition-all shrink-0 flex items-center gap-1',
                activeTag===tag?'text-white':'bg-white text-zinc-500 hover:bg-zinc-100')}
              style={activeTag===tag?{backgroundColor:'var(--ac)'}:{}}>
              {tag}
            </button>
          ))
        )}
      </div>

      {/* Task grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnimatePresence>
          {filtered.map((task,i) => (
            <motion.div key={task.id} layout initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
              exit={{opacity:0,scale:0.95}} transition={{delay:i*0.04}}
              className={cn('p-5 rounded-[2rem] flex flex-col gap-3 relative group',getCatColor(task.category),task.status==='done'&&'opacity-50')}>
              <div className="flex justify-between items-start">
                <div className="w-9 h-9 bg-white/80 rounded-2xl flex items-center justify-center shrink-0">{getCatIcon(task.category)}</div>
                <div className="flex gap-2 items-center">
                  {task.priority==='high' && <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[9px] font-bold uppercase">Cao</span>}
                  <button onClick={()=>setEditTask(task)}
                    className="w-7 h-7 bg-white/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-100">
                    <Pencil className="w-3.5 h-3.5 text-blue-500"/>
                  </button>
                  <button onClick={()=>setTasks(tasks.filter(t=>t.id!==task.id))}
                    className="w-7 h-7 bg-white/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100">
                    <Trash2 className="w-3.5 h-3.5 text-red-500"/>
                  </button>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">{task.category}</p>
                <h3 className={cn('text-base font-bold leading-snug',task.status==='done'&&'line-through')}>{task.title}</h3>
                {(task.tags??[]).length>0 && (
                  <div className="flex gap-1 flex-wrap mt-2">
                    {(task.tags??[]).map(tag => (
                      <span key={tag} className="bg-white/60 text-zinc-600 px-2 py-0.5 rounded-lg text-[10px] font-bold">{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-auto">
                {task.status !== 'done' && <DeadlineBar createdAt={task.createdAt} deadline={task.deadline}/>}
                <div className="flex justify-between items-center mt-2">
                  <div className="flex items-center gap-1 text-xs font-bold text-zinc-500"><Clock className="w-3.5 h-3.5"/>{task.deadline}</div>
                  <button onClick={()=>toggleDone(task.id)} className="w-8 h-8 bg-white/70 rounded-full flex items-center justify-center hover:bg-white transition-all">
                    {task.status==='done'?<CheckCircle2 className="w-4 h-4 text-emerald-500"/>:<Circle className="w-4 h-4 text-zinc-400"/>}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filtered.length===0 && (
        <div className="flex flex-col items-center py-20 text-zinc-300">
          <Circle className="w-14 h-14 mb-3 opacity-30"/>
          <p className="font-bold">Không có task nào</p>
        </div>
      )}

      <AnimatePresence>
        {showAdd && <AddTaskModal categories={categories} onAdd={t=>{setTasks([t,...tasks]);setShowAdd(false);}} onClose={()=>setShowAdd(false)}/>}
        {editTask && <EditTaskModal task={editTask} categories={categories} onSave={saveEdit} onClose={()=>setEditTask(null)}/>}
      </AnimatePresence>
    </div>
  );
}

// ─── Kanban ───────────────────────────────────────────────────────────────────
const KCOLS: {id:Status;title:string;color:string}[] = [
  {id:'todo',title:'To Do',color:'bg-zinc-50'},
  {id:'in-progress',title:'In Progress',color:'bg-blue-50'},
  {id:'done',title:'Done',color:'bg-emerald-50'},
];
const ARCHIVE_THRESHOLD = 10;

function KanbanPage({ tasks, setTasks, archivedTasks, setArchivedTasks }: {
  tasks:Task[]; setTasks:(t:Task[])=>void; archivedTasks:Task[]; setArchivedTasks:(t:Task[])=>void;
}) {
  const dragId = useRef<string|null>(null);
  const today = new Date();
  const [cm, setCm] = useState({year:today.getFullYear(),month:today.getMonth()});
  const [selectedDay, setSelectedDay] = useState<number|null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const MONTHS=['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

  const daysInMonth = new Date(cm.year,cm.month+1,0).getDate();
  const startOffset = (new Date(cm.year,cm.month,1).getDay()+6)%7;
  const deadlines = new Map<number,Task[]>();
  tasks.forEach(t => {
    const d = new Date(t.deadline);
    if (d.getFullYear()===cm.year && d.getMonth()===cm.month)
      deadlines.set(d.getDate(), [...(deadlines.get(d.getDate())||[]), t]);
  });

  const done = tasks.filter(t=>t.status==='done');

  // Auto-archive when done ≥ 10
  useEffect(() => {
    if (done.length >= ARCHIVE_THRESHOLD) {
      const toArchive = done.slice(0, done.length - 5); // keep 5 newest done
      if (toArchive.length > 0) {
        setArchivedTasks([...toArchive, ...archivedTasks]);
        setTasks(tasks.filter(t => !toArchive.find(a=>a.id===t.id)));
      }
    }
  }, [done.length]);

  const move = (id:string, s:Status) => setTasks(tasks.map(t=>t.id===id?{...t,status:s}:t));

  const selectedTasks = selectedDay
    ? (deadlines.get(selectedDay) ?? [])
    : [];

  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar flex flex-col gap-7 pb-24 md:pb-10">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Kanban Board</h2>
        <button onClick={()=>setShowArchive(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 rounded-2xl text-xs font-bold text-zinc-600 hover:bg-zinc-200 transition-colors">
          <Archive className="w-3.5 h-3.5"/> Lưu trữ ({archivedTasks.length})
        </button>
      </div>

      {done.length >= ARCHIVE_THRESHOLD-2 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0"/>
          <p className="text-amber-700 font-semibold">Cột Done gần đầy — sẽ tự lưu trữ khi đạt {ARCHIVE_THRESHOLD} task.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {KCOLS.map(col => (
          <div key={col.id} className={cn('p-5 rounded-[2rem] flex flex-col gap-3 min-h-[180px]',col.color)}
            onDragOver={e=>e.preventDefault()} onDrop={()=>{if(dragId.current)move(dragId.current,col.id);dragId.current=null;}}>
            <div className="flex justify-between items-center">
              <h3 className="font-bold">{col.title}</h3>
              <span className="bg-white/70 px-2.5 py-0.5 rounded-lg text-xs font-bold">{tasks.filter(t=>t.status===col.id).length}</span>
            </div>
            {tasks.filter(t=>t.status===col.id).map(task => (
              <div key={task.id} draggable onDragStart={()=>{dragId.current=task.id;}}
                className="bg-white p-3.5 rounded-2xl shadow-sm border border-zinc-100 cursor-grab active:cursor-grabbing hover:shadow-md transition-all select-none">
                <div className="flex justify-between items-start mb-2">
                  <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-md uppercase',
                    task.priority==='high'?'bg-red-100 text-red-600':task.priority==='medium'?'bg-yellow-100 text-yellow-700':'bg-zinc-100 text-zinc-600')}>
                    {task.priority}
                  </span>
                  <GripVertical className="w-4 h-4 text-zinc-300"/>
                </div>
                <p className="text-sm font-bold leading-snug mb-2">{task.title}</p>
                {(task.tags??[]).length>0 && (
                  <div className="flex gap-1 flex-wrap mb-2">
                    {(task.tags??[]).map(tag=><span key={tag} className="bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded text-[9px] font-bold">{tag}</span>)}
                  </div>
                )}
                <div className="flex items-center gap-1 text-[9px] font-bold text-zinc-400"><Clock className="w-3 h-3"/>{task.deadline}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Calendar */}
      <section className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold">{MONTHS[cm.month]} {cm.year}</h2>
          <div className="flex gap-2">
            <button className="p-2 hover:bg-zinc-50 rounded-xl border border-zinc-100" onClick={()=>setCm(c=>{const d=new Date(c.year,c.month-1,1);return{year:d.getFullYear(),month:d.getMonth()};})}><ChevronLeft className="w-4 h-4"/></button>
            <button className="p-2 hover:bg-zinc-50 rounded-xl border border-zinc-100" onClick={()=>setCm(c=>{const d=new Date(c.year,c.month+1,1);return{year:d.getFullYear(),month:d.getMonth()};})}><ChevronRight className="w-4 h-4"/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {['T2','T3','T4','T5','T6','T7','CN'].map(d=><div key={d} className="text-center text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">{d}</div>)}
          {Array.from({length:startOffset}).map((_,i)=><div key={`e-${i}`}/>)}
          {Array.from({length:daysInMonth},(_,i)=>i+1).map(d=>{
            const tasks4day=deadlines.get(d)??[];
            const isToday=d===today.getDate()&&cm.month===today.getMonth()&&cm.year===today.getFullYear();
            const isSel=selectedDay===d;
            return (
              <button key={d} onClick={()=>setSelectedDay(isSel?null:d)}
                className={cn('h-11 md:h-14 p-1.5 rounded-xl border transition-all flex flex-col text-left',
                  isSel?'border-2 ring-2 ring-black/20':isToday?'bg-black border-black':tasks4day.length>0?'bg-red-50 border-red-100':'bg-zinc-50/50 border-transparent hover:bg-zinc-100')}>
                <span className={cn('text-xs font-bold',isToday?'text-white':tasks4day.length>0?'text-red-500':'text-zinc-500')}>{d}</span>
                {tasks4day.length>0&&!isToday&&<div className="mt-auto w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"/>}
              </button>
            );
          })}
        </div>

        {/* Day detail panel */}
        <AnimatePresence>
          {selectedDay && (
            <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
              className="mt-4 overflow-hidden">
              <div className="border-t border-zinc-100 pt-4">
                <p className="text-sm font-bold text-zinc-500 mb-3">
                  📅 Ngày {selectedDay}/{cm.month+1} — {selectedTasks.length > 0 ? `${selectedTasks.length} task deadline` : 'Không có task nào'}
                </p>
                <div className="flex flex-col gap-2">
                  {selectedTasks.map(t => (
                    <div key={t.id} className={cn('flex items-center gap-3 p-3 rounded-2xl',getCatColor(t.category))}>
                      <div className="w-7 h-7 bg-white/70 rounded-xl flex items-center justify-center shrink-0">{getCatIcon(t.category)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{t.title}</p>
                        <p className="text-[10px] text-zinc-500 font-semibold">{t.category} · {t.priority}</p>
                      </div>
                      <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full uppercase',
                        t.status==='done'?'bg-emerald-500 text-white':t.status==='in-progress'?'bg-blue-500 text-white':'bg-white text-zinc-500')}>
                        {t.status==='done'?'Xong':t.status==='in-progress'?'Đang làm':'Chưa làm'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Archive Modal */}
      <AnimatePresence>
        {showArchive && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.95}}
              className="bg-white rounded-[2rem] p-7 w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-5 shrink-0">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2"><Archive className="w-5 h-5"/> Lưu trữ</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">{archivedTasks.length} tasks đã được lưu trữ</p>
                </div>
                <button onClick={()=>setShowArchive(false)} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><X className="w-4 h-4"/></button>
              </div>
              <div className="overflow-y-auto flex flex-col gap-2 no-scrollbar">
                {archivedTasks.length===0 ? (
                  <p className="text-center text-zinc-400 py-8">Chưa có task nào được lưu trữ.</p>
                ) : archivedTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-2xl">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate line-through text-zinc-400">{t.title}</p>
                      <p className="text-[10px] text-zinc-400">{t.category} · {t.deadline}</p>
                    </div>
                  </div>
                ))}
              </div>
              {archivedTasks.length>0 && (
                <button onClick={()=>{setArchivedTasks([]);setShowArchive(false);}}
                  className="mt-4 w-full py-3 bg-red-50 text-red-500 rounded-2xl text-sm font-bold hover:bg-red-100 transition-colors shrink-0">
                  Xóa toàn bộ lưu trữ
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Habits ───────────────────────────────────────────────────────────────────
const DAYS=['T2','T3','T4','T5','T6','T7','CN'];

function HabitItem({ habit, onToggle, onDelete, onRename }: {
  habit:Habit; onToggle:(id:string,day:number)=>void;
  onDelete:(id:string)=>void; onRename:(id:string,name:string)=>void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(habit.name);
  const commit = () => { if(name.trim()) onRename(habit.id, name.trim()); setEditing(false); };

  return (
    <div className="bg-white p-4 rounded-[2rem] shadow-sm flex flex-col gap-3 group">
      <div className="flex justify-between items-center">
        <div className="flex-1">
          {editing ? (
            <input autoFocus value={name} onChange={e=>setName(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setEditing(false);}}
              className="font-bold text-sm bg-zinc-50 border border-zinc-200 rounded-xl px-2 py-1 outline-none focus:border-black w-full"/>
          ) : (
            <h3 className="font-bold text-sm">{habit.name}</h3>
          )}
          <p className="text-[10px] font-bold text-zinc-400 mt-0.5">{habit.streak} ngày liên tiếp 🔥</p>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
          {editing ? (
            <button onClick={commit} className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center hover:bg-emerald-200">
              <Check className="w-3.5 h-3.5 text-emerald-600"/>
            </button>
          ) : (
            <button onClick={()=>setEditing(true)} className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center hover:bg-blue-200">
              <Pencil className="w-3.5 h-3.5 text-blue-500"/>
            </button>
          )}
          <button onClick={()=>onDelete(habit.id)} className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center hover:bg-red-200">
            <Trash2 className="w-3.5 h-3.5 text-red-500"/>
          </button>
        </div>
      </div>
      <div className="flex gap-1">
        {DAYS.map((d,i) => (
          <button key={i} onClick={()=>onToggle(habit.id,i)}
            className={cn('flex-1 h-9 rounded-xl flex items-center justify-center text-[9px] font-bold transition-all hover:scale-105 active:scale-95',
              habit.completed[i]?'text-white':'bg-zinc-100 text-zinc-400 hover:bg-zinc-200')}
            style={habit.completed[i]?{backgroundColor:'var(--ac)'}:{}}>
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

function HabitCol({ title, habits, color, onToggle, onAdd, onDelete, onRename }: {
  title:string; habits:Habit[]; color:string;
  onToggle:(id:string,day:number)=>void; onAdd:(name:string)=>void;
  onDelete:(id:string)=>void; onRename:(id:string,name:string)=>void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const commit = () => { if(name.trim()){ onAdd(name.trim()); setName(''); setAdding(false); } };
  return (
    <div className={cn('flex-1 p-6 rounded-[2.5rem] flex flex-col gap-4 min-w-[260px]',color)}>
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">{title}</h2>
        <button onClick={()=>setAdding(true)} className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm hover:scale-110 transition-transform"><Plus className="w-4 h-4"/></button>
      </div>
      <AnimatePresence>
        {adding && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="bg-white rounded-2xl p-3 flex gap-2">
            <input autoFocus type="text" placeholder="Tên habit..." value={name} onChange={e=>setName(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setAdding(false);}}
              className="flex-1 bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-black"/>
            <button onClick={commit} className="px-3 py-2 bg-black text-white rounded-xl text-xs font-bold">Thêm</button>
            <button onClick={()=>setAdding(false)} className="px-2 bg-zinc-100 rounded-xl"><X className="w-3.5 h-3.5"/></button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex flex-col gap-3">
        {habits.map(h => <HabitItem key={h.id} habit={h} onToggle={onToggle} onDelete={onDelete} onRename={onRename}/>)}
        {habits.length===0 && <p className="text-xs text-center text-zinc-400 py-4">Chưa có habit nào. Nhấn + để thêm.</p>}
      </div>
    </div>
  );
}

function HabitTrackerPage({ habits, setHabits }: { habits:Habit[]; setHabits:(h:Habit[])=>void }) {
  const toggle  = (id:string,day:number) => setHabits(habits.map(h=>{if(h.id!==id)return h;const c=[...h.completed];c[day]=!c[day];return{...h,completed:c,streak:c.filter(Boolean).length};}));
  const del     = (id:string) => setHabits(habits.filter(h=>h.id!==id));
  const rename  = (id:string,name:string) => setHabits(habits.map(h=>h.id===id?{...h,name}:h));
  const add     = (group:'study'|'life') => (name:string) => setHabits([...habits,{id:Date.now().toString(),name,streak:0,completed:Array(7).fill(false),group}]);
  return (
    <div className="p-6 md:p-8 min-h-screen flex flex-col md:flex-row gap-5 overflow-y-auto no-scrollbar pb-24 md:pb-10">
      <HabitCol title="Study Habits" habits={habits.filter(h=>h.group==='study')} color="bg-card-blue" onToggle={toggle} onAdd={add('study')} onDelete={del} onRename={rename}/>
      <HabitCol title="Life Habits"  habits={habits.filter(h=>h.group==='life')}  color="bg-card-green" onToggle={toggle} onAdd={add('life')}  onDelete={del} onRename={rename}/>
    </div>
  );
}

// ─── Finance ──────────────────────────────────────────────────────────────────
function FinancePage({ finance, setFinance }: { finance:FinanceState; setFinance:(f:FinanceState)=>void }) {
  const [showAdd,setShowAdd]=useState(false);
  const [addType,setAddType]=useState<'income'|'expense'>('income');
  const [amount,setAmount]=useState('');
  const [note,setNote]=useState('');
  const [editReward,setEditReward]=useState(false);
  const [rewardInput,setRewardInput]=useState(String(finance.rewardPerTask));

  const balance=finance.transactions.reduce((a,t)=>t.type==='expense'?a-t.amount:a+t.amount,0);
  const totalIn=finance.transactions.filter(t=>t.type!=='expense').reduce((a,t)=>a+t.amount,0);
  const totalOut=finance.transactions.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0);
  const totalRew=finance.transactions.filter(t=>t.type==='reward').reduce((a,t)=>a+t.amount,0);

  const last7=Array.from({length:7},(_,i)=>{
    const d=new Date();d.setDate(d.getDate()-(6-i));
    const ds=d.toISOString().split('T')[0];
    return{name:`${d.getDate()}/${d.getMonth()+1}`,
      thu:finance.transactions.filter(t=>t.date===ds&&t.type!=='expense').reduce((a,t)=>a+t.amount,0),
      chi:finance.transactions.filter(t=>t.date===ds&&t.type==='expense').reduce((a,t)=>a+t.amount,0)};
  });

  const addTx=()=>{const num=parseInt(amount.replace(/\D/g,''),10);if(!num||!note.trim())return;const tx:Transaction={id:Date.now().toString(),type:addType,amount:num,note:note.trim(),date:todayStr()};setFinance({...finance,transactions:[tx,...finance.transactions]});setAmount('');setNote('');setShowAdd(false);};
  const delTx=(id:string)=>setFinance({...finance,transactions:finance.transactions.filter(t=>t.id!==id)});
  const saveReward=()=>{const num=parseInt(rewardInput.replace(/\D/g,''),10);if(num>0)setFinance({...finance,rewardPerTask:num});setEditReward(false);};

  const txIcon=(type:string)=>{
    if(type==='reward') return <div className="w-9 h-9 rounded-2xl bg-yellow-100 flex items-center justify-center text-base shrink-0">💰</div>;
    if(type==='income') return <div className="w-9 h-9 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0"><ArrowUpCircle className="w-5 h-5 text-emerald-600"/></div>;
    return <div className="w-9 h-9 rounded-2xl bg-red-100 flex items-center justify-center shrink-0"><ArrowDownCircle className="w-5 h-5 text-red-500"/></div>;
  };

  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar flex flex-col gap-5 pb-24 md:pb-10">
      <header className="flex justify-between items-start">
        <div><h1 className="text-3xl md:text-4xl font-bold mb-1">Finance</h1><p className="text-zinc-400 text-sm">Thu chi + thưởng khi hoàn thành task</p></div>
        <button onClick={()=>setShowAdd(true)} className="text-white px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg text-sm shrink-0" style={{backgroundColor:'var(--ac)'}}><Plus className="w-4 h-4"/> Thêm</button>
      </header>

      <div className="bg-black text-white rounded-[2.5rem] p-7 flex flex-col gap-4">
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Số dư hiện tại</p>
        <p className={cn('text-5xl font-black tracking-tight',balance<0?'text-red-400':'text-white')}>{formatVND(balance)}</p>
        <div className="grid grid-cols-3 gap-3">
          {[{label:'Tổng thu',value:totalIn,color:'text-emerald-400'},{label:'Tổng chi',value:totalOut,color:'text-red-400'},{label:'Từ tasks',value:totalRew,color:'text-yellow-400'}].map(item=>(
            <div key={item.label} className="bg-white/10 rounded-2xl p-3">
              <p className="text-zinc-400 text-[9px] font-bold uppercase tracking-wider mb-1">{item.label}</p>
              <p className={cn('text-sm font-black',item.color)}>{formatVND(item.value)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card-orange rounded-[2rem] p-5 flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Thưởng mỗi task xong</p>
          {editReward?<input autoFocus type="text" value={rewardInput} onChange={e=>setRewardInput(e.target.value.replace(/\D/g,''))} onKeyDown={e=>{if(e.key==='Enter')saveReward();}} className="bg-white/80 border-2 border-black rounded-xl px-3 py-1.5 text-xl font-black w-40 outline-none"/>:<p className="text-2xl font-black">{formatVND(finance.rewardPerTask)}</p>}
        </div>
        {editReward?<button onClick={saveReward} className="w-10 h-10 bg-black text-white rounded-2xl flex items-center justify-center shrink-0"><Check className="w-5 h-5"/></button>:<button onClick={()=>{setEditReward(true);setRewardInput(String(finance.rewardPerTask));}} className="w-10 h-10 bg-white/60 rounded-2xl flex items-center justify-center hover:bg-white shrink-0"><Pencil className="w-4 h-4"/></button>}
      </div>

      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100">
        <h3 className="font-bold mb-4">7 ngày gần nhất</h3>
        <div className="h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last7} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0"/>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:10,fontWeight:600}}/>
              <YAxis axisLine={false} tickLine={false} tick={{fontSize:10}} tickFormatter={v=>v>0?`${Math.round(Number(v)/1000)}k`:'0'}/>
              <Tooltip formatter={(v:number)=>formatVND(v)} contentStyle={{borderRadius:12,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,0.08)'}}/>
              <Legend iconType="circle"/>
              <Bar dataKey="thu" name="Thu" fill="#D1F2EB" radius={[5,5,0,0]}/>
              <Bar dataKey="chi" name="Chi" fill="#FDE2E4" radius={[5,5,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="font-bold mb-3 text-lg">Lịch sử</h3>
        <div className="flex flex-col gap-2.5">
          <AnimatePresence>
            {finance.transactions.map(tx=>(
              <motion.div key={tx.id} layout initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.95}}
                className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex items-center gap-3 group">
                {txIcon(tx.type)}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{tx.note}</p>
                  {tx.taskTitle&&<p className="text-[10px] text-zinc-400 font-medium truncate">📋 {tx.taskTitle}</p>}
                  <p className="text-[10px] text-zinc-400">{tx.date}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className={cn('font-black text-sm',tx.type==='expense'?'text-red-500':'text-emerald-600')}>
                    {tx.type==='expense'?'−':'+'}{ formatVND(tx.amount)}
                  </p>
                  <button onClick={()=>delTx(tx.id)} className="w-7 h-7 rounded-full bg-zinc-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100">
                    <Trash2 className="w-3.5 h-3.5 text-red-400"/>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {finance.transactions.length===0&&<div className="text-center py-12 text-zinc-300"><Wallet className="w-12 h-12 mx-auto mb-3 opacity-30"/><p className="font-bold">Chưa có giao dịch</p></div>}
        </div>
      </div>

      <AnimatePresence>
        {showAdd&&(
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-[100] p-4">
            <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}} className="bg-white rounded-[2rem] p-7 w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center mb-5"><h2 className="text-lg font-bold">Thêm giao dịch</h2><button onClick={()=>setShowAdd(false)} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><X className="w-4 h-4"/></button></div>
              <div className="flex gap-2 mb-4">
                {(['income','expense']as const).map(t=><button key={t} onClick={()=>setAddType(t)} className={cn('flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all',addType===t?(t==='income'?'bg-emerald-500 text-white':'bg-red-500 text-white'):'bg-zinc-100 text-zinc-500')}>{t==='income'?'+ Thu nhập':'− Chi tiêu'}</button>)}
              </div>
              <div className="flex flex-col gap-3">
                <input type="text" placeholder="Số tiền (VND)" value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,','))} className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-bold text-lg outline-none focus:border-black"/>
                <input type="text" placeholder="Ghi chú..." value={note} onChange={e=>setNote(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTx()} className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>
              </div>
              <button onClick={addTx} className={cn('mt-5 w-full py-3.5 rounded-2xl font-bold transition-colors',addType==='income'?'bg-emerald-500 hover:bg-emerald-600 text-white':'bg-red-500 hover:bg-red-600 text-white')}>Lưu giao dịch</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Statistics ───────────────────────────────────────────────────────────────
function StatisticsPage({ tasks }: { tasks:Task[] }) {
  const done=tasks.filter(t=>t.status==='done').length;
  const over=tasks.filter(t=>t.status!=='done'&&new Date(t.deadline)<new Date()).length;
  const pct=tasks.length>0?Math.round((done/tasks.length)*100):0;
  const catData=([...DEFAULT_CATEGORIES]).map(c=>({name:c,value:tasks.filter(t=>t.category===c).length||0}));
  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar flex flex-col gap-5 pb-24 md:pb-10">
      <header><h1 className="text-3xl md:text-4xl font-bold mb-1">Analytics</h1><p className="text-zinc-400 text-sm">Theo dõi tiến độ và tối ưu năng suất.</p></header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{label:'Tổng tasks',value:tasks.length,c:'bg-card-purple'},{label:'Hoàn thành',value:done,c:'bg-card-green'},{label:'Tỉ lệ',value:`${pct}%`,c:'bg-card-blue'},{label:'Quá hạn',value:over,c:over>0?'bg-red-100':'bg-card-orange'}].map(k=>(
          <div key={k.label} className={cn('p-5 rounded-[2rem] flex flex-col gap-1.5',k.c)}>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{k.label}</p>
            <p className="text-4xl font-black">{k.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100">
          <h3 className="font-bold mb-4">Hoàn thành vs Kế hoạch</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={STATS_DATA.completionRate}>
                <defs><linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#000" stopOpacity={0.1}/><stop offset="95%" stopColor="#000" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0"/>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:11}}/>
                <YAxis axisLine={false} tickLine={false} tick={{fontSize:11}}/>
                <Tooltip contentStyle={{borderRadius:12,border:'none'}}/>
                <Area type="monotone" dataKey="planned" stroke="#000" fillOpacity={1} fill="url(#gP)" strokeWidth={2.5}/>
                <Area type="monotone" dataKey="completed" stroke="#F6C6D9" fill="#F6C6D9" fillOpacity={0.3} strokeWidth={2.5}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-black text-white p-6 rounded-[2rem] flex flex-col justify-between">
          <div><h3 className="font-bold mb-1">Quá hạn</h3><p className="text-zinc-500 text-xs">Cần xử lý</p></div>
          <div className={cn('text-6xl font-black',over>0?'text-red-500':'text-emerald-400')}>{String(over).padStart(2,'0')}</div>
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-400"><AlertCircle className="w-4 h-4"/>{over>0?'Cần chú ý':'Tất cả on track!'}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100">
          <h3 className="font-bold mb-4">Tạo vs Hoàn thành</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={STATS_DATA.weeklyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0"/>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:11}}/>
                <YAxis axisLine={false} tickLine={false} tick={{fontSize:11}}/>
                <Tooltip/><Legend iconType="circle"/>
                <Bar dataKey="created" name="Tạo mới" fill="#000" radius={[6,6,0,0]}/>
                <Bar dataKey="completed" name="Hoàn thành" fill="#D1F2EB" radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100">
          <h3 className="font-bold mb-4">Danh mục</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={catData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                  {catData.map((_,i)=><Cell key={i} fill={['#FDE2E4','#FAD2AD','#E2E2FB','#D1F2EB'][i%4]}/>)}
                </Pie>
                <Tooltip/><Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="bg-card-orange p-7 rounded-[2rem] flex items-center justify-between">
        <div><h3 className="text-xl font-bold mb-1">Chuỗi năng suất</h3><p className="text-zinc-600 text-sm">Tiếp tục giữ đà!</p></div>
        <div className="flex items-baseline gap-2"><span className="text-5xl font-black">12</span><span className="font-bold uppercase text-sm">Ngày</span></div>
      </div>
    </div>
  );
}

// ─── Sync hook ────────────────────────────────────────────────────────────────
function useSync(user: AuthUser|null, data: object, setData: (d: any) => void) {
  const [syncing, setSyncing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  const pushData = useCallback(async (payload: object) => {
    if (!user) return;
    try {
      await fetch('/api/sync', {
        method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${user.token}`},
        body: JSON.stringify(payload),
      });
    } catch {}
  }, [user]);

  const pullData = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', { headers:{'Authorization':`Bearer ${user.token}`} });
      if (res.ok) { const d = await res.json(); if(d.data) setData(d.data); }
    } catch {} finally { setSyncing(false); }
  }, [user, setData]);

  // Debounced auto-push on data changes
  useEffect(() => {
    if (!user) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushData(data), 2000);
    return () => { if(debounceRef.current) clearTimeout(debounceRef.current); };
  }, [data, user, pushData]);

  return { syncing, pullData };
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activePage,  setActivePage]  = useState('home');
  const [tasks,       setTasks]       = useLocalStorage<Task[]>('chance-tasks',    INIT_TASKS);
  const [habits,      setHabits]      = useLocalStorage<Habit[]>('chance-habits',  INIT_HABITS);
  const [finance,     setFinanceRaw]  = useLocalStorage<FinanceState>('chance-finance', INIT_FINANCE);
  const [settings,    setSettings]    = useLocalStorage<AppSettings>('chance-settings', INIT_SETTINGS);
  const [archived,    setArchived]    = useLocalStorage<Task[]>('chance-archived', []);
  const [user,        setUser]        = useLocalStorage<AuthUser|null>('chance-user', null);
  const [showAuth,    setShowAuth]    = useState(false);
  const { toasts, add: addToast }     = useToast();

  useAccentCSS(settings.accentColor);

  const allCategories = useMemo(() =>
    [...DEFAULT_CATEGORIES, ...settings.customCategories.filter(c=>!DEFAULT_CATEGORIES.includes(c))],
    [settings.customCategories]
  );

  // Bundle all data for sync
  const syncPayload = useMemo(() => ({ tasks, habits, finance, settings, archived }), [tasks, habits, finance, settings, archived]);

  const applyServerData = useCallback((d: any) => {
    if (d.tasks)    setTasks(d.tasks);
    if (d.habits)   setHabits(d.habits);
    if (d.finance)  setFinanceRaw(d.finance);
    if (d.settings) setSettings(d.settings);
    if (d.archived) setArchived(d.archived);
    addToast('Đồng bộ thành công!', '☁️');
  }, [setTasks, setHabits, setFinanceRaw, setSettings, setArchived, addToast]);

  const { syncing, pullData } = useSync(user, syncPayload, applyServerData);

  // Wrap setFinance to always use latest rewardPerTask
  const setFinance = useCallback((f: FinanceState) => setFinanceRaw(f), [setFinanceRaw]);

  const handleTaskDone = useCallback((task: Task) => {
    setFinanceRaw(prev => {
      const tx: Transaction = { id:Date.now().toString(), type:'reward', amount:prev.rewardPerTask,
        note:'Hoàn thành task', date:todayStr(), taskTitle:task.title };
      return { ...prev, transactions:[tx,...prev.transactions] };
    });
    addToast(`+${formatVND(finance.rewardPerTask)} vào ví! 💰`, '');
  }, [finance.rewardPerTask, setFinanceRaw, addToast]);

  const handleLogin = (u: AuthUser) => {
    setUser(u);
    addToast(`Xin chào, ${u.email}!`, '👋');
    // pull server data after login
    setTimeout(() => pullData(), 500);
  };

  const handleLogout = () => { setUser(null); addToast('Đã đăng xuất', '👋'); };

  return (
    <div className="flex min-h-screen font-sans bg-bg-chance selection:bg-black selection:text-white">
      <Sidebar
        activePage={activePage} setActivePage={setActivePage}
        settings={settings} setSettings={setSettings}
        user={user} onLogout={handleLogout}
        onSyncClick={() => user ? pullData() : setShowAuth(true)}
        syncing={syncing}
      />

      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={activePage}
            initial={{opacity:0,x:12}} animate={{opacity:1,x:0}}
            exit={{opacity:0,x:-12}} transition={{duration:0.2,ease:'easeInOut'}}
            className="min-h-screen">
            {activePage==='home'     && <ErrorBoundary><HomePage tasks={tasks} habits={habits} setHabits={setHabits} finance={finance} setActivePage={setActivePage}/></ErrorBoundary>}
            {activePage==='pomodoro' && <ErrorBoundary><PomodoroPage settings={settings} setSettings={setSettings}/></ErrorBoundary>}
            {activePage==='tasks'    && <ErrorBoundary><TaskListPage tasks={tasks} setTasks={setTasks} categories={allCategories} onTaskDone={handleTaskDone}/></ErrorBoundary>}
            {activePage==='kanban'   && <ErrorBoundary><KanbanPage tasks={tasks} setTasks={setTasks} archivedTasks={archived} setArchivedTasks={setArchived}/></ErrorBoundary>}
            {activePage==='habits'   && <ErrorBoundary><HabitTrackerPage habits={habits} setHabits={setHabits}/></ErrorBoundary>}
            {activePage==='finance'  && <ErrorBoundary><FinancePage finance={finance} setFinance={setFinance}/></ErrorBoundary>}
            {activePage==='stats'    && <ErrorBoundary><StatisticsPage tasks={tasks}/></ErrorBoundary>}
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav activePage={activePage} setActivePage={setActivePage}/>
      <ToastContainer toasts={toasts}/>

      <AnimatePresence>
        {showAuth && <AuthModal onClose={()=>setShowAuth(false)} onLogin={handleLogin}/>}
      </AnimatePresence>
    </div>
  );
}
