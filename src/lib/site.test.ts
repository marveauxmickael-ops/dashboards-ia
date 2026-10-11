import { describe, expect, it } from "vitest";
import { isVercelPreviewHost } from "./site";

describe("adresse des liens envoyés", () => {
  it("reconnaît les adresses de prévisualisation Vercel, protégées par un compte Vercel", () => {
    expect(isVercelPreviewHost("dashboards-ia-k3j9x2m1p-creetacrea.vercel.app")).toBe(true);
    expect(isVercelPreviewHost("dashboards-ia-git-main-creetacrea.vercel.app")).toBe(true);
    expect(isVercelPreviewHost("dashboards-ia.vercel.app")).toBe(false);
    expect(isVercelPreviewHost("dashboards-ia-creetacrea.vercel.app")).toBe(false);
    expect(isVercelPreviewHost("app.dashboards-ia.fr")).toBe(false);
  });
});
