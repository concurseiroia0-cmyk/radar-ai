import type { AIAnalysisPayload, ConsensusResult, ModelVote } from "@/lib/engine";
import { analyzeSignal, getFreeModels } from "@/lib/services/openrouter";
import { analyzeWithNvidia, nvidiaEnabled, nvidiaModel } from "@/lib/services/nvidia";

/**
 * CONSENSO ENTRE MÚLTIPLAS IAs (regra de ouro do Prompt 2):
 * - A IA NUNCA decide sozinha — o motor determinístico roda primeiro.
 * - Só chamamos IAs quando score_tecnico >= score_minimo.
 * - Voto "favorável" = coherent=true E direção == direção do motor
 *   E confidence >= AI_MIN_CONFIDENCE.
 * - Consenso passa com >= AI_MIN_AGREE votos favoráveis.
 * - Fallback automático: modelo que falha é pulado, próximo da lista entra.
 * - NUNCA lança: falha de TODOS → { passed:false }.
 */

export interface ConsensusOptions {
  maxModels?: number; // AI_MAX_MODELS (default 3)
  minAgree?: number; // AI_MIN_AGREE (default 2)
  minConfidence?: number; // AI_MIN_CONFIDENCE (default 60)
  attemptCap?: number; // limite de tentativas totais
}

export function consensusDefaults(): Required<ConsensusOptions> {
  return {
    maxModels: Number(process.env.AI_MAX_MODELS ?? 3),
    minAgree: Number(process.env.AI_MIN_AGREE ?? 2),
    minConfidence: Number(process.env.AI_MIN_CONFIDENCE ?? 60),
    attemptCap: Number(process.env.AI_ATTEMPT_CAP ?? 8),
  };
}

export function aiAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_KEY || process.env.NVIDIA_KEY);
}

export async function runConsensus(
  payload: AIAnalysisPayload,
  opts: ConsensusOptions = {}
): Promise<ConsensusResult> {
  const cfg = { ...consensusDefaults(), ...opts };

  // pool de modelos: NVIDIA (se configurada) + OpenRouter free list
  const pool: string[] = [];
  const sourceOf = new Map<string, "nvidia" | "openrouter">();
  if (nvidiaEnabled() && nvidiaModel()) {
    pool.push(nvidiaModel()!);
    sourceOf.set(nvidiaModel()!, "nvidia");
  }
  for (const m of getFreeModels()) {
    if (!sourceOf.has(m)) {
      pool.push(m);
      sourceOf.set(m, "openrouter");
    }
  }

  const votes: ModelVote[] = [];
  const favoravel = (v: ModelVote): boolean =>
    v.status === "ok" &&
    v.coherent &&
    v.direction === payload.direcao_sugerida &&
    v.direction !== "NEUTRAL" &&
    v.confidence >= cfg.minConfidence;

  const callModel = async (model: string): Promise<ModelVote> => {
    const started = Date.now();
    if (sourceOf.get(model) === "nvidia") {
      const r = await analyzeWithNvidia(payload, model);
      return r.ok && r.result
        ? {
            model,
            status: "ok",
            direction: r.result.direction,
            coherent: r.result.coherent,
            confidence: r.result.confidence,
            reasoning: r.result.reasoning,
            warnings: r.result.warnings,
            latencyMs: r.latencyMs,
          }
        : { model, status: "erro", direction: "NEUTRAL", coherent: false, confidence: 0, reasoning: "", warnings: [], latencyMs: r.latencyMs, error: r.error };
    }
    const r = await analyzeSignal(payload, model);
    return r.ok && r.result
      ? {
          model,
          status: "ok",
          direction: r.result.direction,
          coherent: r.result.coherent,
          confidence: r.result.confidence,
          reasoning: r.result.reasoning,
          warnings: r.result.warnings,
          latencyMs: r.latencyMs,
        }
      : { model, status: "erro", direction: "NEUTRAL", coherent: false, confidence: 0, reasoning: "", warnings: [], latencyMs: r.latencyMs, error: r.error };
  };

  // Lote 1: primeiros maxModels em paralelo
  const firstBatch = pool.slice(0, cfg.maxModels);
  const results = await Promise.all(firstBatch.map(callModel));
  votes.push(...results);

  // fallback: modelos que falharam são substituídos pelos próximos da lista
  // (rate-limit/404 → pula para o próximo; limite total = attemptCap)
  const fallbacks = pool.slice(cfg.maxModels);
  let fbIdx = 0;
  let attempts = 0;
  for (let vi = 0; vi < votes.length && fbIdx < fallbacks.length && attempts < cfg.attemptCap; vi++) {
    if (votes[vi].status === "erro") {
      attempts++;
      votes[vi] = await callModel(fallbacks[fbIdx++]);
    }
  }

  const okVotes = votes.filter((v) => v.status === "ok");
  const favoraveis = okVotes.filter(favoravel);
  const passed = favoraveis.length >= cfg.minAgree;
  const confidenceMedia =
    okVotes.length > 0 ? okVotes.reduce((a, v) => a + v.confidence, 0) / okVotes.length : 0;

  return {
    passed,
    favoravel: `${favoraveis.length}/${okVotes.length}`,
    favoravelCount: favoraveis.length,
    totalModels: okVotes.length,
    direction: passed ? payload.direcao_sugerida : "NEUTRAL",
    confidenceMedia,
    modelos: votes,
    timestamp: Date.now(),
  };
}