import React, { useMemo, useState } from 'react';
import { Lock, ShieldCheck, User as UserIcon, ArrowRight, Loader2, Sparkles, Globe, Shield } from 'lucide-react';
import { Input } from '../../components/Input';
import { useAuth } from '../../context/AuthContext';

const Login: React.FC = () => {
  const { login, notification, clearNotification, companyConfig } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!username.trim()) return false;
    if (requiresMfa) return mfaCode.trim().length === 6;
    return password.length > 0;
  }, [mfaCode, password, requiresMfa, username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    if (notification) clearNotification();

    try {
      const result = await login(username.trim(), password, requiresMfa ? mfaCode.trim() : undefined);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Animated Background Gradient Orbs */}
      <div className="fixed top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/20 to-indigo-500/10 rounded-full blur-3xl opacity-40 animate-float" />
      <div className="fixed bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-indigo-500/20 to-blue-500/10 rounded-full blur-3xl opacity-40 animate-float [animation-delay:4s]" />
      <div className="fixed top-1/3 left-1/4 w-80 h-80 bg-gradient-to-br from-blue-500/15 to-transparent rounded-full blur-3xl opacity-30" />

      <div className="relative z-10 w-full max-w-2xl">
        {/* Header Section */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-400/30 rounded-full mb-6 backdrop-blur-sm hover:from-blue-500/30 hover:to-indigo-500/30 transition-all duration-300">
            <ShieldCheck size={18} className="text-blue-300" />
            <span className="text-sm font-bold text-blue-300">{companyConfig?.companyName || 'Prime ERP'}</span>
          </div>
          
          <h1 className="text-4xl lg:text-5xl font-black tracking-tight mb-3 text-white">
            Welcome <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent">Back</span>
          </h1>
          <p className="text-lg text-slate-300 font-medium">
            Sign in to your enterprise workspace
          </p>
        </div>

        {/* Main Card Container */}
        <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden p-8">
          {/* Animated Grid Background */}
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: 'linear-gradient(90deg, #ffffff 1px, transparent 1px), linear-gradient(#ffffff 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }} />

          {/* Content */}
          <div className="relative z-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Step Title */}
              <div className="relative mb-6">
                <h2 className="text-2xl lg:text-3xl font-black text-white mb-1 animate-fade-in">
                  {requiresMfa ? 'Two-Factor Authentication' : 'Sign In'}
                </h2>
                <p className="text-sm text-slate-300 font-medium animate-fade-in" style={{ animationDelay: '0.1s' }}>
                  {requiresMfa ? 'Enter your 6-digit verification code' : 'Enter your credentials to continue'}
                </p>
                <div className="absolute -bottom-2 left-0 w-20 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" />
              </div>
              {/* Error Alert */}
              {(error || (notification?.type === 'error' ? notification.message : null)) && (
                <div role="alert" className="animate-slide-down group">
                  <div className="p-4 bg-gradient-to-r from-rose-500/20 to-red-500/20 border border-rose-400/40 rounded-2xl text-rose-200 text-sm font-medium flex items-start gap-3 backdrop-blur-sm hover:from-rose-500/30 hover:to-red-500/30 transition-all duration-300">
                    <div className="text-lg mt-0.5">⚠️</div>
                    <p className="flex-1">{error || notification?.message}</p>
                  </div>
                </div>
              )}

              {/* Username Input */}
              <div className="space-y-2 group animate-in fade-in slide-in-from-right-1/2 duration-300">
                <label className="text-xs font-black uppercase tracking-widest text-slate-300 ml-1 flex items-center gap-2">
                  <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full group-hover:scale-125 transition-transform" />
                  Username
                </label>
                <div className="relative group/input">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-400 transition-all duration-300">
                    <UserIcon size={20} />
                  </div>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-14 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl focus:bg-white/10 focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-300 text-white font-medium text-sm placeholder-slate-500 backdrop-blur-sm hover:bg-white/8 hover:border-white/20"
                    placeholder="Enter your username"
                    autoComplete="username"
                    disabled={submitting}
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              {!requiresMfa && (
                <div className="space-y-2 group animate-in fade-in slide-in-from-right-1/2 duration-300" style={{ animationDelay: '0.1s' }}>
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
                      <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full group-hover:scale-125 transition-transform" />
                      Password
                    </label>
                    <button type="button" className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors">Forgot?</button>
                  </div>
                  <div className="relative group/input">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-400 transition-all duration-300">
                      <Lock size={20} />
                    </div>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-14 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl focus:bg-white/10 focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-300 text-white font-medium text-sm placeholder-slate-500 backdrop-blur-sm hover:bg-white/8 hover:border-white/20"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      disabled={submitting}
                      required
                    />
                  </div>
                </div>
              )}

              {/* MFA Code Input */}
              {requiresMfa && (
                <div className="space-y-2 group animate-in fade-in slide-in-from-right-1/2 duration-500">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-300 ml-1 flex items-center gap-2">
                    <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full group-hover:scale-125 transition-transform" />
                    MFA Code
                  </label>
                  <div className="relative group/input">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-400 transition-all duration-300">
                      <Sparkles size={20} />
                    </div>
                    <Input
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      className="w-full pl-14 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl focus:bg-white/10 focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-300 text-white font-medium text-sm placeholder-slate-500 backdrop-blur-sm hover:bg-white/8 hover:border-white/20"
                      inputMode="numeric"
                      disabled={submitting}
                      placeholder="6-digit code"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Remember Device Checkbox */}
              {!requiresMfa && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-1/2 duration-300" style={{ animationDelay: '0.2s' }}>
                  <input type="checkbox" id="remember" className="w-4 h-4 rounded border-white/20 text-blue-500 focus:ring-blue-400 cursor-pointer bg-white/10" />
                  <label htmlFor="remember" className="text-sm font-medium text-slate-300 cursor-pointer select-none">Remember this device</label>
                </div>
              )}

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="group relative w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 disabled:from-slate-600 disabled:to-slate-700 disabled:text-slate-400 text-white rounded-xl font-bold shadow-lg shadow-blue-500/40 transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden text-sm mt-2 animate-in fade-in slide-in-from-right-1/2 duration-300" style={{ animationDelay: '0.3s' }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>{requiresMfa ? 'Verify' : 'Sign In'}</span>
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-full group-hover:-translate-x-full transition-transform duration-1000" />
              </button>
            </form>

            {/* Footer Links */}
            <div className="pt-6 text-center animate-in fade-in duration-500" style={{ animationDelay: '0.4s' }}>
              <p className="text-sm font-medium text-slate-400">
                Don't have an account? <span className="text-blue-400 cursor-help hover:text-blue-300 transition-colors">Contact IT Admin</span>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="mt-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center justify-center gap-4 animate-fade-in" style={{ animationDelay: '0.5s' }}>
          <span>&copy; 2026 Prime ERP</span>
          <span className="w-1 h-1 bg-slate-600 rounded-full" />
          <span className="hover:text-slate-400 transition-colors cursor-pointer">Security Policy</span>
          <span className="w-1 h-1 bg-slate-600 rounded-full" />
          <span className="hover:text-slate-400 transition-colors cursor-pointer">Terms of Service</span>
        </div>
      </div>
    </div>
  );
};

export default Login;
