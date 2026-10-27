import React, { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2Icon, EyeIcon, EyeOffIcon, Loader2Icon, SendIcon } from 'lucide-react';
import { BrandMark } from '../components/auth/BrandMark';
import { Alert } from '../components/ui/Alert';
import { ChoiceField } from '../components/ui/ChoiceField';
import { InputField } from '../components/ui/InputField';
import { TextAreaField } from '../components/ui/TextAreaField';
import { ROLE_KEYS, ROLE_LABELS, ROLE_SUMMARY, type RoleKey } from '../data/roles';
import { api } from '../utils/api';
import { EMAIL_RE, MIN_PASSWORD_LENGTH, passwordProblem } from '../utils/accountRules';

const ROLE_OPTIONS = ROLE_KEYS.map((r) => ({ value: r, label: ROLE_LABELS[r], description: ROLE_SUMMARY[r] }));

const inputCls =
  'h-12 w-full rounded-lg border border-line-strong bg-white pl-3.5 pr-12 text-base text-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-brand-600 focus:ring-[3px] focus:ring-brand-600/20';

export function RequestAccessView() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleKey | ''>('');
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [trap, setTrap] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const cleanEmail = email.trim().toLowerCase();
  const problems = {
    name: name.trim().length < 2 ? 'Enter your full name' : null,
    email: EMAIL_RE.test(cleanEmail) ? null : 'Enter a valid email address',
    role: role ? null : 'Choose the role you need',
    note: note.trim().length < 5 ? 'Say briefly who you are and why you need access' : null,
    password: passwordProblem(password, cleanEmail),
    confirm: confirm !== password ? 'The passwords do not match' : null,
  };
  const firstProblem = Object.values(problems).find(Boolean);
  const shownError = (k: keyof typeof problems) => (touched ? (problems[k] ?? undefined) : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (firstProblem || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/access-requests', { method: 'POST', body: { name, email: cleanEmail, role, note, password, website: trap } });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[480px]">
        <BrandMark tone="dark" />
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-sm">
          {sent ? (
            <div className="space-y-4 text-center">
              <CheckCircle2Icon className="mx-auto h-10 w-10 text-ok-600" aria-hidden="true" />
              <h1 className="text-xl font-semibold text-ink">Request sent</h1>
              <p className="text-sm text-ink-muted">
                The study PI will review it. You can log in with the email and password you chose once it is approved. There is no email notice, so
                try again later, or contact the study team if you need access sooner. Requests not reviewed within 14 days expire.
              </p>
              <Link href="/login" className="inline-flex min-h-[48px] w-full items-center justify-center rounded-lg bg-forest-700 px-5 font-semibold text-white hover:bg-forest-800">
                Back to log in
              </Link>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold text-ink">Request access</h1>
                <p className="mt-1 text-sm text-ink-muted">
                  For SMART-TB study staff. The PI decides who gets an account and which role. Nothing is available until you are approved.
                </p>
              </div>
              {error && <Alert tone="danger" title={error} />}

              <InputField id="req-name" label="Full name" value={name} onChange={setName} required autoComplete="name" maxLength={80} error={shownError('name')} />
              <InputField
                id="req-email"
                label="Email address"
                value={email}
                onChange={setEmail}
                required
                autoComplete="email"
                maxLength={120}
                hint="This will be your login name"
                error={shownError('email')}
              />
              <ChoiceField
                id="req-role"
                label="Role you need"
                options={ROLE_OPTIONS}
                value={role}
                onChange={setRole}
                layout="stack"
                required
                hint="The PI makes the final decision on your role"
                error={shownError('role')}
              />
              <TextAreaField
                id="req-note"
                label="Who are you, and why do you need access?"
                value={note}
                onChange={setNote}
                required
                rows={3}
                placeholder="e.g. Research officer at NRS Medical College, collecting data for SMART-TB"
                error={shownError('note')}
              />

              {/* Trap for automated form fillers: people never see or fill this. */}
              <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="req-website">Website</label>
                <input id="req-website" type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
              </div>

              <div>
                <label htmlFor="req-password" className="block text-sm font-medium text-ink">
                  Choose a password <span className="text-danger-600">*</span>
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="req-password"
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={touched && !!problems.password}
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
                <p className={`mt-1.5 text-sm ${touched && problems.password ? 'text-danger-700' : 'text-ink-muted'}`}>
                  {touched && problems.password ? problems.password : `At least ${MIN_PASSWORD_LENGTH} characters, with letters and numbers.`}
                </p>
              </div>
              <div>
                <label htmlFor="req-confirm" className="block text-sm font-medium text-ink">
                  Confirm password <span className="text-danger-600">*</span>
                </label>
                <input
                  id="req-confirm"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={touched && !!problems.confirm}
                  className={`mt-1.5 ${inputCls}`}
                />
                {touched && problems.confirm && <p className="mt-1.5 text-sm text-danger-700">{problems.confirm}</p>}
              </div>

              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-forest-700 px-5 text-[15px] font-semibold text-white hover:bg-forest-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-700 focus-visible:ring-offset-2 disabled:bg-lock-100 disabled:text-lock-500"
              >
                {busy ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SendIcon className="h-4 w-4" aria-hidden="true" />}
                Send request
              </button>
              <p className="text-center text-sm text-ink-muted">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-brand-700 hover:underline">
                  Log in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
