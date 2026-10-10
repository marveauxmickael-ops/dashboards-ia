import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { GoogleAuth } from "google-auth-library";
import type { z } from "zod";
import type { AiContext } from "@/lib/privacy/ai-context";
import { buildDemoSpec } from "./demo-designer";
import { SYSTEM_PROMPT, userMessage } from "./prompt";
import { DashboardSpecSchema, type DashboardSpec } from "./spec";

// Passerelle IA : un point d'entrée unique, quel que soit le fournisseur.
// - anthropic : API Anthropic (prototype, données fictives uniquement) ;
// - vertex : Claude sur Google Cloud Vertex AI, région UE ;
// - bedrock : Claude sur Amazon Bedrock, région Paris ou Francfort ;
// - demo : concepteur déterministe, sans appel à un modèle.

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

export type Provider = "anthropic" | "vertex" | "bedrock" | "demo";

export interface AiUsage {
  provider: Provider;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface DesignResult extends AiUsage {
  spec: DashboardSpec;
}

export class AiError extends Error {}

export function activeProvider(): Provider {
  const configured = process.env.AI_PROVIDER as Provider | undefined;
  if (configured) return configured;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "demo";
}

/** Le traitement reste-t-il dans l'Union européenne ? (affiché à l'utilisateur) */
export function processedInEurope(provider: Provider): boolean {
  return provider === "vertex" || provider === "bedrock" || provider === "demo";
}

export async function designDashboard(ctx: AiContext): Promise<DesignResult> {
  const provider = activeProvider();
  if (provider === "demo") return { spec: buildDemoSpec(ctx), provider, model: null, inputTokens: null, outputTokens: null };
  const { output, ...usage } = await callClaude(provider, DashboardSpecSchema, SYSTEM_PROMPT, userMessage(JSON.stringify(ctx)));
  return { spec: output, ...usage };
}

type ParseClient = Pick<Anthropic, "beta">;

function clientFor(provider: Exclude<Provider, "demo">): { client: ParseClient; model: string } {
  switch (provider) {
    case "anthropic":
      return { client: new Anthropic(), model: CLAUDE_MODEL };
    case "vertex": {
      const projectId = process.env.VERTEX_PROJECT_ID;
      if (!projectId) throw new AiError("VERTEX_PROJECT_ID manquant : Claude sur Vertex AI n'est pas configuré.");
      // Compte de service Google (JSON) fourni par variable d'environnement, faute de fichier sur Vercel.
      const credentials = process.env.GOOGLE_VERTEX_CREDENTIALS ? JSON.parse(process.env.GOOGLE_VERTEX_CREDENTIALS) : undefined;
      const client = new AnthropicVertex({
        projectId,
        // Multi-région UE : le traitement reste en Europe.
        region: process.env.VERTEX_REGION ?? "eu",
        googleAuth: credentials ? new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"] }) : undefined,
      });
      return { client: client as unknown as ParseClient, model: CLAUDE_MODEL };
    }
    case "bedrock": {
      // Identifiants AWS lus dans l'environnement (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).
      const client = new AnthropicBedrockMantle({ awsRegion: process.env.BEDROCK_REGION ?? "eu-west-3" });
      return { client: client as unknown as ParseClient, model: process.env.BEDROCK_MODEL ?? `anthropic.${CLAUDE_MODEL}` };
    }
  }
}

/**
 * Appel à Claude avec sortie structurée validée par un schéma Zod.
 * Le repli serveur en cas de refus n'existe que sur l'API Anthropic ; ailleurs un refus est une erreur.
 */
export async function callClaude<S extends z.ZodType>(
  provider: Provider,
  schema: S,
  system: string,
  user: string,
): Promise<AiUsage & { output: z.infer<S> }> {
  if (provider === "demo") throw new AiError("Le mode démonstration n'appelle pas de modèle.");
  if (provider !== "anthropic" && provider !== "vertex" && provider !== "bedrock") {
    throw new AiError(`AI_PROVIDER inconnu : ${String(provider)}.`);
  }
  const { client, model } = clientFor(provider);

  let response;
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      ...(provider === "anthropic" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new AiError("Identifiants du fournisseur IA invalides.");
    if (error instanceof Anthropic.RateLimitError) throw new AiError("Limite d'appels à l'IA atteinte, réessayez dans une minute.");
    if (error instanceof Anthropic.APIError) throw new AiError(`Erreur du fournisseur IA (${error.status ?? "réseau"}).`);
    throw error;
  }

  if (response.stop_reason === "refusal") throw new AiError("L'IA a décliné cette demande.");
  if (response.stop_reason === "max_tokens") throw new AiError("La réponse de l'IA a été tronquée.");
  if (!response.parsed_output) throw new AiError("La réponse de l'IA ne respecte pas le format attendu.");

  return {
    output: response.parsed_output as z.infer<S>,
    provider,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
