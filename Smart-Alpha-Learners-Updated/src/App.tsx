import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Learners, { LearnerDetail } from './pages/Learners';
import Parents, { ParentDetail } from './pages/Parents';
import Teachers, { TeacherDetail } from './pages/Teachers';
import Academic from './pages/Academic';
import Attendance from './pages/Attendance';
import Curriculum from './pages/Curriculum';
import Timetable from './pages/Timetable';
import SchoolSetup from './pages/SchoolSetup';
import Users from './pages/Users';
import DataImport from './pages/DataImport';
import AuditLog from './pages/AuditLog';
import Profile from './pages/Profile';
import Finance from './pages/Finance';
import Communication from './pages/Communication';
import Calendar from './pages/Calendar';
import Reports from './pages/Reports';
import Transport from './pages/Transport';
import { Discipline, Staff, Library, Inventory } from './pages/Operations';
import { ThemeProvider } from './contexts/ThemeContext';

function Protected({ children, perms }: { children: React.ReactNode; perms?: string[] }) {
  const { user, loading, can } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center app-shell"><Spinner label="Loading Smart Alpha Learners..." /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (perms && perms.length > 0 && !can(...perms)) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-6 py-16 text-center">
          <p className="text-lg font-bold text-amber-900">Access denied</p>
          <p className="mt-1 max-w-sm text-sm text-amber-700">Your role ({user.roles?.name}) does not have permission to view this page. Contact your administrator if you need access.</p>
        </div>
      </Layout>
    );
  }
  return <Layout>{children}</Layout>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center app-shell"><Spinner label="Loading..." /></div>;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/setup" element={<PublicOnly><Setup /></PublicOnly>} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/learners" element={<Protected perms={['learners.view', 'learners.edit', 'learners.manage', 'attendance.mark', 'observations.manage']}><Learners /></Protected>} />
          <Route path="/learners/:id" element={<Protected><LearnerDetail /></Protected>} />
          <Route path="/parents" element={<Protected perms={['parents.view', 'parents.manage', 'learners.manage']}><Parents /></Protected>} />
          <Route path="/parents/:id" element={<Protected perms={['parents.view', 'parents.manage', 'learners.manage']}><ParentDetail /></Protected>} />
          <Route path="/teachers" element={<Protected perms={['teachers.view', 'teachers.manage', 'academic.manage']}><Teachers /></Protected>} />
          <Route path="/teachers/:id" element={<Protected perms={['teachers.view', 'teachers.manage', 'academic.manage']}><TeacherDetail /></Protected>} />
          <Route path="/academic" element={<Protected perms={['academic.manage', 'dashboard.admin']}><Academic /></Protected>} />
          <Route path="/attendance" element={<Protected perms={['attendance.view', 'attendance.mark', 'attendance.manage']}><Attendance /></Protected>} />
          <Route path="/curriculum" element={<Protected perms={['curriculum.view', 'curriculum.manage']}><Curriculum /></Protected>} />
          <Route path="/timetable" element={<Protected perms={['timetable.view', 'timetable.manage']}><Timetable /></Protected>} />
          <Route path="/school" element={<Protected perms={['school.manage', 'dashboard.admin']}><SchoolSetup /></Protected>} />
          <Route path="/users" element={<Protected perms={['users.manage', 'users.view', 'roles.manage']}><Users /></Protected>} />
          <Route path="/import" element={<Protected perms={['import.run']}><DataImport /></Protected>} />
          <Route path="/audit" element={<Protected perms={['audit.view']}><AuditLog /></Protected>} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="/finance" element={<Protected perms={['finance.structures', 'finance.invoices', 'finance.payments', 'finance.reports', 'finance.view', 'dashboard.finance', 'dashboard.admin']}><Finance /></Protected>} />
          <Route path="/communication" element={<Protected><Communication /></Protected>} />
          <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
          <Route path="/reports" element={<Protected><Reports /></Protected>} />
          <Route path="/discipline" element={<Protected perms={['discipline.view', 'discipline.manage']}><Discipline /></Protected>} />
          <Route path="/staff" element={<Protected perms={['staff.view', 'staff.manage']}><Staff /></Protected>} />
          <Route path="/library" element={<Protected perms={['library.view', 'library.borrow', 'library.manage']}><Library /></Protected>} />
          <Route path="/inventory" element={<Protected perms={['inventory.view', 'inventory.manage']}><Inventory /></Protected>} />
          <Route path="/transport" element={<Protected perms={['transport.view', 'transport.manage']}><Transport /></Protected>} />
          <Route path="*" element={<Protected><Dashboard /></Protected>} />
        </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}
