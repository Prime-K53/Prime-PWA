import React, { useMemo, useState, useEffect } from 'react';
import { Lock, ShieldCheck, Mail, ArrowRight, Loader2, Key, Eye, EyeOff, AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { useAuth } from '../../context/AuthContext';

const Login: React.FC = () => {
  const { login, notification, clearNotification, needsEmailVerification, setNeedsEmailVerification, verifyingEmail, setVerifyingEmail, verifyEmailOtp, resendOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setInterval(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
      return () => clearInterval(t);
    }
  }, [resendCooldown]);

  useEffect(() => {
    if (needsEmailVerification && verifyingEmail) {
      setEmail(verifyingEmail);
    }
  }, [needsEmailVerification, verifyingEmail]);

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
      if (result === 'EMAIL_NOT_VERIFIED') {
        setOtpSent(true);
        setSubmitting(false);
        return;
      }
      if (result === 'INVALID') {
        setError('Invalid credentials. Please try again.');
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

  const handleVerifyOtp = async () => {
    if (otpCode.trim().length !== 6) return;
    setVerifyingOtp(true);
    setError(null);
    try {
      const result = await verifyEmailOtp(verifyingEmail || email.trim(), otpCode.trim());
      if (result.success) {
        setNeedsEmailVerification(false);
        setVerifyingEmail('');
        setOtpSent(false);
        const loginResult = await login(verifyingEmail || email.trim(), password);
        if (loginResult === 'SUCCESS') return;
        setError('Verification successful. Please sign in again.');
      } else {
        setError(result.error || 'Verification failed.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    setError(null);
    try {
      const result = await resendOtp(verifyingEmail || email.trim(), 'signup');
      if (result.success) {
        setResendCooldown(60);
      } else {
        setError(result.error || 'Failed to resend code.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  };

  const handleSignOut = () => {
    setNeedsEmailVerification(false);
    setVerifyingEmail('');
    setOtpSent(false);
    setOtpCode('');
    setError(null);
  };

  if (needsEmailVerification || otpSent) {
    return (
      <AuthLayout title="Email Verification" subtitle="Verify your email address to continue." showBrand>
        <div>
          <div className="mb-8">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-700 uppercase tracking-wider">
              <ShieldCheck size={12} />
              Email Not Verified
            </span>
            <h1 className="mt-4 text-[1.65rem] font-bold text-slate-900 tracking-tight leading-snug">
              Verify Your Email
            </h1>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Your email address has not yet been verified. Please enter the verification code sent to:
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{verifyingEmail || email}</p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
              <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700">{error}</p>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                Verification Code <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <Key size={16} />
                </div>
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-sky-400 focus:ring-3 focus:ring-sky-100/60 tracking-[0.2em] font-mono text-center text-base"
                  inputMode="numeric"
                  placeholder="000000"
                  disabled={verifyingOtp}
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">Enter the 6-digit code sent to your email</p>
            </div>

            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={otpCode.trim().length !== 6 || verifyingOtp}
              className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/30 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-[13px] flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99]"
            >
              {verifyingOtp ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Verify Email</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || resendCooldown > 0}
                className="text-xs font-semibold text-sky-600 hover:text-sky-700 transition-colors disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {resending ? (
                  <><Loader2 size={12} className="animate-spin inline mr-1" />Resending...</>
                ) : resendCooldown > 0 ? (
                  `Resend code in ${resendCooldown}s`
                ) : (
                  'Resend Verification Code'
                )}
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
              >
                <LogOut size={12} />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in to your account" subtitle="Enter your credentials to access the Prime ERP dashboard." showBrand>
      <div>
        <div className="mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
            <ShieldCheck size={12} />
            {requiresMfa ? 'Two-Factor Auth' : 'Secure Sign In'}
          </span>
          <h1 className="mt-4 text-[1.65rem] font-bold text-slate-100 tracking-tight leading-snug">
            {requiresMfa ? 'Two-Factor Authentication' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            {requiresMfa
              ? 'Enter the 6-digit code from your authenticator app to continue.'
              : 'Sign in to your workspace to continue where you left off.'}
          </p>
        </div>

        {(error || notification?.type === 'error') && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0 mt-0.5">
              <div className="w-2 h-2 rounded-full bg-rose-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-rose-700 leading-relaxed">{error || notification?.message}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                Email <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-sky-400 focus:ring-3 focus:ring-sky-100/60"
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
                  <label className="block text-[13px] font-semibold text-slate-700">
                    Password <span className="text-rose-500">*</span>
                  </label>
<a href="#/forgot-password" className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 transition-colors">
              Forgot Password?
            </a>
                </div>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-sky-400 focus:ring-3 focus:ring-sky-100/60"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={submitting}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            {requiresMfa && (
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                  Verification Code <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Key size={16} />
                  </div>
                  <input
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-sky-400 focus:ring-3 focus:ring-sky-100/60 tracking-[0.2em] font-mono text-center text-base"
                    inputMode="numeric"
                    placeholder="000000"
                    disabled={submitting}
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">6-digit code from your authenticator app</p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/30 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-[13px] flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99]"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{requiresMfa ? 'Verifying...' : 'Signing in...'}</span>
                </>
              ) : (
                <>
                  <span>{requiresMfa ? 'Verify Code' : 'Sign In'}</span>
                  <ArrowRight size={16} />
                </>
              )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-200 text-center">
          <p className="text-xs text-slate-500">
            Don't have an account?{' '}
            <a href="#/setup" className="text-xs font-semibold text-sky-600 hover:text-sky-700 transition-colors">
              Create new
            </a>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Login;
