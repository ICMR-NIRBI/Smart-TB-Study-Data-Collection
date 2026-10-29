import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2Icon, EyeIcon, EyeOffIcon, Loader2Icon, LockIcon } from 'lucide-react';
import { BrandMark } from '../components/auth/BrandMark';
import { Alert } from '../components/ui/Alert';
import { api } from '../utils/api';
import { EMAIL_RE, MIN_PASSWORD_LENGTH, passwordProblem } from '../utils/accountRules';

const inputCls =
  'h-12 w-full rounded-lg border border-line-strong bg-white px-3.5 text-base text-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-brand-600 focus:ring-[3px] focus:ring-brand-600/20';

const LOGIN_BUTTON =
  'inline-flex min-h-[48px] w-full items-center justify-center rounded-lg bg-forest-700 px-5 font-semibold text-white hover:bg-forest-800';

/** Where a person lands from an invitation link: they give their own name, email and password. */
export function JoinView() {
  const token = useSearchParams().get('token') ?? '';
  const [roleName, setRoleName] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLinkError('This page needs the invitation link sent by your study administrator.');
      return;
    }
    api<{ invite: { roleLabel: string } }>(`/api/join?token=${encodeURIComponent(token)}`)
      .then((r) => setRoleName(r.invite.roleLabel))
      .catch((err: unknown) => setLinkError(err instanceof Error ? err.message : 'This invitation link is not valid.'));
  }, [token]);

  const problems = {
    name: name.trim().length < 2 ? 'Enter your full name' : null,
    email: !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address' : null,
    password: passwordProblem(password, email.trim()),
    confirm: confirm !== password ? 'The passwords do not match' : null,
  };
  const valid = !problems.name && !problems.email && !problems.password && !problems.confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/join', { method: 'POST', body: { token, name: name.trim(), email: email.trim(), password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      aria-label={show ? 'Hide password' : 'Show password'}
      aria-pressed={show}
      className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
    >
      {show ? <EyeOffIcon className="h-5 w-5" aria-hidden="true" /> : <EyeIcon className="h-5 w-5" aria-hidden="true" />}
    </button>
  );

  const hint = (shown: boolean, text: string | null) => (shown && text ? <p className="mt-1.5 text-sm text-danger-700">{text}</p> : null);

  return (
    <main className="flex min-h-screen w-full justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[440px]">
        <BrandMark tone="dark" />
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-sm">
          {done ? (
            <div className="space-y-4 text-center">
              <CheckCircle2Icon className="mx-auto h-10 w-10 text-ok-600" aria-hidden="true" />
              <h1 className="text-xl font-semibold text-ink">Account created</h1>
              <p className="text-sm text-ink-muted">
                Log in with {email.trim().toLowerCase()} and the password you chose. This link has now been used, so next time go straight to the log in page.
              </p>
              <Link href="/login" className={LOGIN_BUTTON}>
                Go to log in
              </Link>
            </div>
          ) : linkError ? (
            <div className="space-y-4">
              <h1 className="text-xl font-semibold text-ink">Link not valid</h1>
              <Alert tone="warn" title={linkError} />
              <p className="text-sm text-ink-muted">If you already created your account from this link, log in instead.</p>
              <Link href="/login" className={LOGIN_BUTTON}>
                Go to log in
              </Link>
            </div>
          ) : !roleName ? (
            <div className="flex justify-center py-8 text-ink-muted" aria-busy="true">
              <Loader2Icon className="h-6 w-6 animate-spin" aria-hidden="true" />
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold text-ink">Create your account</h1>
                <p className="mt-1 text-sm text-ink-muted">
                  You are joining the SMART-TB study as <span className="font-medium text-ink">{roleName}</span>. The link works once.
                </p>
              </div>
              {error && <Alert tone="danger" title={error} />}
              <div>
                <label htmlFor="join-name" className="block text-sm font-semibold text-ink">
                  Full name
                </label>
                <input id="join-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={`mt-2 ${inputCls}`} />
                {hint(touched, problems.name)}
              </div>
              <div>
                <label htmlFor="join-email" className="block text-sm font-semibold text-ink">
                  Email address
                </label>
                <input
                  id="join-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`mt-2 ${inputCls}`}
                />
                <p className="mt-1.5 text-sm text-ink-muted">This is what you use to log in.</p>
                {hint(touched, problems.email)}
              </div>
              <div>
                <label htmlFor="join-password" className="block text-sm font-semibold text-ink">
                  Password
                </label>
                <div className="relative mt-2">
                  <input
                    id="join-password"
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputCls} pr-12`}
                  />
                  {toggle}
                </div>
                {touched && problems.password ? hint(true, problems.password) : <p className="mt-1.5 text-sm text-ink-muted">At least {MIN_PASSWORD_LENGTH} characters, with letters and numbers.</p>}
              </div>
              <div>
                <label htmlFor="join-confirm" className="block text-sm font-semibold text-ink">
                  Confirm password
                </label>
                <input
                  id="join-confirm"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={`mt-2 ${inputCls}`}
                />
                {hint(touched, problems.confirm)}
              </div>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-forest-700 px-5 text-[15px] font-semibold text-white hover:bg-forest-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-700 focus-visible:ring-offset-2 disabled:bg-lock-100 disabled:text-lock-500"
              >
                {busy ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LockIcon className="h-4 w-4" aria-hidden="true" />}
                Create account
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
