"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { AuthState } from "@/app/(auth)/actions";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link href="/" className="text-xs font-semibold uppercase tracking-widest text-teal-800">
          Dashboards IA
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">{children}</div>
      {footer && <div className="text-center text-sm text-slate-600">{footer}</div>}
    </main>
  );
}

export function AuthForm({
  action,
  submitLabel,
  children,
}: {
  action: (state: AuthState, form: FormData) => Promise<AuthState>;
  submitLabel: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  // React vide le formulaire après l'envoi : on réaffiche les saisies non sensibles en cas d'erreur.
  useEffect(() => {
    for (const [name, value] of Object.entries(state.fields ?? {})) {
      const input = formRef.current?.elements.namedItem(name);
      if (input instanceof HTMLInputElement) input.value = value;
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {children}
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.info && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {state.info}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:opacity-60"
      >
        {pending ? "Patientez…" : submitLabel}
      </button>
    </form>
  );
}

export function Field({
  id,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
        {...input}
      />
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
