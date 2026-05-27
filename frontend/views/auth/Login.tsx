import React, { useMemo, useState } from 'react';
import { Lock, ShieldCheck, Mail, ArrowRight, Loader2, Sparkles, Receipt, AlertCircle, Key } from 'lucide-react';
import { Input } from '../../components/Input';
import AuthLayout from './AuthLayout';
import { useAuth } from '../../context/AuthContext';

const Login: React.FC = () => {
  const { login, notification, clearNotification, companyConfig } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!email.trim()) return false;
    if (requiresMfa) return mfaCode.trim().length === 6;
    return password.length > 0;
  }, [mfaCode, password, requiresMfa, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    if (notification) clearNotification();

    try {
      const result = await login(email.trim(), password, requiresMfa ? mfaCode.trim() : undefined);
      if (result === 'MFA_REQUIRED') {
        setRequiresMfa(true);
        setSubmitting(false);
        return;
      }
      if (result === 'INVALID') {
        setError('Invalid credentials.');
        setSubmitting(false);
        return;
      }
      if (result === 'EXPIRED') {
        setError('Session expired. Please sign in again.');
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
      setSubmitting(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-white text-sm transition-all placeholder:text-slate-600 outline-none";

  return (
    <AuthLayout title={requiresMfa ? 'Two-Factor Authentication' : 'Access Your Account'} subtitle={requiresMfa ? 'Verify your identity' : 'Sign in to continue'}>
      {/* Mobile Logo */}
      <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
          <Receipt size={20} className="text-white" />
        </div>
      </div>

      {/* Form Header */}
      <div className="mb-6">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-emerald-400 uppercase tracking-widest mb-3">
          <ShieldCheck size={12} />
          {requiresMfa ? 'Two-Factor Auth' : 'Sign In'}
        </span>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {requiresMfa ? 'Verify Your Identity' : 'Access Your Account'}
        </h2>
        <p className="text-sm text-slate-400 mt-2">
          {requiresMfa
            ? 'Enter the 6-digit code from your authenticator app.'
            : 'Enter your credentials to continue to the dashboard.'}
        </p>
      </div>

      {/* Error Alert */}
      {(error || notification?.type === 'error') && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2">
          <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-300">{error || notification?.message}</p>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white/3 border border-white/6 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Mail size={16} className="text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Sign In</h3>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
              Email <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                <Mail size={16} />
              </div>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} pl-10`}
                placeholder="admin@company.com"
                autoComplete="email"
                disabled={submitting}
                required
              />
            </div>
          </div>

          {!requiresMfa && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-300">Password <span className="text-rose-400">*</span></label>
              </div>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                  <Lock size={16} />
                </div>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pl-10`}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={submitting}
                  required
                />
              </div>
            </div>
          )}

          {requiresMfa && (
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Verification Code <span className="text-rose-400">*</span></label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                  <Key size={16} />
                </div>
                <Input
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className={`${inputClass} pl-10 tracking-[0.3em] font-mono`}
                  inputMode="numeric"
                  placeholder="000000"
                  disabled={submitting}
                  required
                />
              </div>
              <p className="text-[10px] text-slate-600 mt-1">6-digit code from your authenticator app</p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-60 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Authenticating...</span>
            </>
          ) : (
            <>
              <span>{requiresMfa ? 'Verify Code' : 'Sign In'}</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-xs text-slate-500">
        Don't have an account? <span className="text-emerald-400 font-medium">Contact your administrator</span>
      </div>
    </AuthLayout>
  );
};

export default Login;
