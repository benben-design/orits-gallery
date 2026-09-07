'use client';

import { useActionState } from 'react';
import { LogIn } from 'lucide-react';
import { signIn } from '@/app/(admin)/admin/actions';
import styles from './AdminLoginForm.module.css';

/**
 * The sign-in form. **The third client component in the project**, and the only
 * one in the admin.
 *
 * It is a client component for one reason: the failure message has to appear on
 * the page without the email being carried through a URL to get there.
 * `useActionState` — React 19 — keeps the action's return value in state across
 * the submission, so the form can say "that was wrong" in place. The obvious
 * alternative, redirecting back to `?error=1`, would work, but it puts the
 * outcome of a credential check into a URL that gets logged and shared, and
 * one careless change later that URL carries the email too.
 *
 * Every string is a prop. The dictionary is loaded on the server and passed
 * down — see .claude/rules/i18n.md.
 *
 * Both fields are `required`, so an empty submission never reaches the server.
 * The server checks the same thing anyway; the attribute is for the person
 * typing, not for safety.
 *
 * Both inputs carry `dir="ltr"`. The page is right-to-left, but an email
 * address and a password are Latin strings, and typing one into an RTL field
 * puts the cursor and any punctuation in a place that looks wrong and reads
 * worse. This is the same rule that keeps prices and Latin names LTR inside
 * Hebrew text.
 */
export default function AdminLoginForm({ labels, returnTo }) {
  const [state, formAction, isPending] = useActionState(signIn, { failed: false });

  return (
    <form action={formAction} className={styles.form}>
      {/*
        Where to go after signing in, put here by the guard that sent us. A
        hidden field rather than a value closed over by the action, because the
        action re-reads and re-checks it anyway — a bound value would look
        trustworthy and would not be.
      */}
      <input type="hidden" name="returnTo" value={returnTo} />
      {/*
        Announced when it appears, because someone using a screen reader gets no
        other signal that the page changed — the form looks identical.
      */}
      {state.failed ? (
        <p className={styles.error} role="alert">
          {/*
            Two reasons, two sentences. Telling someone their password is wrong
            when the server has actually stopped listening sends them round the
            same loop faster, which is the opposite of what a rate limit is
            for. Neither message names an address or a remaining time.
          */}
          {state.reason === 'tooManyAttempts' ? labels.tooManyAttempts : labels.error}
        </p>
      ) : null}

      <div className={styles.field}>
        <label htmlFor="admin-email" className={styles.label}>
          {labels.email}
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          className={styles.input}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="admin-password" className={styles.label}>
          {labels.password}
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          className={styles.input}
          autoComplete="current-password"
          dir="ltr"
          required
        />
      </div>

      <button type="submit" className={styles.submit} disabled={isPending}>
        <LogIn size={18} strokeWidth={1.5} aria-hidden="true" />
        <span>{isPending ? labels.submitting : labels.submit}</span>
      </button>
    </form>
  );
}
