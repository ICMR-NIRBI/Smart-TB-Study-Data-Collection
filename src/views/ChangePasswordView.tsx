import React, { useState } from 'react';
import { EyeIcon, EyeOffIcon, Loader2Icon, LockIcon } from 'lucide-react';
import { toast } from 'sonner';
import { BrandMark } from '../components/auth/BrandMark';
import { Alert } from '../components/ui/Alert';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '../utils/accountRules';

const inputCls =
  'h-12 w-full rounded-lg border border-line-strong bg-white pl-3.5 pr-12 text-base text-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-brand-600 focus:ring-[3px] focus:ring-brand-600/20';

/** Shown instead of the app while an account still has a temporary password. */
export function ChangePasswordView() {
  const { session, passwordChanged, signOut } = useAuth();
  const email = session?.email ?? '';
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pwProblem = passwordProblem(password, email) ?? (password === current ? 'Choose a password different from the temporary one' : null);
  const mismatch = confirm !== password ? 'The passwords do not match' : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!current || pwProblem || mismatch || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: password } });
      toast.success('Password changed');
      passwordChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[440px]">
        <BrandMark tone="dark" />
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-sm">
          <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold text-ink">Choose a new password</h1>
              <p className="mt-1 text-sm text-ink-muted">
                You signed in with a temporary password. Choose your own for <span className="font-medium text-ink">{email}</span> to continue.
              </p>
            </div>
            {error && <Alert tone="danger" title={error} />}

            <div>
              <label htmlFor="current-password" className="block text-sm font-semibold text-ink">
                Temporary password
              </label>
              <input
                id="current-password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                aria-invalid={touched && !current}
                className={`mt-2 ${inputCls}`}
              />
              {touched && !current && <p className="mt-1.5 text-sm text-danger-700">Enter the temporary password you were given</p>}
            </div>

            <div>
              <label htmlFor="new-password" className="block text-sm font-semibold text-ink">
                New password
              </label>
              <div className="relative mt-2">
                <input
                  id="new-password"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={touched && !!pwProblem}
                  aria-describedby="new-password-msg"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? 'Hide passwords' : 'Show passwords'}
                  aria-pressed={show}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  {show ? <EyeOffIcon className="h-5 w-5" aria-hidden="true" /> : <EyeIcon className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
              <p id="new-password-msg" className={`mt-1.5 text-sm ${touched && pwProblem ? 'text-danger-700' : 'text-ink-muted'}`}>
                {touched && pwProblem ? pwProblem : `At least ${MIN_PASSWORD_LENGTH} characters, with letters and numbers.`}
              </p>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-semibold text-ink">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={touched && !!mismatch}
                className={`mt-2 ${inputCls}`}
              />
              {touched && mismatch && <p className="mt-1.5 text-sm text-danger-700">{mismatch}</p>}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-forest-700 px-5 text-[15px] font-semibold text-white hover:bg-forest-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-700 focus-visible:ring-offset-2 disabled:bg-lock-100 disabled:text-lock-500"
            >
              {busy ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LockIcon className="h-4 w-4" aria-hidden="true" />}
              Change password
            </button>
            <button
              type="button"
              onClick={() => signOut()}
              className="block w-full text-center text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              Log out instead
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
