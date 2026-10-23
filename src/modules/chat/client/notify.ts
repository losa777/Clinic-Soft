/**
 * ახალი შეტყობინების შეტყობინება მომხმარებლისთვის: ხმა (WebAudio, ფაილის გარეშე) და ბრაუზერის Notification.
 * რამდენიმე ტაბი: ხმა/notification — მხოლოდ ერთში (Web Locks; ხილული ტაბი უპირატესია).
 */

let audio: AudioContext | null = null;
let lastSoundAt = 0;
const SOUND_GAP_MS = 1_000;

/** ბრაუზერი ხმას მხოლოდ მომხმარებლის მოქმედების შემდეგ უშვებს — AudioContext პირველ დაჭერაზე/კლავიშზე იქმნება. */
export function unlockAudioOnGesture(): () => void {
  const unlock = () => {
    try {
      audio ??= new AudioContext();
      void audio.resume();
    } catch {
      // ხმა მიუწვდომელია
    }
  };
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
  return () => {
    window.removeEventListener("pointerdown", unlock, { capture: true });
    window.removeEventListener("keydown", unlock, { capture: true });
  };
}

/** მოკლე ორტონიანი სიგნალი (მაქსიმუმ ერთხელ წამში). */
export function playSound() {
  const now = Date.now();
  if (!audio || audio.state !== "running" || now - lastSoundAt < SOUND_GAP_MS) return;
  lastSoundAt = now;
  const t = audio.currentTime;
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = t + i * 0.11;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.11);
  }
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/** ბრაუზერის შეტყობინება (tag — ერთი საუბრის შეტყობინებები ერთმანეთს ცვლის). */
export function showNotification(title: string, body: string, tag: string, onClick: () => void) {
  if (notificationPermission() !== "granted") return;
  try {
    const n = new Notification(title, { body, tag, icon: "/favicon.ico" });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch {
    // ზოგ ბრაუზერში (Android Chrome) მხოლოდ Service Worker-ით — უბრალოდ არ ჩანს
  }
}

/**
 * ამ ტაბმა უნდა აჩვენოს? ერთი შეტყობინება — ერთი ტაბი: ვინც პირველი აიღებს ბლოკს.
 * ხილული ტაბი მაშინვე ცდის, ფონური — მცირე დაყოვნებით. Web Locks-ის გარეშე — მხოლოდ ხილული ტაბი.
 */
export function claimNotification(key: string): Promise<boolean> {
  const visible = document.visibilityState === "visible";
  if (!("locks" in navigator)) return Promise.resolve(visible);
  return new Promise((resolve) => {
    const attempt = () =>
      navigator.locks
        .request(`clinic-chat:notify:${key}`, { ifAvailable: true }, (lock) => {
          resolve(lock !== null);
          // ბლოკი რჩება, სანამ სხვა ტაბები ცდიან
          return lock ? new Promise((r) => setTimeout(r, 10_000)) : undefined;
        })
        .catch(() => resolve(visible));
    if (visible) attempt();
    else setTimeout(attempt, 400);
  });
}
