import { supabase } from './supabaseClient';

const SUPABASE_ENABLED = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co'
);

const AUTH_TIMEOUT = 15000;

async function withTimeout<T>(promise: Promise<T>, ms: number = AUTH_TIMEOUT): Promise<T> {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timer]);
}

export interface AuthResult {
  success: boolean;
  error?: string;
  userId?: string;
}

export interface SessionInfo {
  user: any;
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
    const { data, error } = await withTimeout(supabase.auth.signUp({
      email: targetEmail,
      password,
      options: {
        data: metadata || {},
      },
    }));
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
      if (error.message?.toLowerCase().includes('database error saving new user')) {
        const status = (error as any)?.status || (error as any)?.statusCode;
        return { success: false, error: `Supabase signup failed (server error). This is usually caused by a database trigger on the auth.users table. Please check: 1) Go to your Supabase Dashboard → Database → Triggers and remove any "on_auth_user_created" triggers. 2) If using a "profiles" table, ensure it exists and has proper RLS policies. 3) Check the Supabase Dashboard → Logs for the exact PostgreSQL error.` };
      }
      return { success: false, error: error.message };
    }
    if (data.session?.user) {
      return {
        success: true,
        userId: data.session.user.id,
      };
    }

    const { data: signInData, error: signInError } = await withTimeout(supabase.auth.signInWithPassword({
      email: targetEmail,
      password,
    }));

    if (signInError) {
      console.error('[Supabase] Auto-login after signup failed:', signInError);
      return { success: false, error: signInError.message };
    }

    return {
      success: true,
      userId: signInData.user?.id || data.user?.id,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error. Please try again.' };
  }
}

export async function verifyOtp(email: string, token: string, type: 'recovery' = 'recovery'): Promise<AuthResult> {
  if (!SUPABASE_ENABLED) return { success: false, error: 'Supabase is not configured.' };
  try {
    const { data, error } = await withTimeout(supabase.auth.verifyOtp({
      email: getEmailForUser(email),
      token,
      type,
    }));
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
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Verification failed.' };
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!SUPABASE_ENABLED) return { success: false, error: 'Supabase is not configured.' };
  try {
    const { data, error } = await withTimeout(supabase.auth.signInWithPassword({
      email: getEmailForUser(email),
      password,
    }));

    console.log("AUTH RESPONSE:", data);
    console.log("AUTH ERROR:", error);

    if (error) {
      console.error("LOGIN FAILED:", {
        code: (error as any).code,
        message: error.message,
        status: (error as any).status,
        name: error.name,
      });

      if (error.message?.toLowerCase().includes('invalid login credentials')) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    if (!data.user) return { success: false, error: 'No user data returned.' };
    return {
      success: true,
      userId: data.user.id,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Login failed.' };
  }
}

export async function signOut(): Promise<void> {
  if (!SUPABASE_ENABLED) return;
  try { await withTimeout(supabase.auth.signOut(), 5000); } catch { }
}

export async function getSession(): Promise<SessionInfo | null> {
  if (!SUPABASE_ENABLED) return null;
  try {
    const { data: { session } } = await withTimeout(supabase.auth.getSession());
    if (!session?.user) return null;
    return {
      user: session.user,
    };
  } catch {
    return null;
  }
}

export async function sendPasswordResetOtp(email: string): Promise<AuthResult> {
  if (!SUPABASE_ENABLED) return { success: false, error: 'Supabase is not configured.' };
  try {
    const { error } = await withTimeout(supabase.auth.resetPasswordForEmail(getEmailForUser(email)));
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to send reset code.' };
  }
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (!SUPABASE_ENABLED) return { success: false, error: 'Supabase is not configured.' };
  try {
    const { error } = await withTimeout(supabase.auth.updateUser({ password: newPassword }));
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update password.' };
  }
}

export async function getSupabaseUser(): Promise<any | null> {
  try {
    const { data: { user } } = await withTimeout(supabase.auth.getUser());
    return user;
  } catch {
    return null;
  }
}
