/**
 * ლოკალურ სკანერის აგენტთან კავშირი (scanner-agent/, მუშაობს სარეგისტრატურო კომპიუტერზე).
 * ბრაუზერი სკანერს პირდაპირ ვერ მართავს — აგენტი NAPS2-ით სკანირებს და სურათს აბრუნებს.
 */
export const SCANNER_AGENT_URL = process.env.NEXT_PUBLIC_SCANNER_AGENT_URL || "http://127.0.0.1:7777";

export type ScannerDriver = "wia" | "twain";
export type ScannerDevice = { name: string; driver: ScannerDriver };

export type ScannerSettings = {
  /** null = პირველი ხელმისაწვდომი სკანერი */
  device: ScannerDevice | null;
  dpi: number;
  bitDepth: "color" | "gray" | "bw";
  source: "glass" | "feeder" | "duplex";
};

export type ScannerStatus = { version: string; naps2: boolean; settings: ScannerSettings };

export class ScannerError extends Error {}

const AGENT_UNAVAILABLE =
  "სკანერის პროგრამა (აგენტი) არ პასუხობს. შეამოწმეთ, რომ ის გაშვებულია, ან გამოიყენეთ „ფაილის ატვირთვა“";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SCANNER_AGENT_URL}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ScannerError(AGENT_UNAVAILABLE);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ScannerError(body?.error ?? `სკანერის აგენტის შეცდომა (${res.status})`);
  return body as T;
}

export function getScannerStatus() {
  return call<ScannerStatus>("/status");
}

export async function listScanners() {
  return (await call<{ devices: ScannerDevice[] }>("/devices")).devices;
}

export function saveScannerSettings(settings: ScannerSettings) {
  return call<ScannerStatus>("/settings", { method: "PUT", body: JSON.stringify(settings) });
}

/** სკანირება არჩეული (ან პირველი ხელმისაწვდომი) სკანერით. ფიდერიდან შეიძლება რამდენიმე გვერდი მოვიდეს. */
export async function scanPages(): Promise<Blob[]> {
  const { pages } = await call<{ pages: { mimeType: string; data: string }[] }>("/scan", { method: "POST" });
  return pages.map((p) => {
    const binary = atob(p.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: p.mimeType });
  });
}
