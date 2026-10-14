import type { ButtonHTMLAttributes } from "react";

// Boutons de la direction artistique : pilule bleue (action principale), contour (secondaire), discret (tertiaire).
// Transitions courtes ; l'état désactivé et le focus clavier restent toujours visibles.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "ai";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:scale-[0.98]";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand-800 text-white shadow-sm hover:bg-brand-900 hover:shadow-float",
  secondary: "border border-slate-300 bg-white text-slate-900 hover:border-brand-300 hover:bg-brand-50",
  ghost: "text-brand-900 hover:bg-brand-50",
  ai: "bg-accent-600 text-white shadow-sm hover:bg-accent-700",
};

export function buttonClass(variant: ButtonVariant = "primary", extra = ""): string {
  return `${BASE} ${VARIANT[variant]} ${extra}`.trim();
}

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}
