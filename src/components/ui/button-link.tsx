import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClass, type ButtonVariant } from "./button";

/** Lien présenté comme un bouton (navigation Next.js) ; fichier séparé pour que la démo navigateur n'embarque pas Next. */
export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
