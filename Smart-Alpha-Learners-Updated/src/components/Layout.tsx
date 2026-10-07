import { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, UserCheck, ClipboardList, BookOpen, CalendarDays,
  Building2, UserCog, ShieldCheck, Upload, FileText, Search, Menu, X, LogOut, Settings,
  ChevronDown, Wallet, MessagesSquare, CalendarRange, HeartHandshake,
  LibraryBig, Package, Bus, BarChart3, Bell, Briefcase,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, put } from '../lib/api';

interface NavItem { to: string; label: string; icon: any; perms: string[]; end?: boolean }

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Main',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, perms: [], end: true },
      { to: '/attendance', label: 'Attendance', icon: ClipboardList, perms: ['attendance.view', 'attendance.mark', 'attendance.manage'] },
      { to: '/timetable', label: 'Timetable', icon: CalendarDays, perms: ['timetable.view', 'timetable.manage'] },
    ],
  },
  {
    section: 'People',
    items: [
      { to: '/learners', label: 'Learners', icon: GraduationCap, perms: ['learners.view', 'learners.edit', 'learners.manage', 'attendance.mark', 'observations.manage'] },
      { to: '/parents', label: 'Parents & Guardians', icon: Users, perms: ['parents.view', 'parents.manage', 'learners.manage'] },
      { to: '/teachers', label: 'Teachers & Staff', icon: UserCheck, perms: ['teachers.view', 'teachers.manage', 'academic.manage'] },
    ],
  },
  {
    section: 'Academics',
    items: [
      { to: '/academic', label: 'Academic Structure', icon: Building2, perms: ['academic.manage', 'dashboard.admin'] },
      { to: '/curriculum', label: 'CBC Curriculum', icon: BookOpen, perms: ['curriculum.view', 'curriculum.manage'] },
      { to: '/discipline', label: 'Discipline & Pastoral', icon: HeartHandshake, perms: ['discipline.view', 'discipline.manage'] },
    ],
  },
  {
    section: 'Finance',
    items: [
      { to: '/finance', label: 'Finance', icon: Wallet, perms: ['finance.structures', 'finance.invoices', 'finance.payments', 'finance.reports', 'finance.view', 'dashboard.finance', 'dashboard.admin'] },
    ],
  },
  {
    section: 'Connect',
    items: [
      { to: '/communication', label: 'Communication', icon: MessagesSquare, perms: [] },
      { to: '/calendar', label: 'Calendar & Events', icon: CalendarRange, perms: [] },
      { to: '/reports', label: 'Reports Hub', icon: BarChart3, perms: ['reports.view', 'dashboard.admin', 'dashboard.finance', 'finance.reports', 'attendance.view', 'library.view', 'transport.view', 'discipline.view', 'finance.view'] },
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/staff', label: 'Staff', icon: Briefcase, perms: ['staff.view', 'staff.manage'] },
      { to: '/library', label: 'Library', icon: LibraryBig, perms: ['library.view', 'library.borrow', 'library.manage'] },
      { to: '/inventory', label: 'Inventory', icon: Package, perms: ['inventory.view', 'inventory.manage'] },
      { to: '/transport', label: 'Transport', icon: Bus, perms: ['transport.view', 'transport.manage'] },
    ],
  },
  {
    section: 'Administration',
    items: [
      { to: '/school', label: 'School Setup', icon: Settings, perms: ['school.manage', 'dashboard.admin'] },
      { to: '/users', label: 'Users & Roles', icon: UserCog, perms: ['users.manage', 'users.view', 'roles.manage'] },
      { to: '/import', label: 'Data Import', icon: Upload, perms: ['import.run'] },
      { to: '/audit', label: 'Audit Log', icon: FileText, perms: ['audit.view'] },
    ],
  },
];

function SearchBar({ onNavigate }: { onNavigate: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<any>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); setOpen(false); return; }
    setLoading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const data = await get(`/api/search?q=${encodeURIComponent(q.trim())}`);
        setResults(data);
        setOpen(true);
      } catch { setResults(null); } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const go = (path: string) => {
    setOpen(false); setQ(''); onNavigate(); nav(path);
  };

  const hasAny = results && (results.learners?.length || results.parents?.length || results.teachers?.length || results.areas?.length);

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search learners, parents, teachers..."
        className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-4 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/30"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {loading && <p className="px-3 py-2 text-sm text-slate-500">Searching...</p>}
          {!loading && !hasAny && <p className="px-3 py-2 text-sm text-slate-500">No results found.</p>}
          {results?.learners?.length > 0 && (
            <div>
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-slate-400">Learners</p>
              {results.learners.map((l: any) => (
                <button key={l.id} onClick={() => go(`/learners/${l.id}`)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100">
                  <span className="font-medium text-slate-800">{l.first_name} {l.last_name}</span>
                  <span className="text-xs text-slate-500">{l.admission_no}</span>
                </button>
              ))}
            </div>
          )}
          {results?.parents?.length > 0 && (
            <div>
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-slate-400">Parents</p>
              {results.parents.map((p: any) => (
                <button key={p.id} onClick={() => go(`/parents/${p.id}`)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100">
                  <span className="font-medium text-slate-800">{p.first_name} {p.last_name}</span>
                  <span className="text-xs text-slate-500">{p.phone}</span>
                </button>
              ))}
            </div>
          )}
          {results?.teachers?.length > 0 && (
            <div>
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-slate-400">Teachers</p>
              {results.teachers.map((t: any) => (
                <button key={t.id} onClick={() => go(`/teachers/${t.id}`)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100">
                  <span className="font-medium text-slate-800">{t.first_name} {t.last_name}</span>
                  <span className="text-xs text-slate-500">{t.staff_no}</span>
                </button>
              ))}
            </div>
          )}
          {results?.areas?.length > 0 && (
            <div>
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-slate-400">Learning Areas</p>
              {results.areas.map((a: any) => (
                <button key={a.id} onClick={() => go('/curriculum')} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100">
                  <span className="font-medium text-slate-800">{a.name}</span>
                  <span className="text-xs text-slate-500">{a.code}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, can, roleName } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [school, setSchool] = useState<any>(null);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setSidebarOpen(false); setMenuOpen(false); setNotifOpen(false); }, [location.pathname]);

  useEffect(() => {
    get('/api/schools').then(setSchool).catch(() => {});
  }, []);

  const loadNotifs = () => {
    get('/api/communication?resource=notifications&limit=8').then((d: any) => { setNotifs(d.rows || []); setUnread(d.unread || 0); }).catch(() => {});
  };
  useEffect(() => {
    if (!user) return;
    loadNotifs();
    const t = setInterval(loadNotifs, 60000);
    const onChange = () => loadNotifs();
    window.addEventListener('elimu:notifications-changed', onChange);
    return () => { clearInterval(t); window.removeEventListener('elimu:notifications-changed', onChange); };
  }, [user?.id]);

  const visibleSections = NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.perms.length === 0 || can(...i.perms)),
  })).filter((s) => s.items.length > 0);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const sidebar = (
    <div className="sidebar-shell flex h-full flex-col text-white">
      <Link to="/" className="flex items-center gap-3 px-5 pb-5 pt-6">
        <img src="/smart-alpha-logo.png" alt="Smart Alpha Learners" className="h-10 w-10 rounded-xl bg-white object-contain p-1" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">Smart Alpha Learners</p>
          <p className="truncate text-xs text-white/70">{school?.name || 'School Management'}</p>
        </div>
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {visibleSections.map((s) => (
          <div key={s.section}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">{s.section}</p>
            <div className="space-y-0.5">
              {s.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `sidebar-nav-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'sidebar-nav-active text-white shadow-sm' : 'text-white/80'}`}
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/15 px-4 py-4">
        <div className="flex items-center gap-2 text-xs text-white/60">
          <ShieldCheck className="h-4 w-4" />
          <span className="truncate">{roleName}</span>
        </div>
        <p className="mt-1 truncate px-6 text-xs text-white/40">Phase 3 · Integrated Platform</p>
      </div>
    </div>
  );

  return (
    <div className="app-shell min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            <div className="absolute right-2 top-2 z-10">
              <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 text-white hover:bg-[#781C2E]" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden flex-1 sm:block">
              <SearchBar onNavigate={() => {}} />
            </div>
            <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
              <div className="relative">
                <button
                  onClick={() => { setNotifOpen(!notifOpen); setMenuOpen(false); }}
                  className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[85vw] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <p className="text-sm font-bold text-slate-800">Notifications</p>
                      <div className="flex gap-2">
                        {unread > 0 && (
                          <button
                            onClick={async () => { try { await put('/api/communication?resource=notifications', { action: 'read-all' }); loadNotifs(); } catch { /* noop */ } }}
                            className="text-xs font-semibold text-emerald-700 hover:underline"
                          >
                            Mark all read
                          </button>
                        )}
                        <Link to="/communication?tab=notifications" className="text-xs font-semibold text-emerald-700 hover:underline">View all</Link>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifs.length === 0 && <p className="px-2 py-4 text-center text-sm text-slate-400">No notifications yet.</p>}
                      {notifs.map((n: any) => (
                        <Link
                          key={n.id}
                          to={n.link || '/communication?tab=notifications'}
                          className={`block rounded-lg px-2.5 py-2 hover:bg-slate-50 ${n.is_read ? '' : 'bg-emerald-50/60'}`}
                        >
                          <p className="truncate text-sm font-semibold text-slate-800">{n.title}</p>
                          {n.body && <p className="truncate text-xs text-slate-500">{n.body}</p>}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="relative">
                <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-sm font-bold text-white">
                    {(user?.full_name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="hidden text-left md:block">
                    <p className="max-w-40 truncate text-sm font-semibold text-slate-800">{user?.full_name}</p>
                    <p className="text-xs text-slate-500">{roleName}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <div className="px-3 py-2 md:hidden">
                      <p className="truncate text-sm font-semibold text-slate-800">{user?.full_name}</p>
                      <p className="text-xs text-slate-500">{user?.email}</p>
                    </div>
                    <Link to="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                      <Settings className="h-4 w-4" /> My Profile & Security
                    </Link>
                    <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50">
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="px-4 pb-3 sm:hidden">
            <SearchBar onNavigate={() => {}} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
