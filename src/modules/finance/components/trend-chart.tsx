"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatGel } from "@/lib/money";
import { cn } from "@/lib/utils";
import { bucketLabel } from "@/modules/finance/analytics-format";

export type TrendDatum = { key: string; billed: string; collected: string };

/**
 * დინამიკა: დარიცხული და მიღებული თანხა დღეებით/თვეებით — დაჯგუფებული სვეტები, ერთი ღერძი (ორივე ლარშია).
 * ფერები — დადასტურებული კატეგორიული პალიტრის 1-2 სლოტი (ღია/მუქი რეჟიმი ცალ-ცალკე); hover/focus — tooltip.
 */

const SERIES = [
  { id: "billed", label: "დარიცხული", fill: "fill-[#2a78d6] dark:fill-[#3987e5]", swatch: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  { id: "collected", label: "მიღებული", fill: "fill-[#eb6834] dark:fill-[#d95926]", swatch: "bg-[#eb6834] dark:bg-[#d95926]" },
] as const;

const HEIGHT = 260;
const PAD = { top: 12, right: 8, bottom: 28, left: 64 };

/** „ლამაზი“ ღერძის ნაბიჯი: 1, 2, 5 × 10ⁿ. */
function niceStep(max: number, ticks = 4) {
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

const axisMoney = (v: number) => `${v >= 10000 ? `${Math.round(v / 1000)} ათ.` : v.toLocaleString("ka-GE").replace(/ /g, " ")} ₾`;

export function TrendChart({ data }: { data: TrendDatum[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = useMemo(() => data.map((d) => ({ billed: Number(d.billed), collected: Number(d.collected) })), [data]);
  const max = Math.max(1, ...values.flatMap((v) => [v.billed, v.collected]));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = data.length ? plotW / data.length : 0;
  // ორი სვეტი ზოლში, 2px შუალედით; სისქე ≤ 24px — დარჩენილი ჰაერია
  const barW = Math.max(1, Math.min(24, (band - 6) / 2));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  // X წარწერები ერთმანეთს არ უნდა გადაფარონ: ~44px თითოზე
  const labelEvery = Math.max(1, Math.ceil(44 / Math.max(band, 1)));

  const bar = (x: number, value: number) => {
    const h = Math.max(0, (value / top) * plotH);
    if (h < 0.5) return "";
    const r = Math.min(4, barW / 2, h);
    const yb = PAD.top + plotH;
    // მომრგვალებული მხოლოდ მონაცემის ბოლო (ზედა კუთხეები), საფუძველზე — სწორი
    return `M${x},${yb} V${yb - h + r} Q${x},${yb - h} ${x + r},${yb - h} H${x + barW - r} Q${x + barW},${yb - h} ${x + barW},${yb - h + r} V${yb} Z`;
  };

  const tip = active !== null ? data[active] : null;
  // tooltip სვეტის გვერდით (არა ზემოთ — სვეტს არ ფარავს): მარჯვენა ნახევარში — მარცხნივ
  const tipOnLeft = active !== null && active > data.length / 2;
  const tipX = active === null ? 0 : tipOnLeft ? PAD.left + band * active - 6 : PAD.left + band * (active + 1) + 6;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded-sm", s.swatch)} />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative w-full" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label="დარიცხული და მიღებული თანხის დინამიკა (ცხრილი — ქვემოთ)">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {axisMoney(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x0 = PAD.left + band * i + (band - (barW * 2 + 2)) / 2;
              return (
                <g key={d.key}>
                  {active === i && <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} className="fill-muted/60" />}
                  <path d={bar(x0, values[i].billed)} className={SERIES[0].fill} />
                  <path d={bar(x0 + barW + 2, values[i].collected)} className={SERIES[1].fill} />
                  {i % labelEvery === 0 && (
                    <text x={PAD.left + band * i + band / 2} y={HEIGHT - 8} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular-nums">
                      {bucketLabel(d.key)}
                    </text>
                  )}
                  {/* hit target — მთელი ზოლი (სვეტზე დიდი) */}
                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${bucketLabel(d.key, true)}: დარიცხული ${formatGel(d.billed)}, მიღებული ${formatGel(d.collected)}`}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive((a) => (a === i ? null : a))}
                    className="outline-none"
                  />
                </g>
              );
            })}
            <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} className="stroke-muted-foreground/50" strokeWidth={1} />
          </svg>
        )}
        {tip && (
          <div
            role="status"
            className={cn("pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md", tipOnLeft && "-translate-x-full")}
            style={{ left: tipX }}
          >
            <p className="mb-1 text-xs text-muted-foreground">{bucketLabel(tip.key, true)}</p>
            {SERIES.map((s) => (
              <p key={s.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("h-0.5 w-3 rounded-full", s.swatch)} />
                  {s.label}
                </span>
                <b className="tabular-nums">{formatGel(tip[s.id])}</b>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
