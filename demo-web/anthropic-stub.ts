// La démo navigateur n'appelle jamais Claude : le SDK est remplacé par un module vide.
class APIError extends Error {
  status?: number;
}
export default class Anthropic {
  static APIError = APIError;
  static AuthenticationError = class extends APIError {};
  static RateLimitError = class extends APIError {};
  beta = { messages: { parse: async (): Promise<never> => { throw new Error("Claude n'est pas disponible dans la démo navigateur."); } } };
}
export const betaZodOutputFormat = (schema: unknown) => schema;
