import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertOctagonIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  HistoryIcon,
  InfoIcon,
  Loader2Icon,
  LockIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { IDLE_TIMEOUT_MIN, useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import { EMAIL_RE } from '../utils/accountRules';

interface TestAccount {
  email: string;
  name: string;
  roleLabel: string;
  isAdmin: boolean;
}
import { HERO_DESKTOP_URL, HERO_FALLBACK, HERO_MOBILE_URL } from '../data/assets';
import { BrandMark } from '../components/auth/BrandMark';
import { LoadingScreen } from '../components/auth/LoadingScreen';


type BannerTone = 'ok' | 'warn' | 'danger';

const BANNER: Record<BannerTone, { box: string; bar: string; icon: React.ElementType }> = {
  ok: { box: 'border-forest-200 bg-forest-50 text-forest-800', bar: 'bg-forest-600', icon: CheckCircle2Icon },
  warn: { box: 'border-warn-200 bg-warn-50 text-warn-700', bar: 'bg-warn-600', icon: ClockIcon },
  danger: { box: 'border-danger-200 bg-danger-50 text-danger-700', bar: 'bg-danger-600', icon: AlertOctagonIcon },
};

function Banner({ tone, children }: { tone: BannerTone; children: React.ReactNode }) {
  const t = BANNER[tone];
  const Icon = t.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`relative flex items-start gap-3 overflow-hidden rounded-xl border py-3 pl-5 pr-4 text-sm font-semibold ${t.box}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${t.bar}`} aria-hidden="true" />
      <Icon className="mt-px h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </motion.div>
  );
}

const FEATURES = [
  { icon: ShieldCheckIcon, text: 'Role-based access for authorised study staff only' },
  { icon: HistoryIcon, text: 'Full audit trail: every edit is timestamped with a reason' },
  { icon: SmartphoneIcon, text: 'Built for the ward: phones, tablets and desktops' },
];

/** Only allow same-origin relative paths as the post-login destination. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login') ? raw : '/';
}

export function LoginView() {
  const { session, loading, transition, notice, clearNotice, signIn, signInAsTest, lockoutRemaining } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));

  const [step, setStep] = useState<'email' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [demoOpen, setDemoOpen] = useState(true);
  const [testAccounts, setTestAccounts] = useState<TestAccount[]>([]);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const locked = step === 'password' && lockoutRemaining(email) > 0;

  // The server lists test accounts only while ALLOW_TEST_LOGIN is on (testing phase).
  useEffect(() => {
    api<{ accounts: TestAccount[] }>('/api/auth/test-accounts')
      .then((r) => setTestAccounts(r.accounts))
      .catch(() => setTestAccounts([]));
  }, []);

  // Move on once the sign-in loading screen has finished.
  useEffect(() => {
    if (session && !transition) router.replace(next);
  }, [session, transition, router, next]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (step === 'password') passwordRef.current?.focus();
      else emailRef.current?.focus();
    }, 180);
    return () => window.clearTimeout(t);
  }, [step]);

  // While the sign-in hold runs, the auth layer already shows the loading screen.
  if (session) return transition ? null : <LoadingScreen message="Signing you in…" />;
  if (loading) return <LoadingScreen message="Checking your session…" />;

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);
    if (!emailValid) return;
    setError(null);
    clearNotice();
    setStep('password');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy || locked) return;
    setBusy(true);
    setError(null);
    const result = await signIn(email, password);
    if (result.ok) return; // the session effect redirects
    setBusy(false);
    setError(result.error);
    setPassword('');
    passwordRef.current?.focus();
  };

  const backToEmail = () => {
    setStep('email');
    setPassword('');
    setError(null);
    setShowForgot(false);
  };

  const pickTestAccount = async (a: TestAccount) => {
    if (busy) return;
    clearNotice();
    setError(null);
    setBusy(true);
    const result = await signInAsTest(a.email);
    if (result.ok) return; // the session effect redirects
    setBusy(false);
    setError(result.error);
  };

  return (
    <div className="relative flex min-h-screen w-full bg-forest-950 lg:bg-white">
      {/* Mobile illustration: art on top, dark copy-space below */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[48vh] min-h-[320px] overflow-hidden lg:hidden" style={{ background: HERO_FALLBACK }}>
        {HERO_MOBILE_URL && <Image src={HERO_MOBILE_URL} alt="" fill priority unoptimized sizes="100vw" className="object-cover object-top" />}
        <div className="absolute inset-0 bg-gradient-to-b from-forest-950/30 via-transparent to-forest-950" />
      </div>

      {/* Login panel */}
      <section className="relative z-10 flex w-full flex-col lg:w-[480px] lg:shrink-0 lg:bg-white xl:w-[520px]">
        <div className="px-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 lg:hidden">
          <BrandMark tone="light" />
        </div>
        <div className="h-[18vh] min-h-[110px] lg:hidden" aria-hidden="true" />

        <div className="flex flex-1 flex-col rounded-t-[28px] bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:px-10 lg:rounded-none lg:px-14 lg:pt-12 lg:shadow-none">
          <div className="hidden lg:block">
            <BrandMark tone="dark" />
          </div>

          <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col lg:mx-0 lg:mt-16">
            <h1 className="font-serif text-[32px] leading-[1.15] text-forest-900 sm:text-[38px]">Log in to your account</h1>
            <p className="mt-3 text-[15px] text-ink-soft">
              Restricted to authorised SMART-TB study personnel.{' '}
              <span className="whitespace-nowrap">Need access? Ask your study admin.</span>
            </p>

            <div className="mt-6 space-y-3" aria-live="polite">
              {notice === 'signed_out' && !error && <Banner tone="ok">You have successfully logged out.</Banner>}
              {notice === 'timeout' && !error && (
                <Banner tone="warn">Your session ended after {IDLE_TIMEOUT_MIN} minutes of inactivity. Please log in again.</Banner>
              )}
              {error && <Banner tone="danger">{error}</Banner>}
            </div>

            <div className="mt-6">
              <AnimatePresence mode="wait" initial={false}>
                {step === 'email' ? (
                  <motion.form
                    key="email"
                    onSubmit={handleNext}
                    noValidate
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    <label htmlFor="login-email" className="block text-sm font-semibold text-ink">
                      Email address
                    </label>
                    <input
                      ref={emailRef}
                      id="login-email"
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => email && setEmailTouched(true)}
                      aria-invalid={emailTouched && !emailValid}
                      aria-describedby={emailTouched && !emailValid ? 'login-email-err' : undefined}
                      placeholder="name@institution.org"
                      className={`mt-2 h-12 w-full rounded-lg border bg-white px-3.5 text-base text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-muted/60 focus:ring-[3px] ${
                        emailTouched && !emailValid
                          ? 'border-danger-600 focus:ring-danger-600/20'
                          : 'border-line-strong focus:border-brand-600 focus:ring-brand-600/20'
                      }`}
                    />
                    {emailTouched && !emailValid && (
                      <p id="login-email-err" className="mt-1.5 text-sm text-danger-700">
                        Enter a valid email address.
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={!emailValid}
                      className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-forest-700 px-5 text-[15px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-forest-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-lock-100 disabled:text-lock-500 disabled:active:scale-100 sm:w-auto"
                    >
                      Next
                      <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </motion.form>
                ) : (
                  <motion.form
                    key="password"
                    onSubmit={handleSubmit}
                    noValidate
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    <p className="text-sm font-semibold text-ink">Email address</p>
                    <div className="mt-2 flex min-h-[48px] items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-3.5">
                      <span className="truncate text-[15px] text-ink">{email.trim()}</span>
                      <button
                        type="button"
                        onClick={backToEmail}
                        className="min-h-[40px] shrink-0 rounded text-sm font-semibold text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                      >
                        Change
                      </button>
                    </div>

                    <div className="mt-5 flex items-center justify-between">
                      <label htmlFor="login-password" className="text-sm font-semibold text-ink">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowForgot((v) => !v)}
                        aria-expanded={showForgot}
                        className="min-h-[36px] rounded text-sm font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <AnimatePresence initial={false}>
                      {showForgot && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden text-sm text-ink-soft"
                        >
                          <span className="mt-1 flex gap-2 rounded-lg bg-brand-50 p-3">
                            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                            For security, passwords are reset only by the study administrator. Contact the SMART-TB data manager to receive a reset link.
                          </span>
                        </motion.p>
                      )}
                    </AnimatePresence>
                    <div className="relative mt-2">
                      <input
                        ref={passwordRef}
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={busy}
                        className="h-12 w-full rounded-lg border border-line-strong bg-white pl-3.5 pr-12 text-base text-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-brand-600 focus:ring-[3px] focus:ring-brand-600/20 disabled:bg-canvas"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                      >
                        {showPassword ? <EyeOffIcon className="h-5 w-5" aria-hidden="true" /> : <EyeIcon className="h-5 w-5" aria-hidden="true" />}
                      </button>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
                      <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      You will be signed out after {IDLE_TIMEOUT_MIN} minutes of inactivity.
                    </p>

                    <button
                      type="submit"
                      disabled={!password || busy || locked}
                      className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-forest-700 px-5 text-[15px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-forest-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-lock-100 disabled:text-lock-500 disabled:active:scale-100"
                    >
                      {busy ? (
                        <>
                          <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Verifying…
                        </>
                      ) : (
                        <>
                          <LockIcon className="h-4 w-4" aria-hidden="true" />
                          Log in securely
                        </>
                      )}
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            {/* Testing phase only: one-tap sign-in, shown while the server has ALLOW_TEST_LOGIN on */}
            {testAccounts.length > 0 && (
            <div className="mt-8 rounded-xl border border-dashed border-line-strong">
              <button
                type="button"
                onClick={() => setDemoOpen((v) => !v)}
                aria-expanded={demoOpen}
                className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl px-4 text-left text-sm font-medium text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                <span>
                  Test accounts — tap to sign in
                  <span className="ml-2 rounded-full bg-warn-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warn-700">Testing</span>
                </span>
                <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ${demoOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              <AnimatePresence initial={false}>
                {demoOpen && (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden px-2 pb-2"
                  >
                    {testAccounts.map((a) => (
                      <li key={a.email}>
                        <button
                          type="button"
                          onClick={() => void pickTestAccount(a)}
                          disabled={busy}
                          className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg px-2 text-left transition-colors duration-150 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">
                              {a.name} · {a.roleLabel}
                              {a.isAdmin ? ' + admin' : ''}
                            </span>
                            <span className="block truncate text-xs text-ink-muted">{a.email}</span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-brand-700">Sign in</span>
                        </button>
                      </li>
                    ))}
                    <li className="px-2 pt-1 text-xs text-ink-muted">For testing with dummy data only. Switched off before real participants are entered.</li>
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
            )}

            <div className="mt-auto pt-10">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
                <ShieldCheckIcon className="mt-px h-4 w-4 shrink-0 text-forest-600" aria-hidden="true" />
                Contains confidential participant data. Access is monitored and audited; unauthorised use is prohibited.
              </p>
              <p className="mt-3 text-xs text-ink-muted">© 2026 SMART-TB Study · NRS Medical College &amp; Hospital, Kolkata</p>
            </div>
          </div>
        </div>
      </section>

      {/* Desktop illustration */}
      <aside className="relative hidden flex-1 overflow-hidden lg:block" style={{ background: HERO_FALLBACK }}>
        {HERO_DESKTOP_URL && (
          <Image src={HERO_DESKTOP_URL} alt="" aria-hidden="true" fill priority unoptimized sizes="(min-width: 1024px) 70vw, 0px" className="object-cover object-[72%_center]" />
        )}
        <div className="absolute inset-y-0 left-0 w-[70%] bg-gradient-to-r from-forest-950/90 via-forest-950/55 to-transparent" aria-hidden="true" />

        <div className="relative flex h-full flex-col justify-between p-14 xl:p-20">
          <div className="max-w-[520px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-forest-200 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-forest-300" aria-hidden="true" />
              HRZE Pharmacokinetic Study
            </span>
            <h2 className="mt-6 text-[44px] font-bold leading-[1.08] tracking-tight text-white xl:text-[52px]">Precision dosing begins with precise data.</h2>
            <p className="mt-6 max-w-[440px] text-[17px] leading-relaxed text-white/80">
              SMART-TB study of first-line anti-TB therapy
            </p>
            <ul className="mt-8 space-y-4">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-[15px] text-white/90">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forest-300/15 text-forest-300 ring-1 ring-inset ring-forest-300/25">
                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <div className="max-w-[560px] border-t border-white/10 pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Study partners</p>
            <p className="mt-2 text-sm text-white/80">NRS Medical College &amp; Hospital, Kolkata · Dr. RMLIMS, Lucknow · ICMR-NIRBI</p>
            <p className="mt-1 text-xs text-white/50">IEC-approved protocol v1.1.1 · GCP &amp; ICMR ethical guidelines</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
