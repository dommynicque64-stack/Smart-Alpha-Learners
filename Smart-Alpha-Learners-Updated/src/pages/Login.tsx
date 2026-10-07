import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Field } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    // Proactive server check so a 500 surfaces as an actionable message,
    // not a dead login button.
    fetch('/api/health')
      .then(async (r) => {
        try { setHealth(await r.json()); } catch { setHealth({ ok: false, issues: [`Health check returned HTTP ${r.status}`] }); }
      })
      .catch(() => setHealth({ ok: false, issues: ['Cannot reach the API server.'] }));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorDetail('');
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err: any) {
      const req = err?.request ? ` [${err.request.method} ${err.request.url}]` : '';
      const code = err?.code ? ` (code: ${err.code})` : '';
      setError(err.message || 'Sign in failed');
      if (err?.status >= 500 || err?.code) {
        setErrorDetail(
          `Request POST /api/auth${req}${code} failed. ` +
          `If this persists, open DevTools → Network, click the failed /api/auth request, and send the Response body plus the Netlify Function log line to support. ` +
          `Server status: /api/health.`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-landing relative flex min-h-screen flex-col overflow-hidden lg:flex-row">
      <div
        className="login-landing-visual relative flex min-h-[58vh] w-full items-center justify-center overflow-visible p-2 sm:min-h-[62vh] sm:p-4 lg:min-h-screen lg:w-[58%] lg:p-5"
        aria-label="Smart Alpha Learners animated logo"
      >
        <iframe
          src="/smart-alpha-learners-3d/index.html"
          title="Smart Alpha Learners 3D animated logo"
          className="login-3d-frame h-[60vh] min-h-[390px] w-full max-w-4xl border-0 sm:h-[64vh] lg:h-[96vh] lg:min-h-[680px]"
          style={{ background: 'transparent' }}
          allow="autoplay"
        />
      </div>
      <div className="login-landing-panel relative z-20 flex w-full items-center justify-center p-5 sm:p-8 lg:min-h-screen lg:w-[42%] lg:min-w-0 lg:p-10 xl:p-14">
        <div className="login-form-card w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/smart-alpha-logo.png" alt="Smart Alpha Learners" className="h-11 w-11 rounded-2xl bg-white object-contain p-1 shadow-sm" />
            <div>
              <p className="text-lg font-bold text-slate-900">Smart Alpha Learners</p>
              <p className="text-xs text-slate-500">Kenyan School Management System</p>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to your school account to continue.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email address" required>
              <Input type="email" autoComplete="email" placeholder="you@school.ac.ke" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" required>
              <div className="relative">
                <Input type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-11" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <p>{error}</p>
                {errorDetail && <p className="mt-1.5 text-xs text-rose-600/90">{errorDetail}</p>}
              </div>
            )}
            <Button type="submit" loading={loading} className="w-full" size="lg">Sign in</Button>
          </form>
          {health && health.ok === false && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Server needs attention before login can work</p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                {(health.issues || ['Unknown server issue']).slice(0, 4).map((i: string, n: number) => <li key={n}>{i}</li>)}
              </ul>
              <p className="mt-1.5">Details: <span className="font-mono">GET /api/health</span> · Env: URL {health.env?.supabase_url_set ? '✓' : '✗'} · key {health.env?.service_role_set ? '✓' : '✗'} · DB {health.db?.reachable ? '✓' : '✗'}</p>
            </div>
          )}
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <span>Protected by role-based access control. Every action is audit-logged. First time here? <Link to="/setup" className="font-semibold text-emerald-700 hover:underline">Run initial setup</Link>.</span>
          </div>

        </div>
      </div>
    </div>
  );
}
