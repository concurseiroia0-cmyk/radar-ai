import type { AIAnalysisPayload, AIResult, Direction } from "@/lib/engine";
import { AI_SYSTEM_PROMPT } from "@/lib/ai/payload";
import { parseAIResponse } from "./openrouter";

/**
 * NVIDIA NIM (build.nvidia.com) — cliente OPCIONAL.
 * Sem NVIDIA_KEY o modelo é simplesmente PULADO no consenso (nunca quebra).
 */

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1/chat/completions";

export function nvidiaModel(): string | null {
  return process.env.NVIDIA_MODEL || null;
}

export function nvidiaEnabled(): boolean {
  return Boolean(process.env.NVIDIA_KEY && nvidiaModel());
}

export async function analyzeWithNvidia(
  payload: AIAnalysisPayload,
  model: string
): Promise<{ ok: boolean; result?: AIResult; error?: string; latencyMs: number }> {
  const key = process.env.NVIDIA_KEY;
  if (!key) return { ok: false, error: "NVIDIA_KEY ausente", latencyMs: 0 };

  const started = Date.now();
  try {
    const res = await fetch(NVIDIA_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
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
      signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS ?? 20_000)),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status} ${body.slice(0, 160)}`, latencyMs };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "resposta vazia", latencyMs };
    const result = parseAIResponse(content);
    if (!result) return { ok: false, error: "JSON inválido", latencyMs };
    return { ok: true, result, latencyMs };
  } catch (e) {
    return { ok: false, error: String(e), latencyMs: Date.now() - started };
  }
}

/** Direções válidas para type-safety do consenso. */
export function isDirection(v: unknown): v is Direction {
  return v === "CALL" || v === "PUT" || v === "NEUTRAL";
}