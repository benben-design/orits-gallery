import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import AdminLoginForm from '@/components/admin/AdminLoginForm';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { adminLocale } from '@/lib/i18n/config';
import { safeReturnTo, RETURN_TO_PARAM } from '@/lib/auth/admin-guard';
import styles from './page.module.css';

/**
 * /admin/login — the real thing.
 *
 * A server component that loads the Hebrew dictionary and hands the strings to
 * the form, which is a client component only because it has to show a failure
 * in place. The form posts to a Server Action; there is no login endpoint and
 * no URL that could ever carry a credential. See app/(admin)/admin/actions.js.
 *
 * **This page sits outside `(guarded)/` on purpose.** It is the one admin page
 * a signed-out person must be able to reach, and a guard covering it would send
 * it to itself forever.
 *
 * It carries the guard's `next` parameter through to the form as a hidden
 * field, so signing in returns to the page that was originally asked for. The
 * value is narrowed here and again in the action — it arrives from a URL, so
 * it is somebody else's input in both places.
 */
export async function generateMetadata() {
  const dictionary = await getDictionary(adminLocale);
  return { title: dictionary.admin.login.title };
}

export default async function AdminLoginPage({ searchParams }) {
  const dictionary = await getDictionary(adminLocale);
  const { login } = dictionary.admin;

  const params = await searchParams;
  const returnTo = safeReturnTo(params?.[RETURN_TO_PARAM]);

  return (
    <Section as="div">
      <Container width="measure">
        <h1 className={styles.title}>{login.title}</h1>

        <AdminLoginForm
          returnTo={returnTo}
          labels={{
            email: login.emailLabel,
            password: login.passwordLabel,
            submit: login.submit,
            submitting: login.submitting,
            error: login.error,
            tooManyAttempts: login.tooManyAttempts,
          }}
        />
      </Container>
    </Section>
  );
}
