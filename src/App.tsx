/**
 * Chance Productivity — v3
 * NEW: Finance page, task-completion rewards, reward-per-task setting,
 *      manual income/expense, transaction history, 7-day bar chart.
 * IMPROVED: toast notifications, pomodoro background shift, habit day counter,
 *           Vietnamese labels, mobile nav overflow scroll.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Timer, ListTodo, Trello, Flame, BarChart3,
  Play, Pause, RotateCcw, Plus, ChevronRight, ChevronLeft,
  CheckCircle2, Circle, Clock, AlertCircle, BookOpen,
  Search, Briefcase, X, Trash2, GripVertical,
  Coffee, Brain, Zap, Wallet,
  ArrowUpCircle, ArrowDownCircle, Pencil, Check
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ─── Utilities ────────────────────────────────────────────────────────────────
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

// ─── Types ────────────────────────────────────────────────────────────────────
type Priority = 'high' | 'medium' | 'low';
type Status   = 'todo' | 'in-progress' | 'done';
type Category = 'Study' | 'Work' | 'Life' | 'Health';
type TxType   = 'income' | 'expense' | 'reward';

interface Task {
  id: string; title: string; status: Status; priority: Priority;
  category: Category; deadline: string; createdAt: string;
}
interface Habit {
  id: string; name: string; streak: number; completed: boolean[]; group: 'study' | 'life';
}
interface Transaction {
  id: string; type: TxType; amount: number; note: string; date: string; taskTitle?: string;
}
interface FinanceState { rewardPerTask: number; transactions: Transaction[]; }

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INITIAL_TASKS: Task[] = [
  { id: '1', title: 'CCNA 2020 200-125 Video Boot Camp', status: 'todo', priority: 'high', category: 'Study', deadline: '2026-04-10', createdAt: '2026-04-01' },
  { id: '2', title: 'Powerful Business Writing', status: 'in-progress', priority: 'medium', category: 'Work', deadline: '2026-04-12', createdAt: '2026-04-02' },
  { id: '3', title: 'Certified Six Sigma Yellow Belt', status: 'done', priority: 'high', category: 'Study', deadline: '2026-04-08', createdAt: '2026-04-01' },
  { id: '4', title: 'How to Design a Room in 10 Steps', status: 'todo', priority: 'low', category: 'Life', deadline: '2026-04-15', createdAt: '2026-04-03' },
  { id: '5', title: 'Flutter Masterclass (Dart, Firebase)', status: 'todo', priority: 'high', category: 'Study', deadline: '2026-04-11', createdAt: '2026-04-04' },
];
const INITIAL_HABITS: Habit[] = [
  { id: 's1', name: 'Đọc sách 30 phút', streak: 5, completed: [true,true,true,true,true,false,false], group: 'study' },
  { id: 's2', name: 'Luyện code', streak: 12, completed: [true,true,true,true,true,true,true], group: 'study' },
  { id: 's3', name: 'Học từ mới', streak: 3, completed: [false,false,true,true,true,false,false], group: 'study' },
  { id: 'l1', name: 'Tập thể dục sáng', streak: 7, completed: [true,true,true,true,true,true,true], group: 'life' },
  { id: 'l2', name: 'Uống 2L nước', streak: 20, completed: [true,true,true,true,true,true,true], group: 'life' },
  { id: 'l3', name: 'Thiền định', streak: 2, completed: [false,false,false,false,true,true,false], group: 'life' },
];
const INITIAL_FINANCE: FinanceState = {
  rewardPerTask: 10000,
  transactions: [
    { id: 'demo1', type: 'reward',  amount: 10000,  note: 'Hoàn thành task', date: '2026-04-08', taskTitle: 'Certified Six Sigma Yellow Belt' },
    { id: 'demo2', type: 'income',  amount: 500000, note: 'Lương tuần',       date: '2026-04-07' },
    { id: 'demo3', type: 'expense', amount: 75000,  note: 'Cà phê + ăn sáng', date: '2026-04-07' },
    { id: 'demo4', type: 'expense', amount: 120000, note: 'Đổ xăng',           date: '2026-04-06' },
  ],
};
const STATS_DATA = {
  completionRate: [
    { name: 'T2', completed: 5, planned: 8 }, { name: 'T3', completed: 7, planned: 7 },
    { name: 'T4', completed: 4, planned: 10 }, { name: 'T5', completed: 8, planned: 9 },
    { name: 'T6', completed: 6, planned: 6 }, { name: 'T7', completed: 3, planned: 4 },
    { name: 'CN', completed: 2, planned: 2 },
  ],
  createdVsCompleted: [
    { name: 'Tuần 1', created: 20, completed: 15 }, { name: 'Tuần 2', created: 25, completed: 22 },
    { name: 'Tuần 3', created: 18, completed: 20 }, { name: 'Tuần 4', created: 30, completed: 25 },
  ],
};

// ─── Toast ────────────────────────────────────────────────────────────────────
interface ToastMsg { id: number; text: string; emoji: string; }
function ToastContainer({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div key={t.id} initial={{ opacity: 0, y: -16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className="bg-black text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-xl pointer-events-auto flex items-center gap-2">
            <span>{t.emoji}</span>{t.text}
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

// ─── Nav ──────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'pomodoro', icon: Timer,    label: 'Pomodoro' },
  { id: 'tasks',    icon: ListTodo, label: 'Tasks' },
  { id: 'kanban',   icon: Trello,   label: 'Kanban' },
  { id: 'habits',   icon: Flame,    label: 'Habits' },
  { id: 'finance',  icon: Wallet,   label: 'Finance' },
  { id: 'stats',    icon: BarChart3, label: 'Stats' },
];

function Sidebar({ activePage, setActivePage }: { activePage: string; setActivePage: (p: string) => void }) {
  return (
    <aside className="hidden md:flex w-56 h-screen bg-sidebar-dark text-zinc-400 p-5 flex-col gap-6 sticky top-0 z-50 shrink-0">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 bg-white rounded-2xl flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5 text-black" />
        </div>
        <span className="text-xl font-bold text-white tracking-tight">chance</span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => setActivePage(item.id)}
            className={cn('flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-200',
              activePage === item.id ? 'bg-white text-black shadow-xl' : 'hover:text-white hover:bg-white/5')}>
            <item.icon className="w-4 h-4 shrink-0" />{item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function BottomNav({ activePage, setActivePage }: { activePage: string; setActivePage: (p: string) => void }) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-100 z-50 flex overflow-x-auto no-scrollbar">
      {NAV_ITEMS.map(item => (
        <button key={item.id} onClick={() => setActivePage(item.id)}
          className={cn('flex-1 min-w-[52px] flex flex-col items-center gap-0.5 py-2 transition-colors',
            activePage === item.id ? 'text-black' : 'text-zinc-400')}>
          <item.icon className="w-5 h-5" />
          <span className="text-[9px] font-semibold">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ─── Pomodoro ─────────────────────────────────────────────────────────────────
type PomodoroMode = 'work' | 'short' | 'long';
const MODE_DUR: Record<PomodoroMode, number> = { work: 25*60, short: 5*60, long: 15*60 };
const MODE_LBL: Record<PomodoroMode, string> = { work: 'Tập trung', short: 'Nghỉ ngắn', long: 'Nghỉ dài' };

function PomodoroPage() {
  const [mode, setMode] = useState<PomodoroMode>('work');
  const [timeLeft, setTimeLeft] = useState(MODE_DUR.work);
  const [isActive, setIsActive] = useState(false);
  const [sessions, setSessions] = useLocalStorage('pomodoro-sessions', 0);
  const intRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const r = 110; const circ = 2 * Math.PI * r;
  const ring: Record<PomodoroMode, string> = { work: '#000', short: '#10b981', long: '#6366f1' };
  const bg: Record<PomodoroMode, string>   = { work: 'bg-bg-chance', short: 'bg-emerald-50', long: 'bg-indigo-50' };

  const switchMode = (m: PomodoroMode) => { setMode(m); setIsActive(false); setTimeLeft(MODE_DUR[m]); };

  useEffect(() => {
    if (intRef.current) clearInterval(intRef.current);
    if (isActive && timeLeft > 0) { intRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000); }
    else if (isActive && timeLeft === 0) { setIsActive(false); if (mode === 'work') setSessions(s => s + 1); }
    return () => { if (intRef.current) clearInterval(intRef.current); };
  }, [isActive, timeLeft, mode, setSessions]);

  const fmt = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const offset = circ * (timeLeft / MODE_DUR[mode]);

  return (
    <div className={cn('flex flex-col items-center justify-center min-h-screen gap-8 p-6 pb-24 md:pb-6 transition-colors duration-700', bg[mode])}>
      <div className="flex gap-2 bg-white/70 p-1.5 rounded-[2rem] shadow-sm flex-wrap justify-center">
        {(Object.keys(MODE_DUR) as PomodoroMode[]).map(m => (
          <button key={m} onClick={() => switchMode(m)}
            className={cn('px-5 py-2 rounded-[1.5rem] text-sm font-bold transition-all', mode===m ? 'bg-black text-white shadow-lg' : 'text-zinc-500 hover:bg-white')}>
            {MODE_LBL[m]}
          </button>
        ))}
      </div>

      <div className="relative flex items-center justify-center">
        <svg width="260" height="260" className="-rotate-90">
          <circle cx="130" cy="130" r={r} fill="none" stroke="#e4e4e7" strokeWidth="10" />
          <circle cx="130" cy="130" r={r} fill="none" stroke={ring[mode]} strokeWidth="10"
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }} />
        </svg>
        <div className="absolute flex flex-col items-center select-none">
          <span className="text-5xl font-black tracking-tighter">{fmt(timeLeft)}</span>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.4em] mt-2">{MODE_LBL[mode]}</span>
        </div>
      </div>

      <div className="flex gap-5 items-center">
        <button onClick={() => { setIsActive(false); setTimeLeft(MODE_DUR[mode]); }}
          className="w-14 h-14 bg-white border-2 border-zinc-200 rounded-full flex items-center justify-center hover:bg-zinc-50 active:scale-95 transition-all">
          <RotateCcw className="w-5 h-5 text-zinc-400" />
        </button>
        <button onClick={() => setIsActive(a => !a)}
          className="w-20 h-20 bg-black text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-transform">
          {isActive ? <Pause className="w-8 h-8 fill-white" /> : <Play className="w-8 h-8 fill-white ml-1" />}
        </button>
        <div className="w-14 h-14 bg-white border-2 border-zinc-200 rounded-full flex flex-col items-center justify-center">
          <Zap className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-black text-zinc-600">{sessions}</span>
        </div>
      </div>
      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{sessions} phiên xong hôm nay</p>
    </div>
  );
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────
function AddTaskModal({ onAdd, onClose }: { onAdd: (t: Task) => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [category, setCategory] = useState<Category>('Study');
  const [deadline, setDeadline] = useState(new Date().toISOString().split('T')[0]);
  const submit = () => {
    if (!title.trim()) return;
    onAdd({ id: Date.now().toString(), title: title.trim(), status: 'todo', priority, category, deadline, createdAt: new Date().toISOString().split('T')[0] });
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-[100] p-4">
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="bg-white rounded-[2rem] p-7 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold">Task mới</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-col gap-4">
          <input autoFocus type="text" placeholder="Tên task..." value={title}
            onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key==='Enter' && submit()}
            className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black transition-colors" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Độ ưu tiên</p>
              {(['high','medium','low'] as Priority[]).map(p => (
                <button key={p} onClick={() => setPriority(p)}
                  className={cn('w-full mb-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all text-left',
                    priority===p ? 'bg-black text-white' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100')}>
                  {p==='high'?'Cao':p==='medium'?'Trung bình':'Thấp'}
                </button>
              ))}
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Danh mục</p>
              {(['Study','Work','Life','Health'] as Category[]).map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={cn('w-full mb-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all text-left',
                    category===c ? 'bg-black text-white' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100')}>{c}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Deadline</p>
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black" />
          </div>
        </div>
        <button onClick={submit} className="mt-5 w-full bg-black text-white py-3.5 rounded-2xl font-bold hover:bg-zinc-800 transition-colors">Thêm task</button>
      </motion.div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CAT_COLOR: Record<Category, string> = { Study: 'bg-card-pink', Work: 'bg-card-orange', Life: 'bg-card-purple', Health: 'bg-card-green' };
const CAT_ICON: Record<Category, React.ReactNode> = {
  Study: <BookOpen className="w-5 h-5" />, Work: <Briefcase className="w-5 h-5" />,
  Life: <Coffee className="w-5 h-5" />, Health: <Brain className="w-5 h-5" />,
};

// ─── Task List ────────────────────────────────────────────────────────────────
function TaskListPage({ tasks, setTasks, onTaskDone }: { tasks: Task[]; setTasks: (t: Task[]) => void; onTaskDone: (t: Task) => void; }) {
  const [activeCat, setActiveCat] = useState<Category | 'All'>('All');
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = tasks.filter(t =>
    (activeCat === 'All' || t.category === activeCat) &&
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  const toggleDone = (id: string) => {
    const task = tasks.find(t => t.id === id)!;
    const wasNotDone = task.status !== 'done';
    setTasks(tasks.map(t => t.id === id ? { ...t, status: t.status === 'done' ? 'todo' : 'done' } : t));
    if (wasNotDone) onTaskDone(task);
  };

  return (
    <div className="p-6 md:p-8 min-h-screen no-scrollbar pb-24 md:pb-10">
      <header className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-1">Tasks</h1>
          <p className="text-zinc-400 text-sm font-medium">{tasks.filter(t=>t.status!=='done').length} còn lại · {tasks.filter(t=>t.status==='done').length} xong</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="bg-black text-white px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg hover:scale-105 transition-transform shrink-0 text-sm">
          <Plus className="w-4 h-4" /> Thêm
        </button>
      </header>
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input type="text" placeholder="Tìm task..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-white border border-zinc-100 rounded-2xl pl-11 pr-4 py-2.5 font-semibold text-sm outline-none focus:border-black transition-colors shadow-sm" />
      </div>
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 no-scrollbar">
        {(['All','Study','Work','Life','Health'] as const).map(cat => (
          <button key={cat} onClick={() => setActiveCat(cat)}
            className={cn('px-4 py-2 rounded-2xl text-sm font-bold transition-all shrink-0',
              activeCat===cat ? 'bg-black text-white' : 'bg-white text-zinc-500 hover:bg-zinc-100')}>
            {cat}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnimatePresence>
          {filtered.map((task, i) => (
            <motion.div key={task.id} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i*0.04 }}
              className={cn('p-6 rounded-[2rem] flex flex-col gap-4 relative group', CAT_COLOR[task.category], task.status==='done' && 'opacity-50')}>
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 bg-white/80 rounded-2xl flex items-center justify-center shrink-0">{CAT_ICON[task.category]}</div>
                <div className="flex gap-2 items-center">
                  {task.priority==='high' && <span className="bg-red-500 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">Cao</span>}
                  <button onClick={() => setTasks(tasks.filter(t => t.id!==task.id))}
                    className="w-7 h-7 bg-white/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100">
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">{task.category}</p>
                <h3 className={cn('text-lg font-bold leading-snug', task.status==='done' && 'line-through')}>{task.title}</h3>
              </div>
              <div className="mt-auto flex justify-between items-center">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500"><Clock className="w-3.5 h-3.5" />{task.deadline}</div>
                <button onClick={() => toggleDone(task.id)} className="w-9 h-9 bg-white/70 rounded-full flex items-center justify-center hover:bg-white transition-all">
                  {task.status==='done' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5 text-zinc-400" />}
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {filtered.length===0 && (
        <div className="flex flex-col items-center py-20 text-zinc-300">
          <Circle className="w-14 h-14 mb-3 opacity-30" />
          <p className="font-bold">Không có task nào</p>
        </div>
      )}
      <AnimatePresence>
        {showModal && <AddTaskModal onAdd={t => setTasks([t,...tasks])} onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </div>
  );
}

// ─── Kanban ───────────────────────────────────────────────────────────────────
const COLS: { id: Status; title: string; color: string }[] = [
  { id: 'todo', title: 'To Do', color: 'bg-zinc-50' },
  { id: 'in-progress', title: 'In Progress', color: 'bg-blue-50' },
  { id: 'done', title: 'Done', color: 'bg-emerald-50' },
];
function KanbanPage({ tasks, setTasks }: { tasks: Task[]; setTasks: (t: Task[]) => void }) {
  const dragId = useRef<string|null>(null);
  const today = new Date();
  const [cm, setCm] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
  const daysInMonth = new Date(cm.year, cm.month+1, 0).getDate();
  const startOffset = (new Date(cm.year, cm.month, 1).getDay()+6)%7;
  const deadlines = new Set(tasks.filter(t => { const d=new Date(t.deadline); return d.getFullYear()===cm.year && d.getMonth()===cm.month; }).map(t => new Date(t.deadline).getDate()));
  const move = (id: string, s: Status) => setTasks(tasks.map(t => t.id===id ? {...t,status:s} : t));
  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar flex flex-col gap-8 pb-24 md:pb-10">
      <section>
        <h2 className="text-2xl font-bold mb-5">Kanban Board</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLS.map(col => (
            <div key={col.id} className={cn('p-5 rounded-[2rem] flex flex-col gap-3 min-h-[200px]', col.color)}
              onDragOver={e => e.preventDefault()} onDrop={() => { if(dragId.current) move(dragId.current, col.id); dragId.current=null; }}>
              <div className="flex justify-between items-center">
                <h3 className="font-bold">{col.title}</h3>
                <span className="bg-white/70 px-2.5 py-0.5 rounded-lg text-xs font-bold">{tasks.filter(t=>t.status===col.id).length}</span>
              </div>
              {tasks.filter(t=>t.status===col.id).map(task => (
                <div key={task.id} draggable onDragStart={() => { dragId.current=task.id; }}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 cursor-grab active:cursor-grabbing hover:shadow-md transition-all select-none">
                  <div className="flex justify-between items-start mb-2">
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md uppercase',
                      task.priority==='high'?'bg-red-100 text-red-600':task.priority==='medium'?'bg-yellow-100 text-yellow-700':'bg-zinc-100 text-zinc-600')}>
                      {task.priority}
                    </span>
                    <GripVertical className="w-4 h-4 text-zinc-300" />
                  </div>
                  <p className="text-sm font-bold leading-snug mb-2">{task.title}</p>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400"><Clock className="w-3 h-3" />{task.deadline}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
      <section className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">{MONTHS[cm.month]} {cm.year}</h2>
          <div className="flex gap-2">
            <button className="p-2 hover:bg-zinc-50 rounded-xl border border-zinc-100" onClick={() => setCm(c => { const d=new Date(c.year,c.month-1,1); return {year:d.getFullYear(),month:d.getMonth()}; })}><ChevronLeft className="w-4 h-4" /></button>
            <button className="p-2 hover:bg-zinc-50 rounded-xl border border-zinc-100" onClick={() => setCm(c => { const d=new Date(c.year,c.month+1,1); return {year:d.getFullYear(),month:d.getMonth()}; })}><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {['T2','T3','T4','T5','T6','T7','CN'].map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">{d}</div>
          ))}
          {Array.from({length:startOffset}).map((_,i)=><div key={`e-${i}`}/>)}
          {Array.from({length:daysInMonth},(_,i)=>i+1).map(d => {
            const isDl=deadlines.has(d);
            const isToday=d===today.getDate()&&cm.month===today.getMonth()&&cm.year===today.getFullYear();
            return (
              <div key={d} className={cn('h-12 md:h-16 p-1.5 rounded-2xl border transition-all flex flex-col',
                isToday?'bg-black border-black':isDl?'bg-red-50 border-red-100':'bg-zinc-50/50 border-transparent hover:bg-zinc-100')}>
                <span className={cn('text-xs font-bold',isToday?'text-white':isDl?'text-red-500':'text-zinc-500')}>{d}</span>
                {isDl&&!isToday&&<div className="mt-auto w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"/>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ─── Habits ───────────────────────────────────────────────────────────────────
const DAYS = ['T2','T3','T4','T5','T6','T7','CN'];
function HabitItem({ habit, onToggle }: { habit: Habit; onToggle: (id: string, day: number) => void }) {
  return (
    <div className="bg-white p-5 rounded-[2rem] shadow-sm flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-sm">{habit.name}</h3>
          <p className="text-[10px] font-bold text-zinc-400 mt-0.5">{habit.streak} ngày liên tiếp 🔥</p>
        </div>
        <span className="text-xs font-black bg-zinc-100 text-zinc-600 px-2 py-1 rounded-xl">{habit.completed.filter(Boolean).length}/7</span>
      </div>
      <div className="flex gap-1">
        {DAYS.map((d,i) => (
          <button key={i} onClick={() => onToggle(habit.id, i)}
            className={cn('flex-1 h-9 rounded-xl flex items-center justify-center text-[9px] font-bold transition-all hover:scale-105 active:scale-95',
              habit.completed[i]?'bg-black text-white':'bg-zinc-100 text-zinc-400 hover:bg-zinc-200')}>
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}
function HabitCol({ title, habits, color, onToggle, onAdd }: { title: string; habits: Habit[]; color: string; onToggle: (id: string, day: number) => void; onAdd: (name: string) => void; }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const commit = () => { if(name.trim()){ onAdd(name.trim()); setName(''); setAdding(false); } };
  return (
    <div className={cn('flex-1 p-6 rounded-[2.5rem] flex flex-col gap-4 min-w-[260px]', color)}>
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">{title}</h2>
        <button onClick={() => setAdding(true)} className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm hover:scale-110 transition-transform"><Plus className="w-4 h-4" /></button>
      </div>
      <AnimatePresence>
        {adding && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
            className="bg-white rounded-2xl p-3 flex gap-2">
            <input autoFocus type="text" placeholder="Tên habit..." value={name} onChange={e=>setName(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setAdding(false);}}
              className="flex-1 bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-black" />
            <button onClick={commit} className="px-3 py-2 bg-black text-white rounded-xl text-xs font-bold">Thêm</button>
            <button onClick={()=>setAdding(false)} className="px-2 bg-zinc-100 rounded-xl"><X className="w-3.5 h-3.5" /></button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex flex-col gap-3">{habits.map(h => <HabitItem key={h.id} habit={h} onToggle={onToggle}/>)}</div>
    </div>
  );
}
function HabitTrackerPage({ habits, setHabits }: { habits: Habit[]; setHabits: (h: Habit[]) => void }) {
  const toggle = (id: string, day: number) => setHabits(habits.map(h => {
    if(h.id!==id) return h;
    const c=[...h.completed]; c[day]=!c[day];
    return {...h, completed:c, streak:c.filter(Boolean).length};
  }));
  const add = (group: 'study'|'life') => (name: string) => setHabits([...habits,{id:Date.now().toString(),name,streak:0,completed:Array(7).fill(false),group}]);
  return (
    <div className="p-6 md:p-8 min-h-screen flex flex-col md:flex-row gap-5 overflow-y-auto no-scrollbar pb-24 md:pb-10">
      <HabitCol title="Study Habits" habits={habits.filter(h=>h.group==='study')} color="bg-card-blue" onToggle={toggle} onAdd={add('study')} />
      <HabitCol title="Life Habits"  habits={habits.filter(h=>h.group==='life')}  color="bg-card-green" onToggle={toggle} onAdd={add('life')} />
    </div>
  );
}

// ─── Finance ──────────────────────────────────────────────────────────────────
function FinancePage({ finance, setFinance }: { finance: FinanceState; setFinance: (f: FinanceState) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<'income'|'expense'>('income');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [editReward, setEditReward] = useState(false);
  const [rewardInput, setRewardInput] = useState(String(finance.rewardPerTask));

  const balance      = finance.transactions.reduce((acc,tx) => tx.type==='expense' ? acc-tx.amount : acc+tx.amount, 0);
  const totalIncome  = finance.transactions.filter(t=>t.type!=='expense').reduce((a,t)=>a+t.amount,0);
  const totalExpense = finance.transactions.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0);
  const totalRewards = finance.transactions.filter(t=>t.type==='reward').reduce((a,t)=>a+t.amount,0);

  // 7-day chart
  const last7 = Array.from({length:7},(_,i)=>{
    const d=new Date(); d.setDate(d.getDate()-(6-i));
    const ds=d.toISOString().split('T')[0];
    return {
      name: `${d.getDate()}/${d.getMonth()+1}`,
      thu: finance.transactions.filter(t=>t.date===ds&&t.type!=='expense').reduce((a,t)=>a+t.amount,0),
      chi: finance.transactions.filter(t=>t.date===ds&&t.type==='expense').reduce((a,t)=>a+t.amount,0),
    };
  });

  const addTx = () => {
    const num = parseInt(amount.replace(/\D/g,''),10);
    if(!num || !note.trim()) return;
    const tx: Transaction = {id:Date.now().toString(),type:addType,amount:num,note:note.trim(),date:new Date().toISOString().split('T')[0]};
    setFinance({...finance, transactions:[tx,...finance.transactions]});
    setAmount(''); setNote(''); setShowAdd(false);
  };

  const deleteTx = (id: string) => setFinance({...finance, transactions:finance.transactions.filter(t=>t.id!==id)});

  const saveReward = () => {
    const num = parseInt(rewardInput.replace(/\D/g,''),10);
    if(num>0) setFinance({...finance, rewardPerTask:num});
    setEditReward(false);
  };

  const txIcon = (type: TxType) => {
    if(type==='reward')  return <div className="w-9 h-9 rounded-2xl bg-yellow-100 flex items-center justify-center text-base shrink-0">💰</div>;
    if(type==='income')  return <div className="w-9 h-9 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0"><ArrowUpCircle className="w-5 h-5 text-emerald-600"/></div>;
    return <div className="w-9 h-9 rounded-2xl bg-red-100 flex items-center justify-center shrink-0"><ArrowDownCircle className="w-5 h-5 text-red-500"/></div>;
  };

  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar flex flex-col gap-5 pb-24 md:pb-10">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-1">Finance</h1>
          <p className="text-zinc-400 text-sm font-medium">Thu chi + thưởng khi hoàn thành task</p>
        </div>
        <button onClick={()=>setShowAdd(true)}
          className="bg-black text-white px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg hover:scale-105 transition-transform text-sm shrink-0">
          <Plus className="w-4 h-4"/> Thêm
        </button>
      </header>

      {/* Balance hero */}
      <div className="bg-black text-white rounded-[2.5rem] p-7 flex flex-col gap-4">
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Số dư hiện tại</p>
        <p className={cn('text-5xl font-black tracking-tight', balance<0?'text-red-400':'text-white')}>{formatVND(balance)}</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            {label:'Tổng thu',   value:totalIncome,  color:'text-emerald-400'},
            {label:'Tổng chi',   value:totalExpense, color:'text-red-400'},
            {label:'Từ tasks',   value:totalRewards, color:'text-yellow-400'},
          ].map(item => (
            <div key={item.label} className="bg-white/10 rounded-2xl p-3">
              <p className="text-zinc-400 text-[9px] font-bold uppercase tracking-wider mb-1">{item.label}</p>
              <p className={cn('text-sm font-black', item.color)}>{formatVND(item.value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Reward setting */}
      <div className="bg-card-orange rounded-[2rem] p-5 flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Thưởng mỗi khi tick xong task</p>
          {editReward ? (
            <input autoFocus type="text" value={rewardInput}
              onChange={e => setRewardInput(e.target.value.replace(/\D/g,''))}
              onKeyDown={e=>{if(e.key==='Enter')saveReward();if(e.key==='Escape')setEditReward(false);}}
              className="bg-white/80 border-2 border-black rounded-xl px-3 py-1.5 text-xl font-black w-40 outline-none" />
          ) : (
            <p className="text-2xl font-black">{formatVND(finance.rewardPerTask)}</p>
          )}
        </div>
        {editReward ? (
          <button onClick={saveReward} className="w-10 h-10 bg-black text-white rounded-2xl flex items-center justify-center shrink-0">
            <Check className="w-5 h-5"/>
          </button>
        ) : (
          <button onClick={()=>{setEditReward(true);setRewardInput(String(finance.rewardPerTask));}}
            className="w-10 h-10 bg-white/60 rounded-2xl flex items-center justify-center hover:bg-white transition-colors shrink-0">
            <Pencil className="w-4 h-4"/>
          </button>
        )}
      </div>

      {/* 7-day chart */}
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100">
        <h3 className="font-bold mb-4">7 ngày gần nhất</h3>
        <div className="h-[160px]">
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

      {/* Transaction list */}
      <div>
        <h3 className="font-bold mb-3 text-lg">Lịch sử giao dịch</h3>
        <div className="flex flex-col gap-2.5">
          <AnimatePresence>
            {finance.transactions.map(tx => (
              <motion.div key={tx.id} layout initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.95}}
                className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex items-center gap-3 group">
                {txIcon(tx.type)}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{tx.note}</p>
                  {tx.taskTitle && <p className="text-[10px] text-zinc-400 font-medium truncate">📋 {tx.taskTitle}</p>}
                  <p className="text-[10px] text-zinc-400 font-medium">{tx.date}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className={cn('font-black text-sm',tx.type==='expense'?'text-red-500':'text-emerald-600')}>
                    {tx.type==='expense'?'−':'+'}{ formatVND(tx.amount)}
                  </p>
                  <button onClick={()=>deleteTx(tx.id)}
                    className="w-7 h-7 rounded-full bg-zinc-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100">
                    <Trash2 className="w-3.5 h-3.5 text-red-400"/>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {finance.transactions.length===0 && (
            <div className="text-center py-12 text-zinc-300">
              <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30"/>
              <p className="font-bold">Chưa có giao dịch nào</p>
            </div>
          )}
        </div>
      </div>

      {/* Add transaction modal */}
      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-[100] p-4">
            <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}}
              className="bg-white rounded-[2rem] p-7 w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold">Thêm giao dịch</h2>
                <button onClick={()=>setShowAdd(false)} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><X className="w-4 h-4"/></button>
              </div>
              <div className="flex gap-2 mb-4">
                {(['income','expense'] as const).map(t => (
                  <button key={t} onClick={()=>setAddType(t)}
                    className={cn('flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all',
                      addType===t ? (t==='income'?'bg-emerald-500 text-white':'bg-red-500 text-white') : 'bg-zinc-100 text-zinc-500')}>
                    {t==='income'?'+ Thu nhập':'− Chi tiêu'}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                <input type="text" placeholder="Số tiền (VND)" value={amount}
                  onChange={e=>setAmount(e.target.value.replace(/\D/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,','))}
                  className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-bold text-lg outline-none focus:border-black"/>
                <input type="text" placeholder="Ghi chú..." value={note} onChange={e=>setNote(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addTx()}
                  className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>
              </div>
              <button onClick={addTx}
                className={cn('mt-5 w-full py-3.5 rounded-2xl font-bold transition-colors',
                  addType==='income'?'bg-emerald-500 hover:bg-emerald-600 text-white':'bg-red-500 hover:bg-red-600 text-white')}>
                Lưu giao dịch
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Statistics ───────────────────────────────────────────────────────────────
function StatisticsPage({ tasks }: { tasks: Task[] }) {
  const done    = tasks.filter(t=>t.status==='done').length;
  const overdue = tasks.filter(t=>t.status!=='done'&&new Date(t.deadline)<new Date()).length;
  const pct     = tasks.length>0 ? Math.round((done/tasks.length)*100) : 0;
  const catData = (['Study','Work','Life','Health'] as Category[]).map(c => ({name:c, value:tasks.filter(t=>t.category===c).length||0}));
  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar flex flex-col gap-5 pb-24 md:pb-10">
      <header>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-1">Analytics</h1>
        <p className="text-zinc-400 text-sm font-medium">Theo dõi tiến độ và tối ưu năng suất.</p>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label:'Tổng tasks',value:tasks.length,c:'bg-card-purple'},
          {label:'Hoàn thành',value:done,c:'bg-card-green'},
          {label:'Tỉ lệ',value:`${pct}%`,c:'bg-card-blue'},
          {label:'Quá hạn',value:overdue,c:overdue>0?'bg-red-100':'bg-card-orange'},
        ].map(k=>(
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
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:11,fontWeight:600}}/>
                <YAxis axisLine={false} tickLine={false} tick={{fontSize:11}}/>
                <Tooltip contentStyle={{borderRadius:12,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,0.08)'}}/>
                <Area type="monotone" dataKey="planned" stroke="#000" fillOpacity={1} fill="url(#gP)" strokeWidth={2.5}/>
                <Area type="monotone" dataKey="completed" stroke="#F6C6D9" fill="#F6C6D9" fillOpacity={0.3} strokeWidth={2.5}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-black text-white p-6 rounded-[2rem] flex flex-col justify-between">
          <div><h3 className="font-bold mb-1">Quá hạn</h3><p className="text-zinc-500 text-xs">Cần xử lý</p></div>
          <div className={cn('text-6xl font-black',overdue>0?'text-red-500':'text-emerald-400')}>{String(overdue).padStart(2,'0')}</div>
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-400"><AlertCircle className="w-4 h-4"/>{overdue>0?'Cần chú ý':'Tất cả on track!'}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100">
          <h3 className="font-bold mb-4">Tạo vs Hoàn thành</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={STATS_DATA.createdVsCompleted}>
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
        <div><h3 className="text-xl font-bold mb-1">Chuỗi năng suất</h3><p className="text-zinc-600 text-sm font-medium">Tiếp tục giữ đà!</p></div>
        <div className="flex items-baseline gap-2"><span className="text-5xl font-black">12</span><span className="font-bold uppercase tracking-widest text-sm">Ngày</span></div>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activePage, setActivePage] = useState('tasks');
  const [tasks,   setTasksRaw]  = useLocalStorage<Task[]>('chance-tasks', INITIAL_TASKS);
  const [habits,  setHabits]    = useLocalStorage<Habit[]>('chance-habits', INITIAL_HABITS);
  const [finance, setFinanceRaw]= useLocalStorage<FinanceState>('chance-finance', INITIAL_FINANCE);
  const { toasts, add: addToast } = useToast();

  // Wrap setFinance so we always have the freshest rewardPerTask in the callback
  const setFinance = useCallback((f: FinanceState) => setFinanceRaw(f), [setFinanceRaw]);

  const handleTaskDone = useCallback((task: Task) => {
    setFinanceRaw(prev => {
      const tx: Transaction = {
        id: Date.now().toString(), type: 'reward',
        amount: prev.rewardPerTask, note: 'Hoàn thành task',
        date: new Date().toISOString().split('T')[0], taskTitle: task.title,
      };
      return { ...prev, transactions: [tx, ...prev.transactions] };
    });
    addToast(`+${formatVND(finance.rewardPerTask)} đã vào ví! 💰`, '');
  }, [finance.rewardPerTask, setFinanceRaw, addToast]);

  const setTasks = useCallback((t: Task[]) => setTasksRaw(t), [setTasksRaw]);

  return (
    <div className="flex min-h-screen font-sans bg-bg-chance selection:bg-black selection:text-white">
      <Sidebar activePage={activePage} setActivePage={setActivePage}/>
      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={activePage}
            initial={{opacity:0,x:12}} animate={{opacity:1,x:0}}
            exit={{opacity:0,x:-12}} transition={{duration:0.22,ease:'easeInOut'}}
            className="min-h-screen">
            {activePage==='pomodoro' && <PomodoroPage/>}
            {activePage==='tasks'    && <TaskListPage tasks={tasks} setTasks={setTasks} onTaskDone={handleTaskDone}/>}
            {activePage==='kanban'   && <KanbanPage tasks={tasks} setTasks={setTasks}/>}
            {activePage==='habits'   && <HabitTrackerPage habits={habits} setHabits={setHabits}/>}
            {activePage==='finance'  && <FinancePage finance={finance} setFinance={setFinance}/>}
            {activePage==='stats'    && <StatisticsPage tasks={tasks}/>}
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomNav activePage={activePage} setActivePage={setActivePage}/>
      <ToastContainer toasts={toasts}/>
    </div>
  );
}
