import { scoreBandInfo } from "@/lib/engine";

interface ScoreBarProps {
  score: number;
  size?: "sm" | "lg";
  showLabel?: boolean;
}

export default function ScoreBar({ score, size = "sm", showLabel = true }: ScoreBarProps) {
  const band = scoreBandInfo(score);
  const isLg = size === "lg";

  return (
    <div className={`flex items-center gap-2 ${isLg ? "flex-col items-start" : ""}`}>
      <div className="flex w-full items-center gap-2">
        {isLg && (
          <span className="text-3xl font-bold tabular-nums" style={{ color: band.color }}>
            {score}
          </span>
        )}
        <div
          className={`${isLg ? "h-3" : "h-2"} w-full overflow-hidden rounded-full bg-muted`}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-all ${score >= 85 ? "score-glow" : ""}`}
            style={{
              width: `${Math.max(2, Math.min(100, score))}%`,
              background: band.color,
            }}
          />
        </div>
      </div>
      {showLabel && (
        <div className="flex items-center gap-1.5 text-xs">
          {!isLg && (
            <span className="font-semibold tabular-nums" style={{ color: band.color }}>
              {score}
            </span>
          )}
          <span className="text-muted-foreground">
            {band.emoji} {band.label}
          </span>
        </div>
      )}
    </div>
  );
}