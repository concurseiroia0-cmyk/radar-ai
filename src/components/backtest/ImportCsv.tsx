"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ImportResult {
  inserted: number;
  skipped: number;
  duplicates: number;
  total: number;
  startTs?: number;
  endTs?: number;
  demo?: boolean;
}

interface ImportCsvProps {
  onImported?: (info: { startTs: number; endTs: number; rows: number }) => void;
}

export default function ImportCsv({ onImported }: ImportCsvProps) {
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      toast.error("Envie um arquivo .csv");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/backtest/import", { method: "POST", body: fd });
      const json = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Falha ao importar CSV");
        return;
      }
      setResult(json);
      if (json.startTs && json.endTs) {
        onImported?.({ startTs: json.startTs, endTs: json.endTs, rows: json.inserted });
      }
      toast.success(
        `CSV importado: ${json.inserted} linhas (${json.duplicates} duplicadas, ${json.skipped} ignoradas)`
      );
    } catch {
      toast.error("Erro ao enviar o arquivo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileUp className="size-4 text-info" />
          Importar Histórico (.CSV)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragOver ? "border-info bg-info/10" : "border-border hover:border-info/50"
          }`}
        >
          <UploadCloud className="size-8 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            Arraste o .csv aqui ou clique para selecionar
          </div>
          <div className="text-xs text-muted-foreground/70">
            Colunas aceitas: Date,Time,Open,High,Low,Close • Timestamp,Open,High,Low,Close • DateTime,Open,High,Low,Close
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Processando CSV em lotes…
          </div>
        )}

        {result && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-call/10 px-2 py-2">
              <div className="text-lg font-bold text-call tabular-nums">{result.inserted}</div>
              <div className="text-xs text-muted-foreground">Importadas</div>
            </div>
            <div className="rounded-lg bg-warn/10 px-2 py-2">
              <div className="text-lg font-bold text-warn tabular-nums">{result.duplicates}</div>
              <div className="text-xs text-muted-foreground">Duplicadas</div>
            </div>
            <div className="rounded-lg bg-put/10 px-2 py-2">
              <div className="text-lg font-bold text-put tabular-nums">{result.skipped}</div>
              <div className="text-xs text-muted-foreground">Ignoradas</div>
            </div>
          </div>
        )}

        <Button variant="outline" size="sm" disabled={loading} onClick={() => inputRef.current?.click()}>
          Selecionar arquivo
        </Button>
      </CardContent>
    </Card>
  );
}