/**
 * ხელმოწერის მოწყობილობები. ნაგულისხმევი — „canvas“: ეკრანზე თითით, სტილუსით ან მაუსით
 * (ასევე USB პლანშეტები, რომლებიც სისტემაში ჩვეულებრივ მაჩვენებლად — Pointer Events-ით მუშაობს).
 *
 * გარე მოწყობილობის (Wacom STU, Topaz და სხვ.) დასამატებლად, რომელსაც საკუთარი SDK აქვს:
 *   1. დაწერეთ ობიექტი `SignatureDevice` ინტერფეისით: `isAvailable()` — SDK/მოწყობილობა მიერთებულია თუ არა,
 *      `capture()` — SDK-ით ხელმოწერის აღება და PNG-ის დაბრუნება (data URL, გამჭვირვალე ან თეთრი ფონით);
 *   2. დაამატეთ `SIGNATURE_DEVICES` სიაში.
 * ხელმოწერის ფანჯარა ხელმისაწვდომ მოწყობილობებს თავად აჩვენებს; სერვერზე ინახება PNG და მოწყობილობის id.
 */

export type SignatureResult = {
  /** data:image/png;base64,... */
  png: string;
  /** მოწყობილობის id (ბაზაში document_signatures.device) */
  device: string;
};

export interface SignatureDevice {
  /** ლათინური პატარა ასოები, ციფრები, - _ (მაქს. 50) */
  id: string;
  label: string;
  /** ეკრანზე ხატვა (SignaturePad) — capture არ სჭირდება */
  kind: "canvas" | "external";
  isAvailable(): Promise<boolean>;
  /** external: SDK-ით აღება; null — გაუქმდა. signal — ფანჯრის დახურვისას. */
  capture?(options: { signerLabel: string; signal: AbortSignal }): Promise<SignatureResult | null>;
}

export const CANVAS_DEVICE: SignatureDevice = {
  id: "canvas",
  label: "ეკრანზე (თითი, სტილუსი, მაუსი)",
  kind: "canvas",
  isAvailable: async () => true,
};

/*
 * მაგალითი (SDK-ის მიერთებისას):
 *
 * const WACOM_STU: SignatureDevice = {
 *   id: "wacom-stu",
 *   label: "Wacom STU პლანშეტი",
 *   kind: "external",
 *   isAvailable: async () => Boolean(window.WacomGSS?.STU) && (await window.WacomGSS.STU.getUsbDevices()).length > 0,
 *   capture: async ({ signerLabel, signal }) => {
 *     const image = await wacomCaptureToPng({ title: signerLabel, signal }); // SDK-ის დიალოგი
 *     return image ? { png: image, device: "wacom-stu" } : null;
 *   },
 * };
 */

export const SIGNATURE_DEVICES: SignatureDevice[] = [CANVAS_DEVICE];

export const DEVICE_ID_PATTERN = /^[a-z0-9_-]{1,50}$/;
