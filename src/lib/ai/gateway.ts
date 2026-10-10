import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { AiContext } from "@/lib/privacy/ai-context";
import { buildDemoSpec } from "./demo-designer";
import { SYSTEM_PROMPT, userMessage } from "./prompt";
import { DashboardSpecSchema, type DashboardSpec } from "./spec";

// Passerelle IA : un point d'entrée unique, quel que soit le fournisseur.
// Le reste de l'application ne connaît que `designDashboard`.

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

export interface DesignResult {
  spec: DashboardSpec;
  provider: "anthropic" | "demo";
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export class AiError extends Error {}

type Provider = "anthropic" | "vertex" | "bedrock" | "demo";

export function activeProvider(): Provider {
  const configured = process.env.AI_PROVIDER as Provider | undefined;
  if (configured) return configured;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "demo";
}

export async function designDashboard(ctx: AiContext): Promise<DesignResult> {
  const provider = activeProvider();
  switch (provider) {
    case "anthropic":
      return designWithClaude(new Anthropic(), ctx);
    case "demo":
      return { spec: buildDemoSpec(ctx), provider: "demo", model: null, inputTokens: null, outputTokens: null };
    case "vertex":
    case "bedrock":
      // Production UE : même SDK Anthropic, client AnthropicVertex (région « eu ») ou AnthropicBedrockMantle
      // (région Paris / Francfort). À brancher avant d'accepter des données réelles.
      throw new AiError(`Le fournisseur ${provider} n'est pas encore branché dans ce prototype.`);
    default:
      throw new AiError(`AI_PROVIDER inconnu : ${String(provider)}.`);
  }
}

async function designWithClaude(client: Anthropic, ctx: AiContext): Promise<DesignResult> {
  let response;
  try {
    response = await client.beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      // Si le modèle décline la requête, l'API la rejoue sur un modèle de repli adapté.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(DashboardSpecSchema) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage(JSON.stringify(ctx)) }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new AiError("Clé d'API Claude invalide.");
    if (error instanceof Anthropic.RateLimitError) throw new AiError("Limite d'appels à Claude atteinte, réessayez dans une minute.");
    if (error instanceof Anthropic.APIError) throw new AiError(`Erreur de l'API Claude (${error.status ?? "réseau"}).`);
    throw error;
  }

  if (response.stop_reason === "refusal") throw new AiError("Claude a décliné la génération de ce dashboard.");
  if (response.stop_reason === "max_tokens") throw new AiError("La réponse de Claude a été tronquée.");
  if (!response.parsed_output) throw new AiError("La réponse de Claude ne respecte pas le format attendu.");

  return {
    spec: response.parsed_output,
    provider: "anthropic",
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
