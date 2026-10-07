import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GraduationCap, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Field } from '../components/ui';

export default function Setup() {
  const { bootstrap } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim() || !email.trim() || !password) { setError('All fields are required.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await bootstrap(email.trim(), password, fullName.trim());
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-950 p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-800">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">Smart Alpha Learners</p>
            <p className="text-xs text-slate-500">Initial administrator setup</p>
          </div>
        </div>
        <h2 className="mt-6 text-xl font-bold text-slate-900">Create the first administrator</h2>
        <p className="mt-1 text-sm text-slate-500">This only works once — when no users exist yet. Afterwards, admins create all other accounts.</p>
        <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
          {['Full access to school setup & academic structure', 'Creates teachers, parents, learners & other staff', 'Manages roles, permissions and the audit log'].map((t) => (
            <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{t}</li>
          ))}
        </ul>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="Full name" required><Input placeholder="e.g. Jane Wanjiru" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Field label="Email address" required><Input type="email" placeholder="admin@school.ac.ke" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Password" required><Input type="password" placeholder="Min. 8 chars" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Field label="Confirm" required><Input type="password" placeholder="Repeat" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          </div>
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <Button type="submit" loading={loading} className="w-full" size="lg">Create administrator</Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">Already set up? <Link to="/login" className="font-semibold text-emerald-700 hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}
