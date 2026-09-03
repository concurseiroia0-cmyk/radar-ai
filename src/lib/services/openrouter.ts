import type { AIAnalysisPayload, AIResult, Direction } from "@/lib/engine";
import { AI_SYSTEM_PROMPT } from "@/lib/ai/payload";

/**
 * Cliente OpenRouter — modelos GRATUITOS com fallback automático.
 * NUNCA lança erro fatal: retorna erro estruturado para o consenso decidir.
 */

const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Lista priorizada de modelos gratuitos (fallback automático).
 * Atualizada em 03/2026 contra a API do OpenRouter (GET /api/v1/models,
 * pricing.prompt === 0) — os slugs antigos (:free) foram aposentados.
 * A lista pode ser sobrescrita via env OPROUTER_FREE_MODELS.
 */
export const DEFAULT_FREE_MODELS = [
  "z-ai/glm-5.2:free",
  "inclusionai/ling-3.0-flash-fin:free",
  "google/gemma-4-31b-it:free",
  "minimax/minimax-m3:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-26b-a4b-it:free",
  "liquid/lfm-2.5-2.6b:free",
];

/** Lista configurável via env OPROUTER_FREE_MODELS (vírgula). */
export function getFreeModels(): string[] {
  const env = process.env.OPROUTER_FREE_MODELS;
  if (env && env.trim()) {
    return env.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [...DEFAULT_FREE_MODELS];
}

export interface AnalyzeOptions {
  timeoutMs?: number;
}

export interface AnalyzeResponse {
  ok: boolean;
  result?: AIResult;
  error?: string;
  latencyMs: number;
}

const DIRECTIONS: Direction[] = ["CALL", "PUT", "NEUTRAL"];

/** Extrai e valida o JSON da resposta (defensivo contra markdown/ruído). */
export function parseAIResponse(raw: string): AIResult | null {
  if (!raw) return null;
  let text = raw.trim();
  // remove fences ```json ... ```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // se sobrou texto antes do primeiro '{' ou depois do último '}', corta
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  text = text.slice(first, last + 1);
  try {
    const parsed = JSON.parse(text) as Partial<AIResult>;
    if (
      typeof parsed.direction === "string" &&
      DIRECTIONS.includes(parsed.direction as Direction) &&
      typeof parsed.coherent === "boolean" &&
      typeof parsed.confidence === "number" &&
      typeof parsed.reasoning === "string"
    ) {
      return {
        direction: parsed.direction as Direction,
        coherent: parsed.coherent,
        confidence: Math.max(0, Math.min(100, parsed.confidence)),
        reasoning: parsed.reasoning.slice(0, 500),
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings.slice(0, 5).map(String) : [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Chama UM modelo OpenRouter com retry 1x + backoff. */
export async function analyzeSignal(
  payload: AIAnalysisPayload,
  model: string,
  opts: AnalyzeOptions = {}
): Promise<AnalyzeResponse> {
  const key = process.env.OPENROUTER_KEY;
  if (!key) {
    return { ok: false, error: "OPENROUTER_KEY ausente", latencyMs: 0 };
  }
  const timeoutMs = opts.timeoutMs ?? Number(process.env.AI_TIMEOUT_MS ?? 20_000);
  const started = Date.now();

  const attempt = async (): Promise<AnalyzeResponse> => {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://radar-ai.local",
        "X-Title": "Radar AI",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        temperature: 0,
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const latencyMs = Date.now() - started;
    if (res.status === 404 || res.status === 400) {
      // modelo indisponível/sem suporte — sem retry (vai para o próximo da lista)
      return { ok: false, error: `modelo indisponível (HTTP ${res.status})`, latencyMs };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status} ${body.slice(0, 200)}`, latencyMs };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "resposta vazia", latencyMs };
    const result = parseAIResponse(content);
    if (!result) return { ok: false, error: "JSON inválido na resposta da IA", latencyMs };
    return { ok: true, result, latencyMs };
  };

  try {
    const r1 = await attempt();
    if (r1.ok) return r1;
    // retry 1x com backoff (1s) apenas para falhas transitórias
    if (r1.error?.includes("429") || r1.error?.includes("5") || r1.error?.includes("timeout") || r1.error?.includes("abort")) {
      await new Promise((r) => setTimeout(r, 1000));
      return attempt();
    }
    return r1;
  } catch (e) {
    return { ok: false, error: String(e), latencyMs: Date.now() - started };
  }
}