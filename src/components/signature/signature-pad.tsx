"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CANVAS_DEVICE, SIGNATURE_DEVICES, type SignatureDevice, type SignatureResult } from "./devices";

const HEIGHT = 180;
const INK = "#111827";

/**
 * ხელმოწერის ველი (canvas, Pointer Events): თითი, სტილუსი (წნევით), მაუსი.
 * onChange — ყოველი შტრიხის შემდეგ PNG (შემოჭრილი, გამჭვირვალე ფონით), გასუფთავებისას — null.
 */
export function SignaturePad({ onChange, disabled, label }: { onChange: (png: string | null) => void; disabled?: boolean; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const bounds = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // canvas-ის ზომა ეკრანის სიმკვრივით (მკვეთრი ხაზი); ზომის შეცვლისას ხელმოწერა იშლება
  useEffect(() => {
    const canvas = canvasRef.current!;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      if (canvas.width === Math.round(width * ratio)) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(HEIGHT * ratio);
      const ctx = canvas.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK;
      bounds.current = null;
      setEmpty(true);
      onChange(null);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [onChange]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const extend = (p: { x: number; y: number }) => {
    const b = bounds.current;
    bounds.current = b
      ? { minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }
      : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
  };

  const stroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    const from = last.current ?? p;
    // სტილუსის წნევა → ხაზის სისქე (მაუსს წნევა არ აქვს — 0.5)
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    ctx.lineWidth = 1.2 + pressure * 2.4;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(p.x + (from === p ? 0.01 : 0), p.y);
    ctx.stroke();
    last.current = p;
    extend(p);
  };

  /** ხელმოწერის შემოჭრა (ცარიელი არე იშლება) და PNG. */
  const exportPng = () => {
    const canvas = canvasRef.current!;
    const b = bounds.current;
    if (!b) return null;
    const ratio = canvas.width / canvas.clientWidth;
    const pad = 6;
    const x = Math.max(0, (b.minX - pad) * ratio);
    const y = Math.max(0, (b.minY - pad) * ratio);
    const w = Math.min(canvas.width - x, (b.maxX - b.minX + pad * 2) * ratio);
    const h = Math.min(canvas.height - y, (b.maxY - b.minY + pad * 2) * ratio);
    const out = document.createElement("canvas");
    // PDF-ისთვის საკმარისი გარჩევადობა, ფაილი — პატარა
    const scale = Math.min(1, 800 / w);
    out.width = Math.max(1, Math.round(w * scale));
    out.height = Math.max(1, Math.round(h * scale));
    out.getContext("2d")!.drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    bounds.current = null;
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          aria-label={`${label}: ხელმოწერის ველი`}
          role="img"
          style={{ height: HEIGHT }}
          className={cn(
            "w-full touch-none rounded-lg border-2 border-dashed bg-white",
            disabled ? "pointer-events-none opacity-50" : "cursor-crosshair",
          )}
          onPointerDown={(e) => {
            if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            last.current = null;
            stroke(e);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            // მაღალი სიხშირის მოვლენები (სტილუსი) — უფრო გლუვი ხაზი
            const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
            if (events.length > 1) {
              const ctx = e.currentTarget.getContext("2d")!;
              const r = e.currentTarget.getBoundingClientRect();
              for (const ev of events) {
                const p = { x: ev.clientX - r.left, y: ev.clientY - r.top };
                const from = last.current ?? p;
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                last.current = p;
                extend(p);
              }
            } else stroke(e);
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            drawing.current = false;
            last.current = null;
            setEmpty(false);
            onChange(exportPng());
          }}
          onPointerCancel={() => {
            drawing.current = false;
            last.current = null;
          }}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-neutral-400">
            <PenLine className="size-4" />
            მოაწერეთ ხელი აქ
          </span>
        )}
        <span className="pointer-events-none absolute right-4 bottom-8 left-4 border-b border-neutral-300" />
      </div>
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={clear} disabled={disabled || empty}>
        <Eraser />
        გასუფთავება
      </Button>
    </div>
  );
}

/**
 * ხელმოწერის აღება ნებისმიერი მოწყობილობით (იხ. devices.ts): ეკრანი ან გარე SDK.
 * onChange — { png, device } ან null.
 */
export function SignatureCapture({
  label,
  onChange,
  disabled,
  devices = SIGNATURE_DEVICES,
}: {
  label: string;
  onChange: (result: SignatureResult | null) => void;
  disabled?: boolean;
  devices?: SignatureDevice[];
}) {
  const [available, setAvailable] = useState<SignatureDevice[]>([CANVAS_DEVICE]);
  const [device, setDevice] = useState<SignatureDevice>(CANVAS_DEVICE);
  const [external, setExternal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all(devices.map(async (d) => ((await d.isAvailable().catch(() => false)) ? d : null))).then((list) => {
      if (alive) setAvailable(list.filter((d): d is SignatureDevice => d !== null));
    });
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, [devices]);

  const onCanvas = useRef(onChange);
  useEffect(() => {
    onCanvas.current = onChange;
  });
  const [canvasHandler] = useState(() => (png: string | null) => onCanvas.current(png ? { png, device: CANVAS_DEVICE.id } : null));

  async function captureExternal(d: SignatureDevice) {
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    try {
      const result = await d.capture!({ signerLabel: label, signal: abort.current.signal });
      setExternal(result?.png ?? null);
      onChange(result);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {available.length > 1 && (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="მოწყობილობა">
          {available.map((d) => (
            <Button
              key={d.id}
              type="button"
              size="sm"
              variant={device.id === d.id ? "default" : "outline"}
              role="radio"
              aria-checked={device.id === d.id}
              disabled={disabled || busy}
              onClick={() => {
                setDevice(d);
                setExternal(null);
                onChange(null);
              }}
            >
              {d.label}
            </Button>
          ))}
        </div>
      )}
      {device.kind === "canvas" ? (
        <SignaturePad label={label} onChange={canvasHandler} disabled={disabled} />
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-lg border-2 border-dashed p-3">
          {external ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL, ოპტიმიზაცია არ სჭირდება
            <img src={external} alt={`${label}: ხელმოწერა`} className="max-h-32 bg-white" />
          ) : (
            <p className="text-sm text-muted-foreground">ხელმოწერა მოწყობილობაზე</p>
          )}
          <Button type="button" size="sm" disabled={disabled || busy} onClick={() => captureExternal(device)}>
            <PenLine />
            {busy ? "ელოდება მოწყობილობას..." : external ? "თავიდან" : "ხელმოწერის აღება"}
          </Button>
        </div>
      )}
    </div>
  );
}
