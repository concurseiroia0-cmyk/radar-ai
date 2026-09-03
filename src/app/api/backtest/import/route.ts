import { NextResponse } from "next/server";
import Papa from "papaparse";
import { createServiceSupabaseClient, isSupabaseConfigured } from "@/lib/services/supabase-server";

/**
 * POST multipart/form-data { file }
 * Parseia CSV (Date,Time,Open,High,Low,Close | Timestamp,Open,High,Low,Close |
 * DateTime,Open,High,Low,Close), converte para ts SEGUNDOS e faz upsert
 * em candles ('1m') em lotes de 1.000 linhas.
 * Retorna { inserted, skipped, duplicates, total, startTs, endTs }.
 */

const BATCH = 1000;

interface ParsedRow {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo CSV" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Arquivo deve ser .csv" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (parsed.errors?.length) {
    return NextResponse.json({ error: `CSV inválido: ${parsed.errors[0].message}` }, { status: 400 });
  }
  const rows = parsed.data;
  if (rows.length < 2) {
    return NextResponse.json({ error: "CSV vazio (sem linhas de dados)" }, { status: 400 });
  }

  // ---- detectar cabeçalho ----
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const lower = header.join(",");

  let idx = { ts: -1, open: -1, high: -1, low: -1, close: -1 };
  if (lower.includes("timestamp")) {
    idx = { ts: header.indexOf("timestamp"), open: header.indexOf("open"), high: header.indexOf("high"), low: header.indexOf("low"), close: header.indexOf("close") };
  } else if (lower.includes("datetime")) {
    idx = { ts: header.indexOf("datetime"), open: header.indexOf("open"), high: header.indexOf("high"), low: header.indexOf("low"), close: header.indexOf("close") };
  } else if (header.includes("date") && header.includes("time")) {
    idx = { ts: -2, open: header.indexOf("open"), high: header.indexOf("high"), low: header.indexOf("low"), close: header.indexOf("close") };
  }

  if (idx.open < 0 || idx.high < 0 || idx.low < 0 || idx.close < 0 || idx.ts === -1) {
    return NextResponse.json(
      { error: "Cabeçalho não reconhecido. Use: Date,Time,Open,High,Low,Close | Timestamp,Open,High,Low,Close | DateTime,Open,High,Low,Close" },
      { status: 400 }
    );
  }

  const dataRows = rows.slice(1);
  const candles: ParsedRow[] = [];
  let skipped = 0;

  for (const r of dataRows) {
    let ts: number;
    if (idx.ts === -2) {
      // Date + Time
      const dateStr = `${r[header.indexOf("date")]}T${r[header.indexOf("time")]}`.replace(" ", "T");
      const d = new Date(dateStr);
      ts = Math.floor(d.getTime() / 1000);
    } else if (idx.ts === -1) {
      skipped++;
      continue;
    } else {
      const raw = String(r[idx.ts]).trim();
      const num = Number(raw);
      ts = Number.isFinite(num)
        ? num < 1e12 // segundos
          ? Math.floor(num)
          : Math.floor(num / 1000) // milissegundos
        : Math.floor(new Date(raw).getTime() / 1000);
    }
    const open = Number(r[idx.open]);
    const high = Number(r[idx.high]);
    const low = Number(r[idx.low]);
    const close = Number(r[idx.close]);
    if (
      !Number.isFinite(ts) || ts <= 0 ||
      !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close) ||
      high < low
    ) {
      skipped++;
      continue;
    }
    candles.push({ ts, open, high, low, close });
  }

  // dedupe por ts (mantém o último)
  const byTs = new Map<number, ParsedRow>();
  for (const c of candles) byTs.set(c.ts, c);
  const unique = [...byTs.values()].sort((a, b) => a.ts - b.ts);

  const total = unique.length;
  let inserted = 0;

  if (isSupabaseConfigured()) {
    const supabase = await createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
    }
    // precisa de um asset para referenciar — pega o primeiro ativo ativo (ou aceita assetId opcional)
    const assetId = form.get("assetId");
    let targetAsset = String(assetId ?? "");
    if (!targetAsset) {
      const { data: first } = await supabase.from("assets").select("id").eq("active", true).limit(1).maybeSingle();
      targetAsset = first?.id ?? "";
    }
    if (!targetAsset) {
      return NextResponse.json({ error: "Nenhum ativo ativo encontrado para vincular os candles" }, { status: 400 });
    }
    for (let i = 0; i < unique.length; i += BATCH) {
      const chunk = unique.slice(i, i + BATCH).map((c) => ({
        asset_id: targetAsset,
        timeframe: "1m",
        ts: c.ts,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      const { data, error } = await supabase
        .from("candles")
        .upsert(chunk, { onConflict: "asset_id,timeframe,ts" })
        .select("ts");
      if (error) {
        return NextResponse.json({ error: `Erro no upsert: ${error.message}` }, { status: 500 });
      }
      inserted += data?.length ?? 0;
    }
  } else {
    // demo: valida e reporta sem persistir
    inserted = total;
  }

  const duplicates = total - inserted + skipped;

  return NextResponse.json({
    inserted,
    skipped,
    duplicates: Math.max(0, duplicates),
    total,
    startTs: unique[0]?.ts,
    endTs: unique[unique.length - 1]?.ts,
    demo: !isSupabaseConfigured(),
  });
}