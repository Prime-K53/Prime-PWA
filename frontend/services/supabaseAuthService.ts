import { supabase } from './supabaseClient';

const SUPABASE_ENABLED = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co'
);

export interface AuthResult {
  success: boolean;
  error?: string;
  emailVerified?: boolean;
  userId?: string;
}

export interface SessionInfo {
  user: any;
  emailVerified: boolean;
}

function getEmailForUser(username: string, domain = 'prime-erp.local'): string {
  if (username.includes('@')) return username;
  return `${username}@${domain}`;
}

export async function signUp(email: string, password: string, metadata?: Record<string, any>): Promise<AuthResult> {
  if (!SUPABASE_ENABLED) return { success: false, error: 'Supabase is not configured.' };
  try {
    const targetEmail = getEmailForUser(email);
    if (!targetEmail || !targetEmail.includes('@') || targetEmail.startsWith('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    const { data, error } = await supabase.auth.signUp({
      email: targetEmail,
      password,
      options: {
        data: metadata || {},
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}#/setup` : undefined,
      },
    });
    if (error) {
      console.error('[Supabase] signUp error:', error);
      if (error.message?.toLowerCase().includes('already registered')) {
        return { success: false, error: 'An account with this email already exists.' };
      }
      if (error.message?.toLowerCase().includes('captcha')) {
        return { success: false, error: 'CAPTCHA verification required. Please disable CAPTCHA in your Supabase dashboard under Authentication > Settings > Security, or configure reCAPTCHA keys.' };
      }
      if (error.message?.toLowerCase().includes('signups not allowed')) {
        return { success: false, error: 'User signups are disabled in your Supabase project. Enable them under Authentication > Settings > General > User Signups.' };
      }
      if (error.message?.toLowerCase().includes('password')) {
        return { success: false, error: 'Password does not meet requirements. Must be at least 6 characters.' };
      }
      if (error.message?.toLowerCase().includes('rate limit') || error.message?.toLowerCase().includes('too many requests') || (error as any)?.status === 429) {
        return { success: false, error: 'Too many attempts. Please wait about 60 seconds and try again.' };
      }
      return { success: false, error: error.message };
    }
    return {
      success: true,
      userId: data.user?.id,
      emailVerified: data.user?.email_confirmed_at != null,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error. Please try again.' };
  }
}

export async function checkEmailConfirmation(email: string): Promise<boolean> {
  if (!SUPABASE_ENABLED) return false;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.email_confirmed_at) return true;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email_confirmed_at) return true;
    return false;
  } catch {
    return false;
  }
}

export async function verifyOtp(email: string, token: string, type: 'signup' | 'recovery' = 'signup'): Promise<AuthResult> {
  if (!SUPABASE_ENABLED) return { success: false, error: 'Supabase is not configured.' };
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: getEmailForUser(email),
      token,
      type,
    });
    if (error) {
      if (error.message?.toLowerCase().includes('expired')) {
        return { success: false, error: 'This verification code has expired. Request a new one.' };
      }
      if (error.message?.toLowerCase().includes('invalid') || error.message?.toLowerCase().includes('otp')) {
        return { success: false, error: 'Invalid verification code. Please try again.' };
      }
      return { success: false, error: error.message };
    }
    return {
      success: true,
      userId: data.user?.id,
      emailVerified: data.user?.email_confirmed_at != null,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Verification failed.' };
  }
}

export async function resendOtp(email: string, type: 'signup' | 'recovery' = 'signup'): Promise<AuthResult> {
  if (!SUPABASE_ENABLED) return { success: false, error: 'Supabase is not configured.' };
  try {
    const { error } = await supabase.auth.resend({
      type,
      email: getEmailForUser(email),
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to resend code.' };
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult & { emailVerified?: boolean }> {
  if (!SUPABASE_ENABLED) return { success: false, error: 'Supabase is not configured.' };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: getEmailForUser(email),
      password,
    });
    if (error) {
      if (error.message?.toLowerCase().includes('invalid login credentials')) {
        return { success: false, error: 'Invalid email or password.' };
      }
      if (error.message?.toLowerCase().includes('email not confirmed')) {
        return { success: false, error: 'EMAIL_NOT_VERIFIED', emailVerified: false };
      }
      return { success: false, error: error.message };
    }
    if (!data.user) return { success: false, error: 'No user data returned.' };
    const emailVerified = data.user.email_confirmed_at != null;
    return {
      success: true,
      userId: data.user.id,
      emailVerified,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Login failed.' };
  }
}

export async function signOut(): Promise<void> {
  if (!SUPABASE_ENABLED) return;
  try { await supabase.auth.signOut(); } catch { }
}

export async function getSession(): Promise<SessionInfo | null> {
  if (!SUPABASE_ENABLED) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    return {
      user: session.user,
      emailVerified: session.user.email_confirmed_at != null,
    };
  } catch {
    return null;
  }
}

export async function sendPasswordResetOtp(email: string): Promise<AuthResult> {
  if (!SUPABASE_ENABLED) return { success: false, error: 'Supabase is not configured.' };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(getEmailForUser(email));
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to send reset code.' };
  }
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (!SUPABASE_ENABLED) return { success: false, error: 'Supabase is not configured.' };
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update password.' };
  }
}

export async function getSupabaseUser(): Promise<any | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}
