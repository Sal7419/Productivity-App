/**
 * Chance Productivity v5
 * NEW: Weekly schedule/timetable (grid + list), Finance view modes (overview/daily/weekly/monthly),
 *      Undo task completion deducts reward from wallet, Supabase cloud auth + sync
 *      (no local server needed — works from any network).
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Timer, ListTodo, Trello, Flame, BarChart3, Home,
  Play, Pause, RotateCcw, Plus, ChevronRight, ChevronLeft,
  CheckCircle2, Circle, Clock, AlertCircle, BookOpen,
  Search, Briefcase, X, Trash2, GripVertical,
  Coffee, Brain, Zap, Wallet, Tag, Archive, CalendarDays,
  LogIn, LogOut, User, Hash, RefreshCw, Pencil, Check,
  ArrowUpCircle, ArrowDownCircle, LayoutGrid, List,
  StickyNote, AlignLeft, CheckSquare, ListOrdered,
  RotateCcw as Reset, TrendingUp, Calendar,
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
      <div style={{padding:'2rem'}}>
        <h2 style={{color:'red',marginBottom:'1rem'}}>⚠️ Lỗi render</h2>
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

// ─── Utilities ────────────────────────────────────────────────────────────────
function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

/** Only used for auth token — everything else lives on Supabase */
function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue] as const;
}

/** Simple in-memory state — data comes from / goes to Supabase only */
function useServerState<T>(initial: T) {
  return useState<T>(initial);
}

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(n);
}
function todayIndex() { return (new Date().getDay()+6)%7; }
function todayStr()   { return new Date().toISOString().split('T')[0]; }
function getISOWeek(d=new Date()):string {
  const date=new Date(d); date.setHours(0,0,0,0);
  date.setDate(date.getDate()+3-(date.getDay()+6)%7);
  const w1=new Date(date.getFullYear(),0,4);
  const wn=1+Math.round(((date.getTime()-w1.getTime())/86400000-3+(w1.getDay()+6)%7)/7);
  return `${date.getFullYear()}-W${String(wn).padStart(2,'0')}`;
}

// ─── Schema Migration ─────────────────────────────────────────────────────────
// Runs once on startup to upgrade localStorage data from old versions.
// Never deletes data — only fills in missing fields with safe defaults.
function migrateLocalStorage() {
  try {
    // ── Habits ──
    const rawHabits = localStorage.getItem('chance-habits');
    if (rawHabits) {
      const habits = JSON.parse(rawHabits) as any[];
      let changed = false;
      const migrated = habits.map((h: any) => {
        const updates: any = {};
        if (typeof h.weeklyStreak !== 'number') { updates.weeklyStreak = 0; changed = true; }
        if (!h.lastResetWeek) { updates.lastResetWeek = getISOWeek(); changed = true; }
        if (!Array.isArray(h.completed) || h.completed.length !== 7) {
          updates.completed = Array(7).fill(false); changed = true;
        }
        if (typeof h.streak !== 'number') { updates.streak = 0; changed = true; }
        return changed ? { ...h, ...updates } : h;
      });
      if (changed) localStorage.setItem('chance-habits', JSON.stringify(migrated));
    }

    // ── Tasks ──
    const rawTasks = localStorage.getItem('chance-tasks');
    if (rawTasks) {
      const tasks = JSON.parse(rawTasks) as any[];
      let changed = false;
      const migrated = tasks.map((t: any) => {
        const updates: any = {};
        if (!Array.isArray(t.tags)) { updates.tags = []; changed = true; }
        if (!t.createdAt) { updates.createdAt = t.deadline ?? todayStr(); changed = true; }
        if (!t.category) { updates.category = 'Study'; changed = true; }
        return changed ? { ...t, ...updates } : t;
      });
      if (changed) localStorage.setItem('chance-tasks', JSON.stringify(migrated));
    }

    // ── Archived ──
    const rawArchived = localStorage.getItem('chance-archived');
    if (rawArchived) {
      const archived = JSON.parse(rawArchived) as any[];
      let changed = false;
      const migrated = archived.map((t: any) => {
        const updates: any = {};
        if (!Array.isArray(t.tags)) { updates.tags = []; changed = true; }
        if (!t.archivedAt) { updates.archivedAt = todayStr(); changed = true; }
        return changed ? { ...t, ...updates } : t;
      });
      if (changed) localStorage.setItem('chance-archived', JSON.stringify(migrated));
    }

    // ── Finance ──
    const rawFin = localStorage.getItem('chance-finance');
    if (rawFin) {
      const fin = JSON.parse(rawFin) as any;
      let changed = false;
      if (typeof fin.rewardPerTask !== 'number') { fin.rewardPerTask = 10000; changed = true; }
      if (!Array.isArray(fin.transactions)) { fin.transactions = []; changed = true; }
      if (changed) localStorage.setItem('chance-finance', JSON.stringify(fin));
    }

    // ── Settings ──
    const rawSettings = localStorage.getItem('chance-settings');
    if (rawSettings) {
      const s = JSON.parse(rawSettings) as any;
      let changed = false;
      if (!s.accentColor) { s.accentColor = 'black'; changed = true; }
      if (!s.pomoDurations) { s.pomoDurations = {work:25,short:5,long:15}; changed = true; }
      if (!Array.isArray(s.customCategories)) { s.customCategories = []; changed = true; }
      if (changed) localStorage.setItem('chance-settings', JSON.stringify(s));
    }

    // ── Notes ──
    const rawNotes = localStorage.getItem('chance-notes');
    if (rawNotes) {
      const notes = JSON.parse(rawNotes) as any[];
      let changed = false;
      const migrated = notes.map((n: any) => {
        const updates: any = {};
        if (!Array.isArray(n.tags)) { updates.tags = []; changed = true; }
        if (!Array.isArray(n.blocks)) { updates.blocks = [{id:'b1',type:'text',content:n.content??''}]; changed = true; }
        if (!n.color) { updates.color = '#FFFFFF'; changed = true; }
        if (!n.createdAt) { updates.createdAt = todayStr(); changed = true; }
        if (!n.updatedAt) { updates.updatedAt = todayStr(); changed = true; }
        return changed ? { ...n, ...updates } : n;
      });
      if (changed) localStorage.setItem('chance-notes', JSON.stringify(migrated));
    }
  } catch(e) {
    console.warn('[Migration] Error:', e);
  }
}

// Run migration immediately (before React renders anything)
migrateLocalStorage();

// ─── Supabase helpers (no SDK needed — direct REST) ───────────────────────────
const SB_URL = (import.meta as any).env?.VITE_SUPABASE_URL  ?? '';
const SB_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON ?? '';

async function sbFetch(path: string, opts: RequestInit={}, token?: string) {
  const headers: Record<string,string> = {
    'apikey': SB_KEY, 'Content-Type': 'application/json',
    ...(opts.headers as Record<string,string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${SB_URL}${path}`, {...opts, headers});
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error_description ?? data.message ?? data.error ?? `HTTP ${r.status}`);
  return data;
}
async function sbRegister(email: string, pw: string) {
  return sbFetch('/auth/v1/signup',{method:'POST',body:JSON.stringify({email,password:pw})});
}
async function sbLogin(email: string, pw: string) {
  return sbFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:pw})});
}
async function sbRefresh(refreshToken: string) {
  return sbFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:refreshToken})});
}
async function sbGetData(token: string, uid: string) {
  const rows = await sbFetch(`/rest/v1/profiles?id=eq.${uid}&select=data,updated_at`,{},token);
  const row = Array.isArray(rows)?rows[0]:null;
  return row ? { data: row.data, updatedAt: row.updated_at } : null;
}
async function sbSetData(token: string, uid: string, data: object) {
  await sbFetch('/rest/v1/profiles',{
    method:'POST',
    headers:{'Prefer':'resolution=merge-duplicates'},
    body:JSON.stringify({id:uid,data,updated_at:new Date().toISOString()}),
  },token);
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Priority = 'high'|'medium'|'low';
type Status   = 'todo'|'in-progress'|'done';
interface Task { id:string;title:string;status:Status;priority:Priority;category:string;deadline:string;createdAt:string;tags:string[];archivedAt?:string; }
interface Habit{ id:string;name:string;streak:number;weeklyStreak:number;completed:boolean[];group:'study'|'life';lastResetWeek:string; }
interface Transaction{ id:string;type:'income'|'expense'|'reward';amount:number;note:string;date:string;taskTitle?:string; }
interface FinanceState{ rewardPerTask:number;transactions:Transaction[]; }
interface AuthUser{ email:string;token:string;userId:string;refreshToken:string;expiresAt:number; }
interface AppSettings{ accentColor:string;pomoDurations:{work:number;short:number;long:number};customCategories:string[]; }
interface ScheduleEvent{ id:string;title:string;startTime:string;endTime:string;days:number[];color:string;note:string; }
type NoteBlockType='text'|'checkbox'|'bullet';
interface NoteBlock{ id:string;type:NoteBlockType;content:string;checked?:boolean; }
interface Note{ id:string;title:string;blocks:NoteBlock[];tags:string[];createdAt:string;updatedAt:string;color:string; }

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = ['Study','Work','Life','Health'];
const CAT_COLORS: Record<string,string> = {Study:'bg-card-pink',Work:'bg-card-orange',Life:'bg-card-purple',Health:'bg-card-green',Personal:'bg-card-blue'};
const CAT_ICONS: Record<string,React.ReactNode> = {
  Study:<BookOpen className="w-5 h-5"/>,Work:<Briefcase className="w-5 h-5"/>,
  Life:<Coffee className="w-5 h-5"/>,Health:<Brain className="w-5 h-5"/>,Personal:<User className="w-5 h-5"/>,
};
const getCatColor = (c:string) => CAT_COLORS[c]??'bg-zinc-100';
const getCatIcon  = (c:string) => CAT_ICONS[c]??<Tag className="w-5 h-5"/>;
const ACCENT_COLORS: Record<string,{hex:string;light:string}> = {
  black:{hex:'#18181b',light:'#f4f4f5'}, indigo:{hex:'#6366f1',light:'#eef2ff'},
  emerald:{hex:'#10b981',light:'#ecfdf5'}, rose:{hex:'#f43f5e',light:'#fff1f2'},
  amber:{hex:'#f59e0b',light:'#fffbeb'},
};
const SCHED_COLORS=[
  {bg:'#FDE2E4',label:'Hồng'},{bg:'#FAD2AD',label:'Cam'},{bg:'#E2E2FB',label:'Tím'},
  {bg:'#D1F2EB',label:'Xanh lá'},{bg:'#D0E7FF',label:'Xanh'},{bg:'#FFF9C4',label:'Vàng'},{bg:'#E0E0E0',label:'Xám'},
];
const DAY_SHORT=['T2','T3','T4','T5','T6','T7','CN'];
const DAY_FULL=['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật'];

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INIT_TASKS: Task[] = [
  {id:'1',title:'CCNA 2020 Video Boot Camp',status:'todo',priority:'high',category:'Study',deadline:'2026-04-20',createdAt:'2026-04-01',tags:['#networking','#cert']},
  {id:'2',title:'Powerful Business Writing',status:'in-progress',priority:'medium',category:'Work',deadline:'2026-04-14',createdAt:'2026-04-05',tags:['#writing']},
  {id:'3',title:'Six Sigma Yellow Belt',status:'done',priority:'high',category:'Study',deadline:'2026-04-08',createdAt:'2026-04-01',tags:['#cert']},
  {id:'4',title:'How to Design a Room',status:'todo',priority:'low',category:'Life',deadline:'2026-04-25',createdAt:'2026-04-03',tags:[]},
  {id:'5',title:'Flutter Masterclass',status:'todo',priority:'high',category:'Study',deadline:'2026-04-13',createdAt:'2026-04-04',tags:['#flutter']},
];
const INIT_HABITS: Habit[] = [
  {id:'s1',name:'Đọc sách 30 phút',streak:5,weeklyStreak:2,completed:[true,true,true,true,true,false,false],group:'study',lastResetWeek:getISOWeek()},
  {id:'s2',name:'Luyện code',streak:7,weeklyStreak:4,completed:[true,true,true,true,true,true,true],group:'study',lastResetWeek:getISOWeek()},
  {id:'s3',name:'Học từ mới',streak:3,weeklyStreak:1,completed:[false,false,true,true,true,false,false],group:'study',lastResetWeek:getISOWeek()},
  {id:'l1',name:'Tập thể dục sáng',streak:7,weeklyStreak:5,completed:[true,true,true,true,true,true,true],group:'life',lastResetWeek:getISOWeek()},
  {id:'l2',name:'Uống 2L nước',streak:7,weeklyStreak:8,completed:[true,true,true,true,true,true,true],group:'life',lastResetWeek:getISOWeek()},
  {id:'l3',name:'Thiền định',streak:2,weeklyStreak:0,completed:[false,false,false,false,true,true,false],group:'life',lastResetWeek:getISOWeek()},
];
const INIT_FINANCE: FinanceState = {
  rewardPerTask:10000,
  transactions:[
    {id:'d1',type:'reward',amount:10000,note:'Hoàn thành task',date:'2026-04-08',taskTitle:'Six Sigma Yellow Belt'},
    {id:'d2',type:'income',amount:500000,note:'Lương tuần',date:'2026-04-07'},
    {id:'d3',type:'expense',amount:75000,note:'Cà phê + ăn sáng',date:'2026-04-07'},
  ],
};
const INIT_SETTINGS: AppSettings = {accentColor:'black',pomoDurations:{work:25,short:5,long:15},customCategories:[]};
const INIT_SCHEDULE: ScheduleEvent[] = [
  {id:'ev1',title:'Tập thể dục',startTime:'06:00',endTime:'07:00',days:[0,1,2,3,4],color:'#D1F2EB',note:'Chạy bộ / gym'},
  {id:'ev2',title:'Học tiếng Anh',startTime:'07:30',endTime:'08:30',days:[0,1,2,3,4,5],color:'#E2E2FB',note:''},
  {id:'ev3',title:'Làm việc',startTime:'09:00',endTime:'12:00',days:[0,1,2,3,4],color:'#FAD2AD',note:''},
  {id:'ev4',title:'Nghỉ trưa',startTime:'12:00',endTime:'13:00',days:[0,1,2,3,4,5,6],color:'#D0E7FF',note:''},
  {id:'ev5',title:'Học dự án cá nhân',startTime:'19:00',endTime:'21:00',days:[0,1,2,3,4],color:'#FDE2E4',note:''},
];
const NOTE_COLORS=['#FFFFFF','#FDE2E4','#FAD2AD','#E2E2FB','#D1F2EB','#D0E7FF','#FFF9C4'];
const INIT_NOTES: Note[] = [
  {id:'n1',title:'Ý tưởng project',color:'#E2E2FB',tags:['#idea','#project'],createdAt:'2026-04-01',updatedAt:'2026-04-01',blocks:[
    {id:'b1',type:'text',content:'Ứng dụng quản lý chi tiêu cá nhân với AI gợi ý.'},
    {id:'b2',type:'bullet',content:'Phân tích thói quen chi tiêu'},
    {id:'b3',type:'bullet',content:'Gợi ý tiết kiệm mỗi tuần'},
    {id:'b4',type:'checkbox',content:'Nghiên cứu thị trường',checked:true},
    {id:'b5',type:'checkbox',content:'Thiết kế UI mockup',checked:false},
  ]},
  {id:'n2',title:'Danh sách mua sắm',color:'#D1F2EB',tags:['#shopping'],createdAt:'2026-04-05',updatedAt:'2026-04-05',blocks:[
    {id:'b6',type:'checkbox',content:'Sữa tươi',checked:true},
    {id:'b7',type:'checkbox',content:'Trứng gà',checked:false},
    {id:'b8',type:'checkbox',content:'Rau củ',checked:false},
    {id:'b9',type:'checkbox',content:'Bánh mì',checked:true},
  ]},
];

// ─── Accent CSS ───────────────────────────────────────────────────────────────
function useAccentCSS(color: string) {
  useEffect(()=>{
    const ac=ACCENT_COLORS[color]??ACCENT_COLORS.black;
    let el=document.getElementById('chance-accent') as HTMLStyleElement|null;
    if(!el){el=document.createElement('style');el.id='chance-accent';document.head.appendChild(el);}
    el.textContent=`:root{--ac:${ac.hex};--ac-light:${ac.light};}
    @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
    .shake{animation:shake 0.4s ease infinite;}
    @keyframes pulsered{0%,100%{opacity:1}50%{opacity:0.5}}
    .pulsered{animation:pulsered 1s ease infinite;}`;
  },[color]);
}

// ─── Toast ────────────────────────────────────────────────────────────────────
interface ToastMsg{id:number;text:string;emoji:string;}
function ToastContainer({toasts}:{toasts:ToastMsg[]}) {
  return (
    <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t=>(
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
  const [toasts,setToasts]=useState<ToastMsg[]>([]);
  const add=useCallback((text:string,emoji='✓')=>{
    const id=Date.now();
    setToasts(p=>[...p,{id,text,emoji}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000);
  },[]);
  return {toasts,add};
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
const NAV_ITEMS=[
  {id:'home',     icon:Home,        label:'Home'},
  {id:'pomodoro', icon:Timer,       label:'Pomodoro'},
  {id:'tasks',    icon:ListTodo,    label:'Tasks'},
  {id:'kanban',   icon:Trello,      label:'Kanban'},
  {id:'habits',   icon:Flame,       label:'Habits'},
  {id:'schedule', icon:CalendarDays,label:'Schedule'},
  {id:'notes',    icon:StickyNote,  label:'Notes'},
  {id:'finance',  icon:Wallet,      label:'Finance'},
  {id:'stats',    icon:BarChart3,   label:'Stats'},
];

function Sidebar({activePage,setActivePage,settings,setSettings,user,onLogout,onSyncClick,syncing}:
  {activePage:string;setActivePage:(p:string)=>void;settings:AppSettings;setSettings:(s:AppSettings)=>void;
   user:AuthUser|null;onLogout:()=>void;onSyncClick:()=>void;syncing:boolean;}) {
  return (
    <aside className="hidden md:flex w-56 h-screen bg-sidebar-dark text-zinc-400 p-4 flex-col gap-4 sticky top-0 z-50 shrink-0 overflow-y-auto no-scrollbar">
      <div className="flex items-center gap-2.5 mb-1 cursor-pointer" onClick={()=>setActivePage('home')}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity" style={{backgroundColor:'var(--ac)'}}>
          <CheckCircle2 className="w-4 h-4 text-white"/>
        </div>
        <span className="text-lg font-bold text-white tracking-tight hover:opacity-80 transition-opacity">chance</span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(item=>(
          <button key={item.id} onClick={()=>setActivePage(item.id)}
            className={cn('flex items-center gap-2.5 px-3 py-2 rounded-2xl text-sm font-semibold transition-all duration-200',
              activePage===item.id?'text-black shadow-xl bg-white':'hover:text-white hover:bg-white/5')}>
            <item.icon className="w-4 h-4 shrink-0"/>{item.label}
          </button>
        ))}
      </nav>
      <div className="border-t border-white/10 pt-3">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Màu chủ đạo</p>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(ACCENT_COLORS).map(([k,v])=>(
            <button key={k} onClick={()=>setSettings({...settings,accentColor:k})}
              className={cn('w-6 h-6 rounded-full transition-all hover:scale-110 border-2',settings.accentColor===k?'border-white scale-110':'border-transparent')}
              style={{backgroundColor:v.hex}}/>
          ))}
        </div>
      </div>
      <div className="mt-auto border-t border-white/10 pt-3 flex flex-col gap-1.5">
        {user?(
          <>
            <div className="flex items-center gap-2 px-1">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0"><User className="w-3.5 h-3.5 text-white"/></div>
              <span className="text-xs text-zinc-300 font-semibold truncate flex-1">{user.email}</span>
            </div>
            <button onClick={onSyncClick} className={cn('flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-bold text-emerald-400 hover:bg-white/5 transition-colors',syncing&&'opacity-60')}>
              <RefreshCw className={cn('w-3.5 h-3.5',syncing&&'animate-spin')}/>{syncing?'Đang đồng bộ...':'Đồng bộ ngay'}
            </button>
            <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-bold text-red-400 hover:bg-red-400/10 transition-colors">
              <LogOut className="w-3.5 h-3.5"/>Đăng xuất
            </button>
          </>
        ):(
          <button onClick={onSyncClick} className="flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/5 transition-colors">
            <LogIn className="w-3.5 h-3.5"/>Đăng nhập / Tạo tài khoản
          </button>
        )}
      </div>
    </aside>
  );
}

// ─── Auth Page (full screen) ──────────────────────────────────────────────────
function AuthPage({onLogin,onBack}:{onLogin:(u:AuthUser)=>void;onBack:()=>void}) {
  const [tab,setTab]=useState<'login'|'register'>('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const noSB=!SB_URL||!SB_KEY;

  const submit=async()=>{
    if(!email.trim()||!password.trim()){setError('Vui lòng điền đầy đủ.');return;}
    if(noSB){setError('Chưa cấu hình Supabase. Xem SETUP_SUPABASE.md.');return;}
    setLoading(true);setError('');
    try{
      const data=tab==='register'?await sbRegister(email,password):await sbLogin(email,password);
      const token=data.access_token;const refreshToken=data.refresh_token??'';
      const userId=data.user?.id??data.id;const expiresAt=Date.now()+(data.expires_in??3600)*1000;
      if(!token||!userId)throw new Error(data.error_description??data.msg??'Thất bại.');
      onLogin({email:data.user?.email??email,token,userId,refreshToken,expiresAt});
    }catch(e:any){setError(e.message??'Đã có lỗi.');}
    finally{setLoading(false);}
  };

  return (
    <div className="min-h-screen bg-bg-chance flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-5">
        <button onClick={onBack} className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-zinc-100 hover:bg-zinc-50">
          <ChevronLeft className="w-5 h-5"/>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{backgroundColor:'var(--ac)'}}>
            <CheckCircle2 className="w-4 h-4 text-white"/>
          </div>
          <span className="text-lg font-bold tracking-tight">chance</span>
        </div>
        <div className="w-10"/>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        {/* Illustration */}
        <div className="w-20 h-20 rounded-[2rem] flex items-center justify-center mb-6 shadow-xl" style={{backgroundColor:'var(--ac)'}}>
          <User className="w-10 h-10 text-white"/>
        </div>
        <h1 className="text-3xl font-black tracking-tight mb-1 text-center">
          {tab==='login'?'Xin chào!':'Tạo tài khoản'}
        </h1>
        <p className="text-zinc-400 text-sm text-center mb-8">
          {tab==='login'?'Đăng nhập để đồng bộ dữ liệu của bạn':'Đăng ký miễn phí — dữ liệu lưu trên cloud'}
        </p>

        {/* Card */}
        <div className="w-full max-w-sm bg-white rounded-[2rem] p-7 shadow-xl border border-zinc-100">
          {/* Tabs */}
          <div className="flex gap-2 mb-5 p-1 bg-zinc-100 rounded-2xl">
            {(['login','register']as const).map(t=>(
              <button key={t} onClick={()=>{setTab(t);setError('');}}
                className={cn('flex-1 py-2.5 rounded-xl text-sm font-bold transition-all',tab===t?'bg-white text-black shadow-sm':'text-zinc-500')}>
                {t==='login'?'Đăng nhập':'Đăng ký'}
              </button>
            ))}
          </div>

          {noSB&&(
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-4 text-xs text-amber-700 font-semibold">
              ⚠️ Chưa cấu hình Supabase. Tạo file <code>.env.local</code> với VITE_SUPABASE_URL và VITE_SUPABASE_ANON.
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 block">Email</label>
              <input type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}
                className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black transition-colors"/>
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 block">Mật khẩu</label>
              <input type="password" placeholder="Tối thiểu 6 ký tự" value={password} onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&submit()}
                className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black transition-colors"/>
            </div>
            <AnimatePresence>
              {error&&<motion.p initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="text-xs text-red-500 font-semibold px-1">{error}</motion.p>}
            </AnimatePresence>
          </div>

          <button onClick={submit} disabled={loading}
            className="mt-5 w-full text-white py-4 rounded-2xl font-bold transition-all disabled:opacity-60 hover:opacity-90 shadow-lg"
            style={{backgroundColor:'var(--ac)'}}>
            {loading?'Đang xử lý...':(tab==='login'?'Đăng nhập & Đồng bộ':'Tạo tài khoản')}
          </button>
        </div>

        <p className="text-center text-[11px] text-zinc-400 mt-5">
          ☁️ Dữ liệu lưu trên Supabase · Đồng bộ mọi thiết bị
        </p>
      </div>
    </div>
  );
}

// ─── Mobile Header ────────────────────────────────────────────────────────────
function MobileHeader({title,activePage,setActivePage,user,onSyncClick,syncing}:{
  title:string;activePage:string;setActivePage:(p:string)=>void;
  user:AuthUser|null;onSyncClick:()=>void;syncing:boolean;
}) {
  return (
    <header className="md:hidden sticky top-0 z-40 bg-white/80 backdrop-blur-sm border-b border-zinc-100 px-4 py-3 flex items-center justify-between">
      <button onClick={()=>setActivePage('home')} className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0" style={{backgroundColor:'var(--ac)'}}>
          <CheckCircle2 className="w-4 h-4 text-white"/>
        </div>
        <span className="text-base font-black tracking-tight">chance</span>
      </button>
      <h1 className="text-sm font-bold text-zinc-500">{title}</h1>
      <button onClick={onSyncClick}
        className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors',user?'bg-emerald-100 text-emerald-600':'bg-zinc-100 text-zinc-500')}>
        {syncing?<RefreshCw className="w-4 h-4 animate-spin"/>:user?<User className="w-4 h-4"/>:<LogIn className="w-4 h-4"/>}
      </button>
    </header>
  );
}

// ─── Bottom Nav (redesigned for mobile) ──────────────────────────────────────
const NAV_PRIMARY=[
  {id:'home',     icon:Home,         label:'Home'},
  {id:'tasks',    icon:ListTodo,     label:'Tasks'},
  {id:'habits',   icon:Flame,        label:'Habits'},
  {id:'finance',  icon:Wallet,       label:'Finance'},
  {id:'notes',    icon:StickyNote,   label:'Notes'},
];
const NAV_MORE=[
  {id:'pomodoro', icon:Timer,        label:'Pomodoro'},
  {id:'kanban',   icon:Trello,       label:'Kanban'},
  {id:'schedule', icon:CalendarDays, label:'Schedule'},
  {id:'stats',    icon:BarChart3,    label:'Stats'},
];

function BottomNav({activePage,setActivePage,user,onSyncClick,syncing}:{
  activePage:string;setActivePage:(p:string)=>void;user:AuthUser|null;onSyncClick:()=>void;syncing:boolean;
}) {
  const [showMore,setShowMore]=useState(false);
  const isMore=NAV_MORE.some(n=>n.id===activePage);
  return (
    <>
      {/* More drawer */}
      <AnimatePresence>
        {showMore&&(
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              className="md:hidden fixed inset-0 z-40" onClick={()=>setShowMore(false)}/>
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}}
              className="md:hidden fixed bottom-20 left-4 right-4 z-50 bg-white rounded-[2rem] shadow-2xl border border-zinc-100 p-4">
              <div className="grid grid-cols-4 gap-2">
                {NAV_MORE.map(item=>(
                  <button key={item.id} onClick={()=>{setActivePage(item.id);setShowMore(false);}}
                    className={cn('flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl transition-all',activePage===item.id?'text-white':'text-zinc-500 hover:bg-zinc-50')}
                    style={activePage===item.id?{backgroundColor:'var(--ac)'}:{}}>
                    <item.icon className="w-5 h-5"/>
                    <span className="text-[10px] font-bold">{item.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-zinc-100">
        <div className="flex items-center px-2 py-1">
          {NAV_PRIMARY.map(item=>(
            <button key={item.id} onClick={()=>{setActivePage(item.id);setShowMore(false);}}
              className={cn('flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-2xl transition-all',
                activePage===item.id?'text-black':'text-zinc-400 hover:text-zinc-600')}>
              <div className={cn('w-8 h-8 flex items-center justify-center rounded-2xl transition-all',activePage===item.id?'bg-zinc-100':'')} style={activePage===item.id?{}:{}}>
                <item.icon className={cn('transition-all',activePage===item.id?'w-5 h-5':'w-4.5 h-4.5 w-[18px] h-[18px]')}/>
              </div>
              <span className={cn('text-[9px] font-semibold transition-all',activePage===item.id?'font-black':'')}>{item.label}</span>
            </button>
          ))}
          {/* More button */}
          <button onClick={()=>setShowMore(s=>!s)}
            className={cn('flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-2xl transition-all',
              isMore||showMore?'text-black':'text-zinc-400 hover:text-zinc-600')}>
            <div className={cn('w-8 h-8 flex items-center justify-center rounded-2xl',isMore||showMore?'bg-zinc-100':'')}>
              <LayoutGrid className="w-[18px] h-[18px]"/>
            </div>
            <span className={cn('text-[9px] font-semibold',isMore||showMore?'font-black':'')}>{isMore?NAV_MORE.find(n=>n.id===activePage)?.label:'Thêm'}</span>
          </button>
        </div>
      </nav>
    </>
  );
}

// ─── Home Page ────────────────────────────────────────────────────────────────
function HomePage({tasks,habits,setHabits,finance,setActivePage}:
  {tasks:Task[];habits:Habit[];setHabits:(h:Habit[])=>void;finance:FinanceState;setActivePage:(p:string)=>void}) {
  const hour=new Date().getHours();
  const greeting=hour<12?'Chào buổi sáng':hour<18?'Chào buổi chiều':'Chào buổi tối';
  const today=todayIndex();
  const todayTasks=tasks.filter(t=>t.deadline===todayStr()&&t.status!=='done');
  const balance=finance.transactions.reduce((a,t)=>t.type==='expense'?a-t.amount:a+t.amount,0);

  const toggleHabit=(id:string)=>setHabits(habits.map(h=>{
    if(h.id!==id)return h;
    const c=[...h.completed];c[today]=!c[today];
    return{...h,completed:c,streak:c.filter(Boolean).length};
  }));

  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar pb-24 md:pb-10">
      <header className="mb-7">
        <p className="text-zinc-400 text-sm font-semibold mb-1">{new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'long'})}</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">{greeting} 👋</h1>
      </header>
      <div className="grid grid-cols-3 gap-3 mb-7">
        {[
          {label:'Tasks xong',value:tasks.filter(t=>t.status==='done').length,c:'bg-card-green'},
          {label:'Số dư ví',value:formatVND(balance),c:'bg-card-orange',small:true},
          {label:'Quá hạn',value:tasks.filter(t=>t.status!=='done'&&new Date(t.deadline)<new Date()).length,c:'bg-card-pink'},
        ].map(s=>(
          <div key={s.label} className={cn('p-4 rounded-[1.5rem] flex flex-col gap-1',s.c)}>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{s.label}</p>
            <p className={cn('font-black',s.small?'text-sm leading-tight':'text-3xl')}>{s.value}</p>
          </div>
        ))}
      </div>
      {todayTasks.length>0&&(
        <section className="mb-7">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold">📋 Task hôm nay</h2>
            <button onClick={()=>setActivePage('tasks')} className="text-xs font-bold text-zinc-400 hover:text-black flex items-center gap-1">Xem tất cả<ChevronRight className="w-3 h-3"/></button>
          </div>
          <div className="flex flex-col gap-2">
            {todayTasks.slice(0,4).map(t=>(
              <div key={t.id} className={cn('flex items-center gap-3 p-3 rounded-2xl',getCatColor(t.category))}>
                <div className="w-8 h-8 bg-white/70 rounded-xl flex items-center justify-center shrink-0">{getCatIcon(t.category)}</div>
                <p className="font-bold text-sm flex-1 truncate">{t.title}</p>
                {t.priority==='high'&&<span className="bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0">Hot</span>}
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold">🔥 Habit hôm nay</h2>
          <button onClick={()=>setActivePage('habits')} className="text-xs font-bold text-zinc-400 hover:text-black flex items-center gap-1">Quản lý<ChevronRight className="w-3 h-3"/></button>
        </div>
        <div className="flex flex-col gap-2">
          {habits.map(h=>(
            <div key={h.id} className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex items-center gap-4">
              <div className="flex-1">
                <p className="font-bold text-sm">{h.name}</p>
                <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">{h.streak} ngày liên tiếp 🔥</p>
              </div>
              <button onClick={()=>toggleHabit(h.id)}
                className={cn('w-10 h-10 rounded-full flex items-center justify-center transition-all font-bold text-sm border-2',
                  h.completed[today]?'bg-black text-white border-black':'bg-white text-zinc-400 border-zinc-200 hover:border-black')}>
                {h.completed[today]?'✓':'?'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Pomodoro ─────────────────────────────────────────────────────────────────
type PomMode='work'|'short'|'long';
const POM_LBL: Record<PomMode,string>={work:'Tập trung',short:'Nghỉ ngắn',long:'Nghỉ dài'};

function PomodoroPage({settings,setSettings}:{settings:AppSettings;setSettings:(s:AppSettings)=>void}) {
  const dur=useMemo(()=>({work:settings.pomoDurations.work*60,short:settings.pomoDurations.short*60,long:settings.pomoDurations.long*60}),[settings.pomoDurations]);
  const [mode,setMode]=useState<PomMode>('work');
  const [timeLeft,setTimeLeft]=useState(dur.work);
  const [isActive,setIsActive]=useState(false);
  const [sessions,setSessions]=useLocalStorage('pomo-sessions',0);
  const [showCfg,setShowCfg]=useState(false);
  const [draft,setDraft]=useState(settings.pomoDurations);
  const intRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const modeBg:Record<PomMode,string>={work:'bg-bg-chance',short:'bg-emerald-50',long:'bg-indigo-50'};
  const modeRing:Record<PomMode,string>={work:'#000',short:'#10b981',long:'#6366f1'};
  const r=108;const circ=2*Math.PI*r;
  const offset=circ*(timeLeft/dur[mode]);
  const switchMode=(m:PomMode)=>{setMode(m);setIsActive(false);setTimeLeft(dur[m]);};
  useEffect(()=>{
    if(intRef.current)clearInterval(intRef.current);
    if(isActive&&timeLeft>0)intRef.current=setInterval(()=>setTimeLeft(t=>t-1),1000);
    else if(isActive&&timeLeft===0){
      setIsActive(false);
      playBell();
      if(mode==='work')setSessions(s=>s+1);
    }
    return()=>{if(intRef.current)clearInterval(intRef.current);};
  },[isActive,timeLeft,mode,setSessions]);
  useEffect(()=>{if(!isActive)setTimeLeft(dur[mode]);},[dur,mode]);
  const fmt=(s:number)=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  return (
    <div className={cn('flex flex-col items-center justify-center min-h-screen gap-7 p-6 pb-24 md:pb-6 transition-colors duration-700',modeBg[mode])}>
      <div className="flex gap-2 bg-white/70 p-1.5 rounded-[2rem] shadow-sm flex-wrap justify-center">
        {(Object.keys(dur)as PomMode[]).map(m=>(
          <button key={m} onClick={()=>switchMode(m)}
            className={cn('px-5 py-2 rounded-[1.5rem] text-sm font-bold transition-all',mode===m?'text-white shadow-lg':'text-zinc-500 hover:bg-white')}
            style={mode===m?{backgroundColor:'var(--ac)'}:{}}>{POM_LBL[m]}</button>
        ))}
      </div>
      <div className="relative flex items-center justify-center">
        <svg width="260" height="260" className="-rotate-90">
          <circle cx="130" cy="130" r={r} fill="none" stroke="#e4e4e7" strokeWidth="10"/>
          <circle cx="130" cy="130" r={r} fill="none" stroke={modeRing[mode]} strokeWidth="10"
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
            style={{transition:'stroke-dashoffset 0.6s ease,stroke 0.4s ease'}}/>
        </svg>
        <div className="absolute flex flex-col items-center select-none">
          <span className="text-5xl font-black tracking-tighter">{fmt(timeLeft)}</span>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.4em] mt-2">{POM_LBL[mode]}</span>
        </div>
      </div>
      <div className="flex gap-5 items-center">
        <button onClick={()=>{setIsActive(false);setTimeLeft(dur[mode]);}} className="w-14 h-14 bg-white border-2 border-zinc-200 rounded-full flex items-center justify-center hover:bg-zinc-50 active:scale-95">
          <RotateCcw className="w-5 h-5 text-zinc-400"/>
        </button>
        <button onClick={()=>setIsActive(a=>!a)} className="w-20 h-20 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-transform" style={{backgroundColor:'var(--ac)'}}>
          {isActive?<Pause className="w-8 h-8 fill-white"/>:<Play className="w-8 h-8 fill-white ml-1"/>}
        </button>
        <button onClick={()=>setShowCfg(s=>!s)} className="w-14 h-14 bg-white border-2 border-zinc-200 rounded-full flex flex-col items-center justify-center gap-0.5 hover:bg-zinc-50">
          <Zap className="w-4 h-4 text-zinc-400"/>
          <span className="text-[10px] font-black text-zinc-500">{sessions}</span>
        </button>
      </div>
      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{sessions} phiên xong hôm nay</p>
      <AnimatePresence>
        {showCfg&&(
          <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:16}} className="bg-white rounded-[2rem] p-6 shadow-xl w-full max-w-xs">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">Tùy chỉnh thời gian</h3>
              <button onClick={()=>setShowCfg(false)} className="w-7 h-7 bg-zinc-100 rounded-full flex items-center justify-center"><X className="w-3.5 h-3.5"/></button>
            </div>
            {([{key:'work',label:'Tập trung (phút)',min:5,max:90},{key:'short',label:'Nghỉ ngắn (phút)',min:1,max:30},{key:'long',label:'Nghỉ dài (phút)',min:5,max:60}]as const).map(({key,label,min,max})=>(
              <div key={key} className="mb-4">
                <div className="flex justify-between mb-1"><label className="text-xs font-bold text-zinc-500">{label}</label><span className="text-sm font-black">{draft[key]}</span></div>
                <input type="range" min={min} max={max} value={draft[key]} step={1} onChange={e=>setDraft({...draft,[key]:Number(e.target.value)})} className="w-full accent-black"/>
              </div>
            ))}
            <button onClick={()=>{setSettings({...settings,pomoDurations:draft});setIsActive(false);setShowCfg(false);}} className="w-full bg-black text-white py-3 rounded-2xl font-bold text-sm">Lưu & Áp dụng</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Audio bell ───────────────────────────────────────────────────────────────
function playBell() {
  try {
    const ctx=new (window.AudioContext||(window as any).webkitAudioContext)();
    [[880,0],[660,0.15],[440,0.35]].forEach(([freq,delay])=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);
      osc.frequency.value=freq;osc.type='sine';
      gain.gain.setValueAtTime(0.4,ctx.currentTime+delay);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+delay+1);
      osc.start(ctx.currentTime+delay);osc.stop(ctx.currentTime+delay+1.1);
    });
  }catch{}
}


function DeadlineBar({createdAt,deadline}:{createdAt:string;deadline:string}) {
  const start=new Date(createdAt).getTime(),end=new Date(deadline).getTime(),now=Date.now();
  const pct=Math.min(100,Math.max(0,((now-start)/(end-start))*100));
  const dLeft=Math.ceil((end-now)/86400000);
  const isOver=now>end,isNear=!isOver&&dLeft<=2,isToday=!isOver&&dLeft===0;
  const barColor=isOver?'#ef4444':isNear?'#f97316':'var(--ac)';
  const label=isOver?`Quá hạn ${Math.abs(dLeft)} ngày`:isToday?'Hết hạn hôm nay!':`Còn ${dLeft} ngày`;
  const flameSize=isOver?22:isToday?20:isNear?16:12;
  return (
    <div className="w-full mt-1">
      <div className="w-full h-2 bg-white/50 rounded-full relative overflow-visible flex items-center">
        <div className="h-full rounded-full transition-all duration-1000" style={{width:`${pct}%`,backgroundColor:barColor}}/>
        <span
          className={cn('absolute -translate-y-1/2 transition-all duration-500 leading-none select-none',isOver?'pulsered':isNear?'animate-bounce':'')}
          style={{left:`calc(${Math.min(pct,95)}% - ${flameSize/2}px)`,fontSize:`${flameSize}px`,top:'50%'}}>
          {isOver?'💀':'🔥'}
        </span>
      </div>
      <p className={cn('text-[10px] font-bold mt-2',isOver?'text-red-500':isNear||isToday?'text-orange-500':'text-zinc-400')}>{label}</p>
    </div>
  );
}

// ─── TagInput with suggestions ────────────────────────────────────────────────
function TagInput({value,onChange,allTags,placeholder='#hashtag1 #hashtag2'}:{
  value:string;onChange:(v:string)=>void;allTags:string[];placeholder?:string;
}) {
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};
    document.addEventListener('mousedown',h);
    return()=>document.removeEventListener('mousedown',h);
  },[]);

  // Tags already in the input
  const existingTags=value.split(/[\s,]+/).filter(s=>s.startsWith('#'));

  // Filter suggestions: allTags not already typed, match current partial word
  const lastWord=value.split(/\s+/).at(-1)??'';
  const suggestions=allTags.filter(t=>
    !existingTags.includes(t) &&
    (lastWord===''||lastWord===' '||(lastWord.startsWith('#')&&t.includes(lastWord.slice(1))))
  );

  const pickTag=(tag:string)=>{
    // Replace the partial last word with the full tag
    const parts=value.split(/\s+/);
    const lastPart=parts.at(-1)??'';
    if(lastPart.startsWith('#')) parts[parts.length-1]=tag;
    else parts.push(tag);
    onChange(parts.join(' ')+' ');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <input type="text" placeholder={placeholder} value={value}
        onChange={e=>{onChange(e.target.value);setOpen(true);}}
        onFocus={()=>setOpen(true)}
        className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold text-sm outline-none focus:border-black"/>
      <AnimatePresence>
        {open&&suggestions.length>0&&(
          <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}}
            className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-100 rounded-2xl shadow-xl z-50 overflow-hidden max-h-40 overflow-y-auto no-scrollbar">
            {suggestions.slice(0,10).map(tag=>(
              <button key={tag} onMouseDown={e=>{e.preventDefault();pickTag(tag);}}
                className="w-full text-left px-4 py-2.5 text-sm font-bold hover:bg-zinc-50 transition-colors flex items-center gap-2">
                <Hash className="w-3.5 h-3.5 text-zinc-400 shrink-0"/>
                {tag}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Task Modals ──────────────────────────────────────────────────────────────
function EditTaskModal({task,categories,allTags,onSave,onClose}:{task:Task;categories:string[];allTags:string[];onSave:(t:Task)=>void;onClose:()=>void}) {
  const [t,setT]=useState({...task});
  const [tagInput,setTagInput]=useState((task.tags??[]).join(' '));
  const save=()=>{
    const tags=tagInput.split(/[\s,]+/).filter(s=>s.startsWith('#')).map(s=>s.toLowerCase());
    onSave({...t,tags});onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-[100] p-4">
      <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}} className="bg-white rounded-[2rem] p-7 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-5"><h2 className="text-xl font-bold">Chỉnh sửa task</h2><button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><X className="w-4 h-4"/></button></div>
        <div className="flex flex-col gap-4">
          <input type="text" value={t.title} onChange={e=>setT({...t,title:e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Độ ưu tiên</p>
              {(['high','medium','low']as Priority[]).map(p=>(
                <button key={p} onClick={()=>setT({...t,priority:p})} className={cn('w-full mb-1 px-3 py-2 rounded-xl text-sm font-bold transition-all text-left',t.priority===p?'bg-black text-white':'bg-zinc-50 text-zinc-500 hover:bg-zinc-100')}>
                  {p==='high'?'Cao':p==='medium'?'Trung bình':'Thấp'}
                </button>
              ))}
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Danh mục</p>
              <div className="overflow-y-auto max-h-[120px] flex flex-col gap-1">
                {categories.map(c=>(<button key={c} onClick={()=>setT({...t,category:c})} className={cn('w-full px-3 py-2 rounded-xl text-sm font-bold transition-all text-left',t.category===c?'bg-black text-white':'bg-zinc-50 text-zinc-500 hover:bg-zinc-100')}>{c}</button>))}
              </div>
            </div>
          </div>
          <input type="date" value={t.deadline} onChange={e=>setT({...t,deadline:e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>
          <TagInput value={tagInput} onChange={setTagInput} allTags={allTags}/>
          <div className="flex gap-2">
            {(['todo','in-progress','done']as Status[]).map(s=>(
              <button key={s} onClick={()=>setT({...t,status:s})} className={cn('flex-1 py-2 rounded-xl text-xs font-bold transition-all',t.status===s?'bg-black text-white':'bg-zinc-50 text-zinc-500 hover:bg-zinc-100')}>
                {s==='todo'?'Chưa':s==='in-progress'?'Đang làm':'Xong'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={save} className="mt-5 w-full bg-black text-white py-3.5 rounded-2xl font-bold hover:bg-zinc-800">Lưu thay đổi</button>
      </motion.div>
    </div>
  );
}

function AddTaskModal({categories,allTags,onAdd,onClose}:{categories:string[];allTags:string[];onAdd:(t:Task)=>void;onClose:()=>void}) {
  const [title,setTitle]=useState('');
  const [priority,setPriority]=useState<Priority>('medium');
  const [category,setCategory]=useState(categories[0]??'Study');
  const [deadline,setDeadline]=useState(todayStr());
  const [tagInput,setTagInput]=useState('');
  const submit=()=>{
    if(!title.trim())return;
    const tags=tagInput.split(/[\s,]+/).filter(s=>s.startsWith('#')).map(s=>s.toLowerCase());
    onAdd({id:Date.now().toString(),title:title.trim(),status:'todo',priority,category,deadline,createdAt:todayStr(),tags});
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-[100] p-4">
      <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}} className="bg-white rounded-[2rem] p-7 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-5"><h2 className="text-xl font-bold">Task mới</h2><button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><X className="w-4 h-4"/></button></div>
        <div className="flex flex-col gap-4">
          <input autoFocus type="text" placeholder="Tên task..." value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Ưu tiên</p>
              {(['high','medium','low']as Priority[]).map(p=>(<button key={p} onClick={()=>setPriority(p)} className={cn('w-full mb-1 px-3 py-2 rounded-xl text-sm font-bold transition-all text-left',priority===p?'bg-black text-white':'bg-zinc-50 text-zinc-500 hover:bg-zinc-100')}>{p==='high'?'Cao':p==='medium'?'Trung bình':'Thấp'}</button>))}
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Danh mục</p>
              <div className="overflow-y-auto max-h-[120px] flex flex-col gap-1">
                {categories.map(c=>(<button key={c} onClick={()=>setCategory(c)} className={cn('w-full px-3 py-2 rounded-xl text-sm font-bold transition-all text-left',category===c?'bg-black text-white':'bg-zinc-50 text-zinc-500 hover:bg-zinc-100')}>{c}</button>))}
              </div>
            </div>
          </div>
          <input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)} className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>
          <TagInput value={tagInput} onChange={setTagInput} allTags={allTags}/>
        </div>
        <button onClick={submit} className="mt-5 w-full bg-black text-white py-3.5 rounded-2xl font-bold hover:bg-zinc-800">Thêm task</button>
      </motion.div>
    </div>
  );
}

// ─── Task List ────────────────────────────────────────────────────────────────
function TaskListPage({tasks,setTasks,categories,onTaskDone,onTaskUndo}:{
  tasks:Task[];setTasks:(t:Task[])=>void;categories:string[];
  onTaskDone:(t:Task)=>void;onTaskUndo:(t:Task)=>void;
}) {
  const [activeCat,setActiveCat]=useState<string>('All');
  const [activeTag,setActiveTag]=useState<string>('');
  const [filterMode,setFilterMode]=useState<'cat'|'tag'>('cat');
  const [showAdd,setShowAdd]=useState(false);
  const [editTask,setEditTask]=useState<Task|null>(null);
  const [search,setSearch]=useState('');

  const allTags=useMemo(()=>{const s=new Set<string>();tasks.forEach(t=>(t.tags??[]).forEach(g=>s.add(g)));return[...s].sort();},[tasks]);
  const filtered=useMemo(()=>sortByDeadlinePriority(tasks.filter(t=>{
    const tags=t.tags??[];
    const matchSearch=t.title.toLowerCase().includes(search.toLowerCase())||tags.some(g=>g.includes(search.toLowerCase()));
    const matchCat=filterMode==='cat'?(activeCat==='All'||t.category===activeCat):true;
    const matchTag=filterMode==='tag'?tags.includes(activeTag):true;
    return matchSearch&&matchCat&&matchTag;
  })),[tasks,search,activeCat,activeTag,filterMode]);

  const toggleDone=(id:string)=>{
    const task=tasks.find(t=>t.id===id)!;
    const wasDone=task.status==='done';
    if(!wasDone){
      // Mark done → useEffect in App will auto-archive it
      setTasks(tasks.map(t=>t.id===id?{...t,status:'done' as Status}:t));
      onTaskDone(task);
    } else {
      // Already done (shouldn't normally appear in list), undo
      onTaskUndo(task);
    }
  };

  return (
    <div className="p-6 md:p-8 min-h-screen no-scrollbar pb-24 md:pb-10">
      <header className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-1">Tasks</h1>
          <p className="text-zinc-400 text-sm">{tasks.filter(t=>t.status!=='done').length} còn lại · {tasks.filter(t=>t.status==='done').length} xong</p>
        </div>
        <button onClick={()=>setShowAdd(true)} className="text-white px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg hover:opacity-90 text-sm shrink-0" style={{backgroundColor:'var(--ac)'}}>
          <Plus className="w-4 h-4"/> Thêm
        </button>
      </header>
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"/>
        <input type="text" placeholder="Tìm task hoặc #hashtag..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full bg-white border border-zinc-100 rounded-2xl pl-11 pr-4 py-2.5 font-semibold text-sm outline-none focus:border-black shadow-sm"/>
      </div>
      <div className="flex gap-2 mb-3">
        {(['cat','tag']as const).map(m=>(
          <button key={m} onClick={()=>setFilterMode(m)} className={cn('px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1',filterMode===m?'bg-black text-white':'bg-white text-zinc-500 border border-zinc-200')}>
            {m==='tag'&&<Hash className="w-3 h-3"/>}{m==='cat'?'Danh mục':'Hashtag'}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 no-scrollbar">
        {filterMode==='cat'?(
          ['All',...categories].map(cat=>(
            <button key={cat} onClick={()=>setActiveCat(cat)} className={cn('px-4 py-2 rounded-2xl text-sm font-bold transition-all shrink-0',activeCat===cat?'text-white':'bg-white text-zinc-500 hover:bg-zinc-100')} style={activeCat===cat?{backgroundColor:'var(--ac)'}:{}}>{cat}</button>
          ))
        ):allTags.length===0?(
          <p className="text-xs text-zinc-400 py-2">Chưa có hashtag nào.</p>
        ):(
          allTags.map(tag=>(
            <button key={tag} onClick={()=>setActiveTag(tag)} className={cn('px-4 py-2 rounded-2xl text-sm font-bold transition-all shrink-0',activeTag===tag?'text-white':'bg-white text-zinc-500 hover:bg-zinc-100')} style={activeTag===tag?{backgroundColor:'var(--ac)'}:{}}>{tag}</button>
          ))
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnimatePresence>
          {filtered.map((task,i)=>(
            <motion.div key={task.id} layout initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.95}} transition={{delay:i*0.04}}
              className={cn('p-5 rounded-[2rem] flex flex-col gap-3 relative group',getCatColor(task.category),task.status==='done'&&'opacity-50')}>
              <div className="flex justify-between items-start">
                <div className="w-9 h-9 bg-white/80 rounded-2xl flex items-center justify-center shrink-0">{getCatIcon(task.category)}</div>
                <div className="flex gap-1.5 items-center">
                  {task.priority==='high'&&<span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[9px] font-bold uppercase">Cao</span>}
                  <button onClick={()=>setEditTask(task)} className="w-7 h-7 bg-white/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-100"><Pencil className="w-3.5 h-3.5 text-blue-500"/></button>
                  <button onClick={()=>setTasks(tasks.filter(t=>t.id!==task.id))} className="w-7 h-7 bg-white/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100"><Trash2 className="w-3.5 h-3.5 text-red-500"/></button>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">{task.category}</p>
                <h3 className={cn('text-base font-bold leading-snug',task.status==='done'&&'line-through')}>{task.title}</h3>
                {(task.tags??[]).length>0&&(
                  <div className="flex gap-1 flex-wrap mt-2">
                    {(task.tags??[]).map(tag=>(<span key={tag} className="bg-white/60 text-zinc-600 px-2 py-0.5 rounded-lg text-[10px] font-bold">{tag}</span>))}
                  </div>
                )}
              </div>
              <div className="mt-auto">
                {task.status!=='done'&&<DeadlineBar createdAt={task.createdAt} deadline={task.deadline}/>}
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
      {filtered.length===0&&<div className="flex flex-col items-center py-20 text-zinc-300"><Circle className="w-14 h-14 mb-3 opacity-30"/><p className="font-bold">Không có task nào</p></div>}
      <AnimatePresence>
        {showAdd&&<AddTaskModal categories={categories} allTags={allTags} onAdd={t=>{setTasks([t,...tasks]);setShowAdd(false);}} onClose={()=>setShowAdd(false)}/>}
        {editTask&&<EditTaskModal task={editTask} categories={categories} allTags={allTags} onSave={u=>setTasks(tasks.map(t=>t.id===u.id?u:t))} onClose={()=>setEditTask(null)}/>}
      </AnimatePresence>
    </div>
  );
}

// ─── Kanban ───────────────────────────────────────────────────────────────────
const PRIORITY_ORDER:Record<string,number>={high:0,medium:1,low:2};
function sortByDeadlinePriority(items:Task[]):Task[] {
  return [...items].sort((a,b)=>{
    const dl=a.deadline.localeCompare(b.deadline);
    if(dl!==0) return dl;
    return (PRIORITY_ORDER[a.priority]??1)-(PRIORITY_ORDER[b.priority]??1);
  });
}


  {id:'todo',title:'To Do',color:'bg-zinc-50'},
  {id:'in-progress',title:'In Progress',color:'bg-blue-50'},
  {id:'done',title:'Done',color:'bg-emerald-50'},
] as any);

function KanbanPage({tasks,setTasks,archived,setArchived}:{tasks:Task[];setTasks:(t:Task[])=>void;archived:Task[];setArchived:(t:Task[])=>void}) {
  const dragId=useRef<string|null>(null);
  const today=new Date();
  const [cm,setCm]=useState({year:today.getFullYear(),month:today.getMonth()});
  const [selDay,setSelDay]=useState<number|null>(null);
  const [showArch,setShowArch]=useState(false);
  const MONTHS=['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
  const daysInMonth=new Date(cm.year,cm.month+1,0).getDate();
  const startOffset=(new Date(cm.year,cm.month,1).getDay()+6)%7;
  const deadlines=new Map<number,Task[]>();
  tasks.forEach(t=>{const d=new Date(t.deadline);if(d.getFullYear()===cm.year&&d.getMonth()===cm.month)deadlines.set(d.getDate(),[...(deadlines.get(d.getDate())??[]),t]);});
  const move=(id:string,s:Status)=>setTasks(tasks.map(t=>t.id===id?{...t,status:s}:t));
  const selTasks=selDay?(deadlines.get(selDay)??[]):[];
  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar flex flex-col gap-7 pb-24 md:pb-10">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Kanban Board</h2>
        <button onClick={()=>setShowArch(true)} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 rounded-2xl text-xs font-bold text-zinc-600 hover:bg-zinc-200">
          <Archive className="w-3.5 h-3.5"/> Lưu trữ ({archived.length})
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {KCOLS.map((col:any)=>(
          <div key={col.id} className={cn('p-5 rounded-[2rem] flex flex-col gap-3 min-h-[180px]',col.color)}
            onDragOver={e=>e.preventDefault()} onDrop={()=>{if(dragId.current)move(dragId.current,col.id);dragId.current=null;}}>
            <div className="flex justify-between items-center">
              <h3 className="font-bold">{col.title}</h3>
              <span className="bg-white/70 px-2.5 py-0.5 rounded-lg text-xs font-bold">{tasks.filter(t=>t.status===col.id).length}</span>
            </div>
            {sortByDeadlinePriority(tasks.filter(t=>t.status===col.id)).map(task=>(
              <div key={task.id} draggable onDragStart={()=>{dragId.current=task.id;}}
                className="bg-white p-3.5 rounded-2xl shadow-sm border border-zinc-100 cursor-grab active:cursor-grabbing hover:shadow-md transition-all select-none">
                <div className="flex justify-between items-start mb-2">
                  <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-md uppercase',task.priority==='high'?'bg-red-100 text-red-600':task.priority==='medium'?'bg-yellow-100 text-yellow-700':'bg-zinc-100 text-zinc-600')}>{task.priority}</span>
                  <GripVertical className="w-4 h-4 text-zinc-300"/>
                </div>
                <p className="text-sm font-bold leading-snug mb-2">{task.title}</p>
                {(task.tags??[]).length>0&&<div className="flex gap-1 flex-wrap mb-2">{(task.tags??[]).map(tag=><span key={tag} className="bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded text-[9px] font-bold">{tag}</span>)}</div>}
                <div className="flex items-center gap-1 text-[9px] font-bold text-zinc-400"><Clock className="w-3 h-3"/>{task.deadline}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
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
            const t4d=deadlines.get(d)??[];
            const isToday=d===today.getDate()&&cm.month===today.getMonth()&&cm.year===today.getFullYear();
            const isSel=selDay===d;
            return (
              <button key={d} onClick={()=>setSelDay(isSel?null:d)}
                className={cn('h-11 md:h-14 p-1.5 rounded-xl border transition-all flex flex-col text-left',
                  isSel?'border-2 ring-2 ring-black/20 bg-zinc-100':isToday?'bg-black border-black':t4d.length>0?'bg-red-50 border-red-100':'bg-zinc-50/50 border-transparent hover:bg-zinc-100')}>
                <span className={cn('text-xs font-bold',isSel&&isToday?'text-white':isToday?'text-white':isSel?'text-black':t4d.length>0?'text-red-500':'text-zinc-500')}>{d}</span>
                {t4d.length>0&&<div className={cn('mt-auto w-1.5 h-1.5 rounded-full animate-pulse',isToday?'bg-orange-400':'bg-red-500')}/>}
              </button>
            );
          })}
        </div>
        <AnimatePresence>
          {selDay&&(
            <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="mt-4 overflow-hidden">
              <div className="border-t border-zinc-100 pt-4">
                <p className="text-sm font-bold text-zinc-500 mb-3">📅 Ngày {selDay}/{cm.month+1} — {selTasks.length>0?`${selTasks.length} task deadline`:'Không có task'}</p>
                <div className="flex flex-col gap-2">
                  {selTasks.map(t=>(
                    <div key={t.id} className={cn('flex items-center gap-3 p-3 rounded-2xl',getCatColor(t.category))}>
                      <div className="w-7 h-7 bg-white/70 rounded-xl flex items-center justify-center shrink-0">{getCatIcon(t.category)}</div>
                      <div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{t.title}</p><p className="text-[10px] text-zinc-500">{t.category} · {t.priority}</p></div>
                      <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full uppercase',t.status==='done'?'bg-emerald-500 text-white':t.status==='in-progress'?'bg-blue-500 text-white':'bg-white text-zinc-500')}>{t.status==='done'?'Xong':t.status==='in-progress'?'Đang làm':'Chưa'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
      <AnimatePresence>
        {showArch&&(
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.95}} className="bg-white rounded-[2rem] p-7 w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-5 shrink-0">
                <div><h2 className="text-xl font-bold flex items-center gap-2"><Archive className="w-5 h-5"/> Lưu trữ</h2><p className="text-xs text-zinc-400 mt-0.5">{archived.length} tasks</p></div>
                <button onClick={()=>setShowArch(false)} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><X className="w-4 h-4"/></button>
              </div>
              <div className="overflow-y-auto flex flex-col gap-2 no-scrollbar">
                {archived.length===0?<p className="text-center text-zinc-400 py-8">Chưa có task nào.</p>:archived.map(t=>{
                const daysLeft=t.archivedAt?30-Math.floor((Date.now()-new Date(t.archivedAt).getTime())/86400000):30;
                return (
                  <div key={t.id} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-2xl group">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate line-through text-zinc-400">{t.title}</p>
                      <p className="text-[10px] text-zinc-400">{t.category} · Xóa sau {Math.max(0,daysLeft)} ngày</p>
                    </div>
                  </div>
                );
              })}
              </div>
              {archived.length>0&&<button onClick={()=>{setArchived([]);setShowArch(false);}} className="mt-4 w-full py-3 bg-red-50 text-red-500 rounded-2xl text-sm font-bold hover:bg-red-100 shrink-0">Xóa toàn bộ lưu trữ</button>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Habits ───────────────────────────────────────────────────────────────────
function HabitItem({habit,onToggle,onDelete,onRename}:{habit:Habit;onToggle:(id:string,day:number)=>void;onDelete:(id:string)=>void;onRename:(id:string,name:string)=>void}) {
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState(habit.name);
  const commit=()=>{if(name.trim())onRename(habit.id,name.trim());setEditing(false);};
  const thisWeekPct=Math.round(((habit.streak??0)/7)*100);
  return (
    <div className="bg-white p-4 rounded-[2rem] shadow-sm flex flex-col gap-3 group">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0 pr-2">
          {editing
            ?<input autoFocus value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setEditing(false);}} className="font-bold text-sm bg-zinc-50 border border-zinc-200 rounded-xl px-2 py-1 outline-none focus:border-black w-full"/>
            :<h3 className="font-bold text-sm truncate">{habit.name}</h3>
          }
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold text-zinc-400">{(habit.streak??0)}/7 ngày tuần này</span>
            {(habit.weeklyStreak??0)>0&&<span className="text-[10px] font-bold text-orange-500">🔥 {habit.weeklyStreak} tuần</span>}
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
          {editing
            ?<button onClick={commit} className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center"><Check className="w-3.5 h-3.5 text-emerald-600"/></button>
            :<button onClick={()=>setEditing(true)} className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center"><Pencil className="w-3.5 h-3.5 text-blue-500"/></button>
          }
          <button onClick={()=>onDelete(habit.id)} className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center"><Trash2 className="w-3.5 h-3.5 text-red-500"/></button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{width:`${thisWeekPct}%`,backgroundColor:'var(--ac)'}}/>
      </div>
      {/* Day buttons */}
      <div className="flex gap-1">
        {DAY_SHORT.map((d,i)=>(
          <button key={i} onClick={()=>onToggle(habit.id,i)}
            className={cn('flex-1 h-9 rounded-xl flex items-center justify-center text-[9px] font-bold transition-all hover:scale-105 active:scale-95',
              (habit.completed??[])[i]?'text-white':'bg-zinc-100 text-zinc-400 hover:bg-zinc-200')}
            style={(habit.completed??[])[i]?{backgroundColor:'var(--ac)'}:{}}>
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}
function HabitCol({title,habits,color,onToggle,onAdd,onDelete,onRename}:{title:string;habits:Habit[];color:string;onToggle:(id:string,day:number)=>void;onAdd:(name:string)=>void;onDelete:(id:string)=>void;onRename:(id:string,name:string)=>void}) {
  const [adding,setAdding]=useState(false);const [name,setName]=useState('');
  const commit=()=>{if(name.trim()){onAdd(name.trim());setName('');setAdding(false);}};
  return (
    <div className={cn('flex-1 p-6 rounded-[2.5rem] flex flex-col gap-4 min-w-[260px]',color)}>
      <div className="flex justify-between items-center"><h2 className="text-xl font-bold">{title}</h2><button onClick={()=>setAdding(true)} className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm hover:scale-110 transition-transform"><Plus className="w-4 h-4"/></button></div>
      <AnimatePresence>{adding&&<motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="bg-white rounded-2xl p-3 flex gap-2"><input autoFocus type="text" placeholder="Tên habit..." value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setAdding(false);}} className="flex-1 bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-black"/><button onClick={commit} className="px-3 py-2 bg-black text-white rounded-xl text-xs font-bold">Thêm</button><button onClick={()=>setAdding(false)} className="px-2 bg-zinc-100 rounded-xl"><X className="w-3.5 h-3.5"/></button></motion.div>}</AnimatePresence>
      <div className="flex flex-col gap-3">{habits.map(h=><HabitItem key={h.id} habit={h} onToggle={onToggle} onDelete={onDelete} onRename={onRename}/>)}{habits.length===0&&<p className="text-xs text-center text-zinc-400 py-4">Nhấn + để thêm habit.</p>}</div>
    </div>
  );
}
function HabitTrackerPage({habits,setHabits}:{habits:Habit[];setHabits:(h:Habit[])=>void}) {
  // Auto-reset completed[] when a new ISO week starts — streak/weeklyStreak preserved
  useEffect(()=>{
    const thisWeek=getISOWeek();
    const needsReset=habits.some(h=>(h.lastResetWeek??'')!==thisWeek);
    if(!needsReset)return;
    setHabits(habits.map(h=>{
      if((h.lastResetWeek??'')===thisWeek)return h;
      const hadAnyDone=(h.completed??[]).some(Boolean);
      return{
        ...h,
        completed:Array(7).fill(false),
        streak:0,
        weeklyStreak:hadAnyDone?(h.weeklyStreak??0)+1:0,
        lastResetWeek:thisWeek,
      };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const toggle=(id:string,day:number)=>setHabits(habits.map(h=>{
    if(h.id!==id)return h;
    const c=[...h.completed];c[day]=!c[day];
    return{...h,completed:c,streak:c.filter(Boolean).length};
  }));
  const del=(id:string)=>setHabits(habits.filter(h=>h.id!==id));
  const rename=(id:string,name:string)=>setHabits(habits.map(h=>h.id===id?{...h,name}:h));
  const add=(group:'study'|'life')=>(name:string)=>setHabits([...habits,{
    id:Date.now().toString(),name,streak:0,weeklyStreak:0,
    completed:Array(7).fill(false),group,lastResetWeek:getISOWeek(),
  }]);
  return (
    <div className="p-4 md:p-8 min-h-screen flex flex-col md:flex-row gap-4 md:gap-5 overflow-y-auto no-scrollbar pb-28 md:pb-10">
      <HabitCol title="Study Habits" habits={habits.filter(h=>h.group==='study')} color="bg-card-blue" onToggle={toggle} onAdd={add('study')} onDelete={del} onRename={rename}/>
      <HabitCol title="Life Habits"  habits={habits.filter(h=>h.group==='life')}  color="bg-card-green" onToggle={toggle} onAdd={add('life')}  onDelete={del} onRename={rename}/>
    </div>
  );
}

// ─── Schedule Page ────────────────────────────────────────────────────────────
const HOUR_H=52;const START_H=0;const END_H=24;
const HOURS=Array.from({length:END_H-START_H},(_,i)=>START_H+i);
function parseTime(t:string):number{const[h,m]=t.split(':').map(Number);return h*60+m;}
function eventTop(e:ScheduleEvent):number{return parseTime(e.startTime)/60*HOUR_H;}
function eventHeight(e:ScheduleEvent):number{return Math.max(8,(parseTime(e.endTime)-parseTime(e.startTime))/60*HOUR_H);}

function EventModal({event,onSave,onDelete,onClose}:{event:ScheduleEvent|null;onSave:(e:ScheduleEvent)=>void;onDelete:(id:string)=>void;onClose:()=>void}) {
  const [title,setTitle]=useState(event?.title??'');
  const [startTime,setStartTime]=useState(event?.startTime??'09:00');
  const [endTime,setEndTime]=useState(event?.endTime??'10:00');
  const [days,setDays]=useState<number[]>(event?.days??[0,1,2,3,4]);
  const [color,setColor]=useState(event?.color??'#D0E7FF');
  const [note,setNote]=useState(event?.note??'');
  const toggleDay=(d:number)=>setDays(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d].sort());
  const submit=()=>{
    if(!title.trim()||days.length===0)return;
    onSave({id:event?.id??Date.now().toString(),title:title.trim(),startTime,endTime,days,color,note:note.trim()});
  };
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-[100] p-4">
      <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}} className="bg-white rounded-[2rem] p-7 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-5"><h2 className="text-lg font-bold">{event?'Chỉnh sửa hoạt động':'Thêm hoạt động'}</h2><button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center"><X className="w-4 h-4"/></button></div>
        <div className="flex flex-col gap-4">
          <input autoFocus type="text" placeholder="Tên hoạt động..." value={title} onChange={e=>setTitle(e.target.value)} className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold outline-none focus:border-black"/>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Bắt đầu</p><input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-3 py-2.5 font-bold outline-none focus:border-black"/></div>
            <div><p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Kết thúc</p><input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-3 py-2.5 font-bold outline-none focus:border-black"/></div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Lặp lại (chọn ngày trong tuần)</p>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_SHORT.map((d,i)=>(
                <button key={i} onClick={()=>toggleDay(i)} className={cn('w-9 h-9 rounded-xl text-xs font-bold transition-all',days.includes(i)?'text-white':'bg-zinc-100 text-zinc-400')} style={days.includes(i)?{backgroundColor:'var(--ac)'}:{}}>{d}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Màu</p>
            <div className="flex gap-2 flex-wrap">{SCHED_COLORS.map(c=><button key={c.bg} onClick={()=>setColor(c.bg)} title={c.label} className={cn('w-8 h-8 rounded-full border-2 transition-all',color===c.bg?'border-black scale-110':'border-transparent')} style={{backgroundColor:c.bg}}/>)}</div>
          </div>
          <input type="text" placeholder="Ghi chú (tùy chọn)..." value={note} onChange={e=>setNote(e.target.value)} className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 font-semibold text-sm outline-none focus:border-black"/>
        </div>
        <div className="flex gap-3 mt-5">
          {event&&<button onClick={()=>onDelete(event.id)} className="w-11 h-11 bg-red-50 rounded-2xl flex items-center justify-center hover:bg-red-100 shrink-0"><Trash2 className="w-4 h-4 text-red-500"/></button>}
          <button onClick={submit} className="flex-1 text-white py-3 rounded-2xl font-bold hover:opacity-90" style={{backgroundColor:'var(--ac)'}}>{event?'Lưu thay đổi':'Thêm hoạt động'}</button>
        </div>
      </motion.div>
    </div>
  );
}

function SchedulePage({events,setEvents}:{events:ScheduleEvent[];setEvents:(e:ScheduleEvent[])=>void}) {
  const [viewMode,setViewMode]=useState<'grid'|'list'>('grid');
  const [showAdd,setShowAdd]=useState(false);
  const [editEv,setEditEv]=useState<ScheduleEvent|null>(null);
  const [selDay,setSelDay]=useState(todayIndex());
  const scrollRef=useRef<HTMLDivElement>(null);

  // Scroll to current hour on mount
  useEffect(()=>{
    if(viewMode==='grid'&&scrollRef.current){
      const h=new Date().getHours();
      const top=Math.max(0,(h-1)*HOUR_H-40);
      scrollRef.current.scrollTo({top,behavior:'smooth'});
    }
  },[viewMode]);

  const eventsForDay=(day:number)=>events.filter(e=>e.days.includes(day)).sort((a,b)=>parseTime(a.startTime)-parseTime(b.startTime));

  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar pb-24 md:pb-10">
      <header className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-1">Thời Khóa Biểu</h1>
          <p className="text-zinc-400 text-sm">{events.length} hoạt động lặp lại hàng tuần</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex bg-zinc-100 p-1 rounded-2xl gap-1">
            <button onClick={()=>setViewMode('grid')} className={cn('p-2 rounded-xl transition-all',viewMode==='grid'?'bg-white shadow-sm':'hover:bg-white/50')}><LayoutGrid className="w-4 h-4"/></button>
            <button onClick={()=>setViewMode('list')} className={cn('p-2 rounded-xl transition-all',viewMode==='list'?'bg-white shadow-sm':'hover:bg-white/50')}><List className="w-4 h-4"/></button>
          </div>
          <button onClick={()=>setShowAdd(true)} className="text-white px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg text-sm" style={{backgroundColor:'var(--ac)'}}><Plus className="w-4 h-4"/>Thêm</button>
        </div>
      </header>

      {/* GRID VIEW */}
      {viewMode==='grid'&&(
        <div ref={scrollRef} className="overflow-auto" style={{maxHeight:'calc(100vh - 180px)',scrollBehavior:'smooth'}}>
          <div style={{minWidth:'560px'}}>
            <div className="flex sticky top-0 z-10 bg-bg-chance pb-1 pt-0" style={{paddingLeft:'44px'}}>
              {DAY_SHORT.map((d,i)=>(
                <div key={d} className={cn('flex-1 text-center text-xs font-bold py-2 rounded-xl mx-0.5',i===todayIndex()?'bg-black text-white':'text-zinc-400')}>
                  {d}
                </div>
              ))}
            </div>
            <div className="flex">
              <div className="shrink-0" style={{width:'44px'}}>
                {HOURS.map(h=>(
                  <div key={h} style={{height:`${HOUR_H}px`}} className="flex items-start justify-end pr-2 border-t border-zinc-100 first:border-t-0">
                    <span className="text-[10px] font-bold text-zinc-400 -translate-y-2">{String(h).padStart(2,'0')}:00</span>
                  </div>
                ))}
              </div>
              <div className="flex-1 grid gap-0.5" style={{gridTemplateColumns:'repeat(7,1fr)'}}>
                {[0,1,2,3,4,5,6].map(day=>{
                  const nowH=new Date();
                  const nowTop=(nowH.getHours()*60+nowH.getMinutes())/60*HOUR_H;
                  const isToday=day===todayIndex();
                  return (
                    <div key={day} className="relative bg-zinc-50/50 rounded-xl border border-zinc-100" style={{height:`${END_H*HOUR_H}px`}}>
                      {HOURS.map(h=><div key={h} style={{top:`${h*HOUR_H}px`}} className="absolute left-0 right-0 border-t border-zinc-100/60"/>)}
                      {isToday&&(
                        <div className="absolute left-0 right-0 z-10 flex items-center" style={{top:`${nowTop}px`}}>
                          <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 -ml-1"/>
                          <div className="flex-1 h-px bg-red-400"/>
                        </div>
                      )}
                      {eventsForDay(day).map(ev=>{
                        const top=eventTop(ev),height=eventHeight(ev);
                        return (
                          <div key={ev.id} title={`${ev.title}\n${ev.startTime}–${ev.endTime}`} onClick={()=>setEditEv(ev)}
                            className="absolute left-0.5 right-0.5 rounded-lg px-1 py-0.5 cursor-pointer hover:brightness-95 overflow-hidden"
                            style={{top:`${top}px`,height:`${Math.max(height,18)}px`,backgroundColor:ev.color}}>
                            <p className="text-[9px] font-bold text-zinc-700 leading-tight truncate">{ev.title}</p>
                            {height>26&&<p className="text-[8px] text-zinc-500">{ev.startTime}</p>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode==='list'&&(
        <div>
          <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar pb-1">
            {DAY_SHORT.map((d,i)=>(
              <button key={d} onClick={()=>setSelDay(i)} className={cn('px-4 py-2 rounded-2xl text-sm font-bold shrink-0 transition-all',selDay===i?'text-white':'bg-zinc-100 text-zinc-500')} style={selDay===i?{backgroundColor:'var(--ac)'}:{}}>{d}</button>
            ))}
          </div>
          <h2 className="font-bold text-zinc-500 text-sm mb-3 uppercase tracking-widest">{DAY_FULL[selDay]}</h2>
          <div className="flex flex-col gap-3">
            {eventsForDay(selDay).length===0?(
              <div className="text-center py-12 text-zinc-300"><CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30"/><p className="font-bold">Không có hoạt động nào</p><p className="text-sm mt-1">Nhấn + để thêm hoạt động lặp lại</p></div>
            ):eventsForDay(selDay).map(ev=>(
              <motion.div key={ev.id} layout initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                className="flex items-center gap-4 p-4 rounded-2xl cursor-pointer hover:opacity-90 transition-all" style={{backgroundColor:ev.color}} onClick={()=>setEditEv(ev)}>
                <div className="w-14 shrink-0 text-center">
                  <p className="text-xs font-black text-zinc-700">{ev.startTime}</p>
                  <p className="text-[10px] text-zinc-500">{ev.endTime}</p>
                </div>
                <div className="w-0.5 self-stretch bg-zinc-300/50 rounded-full shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-800">{ev.title}</p>
                  {ev.note&&<p className="text-xs text-zinc-500 truncate mt-0.5">{ev.note}</p>}
                  <div className="flex gap-1 flex-wrap mt-1">
                    {ev.days.map(d=><span key={d} className="text-[9px] font-bold bg-white/60 text-zinc-600 px-1.5 py-0.5 rounded-md">{DAY_SHORT[d]}</span>)}
                  </div>
                </div>
                <Pencil className="w-4 h-4 text-zinc-400 shrink-0"/>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {(showAdd||editEv)&&(
          <EventModal
            event={editEv}
            onSave={ev=>{
              if(editEv) setEvents(events.map(e=>e.id===ev.id?ev:e));
              else setEvents([ev,...events]);
              setShowAdd(false);setEditEv(null);
            }}
            onDelete={id=>{setEvents(events.filter(e=>e.id!==id));setEditEv(null);}}
            onClose={()=>{setShowAdd(false);setEditEv(null);}}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Finance Page (with view modes) ──────────────────────────────────────────
type FinView='overview'|'daily'|'weekly'|'monthly';

function FinancePage({finance,setFinance}:{finance:FinanceState;setFinance:(f:FinanceState)=>void}) {
  const [view,setView]=useState<FinView>('overview');
  const [showAdd,setShowAdd]=useState(false);
  const [addType,setAddType]=useState<'income'|'expense'>('income');
  const [amount,setAmount]=useState('');
  const [note,setNote]=useState('');
  const [editReward,setEditReward]=useState(false);
  const [rewardInput,setRewardInput]=useState(String(finance.rewardPerTask));

  const balance=finance.transactions.reduce((a,t)=>t.type==='expense'?a-t.amount:a+t.amount,0);
  const totalIn=finance.transactions.filter(t=>t.type==='income'||t.type==='reward').reduce((a,t)=>a+t.amount,0);
  const totalOut=finance.transactions.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0);
  const totalReward=finance.transactions.filter(t=>t.type==='reward').reduce((a,t)=>a+t.amount,0);

  const addTx=()=>{
    const num=parseInt(amount.replace(/\D/g,''),10);
    if(!num||!note.trim())return;
    const tx:Transaction={id:Date.now().toString(),type:addType,amount:num,note:note.trim(),date:todayStr()};
    setFinance({...finance,transactions:[tx,...finance.transactions]});
    setAmount('');setNote('');setShowAdd(false);
  };
  const delTx=(id:string)=>setFinance({...finance,transactions:finance.transactions.filter(t=>t.id!==id)});
  const saveReward=()=>{const num=parseInt(rewardInput.replace(/\D/g,''),10);if(num>0)setFinance({...finance,rewardPerTask:num});setEditReward(false);};

  const txIcon=(type:string)=>{
    if(type==='reward') return <div className="w-9 h-9 rounded-2xl bg-yellow-100 flex items-center justify-center text-base shrink-0">💰</div>;
    if(type==='income') return <div className="w-9 h-9 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0"><ArrowUpCircle className="w-5 h-5 text-emerald-600"/></div>;
    return <div className="w-9 h-9 rounded-2xl bg-red-100 flex items-center justify-center shrink-0"><ArrowDownCircle className="w-5 h-5 text-red-500"/></div>;
  };

  // View-specific data
  const today=todayStr();
  const weekStart=(()=>{const d=new Date();d.setDate(d.getDate()-todayIndex());return d.toISOString().split('T')[0];})();
  const monthStart=today.slice(0,7)+'-01';

  const todayTx=finance.transactions.filter(t=>t.date===today);
  const weekTx=finance.transactions.filter(t=>t.date>=weekStart);
  const monthTx=finance.transactions.filter(t=>t.date>=monthStart);

  const last7=Array.from({length:7},(_,i)=>{
    const d=new Date();d.setDate(d.getDate()-(6-i));const ds=d.toISOString().split('T')[0];
    return {
      name:DAY_SHORT[(d.getDay()+6)%7],
      thu:finance.transactions.filter(t=>t.date===ds&&t.type!=='expense').reduce((a,t)=>a+t.amount,0),
      chi:finance.transactions.filter(t=>t.date===ds&&t.type==='expense').reduce((a,t)=>a+t.amount,0),
    };
  });

  // Group daily transactions by date for 'daily' view
  const groupByDate=(txs:Transaction[])=>{
    const map=new Map<string,Transaction[]>();
    txs.forEach(t=>{if(!map.has(t.date))map.set(t.date,[]);map.get(t.date)!.push(t);});
    return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
  };

  const TxList=({txs}:{txs:Transaction[]})=>(
    <div className="flex flex-col gap-2">
      <AnimatePresence>
        {txs.map(tx=>(
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
                {tx.type==='expense'?'−':'+'}{formatVND(tx.amount)}
              </p>
              <button onClick={()=>delTx(tx.id)} className="w-7 h-7 rounded-full bg-zinc-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100">
                <Trash2 className="w-3.5 h-3.5 text-red-400"/>
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {txs.length===0&&<div className="text-center py-8 text-zinc-300"><p className="font-bold">Chưa có giao dịch</p></div>}
    </div>
  );

  const SumBar=({txs,label}:{txs:Transaction[];label:string})=>{
    const inc=txs.filter(t=>t.type!=='expense').reduce((a,t)=>a+t.amount,0);
    const exp=txs.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0);
    return (
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[{l:'Thu',v:inc,c:'text-emerald-600'},{l:'Chi',v:exp,c:'text-red-500'},{l:'Còn lại',v:inc-exp,c:inc-exp>=0?'text-black':'text-red-500'}].map(x=>(
          <div key={x.l} className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{label} — {x.l}</p>
            <p className={cn('font-black text-base mt-1',x.c)}>{formatVND(x.v)}</p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar flex flex-col gap-5 pb-24 md:pb-10">
      <header className="flex justify-between items-start">
        <div><h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-1">Finance</h1><p className="text-zinc-400 text-sm">Thu chi + thưởng task</p></div>
        <button onClick={()=>setShowAdd(true)} className="text-white px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg text-sm shrink-0" style={{backgroundColor:'var(--ac)'}}><Plus className="w-4 h-4"/>Thêm</button>
      </header>

      {/* View tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {([{id:'overview',label:'Tổng quan'},{id:'daily',label:'Hôm nay'},{id:'weekly',label:'Tuần này'},{id:'monthly',label:'Tháng này'}]as const).map(v=>(
          <button key={v.id} onClick={()=>setView(v.id)} className={cn('px-4 py-2 rounded-2xl text-sm font-bold shrink-0 transition-all',view===v.id?'text-white':'bg-white text-zinc-500 border border-zinc-100')} style={view===v.id?{backgroundColor:'var(--ac)'}:{}}>{v.label}</button>
        ))}
      </div>

      {/* OVERVIEW */}
      {view==='overview'&&(<>
        <div className="bg-black text-white rounded-[2.5rem] p-7 flex flex-col gap-4">
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Số dư hiện tại</p>
          <p className={cn('text-5xl font-black tracking-tight',balance<0?'text-red-400':'text-white')}>{formatVND(balance)}</p>
          <div className="grid grid-cols-3 gap-3">
            {[{l:'Tổng thu',v:totalIn,c:'text-emerald-400'},{l:'Tổng chi',v:totalOut,c:'text-red-400'},{l:'Từ tasks',v:totalReward,c:'text-yellow-400'}].map(x=>(
              <div key={x.l} className="bg-white/10 rounded-2xl p-3"><p className="text-zinc-400 text-[9px] font-bold uppercase tracking-wider mb-1">{x.l}</p><p className={cn('text-sm font-black',x.c)}>{formatVND(x.v)}</p></div>
            ))}
          </div>
        </div>
        <div className="bg-card-orange rounded-[2rem] p-5 flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Thưởng mỗi khi tick xong task</p>
            {editReward?<input autoFocus type="text" value={rewardInput} onChange={e=>setRewardInput(e.target.value.replace(/\D/g,''))} onKeyDown={e=>{if(e.key==='Enter')saveReward();if(e.key==='Escape')setEditReward(false);}} className="bg-white/80 border-2 border-black rounded-xl px-3 py-1.5 text-xl font-black w-40 outline-none"/>:<p className="text-2xl font-black">{formatVND(finance.rewardPerTask)}</p>}
          </div>
          {editReward?<button onClick={saveReward} className="w-10 h-10 bg-black text-white rounded-2xl flex items-center justify-center shrink-0"><Check className="w-5 h-5"/></button>:<button onClick={()=>{setEditReward(true);setRewardInput(String(finance.rewardPerTask));}} className="w-10 h-10 bg-white/60 rounded-2xl flex items-center justify-center hover:bg-white shrink-0"><Pencil className="w-4 h-4"/></button>}
        </div>
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
        <div><h3 className="font-bold mb-3 text-lg">Lịch sử giao dịch</h3><TxList txs={finance.transactions}/></div>
      </>)}

      {/* DAILY */}
      {view==='daily'&&(<>
        <SumBar txs={todayTx} label="Hôm nay"/>
        <h3 className="font-bold text-lg">Giao dịch hôm nay</h3>
        <TxList txs={todayTx}/>
      </>)}

      {/* WEEKLY */}
      {view==='weekly'&&(<>
        <SumBar txs={weekTx} label="Tuần này"/>
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100">
          <h3 className="font-bold mb-4">Thu / Chi từng ngày trong tuần</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0"/>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:10,fontWeight:600}}/>
                <YAxis axisLine={false} tickLine={false} tick={{fontSize:10}} tickFormatter={v=>v>0?`${Math.round(Number(v)/1000)}k`:'0'}/>
                <Tooltip formatter={(v:number)=>formatVND(v)} contentStyle={{borderRadius:12,border:'none'}}/>
                <Legend iconType="circle"/>
                <Bar dataKey="thu" name="Thu" fill="#D1F2EB" radius={[5,5,0,0]}/>
                <Bar dataKey="chi" name="Chi" fill="#FDE2E4" radius={[5,5,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <h3 className="font-bold text-lg">Giao dịch tuần này</h3>
        {groupByDate(weekTx).map(([date,txs])=>(
          <div key={date} className="mb-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">{date}</p>
            <TxList txs={txs}/>
          </div>
        ))}
      </>)}

      {/* MONTHLY */}
      {view==='monthly'&&(<>
        <SumBar txs={monthTx} label="Tháng này"/>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100">
            <h3 className="font-bold mb-4">Phân loại chi tiêu tháng này</h3>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[{name:'Reward',value:monthTx.filter(t=>t.type==='reward').reduce((a,t)=>a+t.amount,0)},{name:'Thu nhập',value:monthTx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amount,0)},{name:'Chi tiêu',value:monthTx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0)}]} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value">
                    {['#FDE2E4','#D1F2EB','#FAD2AD'].map((c,i)=><Cell key={i} fill={c}/>)}
                  </Pie>
                  <Tooltip formatter={(v:number)=>formatVND(v)}/><Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-black text-white rounded-[2rem] p-6 flex flex-col justify-between">
            <div><p className="text-zinc-400 text-xs uppercase tracking-widest">Tiết kiệm tháng này</p></div>
            <p className={cn('text-4xl font-black',monthTx.filter(t=>t.type!=='expense').reduce((a,t)=>a+t.amount,0)-monthTx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0)>=0?'text-emerald-400':'text-red-400')}>
              {formatVND(monthTx.filter(t=>t.type!=='expense').reduce((a,t)=>a+t.amount,0)-monthTx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0))}
            </p>
            <p className="text-zinc-500 text-xs">{monthTx.length} giao dịch trong tháng này</p>
          </div>
        </div>
        <h3 className="font-bold text-lg">Giao dịch tháng này</h3>
        {groupByDate(monthTx).map(([date,txs])=>(
          <div key={date} className="mb-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">{date}</p>
            <TxList txs={txs}/>
          </div>
        ))}
      </>)}

      {/* Add transaction modal */}
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

// ─── Notes Page ───────────────────────────────────────────────────────────────
const BLOCK_PLACEHOLDER:Record<NoteBlockType,string>={text:'Nhập văn bản...','checkbox':'Nội dung checkbox...',bullet:'Nội dung gạch đầu dòng...'};

function NoteEditor({note,onSave,onDelete,onClose}:{note:Note|null;onSave:(n:Note)=>void;onDelete:(id:string)=>void;onClose:()=>void}) {
  const isNew=!note;
  const [title,setTitle]=useState(note?.title??'');
  const [blocks,setBlocks]=useState<NoteBlock[]>(note?.blocks??[{id:Date.now().toString(),type:'text',content:''}]);
  const [tagInput,setTagInput]=useState((note?.tags??[]).join(' '));
  const [color,setColor]=useState(note?.color??'#FFFFFF');
  const titleRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{titleRef.current?.focus();},[]);

  const addBlock=(type:NoteBlockType)=>setBlocks(p=>[...p,{id:Date.now().toString(),type,content:'',checked:false}]);
  const updateBlock=(id:string,patch:Partial<NoteBlock>)=>setBlocks(p=>p.map(b=>b.id===id?{...b,...patch}:b));
  const removeBlock=(id:string)=>setBlocks(p=>p.filter(b=>b.id!==id));

  const save=()=>{
    const tags=tagInput.split(/[\s,]+/).filter(s=>s.startsWith('#')).map(s=>s.toLowerCase());
    const now=new Date().toISOString().split('T')[0];
    onSave({id:note?.id??Date.now().toString(),title:title||'Ghi chú không có tiêu đề',blocks,tags,color,createdAt:note?.createdAt??now,updatedAt:now});
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <motion.div initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.96}}
        className="rounded-[2rem] w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]" style={{backgroundColor:color==='#FFFFFF'?'#fff':color}}>
        {/* Header */}
        <div className="flex items-center gap-3 p-5 pb-3 shrink-0">
          <input ref={titleRef} type="text" placeholder="Tiêu đề ghi chú..." value={title} onChange={e=>setTitle(e.target.value)}
            className="flex-1 text-xl font-bold bg-transparent outline-none placeholder:text-zinc-400"/>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center hover:bg-black/20"><X className="w-4 h-4"/></button>
        </div>

        {/* Color picker */}
        <div className="flex gap-2 px-5 pb-3 shrink-0">
          {NOTE_COLORS.map(c=>(
            <button key={c} onClick={()=>setColor(c)} title={c}
              className={cn('w-6 h-6 rounded-full border-2 transition-all',color===c?'border-black scale-110':'border-zinc-200')}
              style={{backgroundColor:c}}/>
          ))}
        </div>

        {/* Blocks */}
        <div className="flex-1 overflow-y-auto px-5 pb-3 no-scrollbar flex flex-col gap-2">
          {blocks.map((b,i)=>(
            <div key={b.id} className="flex items-start gap-2 group">
              {b.type==='checkbox'&&(
                <button onClick={()=>updateBlock(b.id,{checked:!b.checked})} className="mt-0.5 shrink-0 w-5 h-5">
                  {b.checked?<CheckSquare className="w-5 h-5 text-emerald-500"/>:<Circle className="w-5 h-5 text-zinc-300"/>}
                </button>
              )}
              {b.type==='bullet'&&<span className="mt-2 w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0 mt-[10px]"/>}
              {b.type==='text'&&<AlignLeft className="w-4 h-4 text-zinc-300 shrink-0 mt-1"/>}
              <textarea value={b.content} onChange={e=>updateBlock(b.id,{content:e.target.value})}
                placeholder={BLOCK_PLACEHOLDER[b.type]} rows={b.type==='text'?2:1}
                className={cn('flex-1 bg-transparent outline-none resize-none text-sm font-medium placeholder:text-zinc-300',b.checked&&'line-through text-zinc-400')}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addBlock(b.type);}if(e.key==='Backspace'&&b.content===''&&blocks.length>1){e.preventDefault();removeBlock(b.id);}}}/>
              <button onClick={()=>removeBlock(b.id)} className="w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-black/10 shrink-0 mt-0.5">
                <X className="w-3 h-3"/>
              </button>
            </div>
          ))}
        </div>

        {/* Block type buttons */}
        <div className="flex gap-2 px-5 py-3 border-t border-black/5 shrink-0">
          <button onClick={()=>addBlock('text')} title="Văn bản" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/5 hover:bg-black/10 text-xs font-bold transition-all"><AlignLeft className="w-3.5 h-3.5"/>Văn bản</button>
          <button onClick={()=>addBlock('checkbox')} title="Checkbox" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/5 hover:bg-black/10 text-xs font-bold transition-all"><CheckSquare className="w-3.5 h-3.5"/>Check</button>
          <button onClick={()=>addBlock('bullet')} title="Danh sách" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/5 hover:bg-black/10 text-xs font-bold transition-all"><ListOrdered className="w-3.5 h-3.5"/>Danh sách</button>
        </div>

        {/* Tags + actions */}
        <div className="px-5 py-3 border-t border-black/5 shrink-0">
          <TagInput value={tagInput} onChange={setTagInput} allTags={[]} placeholder="#tag1 #tag2 ..."/>
          <div className="flex gap-3 mt-3">
            {!isNew&&<button onClick={()=>onDelete(note!.id)} className="w-10 h-10 bg-red-100 rounded-2xl flex items-center justify-center hover:bg-red-200 shrink-0"><Trash2 className="w-4 h-4 text-red-500"/></button>}
            <button onClick={save} className="flex-1 text-white py-2.5 rounded-2xl font-bold text-sm hover:opacity-90 transition-all" style={{backgroundColor:'var(--ac)'}}>
              {isNew?'Tạo ghi chú':'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function NotesPage({notes,setNotes}:{notes:Note[];setNotes:(n:Note[])=>void}) {
  const [showAdd,setShowAdd]=useState(false);
  const [editNote,setEditNote]=useState<Note|null>(null);
  const [activeTag,setActiveTag]=useState('');
  const [search,setSearch]=useState('');

  const allTags=useMemo(()=>{const s=new Set<string>();notes.forEach(n=>n.tags.forEach(t=>s.add(t)));return['all',...s];},[notes]);

  const filtered=useMemo(()=>notes.filter(n=>{
    const matchTag=activeTag===''||activeTag==='all'||n.tags.includes(activeTag);
    const q=search.toLowerCase();
    const matchSearch=!q||n.title.toLowerCase().includes(q)||n.blocks.some(b=>b.content.toLowerCase().includes(q))||n.tags.some(t=>t.includes(q));
    return matchTag&&matchSearch;
  }),[notes,activeTag,search]);

  const saveNote=(n:Note)=>{
    setNotes(notes.find(x=>x.id===n.id)?notes.map(x=>x.id===n.id?n:x):[n,...notes]);
    setShowAdd(false);setEditNote(null);
  };
  const deleteNote=(id:string)=>{setNotes(notes.filter(n=>n.id!==id));setEditNote(null);};

  const previewText=(n:Note)=>n.blocks.map(b=>b.content).filter(Boolean).join(' ').slice(0,80);
  const checkboxStats=(n:Note)=>{const cbs=n.blocks.filter(b=>b.type==='checkbox');return cbs.length>0?`${cbs.filter(b=>b.checked).length}/${cbs.length}`:null;};

  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar pb-24 md:pb-10">
      <header className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-1">Notes</h1>
          <p className="text-zinc-400 text-sm">{notes.length} ghi chú</p>
        </div>
        <button onClick={()=>setShowAdd(true)} className="text-white px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg text-sm shrink-0" style={{backgroundColor:'var(--ac)'}}><Plus className="w-4 h-4"/>Thêm</button>
      </header>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"/>
        <input type="text" placeholder="Tìm ghi chú, nội dung, #tag..." value={search} onChange={e=>setSearch(e.target.value)}
          className="w-full bg-white border border-zinc-100 rounded-2xl pl-11 pr-4 py-2.5 font-semibold text-sm outline-none focus:border-black shadow-sm"/>
      </div>

      {/* Tag filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 no-scrollbar">
        {allTags.map(tag=>(
          <button key={tag} onClick={()=>setActiveTag(tag==='all'?'':tag)}
            className={cn('px-4 py-2 rounded-2xl text-sm font-bold shrink-0 transition-all flex items-center gap-1',
              (tag==='all'&&activeTag==='')||(tag===activeTag)?'text-white':'bg-white text-zinc-500 hover:bg-zinc-100 border border-zinc-100')}
            style={(tag==='all'&&activeTag==='')||(tag===activeTag)?{backgroundColor:'var(--ac)'}:{}}>
            {tag==='all'?'Tất cả':tag}
          </button>
        ))}
      </div>

      {/* Notes grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {filtered.map((note,i)=>(
            <motion.div key={note.id} layout initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.95}} transition={{delay:i*0.04}}
              onClick={()=>setEditNote(note)} className="p-5 rounded-[2rem] cursor-pointer hover:brightness-95 transition-all flex flex-col gap-3" style={{backgroundColor:note.color==='#FFFFFF'?'#fff':note.color,border:note.color==='#FFFFFF'?'0.5px solid #e4e4e7':'none'}}>
              <h3 className="font-bold text-base leading-snug">{note.title}</h3>
              {previewText(note)&&<p className="text-xs text-zinc-500 leading-relaxed line-clamp-3">{previewText(note)}</p>}
              {checkboxStats(note)&&(
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1.5 bg-black/10 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{width:`${(parseInt(checkboxStats(note)!.split('/')[0])/parseInt(checkboxStats(note)!.split('/')[1]))*100}%`}}/>
                  </div>
                  <span className="text-[10px] font-bold text-zinc-500">{checkboxStats(note)}</span>
                </div>
              )}
              <div className="flex justify-between items-end mt-auto">
                <div className="flex gap-1 flex-wrap">
                  {note.tags.slice(0,3).map(t=><span key={t} className="text-[9px] font-bold bg-black/10 text-zinc-600 px-2 py-0.5 rounded-lg">{t}</span>)}
                </div>
                <span className="text-[10px] text-zinc-400 font-semibold shrink-0">{note.updatedAt}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filtered.length===0&&(
        <div className="flex flex-col items-center py-20 text-zinc-300">
          <StickyNote className="w-14 h-14 mb-3 opacity-30"/>
          <p className="font-bold">Chưa có ghi chú nào</p>
          <p className="text-sm mt-1">Nhấn + để tạo ghi chú đầu tiên</p>
        </div>
      )}

      <AnimatePresence>
        {(showAdd||editNote)&&(
          <NoteEditor note={editNote} onSave={saveNote} onDelete={deleteNote} onClose={()=>{setShowAdd(false);setEditNote(null);}}/>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Statistics (full, real data, date filter, reset) ─────────────────────────
type StatPeriod='day'|'week'|'month'|'year';
function StatisticsPage({tasks,habits,finance,onReset}:{tasks:Task[];habits:Habit[];finance:FinanceState;onReset:()=>void}) {
  const [period,setPeriod]=useState<StatPeriod>('week');
  const [showConfirm,setShowConfirm]=useState(false);

  const now=new Date();
  const startOf=(p:StatPeriod):string=>{
    if(p==='day') return now.toISOString().split('T')[0];
    if(p==='week'){const d=new Date(now);d.setDate(d.getDate()-todayIndex());return d.toISOString().split('T')[0];}
    if(p==='month') return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    return `${now.getFullYear()}-01-01`;
  };
  const cutoff=startOf(period);
  const periodLabel:Record<StatPeriod,string>={day:'Hôm nay',week:'Tuần này',month:'Tháng này',year:'Năm nay'};

  // Task stats filtered by createdAt / deadline within period
  const periodTasks=tasks.filter(t=>t.createdAt>=cutoff||t.deadline>=cutoff);
  const done=periodTasks.filter(t=>t.status==='done').length;
  const over=tasks.filter(t=>t.status!=='done'&&t.deadline<now.toISOString().split('T')[0]).length;
  const pct=periodTasks.length>0?Math.round((done/periodTasks.length)*100):0;

  // Habit stats: completions in todayIndex slot only for 'day', overall streak sum for others
  const habitDone=habits.reduce((a,h)=>a+h.completed.filter(Boolean).length,0);
  const habitTotal=habits.length*7;
  const habitPct=habitTotal>0?Math.round((habitDone/habitTotal)*100):0;

  // Finance stats
  const periodTx=finance.transactions.filter(t=>t.date>=cutoff);
  const income=periodTx.filter(t=>t.type!=='expense').reduce((a,t)=>a+t.amount,0);
  const expense=periodTx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0);

  // Category breakdown (all time)
  const catData=DEFAULT_CATEGORIES.map(c=>({name:c,value:tasks.filter(t=>t.category===c).length||0}));

  // Daily completion chart (last 7 days)
  const chartData=Array.from({length:7},(_,i)=>{
    const d=new Date();d.setDate(d.getDate()-(6-i));const ds=d.toISOString().split('T')[0];
    return {
      name:DAY_SHORT[(d.getDay()+6)%7],
      xong:tasks.filter(t=>t.status==='done'&&t.deadline===ds).length,
      tao:tasks.filter(t=>t.createdAt===ds).length,
    };
  });

  // Habit streak chart (each habit current streak)
  const habitChart=habits.slice(0,6).map(h=>({name:h.name.slice(0,10),streak:h.streak}));

  // Finance chart
  const finChart=Array.from({length:7},(_,i)=>{
    const d=new Date();d.setDate(d.getDate()-(6-i));const ds=d.toISOString().split('T')[0];
    return {
      name:DAY_SHORT[(d.getDay()+6)%7],
      thu:finance.transactions.filter(t=>t.date===ds&&t.type!=='expense').reduce((a,t)=>a+t.amount,0)/1000,
      chi:finance.transactions.filter(t=>t.date===ds&&t.type==='expense').reduce((a,t)=>a+t.amount,0)/1000,
    };
  });

  return (
    <div className="p-6 md:p-8 min-h-screen overflow-y-auto no-scrollbar flex flex-col gap-5 pb-24 md:pb-10">
      {/* Header */}
      <header className="flex justify-between items-start">
        <div><h1 className="text-3xl md:text-4xl font-bold mb-1">Analytics</h1><p className="text-zinc-400 text-sm">Tự động cập nhật từ tất cả trang.</p></div>
        <button onClick={()=>setShowConfirm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-500 rounded-2xl font-bold text-sm hover:bg-red-100 transition-colors shrink-0">
          <Reset className="w-4 h-4"/>Reset
        </button>
      </header>

      {/* Period filter */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {([{id:'day'},{id:'week'},{id:'month'},{id:'year'}]as const).map(p=>(
          <button key={p.id} onClick={()=>setPeriod(p.id)} className={cn('px-4 py-2 rounded-2xl text-sm font-bold shrink-0 transition-all flex items-center gap-1.5',period===p.id?'text-white':'bg-white text-zinc-500 border border-zinc-100')} style={period===p.id?{backgroundColor:'var(--ac)'}:{}}>
            <Calendar className="w-3.5 h-3.5"/>{periodLabel[p.id]}
          </button>
        ))}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label:'Tasks xong',value:done,sub:`/${periodTasks.length} tasks`,c:'bg-card-green'},
          {label:'Hoàn thành',value:`${pct}%`,sub:`${periodLabel[period]}`,c:'bg-card-blue'},
          {label:'Habit tuần',value:`${habitPct}%`,sub:`${habitDone}/${habitTotal} ô`,c:'bg-card-purple'},
          {label:'Quá hạn',value:over,sub:'cần xử lý',c:over>0?'bg-red-100':'bg-card-orange'},
        ].map(k=>(
          <div key={k.label} className={cn('p-5 rounded-[2rem] flex flex-col gap-1',k.c)}>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{k.label}</p>
            <p className="text-4xl font-black">{k.value}</p>
            <p className="text-[10px] text-zinc-500">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Finance KPI */}
      <div className="grid grid-cols-3 gap-3">
        {[{l:'Thu nhập',v:income,c:'text-emerald-600'},{l:'Chi tiêu',v:expense,c:'text-red-500'},{l:'Còn lại',v:income-expense,c:income-expense>=0?'text-black':'text-red-500'}].map(x=>(
          <div key={x.l} className="bg-white rounded-[1.5rem] p-4 shadow-sm border border-zinc-100">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{periodLabel[period]} — {x.l}</p>
            <p className={cn('font-black text-base mt-1 leading-tight',x.c)}>{formatVND(x.v)}</p>
          </div>
        ))}
      </div>

      {/* Task chart */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100">
        <h3 className="font-bold mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4"/>Tasks — 7 ngày gần nhất</h3>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0"/>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:11,fontWeight:600}}/>
              <YAxis axisLine={false} tickLine={false} tick={{fontSize:10}} allowDecimals={false}/>
              <Tooltip contentStyle={{borderRadius:12,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,0.08)'}}/>
              <Legend iconType="circle"/>
              <Bar dataKey="tao" name="Tạo mới" fill="#000" radius={[5,5,0,0]}/>
              <Bar dataKey="xong" name="Hoàn thành" fill="#D1F2EB" radius={[5,5,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Finance chart + Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100">
          <h3 className="font-bold mb-4">Thu / Chi (nghìn VND)</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={finChart}>
                <defs>
                  <linearGradient id="gThu" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                  <linearGradient id="gChi" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0"/>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:11}}/>
                <YAxis axisLine={false} tickLine={false} tick={{fontSize:10}}/>
                <Tooltip contentStyle={{borderRadius:12,border:'none'}}/>
                <Legend iconType="circle"/>
                <Area type="monotone" dataKey="thu" name="Thu" stroke="#10b981" fill="url(#gThu)" strokeWidth={2}/>
                <Area type="monotone" dataKey="chi" name="Chi" stroke="#ef4444" fill="url(#gChi)" strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100">
          <h3 className="font-bold mb-4">Danh mục tasks</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={catData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value">
                {catData.map((_,i)=><Cell key={i} fill={['#FDE2E4','#FAD2AD','#E2E2FB','#D1F2EB'][i%4]}/>)}
              </Pie><Tooltip/><Legend verticalAlign="bottom" height={36}/></PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Habit streaks */}
      {habitChart.length>0&&(
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-zinc-100">
          <h3 className="font-bold mb-4">Chuỗi streak habits</h3>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={habitChart} layout="vertical">
                <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize:10}} allowDecimals={false}/>
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:10}} width={80}/>
                <Tooltip contentStyle={{borderRadius:12,border:'none'}}/>
                <Bar dataKey="streak" name="Streak (ngày)" fill="var(--ac)" radius={[0,6,6,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Productivity streak */}
      <div className="bg-card-orange p-7 rounded-[2rem] flex items-center justify-between">
        <div><h3 className="text-xl font-bold mb-1">Chuỗi năng suất</h3><p className="text-zinc-600 text-sm">Tasks hoàn thành hôm nay</p></div>
        <div className="flex items-baseline gap-2"><span className="text-5xl font-black">{tasks.filter(t=>t.status==='done'&&t.deadline===todayStr()).length}</span><span className="font-bold uppercase text-sm">Task</span></div>
      </div>

      {/* Reset confirm dialog */}
      <AnimatePresence>
        {showConfirm&&(
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
            <motion.div initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.9}} className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-red-500"/>
              </div>
              <h2 className="text-xl font-bold mb-2">Xác nhận Reset?</h2>
              <p className="text-zinc-500 text-sm mb-6">Toàn bộ tasks, habits, finance, schedule, notes sẽ bị xoá và đặt lại về ban đầu. Hành động này không thể hoàn tác.</p>
              <div className="flex gap-3">
                <button onClick={()=>setShowConfirm(false)} className="flex-1 py-3 bg-zinc-100 rounded-2xl font-bold text-zinc-600 hover:bg-zinc-200 transition-colors">Huỷ</button>
                <button onClick={()=>{onReset();setShowConfirm(false);}} className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-colors">Xoá tất cả</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ─── Supabase Sync Hook ───────────────────────────────────────────────────────
function useSupabaseSync(
  user: AuthUser|null,
  data: object,
  setData: (d:any)=>void,
  setUser: (u:AuthUser|null)=>void,
  localUpdatedAt: string,
  setLocalUpdatedAt: (v:string)=>void,
) {
  const [syncing,setSyncing]=useState(false);
  const ready=useRef(false);       // true after first pull completes
  const pushing=useRef(false);     // prevent concurrent pushes
  const debRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const dataRef=useRef(data);
  dataRef.current=data;

  const getValidToken=useCallback(async():Promise<string|null>=>{
    if(!user)return null;
    const fiveMin=5*60*1000;
    if(user.expiresAt>Date.now()+fiveMin) return user.token;
    if(!user.refreshToken) return user.token;
    try{
      const r=await sbRefresh(user.refreshToken);
      const updated:AuthUser={...user,token:r.access_token,refreshToken:r.refresh_token??user.refreshToken,expiresAt:Date.now()+(r.expires_in??3600)*1000};
      setUser(updated);
      return r.access_token;
    }catch{return user.token;}
  },[user,setUser]);

  const push=useCallback(async(payload:object)=>{
    if(!user||!SB_URL||!ready.current||pushing.current)return;
    pushing.current=true;
    try{
      const token=await getValidToken();
      if(token) await sbSetData(token,user.userId,payload);
    }catch{}finally{pushing.current=false;}
  },[user,getValidToken]);

  const pull=useCallback(async()=>{
    if(!user||!SB_URL)return;
    setSyncing(true);
    try{
      const token=await getValidToken();
      if(!token)return;
      const result=await sbGetData(token,user.userId);

      if(!result||!result.data){
        // Server has no data → push local data up so it's not lost
        const now=new Date().toISOString();
        await sbSetData(token,user.userId,{...dataRef.current,_localUpdatedAt:now});
        setLocalUpdatedAt(now);
      } else {
        const serverTs=result.updatedAt??new Date(0).toISOString();
        const localTs=localUpdatedAt??new Date(0).toISOString();

        if(serverTs>localTs){
          // Server is newer → apply server data
          setData(result.data);
          setLocalUpdatedAt(serverTs);
        } else {
          // Local is newer (or equal) → push local up to server
          await sbSetData(token,user.userId,dataRef.current);
        }
      }
    }catch(e){
      console.error('[Sync] pull error',e);
    }finally{
      setSyncing(false);
      ready.current=true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user,setData,getValidToken,setLocalUpdatedAt]);

  // Auto-pull when user changes
  useEffect(()=>{
    ready.current=false;
    if(user&&SB_URL){pull();}
    else{ready.current=true;}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user?.userId]);

  // Debounced push on data change — mark localUpdatedAt so we know local is now newest
  useEffect(()=>{
    if(!user||!SB_URL)return;
    const now=new Date().toISOString();
    setLocalUpdatedAt(now);
    if(debRef.current)clearTimeout(debRef.current);
    debRef.current=setTimeout(()=>{if(ready.current)push(dataRef.current);},2000);
    return()=>{if(debRef.current)clearTimeout(debRef.current);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[data,user]);

  return{syncing,pull};
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activePage,setActivePage]=useState('home');

  // Auth token — localStorage so user stays logged in
  const [user,setUser]=useLocalStorage<AuthUser|null>('chance-user',null);

  // All data uses localStorage as offline cache AND Supabase as cloud backup
  // This means data survives page refreshes even without internet / Supabase
  const [tasks,setTasks]         =useLocalStorage<Task[]>('chance-tasks',INIT_TASKS);
  const [habits,setHabits]       =useLocalStorage<Habit[]>('chance-habits',INIT_HABITS);
  const [finance,setFinanceRaw]  =useLocalStorage<FinanceState>('chance-finance',INIT_FINANCE);
  const [settings,setSettings]   =useLocalStorage<AppSettings>('chance-settings',INIT_SETTINGS);
  const [archived,setArchived]   =useLocalStorage<Task[]>('chance-archived',[]);
  const [schedule,setSchedule]   =useLocalStorage<ScheduleEvent[]>('chance-schedule',INIT_SCHEDULE);
  const [notes,setNotes]         =useLocalStorage<Note[]>('chance-notes',INIT_NOTES);
  // Track when local data was last modified so we can compare with server
  const [localUpdatedAt,setLocalUpdatedAt]=useLocalStorage<string>('chance-updated-at',new Date(0).toISOString());
  const {toasts,add:addToast}    =useToast();

  // ── Auto-archive completed tasks + purge >30 days ──────────────────────────
  // Skip on first mount — only fire when a new task is marked done by the user
  const mountedRef=useRef(false);
  const doneTasks=tasks.filter(t=>t.status==='done');
  const doneCount=doneTasks.length;
  useEffect(()=>{
    if(!mountedRef.current){mountedRef.current=true;return;}  // skip first render
    if(doneCount===0)return;
    const thirtyDaysAgo=new Date(Date.now()-30*24*60*60*1000).toISOString().split('T')[0];
    const toArchive=doneTasks.map(t=>({...t,archivedAt:t.archivedAt??todayStr()}));
    setTasks(prev=>prev.filter(t=>t.status!=='done'));
    setArchived(prev=>{
      const existingIds=new Set(prev.map(a=>a.id));
      const newOnes=toArchive.filter(t=>!existingIds.has(t.id));
      const purged=prev.filter(t=>(t.archivedAt??'9999')>=thirtyDaysAgo);
      return [...newOnes,...purged];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[doneCount]);

  useAccentCSS(settings.accentColor);

  const allCategories=useMemo(()=>[...DEFAULT_CATEGORIES,...settings.customCategories.filter(c=>!DEFAULT_CATEGORIES.includes(c))],[settings.customCategories]);
  const syncPayload=useMemo(()=>({tasks,habits,finance,settings,archived,schedule,notes,_localUpdatedAt:localUpdatedAt}),[tasks,habits,finance,settings,archived,schedule,notes,localUpdatedAt]);

  const applyServerData=useCallback((d:any)=>{
    if(d.tasks){
      const active=(d.tasks as Task[]).filter(t=>t.status!=='done');
      const done=(d.tasks as Task[]).filter(t=>t.status==='done').map(t=>({...t,archivedAt:t.archivedAt??todayStr()}));
      setTasks(active);
      if(done.length>0)setArchived(prev=>{
        const ids=new Set(prev.map(a=>a.id));
        return[...done.filter(t=>!ids.has(t.id)),...prev];
      });
    }
    if(d.habits)   setHabits(d.habits);
    if(d.finance)  setFinanceRaw(d.finance);
    if(d.settings) setSettings(d.settings);
    if(d.archived) setArchived(prev=>{
      const ids=new Set(prev.map(a=>a.id));
      return[...(d.archived as Task[]).filter(t=>!ids.has(t.id)),...prev];
    });
    if(d.schedule) setSchedule(d.schedule);
    if(d.notes)    setNotes(d.notes);
    // Mark local as up-to-date with server so we don't push stale data back
    if(d._localUpdatedAt) setLocalUpdatedAt(d._localUpdatedAt);
    addToast('Đồng bộ thành công!','☁️');
  },[setTasks,setHabits,setFinanceRaw,setSettings,setArchived,setSchedule,setNotes,setLocalUpdatedAt,addToast]);

  const {syncing,pull}=useSupabaseSync(user,syncPayload,applyServerData,setUser,localUpdatedAt,setLocalUpdatedAt);
  const setFinance=useCallback((f:FinanceState)=>setFinanceRaw(f),[setFinanceRaw]);

  // Task done → earn reward (archive handled by useEffect above)
  const handleTaskDone=useCallback((task:Task)=>{
    setFinanceRaw(prev=>{
      const tx:Transaction={id:Date.now().toString(),type:'reward',amount:prev.rewardPerTask,note:'Hoàn thành task',date:todayStr(),taskTitle:task.title};
      return{...prev,transactions:[tx,...prev.transactions]};
    });
    addToast(`+${formatVND(finance.rewardPerTask)} vào ví! 💰`,'');
  },[finance.rewardPerTask,setFinanceRaw,addToast]);

  // Task un-done → deduct reward + restore to active tasks
  const handleTaskUndo=useCallback((task:Task)=>{
    // Move back from archived to tasks
    setArchived(prev=>prev.filter(t=>t.id!==task.id));
    setTasks(prev=>[{...task,status:'todo' as Status,archivedAt:undefined},...prev.filter(t=>t.id!==task.id)]);
    setFinanceRaw(prev=>{
      const tx:Transaction={id:Date.now().toString(),type:'expense',amount:prev.rewardPerTask,note:'Huỷ hoàn thành task',date:todayStr(),taskTitle:task.title};
      return{...prev,transactions:[tx,...prev.transactions]};
    });
    addToast(`−${formatVND(finance.rewardPerTask)} trừ từ ví`,'↩️');
  },[finance.rewardPerTask,setArchived,setTasks,setFinanceRaw,addToast]);

  // Full reset
  const handleReset=useCallback(()=>{
    setTasks(INIT_TASKS);setHabits(INIT_HABITS);setFinanceRaw(INIT_FINANCE);
    setSettings(INIT_SETTINGS);setArchived([]);setSchedule(INIT_SCHEDULE);setNotes(INIT_NOTES);
    addToast('Đã reset toàn bộ dữ liệu','🔄');
  },[setTasks,setHabits,setFinanceRaw,setSettings,setArchived,setSchedule,setNotes,addToast]);

  const PAGE_LABELS: Record<string,string>={home:'Home',pomodoro:'Pomodoro',tasks:'Tasks',kanban:'Kanban',habits:'Habits',schedule:'Schedule',notes:'Notes',finance:'Finance',stats:'Stats'};
  const openAuth=()=>setActivePage('auth');
  const handleLogin=(u:AuthUser)=>{
    setUser(u);
    setActivePage('home');
    addToast(`Xin chào, ${u.email}!`,'👋');
  };
  const handleLogout=()=>{
    setUser(null);
    setTasks(INIT_TASKS);setHabits(INIT_HABITS);setFinanceRaw(INIT_FINANCE);
    setSettings(INIT_SETTINGS);setArchived([]);setSchedule(INIT_SCHEDULE);setNotes(INIT_NOTES);
    addToast('Đã đăng xuất','👋');
  };

  // Auth page — full screen, no sidebar/nav
  if(activePage==='auth'){
    return(
      <div className="font-sans" style={{minHeight:'100dvh'}}>
        <AuthPage onLogin={handleLogin} onBack={()=>setActivePage('home')}/>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen font-sans bg-bg-chance selection:bg-black selection:text-white">
      {/* Desktop sidebar */}
      <Sidebar activePage={activePage} setActivePage={setActivePage} settings={settings} setSettings={setSettings}
        user={user} onLogout={handleLogout} onSyncClick={()=>user?pull():openAuth()} syncing={syncing}/>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <MobileHeader title={PAGE_LABELS[activePage]??''} activePage={activePage} setActivePage={setActivePage}
          user={user} onSyncClick={()=>user?pull():openAuth()} syncing={syncing}/>

        {/* No-account banner — desktop only (mobile uses header icon) */}
        {!user&&SB_URL&&(
          <div className="hidden md:flex items-center justify-between bg-amber-500 text-white text-xs font-bold px-4 py-2 shrink-0">
            <span>⚠️ Chưa đăng nhập — dữ liệu sẽ mất khi tải lại trang</span>
            <button onClick={openAuth} className="bg-white text-amber-600 px-3 py-1 rounded-xl font-bold hover:bg-amber-50">Đăng nhập ngay</button>
          </div>
        )}

        <main className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div key={activePage} initial={{opacity:0,x:12}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-12}} transition={{duration:0.2,ease:'easeInOut'}} className="min-h-full">
              {activePage==='home'     &&<ErrorBoundary><HomePage tasks={tasks} habits={habits} setHabits={setHabits} finance={finance} setActivePage={setActivePage}/></ErrorBoundary>}
              {activePage==='pomodoro' &&<ErrorBoundary><PomodoroPage settings={settings} setSettings={setSettings}/></ErrorBoundary>}
              {activePage==='tasks'    &&<ErrorBoundary><TaskListPage tasks={tasks} setTasks={setTasks} categories={allCategories} onTaskDone={handleTaskDone} onTaskUndo={handleTaskUndo}/></ErrorBoundary>}
              {activePage==='kanban'   &&<ErrorBoundary><KanbanPage tasks={tasks} setTasks={setTasks} archived={archived} setArchived={setArchived}/></ErrorBoundary>}
              {activePage==='habits'   &&<ErrorBoundary><HabitTrackerPage habits={habits} setHabits={setHabits}/></ErrorBoundary>}
              {activePage==='schedule' &&<ErrorBoundary><SchedulePage events={schedule} setEvents={setSchedule}/></ErrorBoundary>}
              {activePage==='notes'    &&<ErrorBoundary><NotesPage notes={notes} setNotes={setNotes}/></ErrorBoundary>}
              {activePage==='finance'  &&<ErrorBoundary><FinancePage finance={finance} setFinance={setFinance}/></ErrorBoundary>}
              {activePage==='stats'    &&<ErrorBoundary><StatisticsPage tasks={tasks} habits={habits} finance={finance} onReset={handleReset}/></ErrorBoundary>}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <BottomNav activePage={activePage} setActivePage={setActivePage} user={user} onSyncClick={()=>user?pull():openAuth()} syncing={syncing}/>
      <ToastContainer toasts={toasts}/>
    </div>
  );
}
