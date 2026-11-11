import React, { useEffect, useState } from 'react';
import { LogIn, LogOut, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { AUTH_CONFIG, AuthUser, authEnabled, completeSignInIfReturning, currentUser, isAllowed, signOut, startSignIn } from './auth';
import { REDIRON_LOGO } from './rediron-logo';

type Phase = 'checking' | 'signedOut' | 'denied' | 'ok';

// Shows a "Sign in with JumpCloud" screen until the person is signed in and in the allowed group.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const enabled = authEnabled();
  const [phase, setPhase] = useState<Phase>(enabled ? 'checking' : 'ok');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    (async () => {
      const r = await completeSignInIfReturning();
      if (r.error) setError(r.error);
      const u = currentUser();
      setUser(u);
      setPhase(!u ? 'signedOut' : isAllowed(u) ? 'ok' : 'denied');
    })();
  }, [enabled]);

  // The JumpCloud token is short-lived: ask to sign in again when it runs out
  useEffect(() => {
    if (!enabled || phase !== 'ok') return;
    const t = setInterval(() => { if (!currentUser()) { setExpired(true); setPhase('signedOut'); } }, 30000);
    return () => clearInterval(t);
  }, [enabled, phase]);

  if (!enabled) return <>{children}</>;

  const go = async () => { setBusy(true); await startSignIn(); };
  const out = () => { signOut(); setUser(null); setExpired(false); setError(null); setPhase('signedOut'); };

  if (phase === 'ok' && user) {
    return (
      <>
        {children}
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-white/95 backdrop-blur border border-slate-200 shadow-lg rounded-2xl pl-4 pr-2 py-2">
          <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
          <div className="leading-tight">
            <p className="text-xs font-black text-slate-800">{user.name}</p>
            {user.email && <p className="text-[10px] font-bold text-slate-400">{user.email}</p>}
          </div>
          <button onClick={out} title="Sign out" className="ml-1 p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100"><LogOut size={16} /></button>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-[40px] border border-slate-200 shadow-sm p-10 text-center">
        <img src={REDIRON_LOGO} alt="RedIron - Forging Retail Innovation" className="w-56 h-auto mx-auto mb-8" />
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">CloudSpend</h1>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8">Enterprise Hub</p>

        {phase === 'checking' && (
          <p className="flex items-center justify-center gap-2 text-sm font-bold text-slate-500"><Loader2 size={16} className="animate-spin" /> Signing you in…</p>
        )}

        {phase === 'signedOut' && (
          <>
            <p className="text-sm font-bold text-slate-500 mb-6">{expired ? 'Your session has expired. Sign in again to keep going.' : 'Sign in with your RedIron JumpCloud account to view cloud costs.'}</p>
            <button onClick={go} disabled={busy} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform disabled:opacity-60">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Sign in with JumpCloud
            </button>
          </>
        )}

        {phase === 'denied' && user && (
          <>
            <div className="flex items-start gap-3 text-left bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
              <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-amber-900">
                You're signed in as <span className="font-black">{user.email || user.name}</span>, but your account isn't in the <span className="font-black">{AUTH_CONFIG.requiredGroup}</span> group. Ask your JumpCloud admin to add you, then sign in again.
                {user.groups.length > 0 && <span className="block mt-2 text-xs font-bold text-amber-700">Groups JumpCloud sent: {user.groups.join(', ')}</span>}
                {user.groups.length === 0 && <span className="block mt-2 text-xs font-bold text-amber-700">No groups came through with the sign-in. Admin: on the CloudSpend app in JumpCloud, tick “Include group attribute” with the name memberOf.</span>}
              </p>
            </div>
            <button onClick={out} className="w-full py-3 bg-slate-100 text-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200">Sign out</button>
          </>
        )}

        {error && <p className="mt-6 text-xs font-bold text-rose-600 break-words">Sign-in problem: {error}</p>}
        <p className="mt-8 text-[10px] font-bold text-slate-300">Secured by JumpCloud single sign-on</p>
      </div>
    </div>
  );
}
