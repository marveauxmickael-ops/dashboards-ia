"use client";

import { useState } from "react";
import { chartPalette, extractColors, LOGO_MAX_HEIGHT, LOGO_MAX_WIDTH, MAX_LOGO_LENGTH, readableOnWhite, type Branding } from "@/lib/branding";

export type SaveBranding = (branding: Branding) => Promise<{ ok: true } | { ok: false; message: string }>;

const COLOR_NAMES = ["Couleur principale", "Couleur secondaire", "Couleur d'accent", "Couleur 4", "Couleur 5", "Couleur 6"];
const ACCEPTED = "image/png,image/jpeg,image/webp,image/svg+xml";

/**
 * Lit l'image dans le navigateur et la réencode en PNG redimensionné : le logo enregistré ne contient
 * ni script (cas d'un SVG), ni métadonnées, et reste léger. Renvoie aussi les pixels pour l'extraction des couleurs.
 */
async function encodeLogo(file: File): Promise<{ dataUrl: string; colors: string[] }> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image illisible."));
      img.src = url;
    });
    const width = image.naturalWidth || LOGO_MAX_WIDTH;
    const height = image.naturalHeight || LOGO_MAX_HEIGHT;
    let scale = Math.min(1, LOGO_MAX_WIDTH / width, LOGO_MAX_HEIGHT / height);
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Image illisible.");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.length <= MAX_LOGO_LENGTH) {
        return { dataUrl, colors: extractColors(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
      }
      scale *= 0.7;
    }
    throw new Error("Logo trop volumineux, même réduit.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Réglage de la charte graphique : logo et couleurs, avec aperçu sur un mini-dashboard. */
export function BrandSettings({ initial, onSave, organization }: { initial: Branding; onSave: SaveBranding; organization: string }) {
  const [branding, setBranding] = useState(initial);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [state, setState] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const palette = chartPalette(branding);
  const primary = palette[0];

  async function importLogo(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED.split(",").includes(file.type)) return setState({ tone: "error", text: "Format accepté : PNG, JPEG, WebP ou SVG." });
    if (file.size > 5 * 1024 * 1024) return setState({ tone: "error", text: "Le fichier dépasse 5 Mo." });
    try {
      const { dataUrl, colors } = await encodeLogo(file);
      setSuggested(colors);
      // Sans couleurs déjà choisies, celles du logo sont proposées d'office.
      setBranding((b) => ({ logo: dataUrl, colors: b.colors.length > 0 ? b.colors : colors }));
      setState(
        colors.length > 0
          ? { tone: "info", text: `${colors.length} couleur(s) détectée(s) dans le logo. Ajustez-les si besoin, puis enregistrez.` }
          : { tone: "info", text: "Aucune couleur marquée détectée dans le logo : choisissez vos couleurs ci-dessous." },
      );
    } catch (error) {
      setState({ tone: "error", text: error instanceof Error ? error.message : "Image illisible." });
    }
  }

  async function save() {
    setBusy(true);
    const outcome = await onSave(branding);
    setBusy(false);
    setState(outcome.ok ? { tone: "success", text: "Charte enregistrée : elle s'applique à tous les dashboards de l'organisation." } : { tone: "error", text: outcome.message });
  }

  const setColor = (i: number, value: string) => setBranding((b) => ({ ...b, colors: b.colors.map((c, j) => (j === i ? value.toLowerCase() : c)) }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-slate-900">Logo</h2>
          <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
            {branding.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL locale, pas d'optimisation possible
              <img src={branding.logo} alt={`Logo ${organization}`} className="max-h-20 max-w-full object-contain" />
            ) : (
              <span className="text-sm text-slate-500">Aucun logo</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
              {branding.logo ? "Remplacer le logo" : "Importer le logo"}
              <input type="file" accept={ACCEPTED} className="sr-only" onChange={(e) => void importLogo(e.target.files?.[0])} />
            </label>
            {branding.logo && (
              <button type="button" onClick={() => setBranding((b) => ({ ...b, logo: null }))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                Retirer le logo
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">PNG, JPEG, WebP ou SVG, 5 Mo maximum. Le logo est redimensionné et converti en PNG dans votre navigateur.</p>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-slate-900">Couleurs de la charte</h2>
          {suggested.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              Couleurs du logo :
              {suggested.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 font-mono">
                  <span className="size-3 rounded-sm" style={{ background: c }} />
                  {c}
                </span>
              ))}
              <button type="button" className="text-teal-900 underline" onClick={() => setBranding((b) => ({ ...b, colors: suggested }))}>
                Utiliser ces couleurs
              </button>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {branding.colors.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <input type="color" value={c} onChange={(e) => setColor(i, e.target.value)} aria-label={COLOR_NAMES[i]} className="h-8 w-12 cursor-pointer rounded border border-slate-300" />
                <input
                  value={c}
                  onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && setColor(i, e.target.value)}
                  aria-label={`${COLOR_NAMES[i]} (hexadécimal)`}
                  className="w-24 rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                />
                <span className="text-slate-700">{COLOR_NAMES[i]}</span>
                {i === 0 && readableOnWhite(c) !== c && <span className="text-xs text-amber-800">claire : les textes utiliseront une nuance plus foncée</span>}
                <button type="button" className="ml-auto text-xs text-slate-500 underline" onClick={() => setBranding((b) => ({ ...b, colors: b.colors.filter((_, j) => j !== i) }))}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
          {branding.colors.length < 6 && (
            <button
              type="button"
              onClick={() => setBranding((b) => ({ ...b, colors: [...b.colors, b.colors.length === 0 ? "#0d5c70" : "#7fb7c7"] }))}
              className="w-fit rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
            >
              Ajouter une couleur
            </button>
          )}
          <p className="text-xs text-slate-500">
            Les couleurs servent aux graphiques, aux titres et aux accents. Les couleurs de signification (hausse en vert, baisse en rouge, alertes)
            restent inchangées pour rester lisibles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">
            {busy ? "Enregistrement…" : "Enregistrer la charte"}
          </button>
          <button type="button" disabled={busy} onClick={() => setBranding({ logo: null, colors: [] })} className="text-sm text-slate-600 underline">
            Revenir aux couleurs par défaut
          </button>
        </div>
        {state && (
          <p role={state.tone === "error" ? "alert" : "status"} className={`text-sm ${state.tone === "error" ? "text-red-800" : state.tone === "success" ? "text-emerald-800" : "text-slate-700"}`}>
            {state.text}
          </p>
        )}
      </section>

      <section aria-label="Aperçu" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">Aperçu</h2>
        <div className="rounded-lg border border-slate-200 p-4" style={{ borderTop: `4px solid ${primary}` }}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-semibold" style={{ color: readableOnWhite(primary) }}>
              Tableau de bord de l&apos;activité
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL locale */}
            {branding.logo && <img src={branding.logo} alt="" className="max-h-10 max-w-32 object-contain" />}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["Chiffre d'affaires", "Marge", "Taux de marge"].map((label, i) => (
              <div key={label} className="rounded-lg border border-slate-200 p-2" style={{ borderLeft: `3px solid ${palette[i]}` }}>
                <p className="text-xs text-slate-600">{label}</p>
                <p className="text-sm font-semibold text-slate-900">{["854 011 €", "370 487 €", "43,4 %"][i]}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex h-28 items-end gap-2" aria-hidden="true">
            {[70, 95, 55, 80, 40, 65, 85].map((h, i) => (
              <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: palette[i % palette.length] }} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {palette.map((c) => (
              <span key={c} className="size-5 rounded" style={{ background: c }} title={c} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
