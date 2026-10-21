/**
 * კლინიკის სკანერის აგენტი: მუშაობს სარეგისტრატურო კომპიუტერზე და საიტს აძლევს სკანირების საშუალებას.
 * სკანერს მართავს NAPS2-ის CLI-ით (WIA/TWAIN). დამოკიდებულებები არ აქვს, საჭიროა მხოლოდ Node.js 20+.
 *
 * უსაფრთხოება:
 * - უსმენს მხოლოდ 127.0.0.1-ს (ქსელიდან მიუწვდომელია);
 * - პასუხობს მხოლოდ config.json-ის allowedOrigins-იდან (CORS + Origin-ის შემოწმება);
 * - Host-ის შემოწმება DNS rebinding-ის წინააღმდეგ.
 *
 * გაშვება: node agent.mjs   (ინსტალაცია/ავტოგაშვება: install.ps1, იხ. README.md)
 */
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.0.0";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(DIR, "config.json");
const SETTINGS_FILE = path.join(DIR, "settings.json");
const LOG_FILE = path.join(DIR, "agent.log");

const DRIVERS = ["wia", "twain"];
const DPI_VALUES = [150, 200, 300, 600];
const BIT_DEPTHS = ["color", "gray", "bw"];
const SOURCES = ["glass", "feeder", "duplex"];
const DEFAULT_SETTINGS = { device: null, dpi: 200, bitDepth: "color", source: "glass" };
const SCAN_TIMEOUT_MS = 3 * 60 * 1000;

function log(...parts) {
  const line = `${new Date().toISOString()} ${parts.join(" ")}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // ლოგის ჩაწერა არ არის კრიტიკული
  }
}

function readJson(file, fallback) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
  } catch (err) {
    log("ფაილი ვერ წაიკითხა:", file, err.message);
    return fallback;
  }
}

// NAPS2-ის ინსტალერი 64 ან 32-ბიტიან Program Files-ში აყენებს
const NAPS2_CANDIDATES = [
  "C:\\Program Files\\NAPS2\\NAPS2.Console.exe",
  "C:\\Program Files (x86)\\NAPS2\\NAPS2.Console.exe",
];

const config = {
  port: 7777,
  allowedOrigins: [],
  ...readJson(CONFIG_FILE, {}),
};
if (!config.naps2Path || !existsSync(config.naps2Path)) {
  config.naps2Path = NAPS2_CANDIDATES.find((p) => existsSync(p)) ?? config.naps2Path ?? NAPS2_CANDIDATES[0];
}
const allowedOrigins = new Set(config.allowedOrigins.map((o) => o.replace(/\/+$/, "")));
const allowedHosts = new Set([`127.0.0.1:${config.port}`, `localhost:${config.port}`]);

let settings = { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) };
let scanning = false;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function runNaps2(args, timeout) {
  return new Promise((resolve, reject) => {
    if (!existsSync(config.naps2Path)) {
      reject(new HttpError(500, `NAPS2 ვერ მოიძებნა: ${config.naps2Path}. დააყენეთ NAPS2 (naps2.com)`));
      return;
    }
    execFile(config.naps2Path, args, { timeout, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      // NAPS2 6.x-ს --listdevices/--driver/--device არ აქვს: უცნობ არგუმენტზე დახმარებას ბეჭდავს ვერსიით
      const old = /Not Another PDF Scanner 2\)\s+(\d+)\./.exec(`${stdout}\n${stderr}`);
      if (old && Number(old[1]) < 7) {
        reject(new HttpError(500, `დაყენებულია NAPS2-ის ძველი ვერსია (${old[1]}.x). საჭიროა NAPS2 7 ან უფრო ახალი (naps2.com)`));
        return;
      }
      if (err) {
        const details = `${stdout}\n${stderr}`.trim().split(/\r?\n/).slice(-3).join(" ");
        reject(Object.assign(err, { details }));
      } else resolve(stdout);
    });
  });
}

/** სკანერების სია: ჯერ WIA, შემდეგ TWAIN. ერთი დრაივერის შეცდომა მეორეს არ აჩერებს. */
async function listDevices() {
  const devices = [];
  for (const driver of DRIVERS) {
    try {
      const out = await runNaps2(["--listdevices", "--driver", driver], 30_000);
      for (const line of out.split(/\r?\n/)) {
        const name = line.trim();
        if (name) devices.push({ name, driver });
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      log(`სკანერების სია (${driver}) ვერ მივიღე:`, err.details || err.message);
    }
  }
  return devices;
}

/** სკანირება არჩეული სკანერით; თუ არჩეული არ არის — პირველი ხელმისაწვდომით. */
async function scan() {
  const device = settings.device ?? (await listDevices())[0];
  if (!device) throw new HttpError(404, "სკანერი ვერ მოიძებნა. შეამოწმეთ, რომ ჩართული და მიერთებულია");

  const dir = await mkdtemp(path.join(tmpdir(), "clinic-scan-"));
  try {
    log("სკანირება:", device.driver, device.name, `${settings.dpi}dpi`, settings.bitDepth, settings.source);
    try {
      await runNaps2(
        [
          "-o", path.join(dir, "page-$(nnnn).jpg"),
          "--noprofile",
          "--driver", device.driver,
          "--device", device.name,
          "--source", settings.source,
          "--dpi", String(settings.dpi),
          "--bitdepth", settings.bitDepth,
          "--jpegquality", "85",
          "-f",
        ],
        SCAN_TIMEOUT_MS,
      );
    } catch (err) {
      if (err instanceof HttpError) throw err;
      log("სკანირების შეცდომა:", err.details || err.message);
      throw new HttpError(502, `სკანირება ვერ მოხერხდა${err.details ? `: ${err.details}` : ""}`);
    }

    const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".jpg")).sort();
    if (!files.length) throw new HttpError(502, "სკანერმა გვერდი არ დააბრუნა (შეამოწმეთ ქაღალდი)");
    const pages = [];
    for (const f of files) {
      pages.push({ mimeType: "image/jpeg", data: (await readFile(path.join(dir, f))).toString("base64") });
    }
    log("დასკანერდა გვერდი:", pages.length);
    return pages;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function validateSettings(input) {
  const s = input && typeof input === "object" ? input : {};
  const device =
    s.device === null
      ? null
      : typeof s.device?.name === "string" && s.device.name.length <= 200 && DRIVERS.includes(s.device.driver)
        ? { name: s.device.name, driver: s.device.driver }
        : undefined;
  if (device === undefined || !DPI_VALUES.includes(s.dpi) || !BIT_DEPTHS.includes(s.bitDepth) || !SOURCES.includes(s.source)) {
    throw new HttpError(400, "პარამეტრები არასწორია");
  }
  return { device, dpi: s.dpi, bitDepth: s.bitDepth, source: s.source };
}

function readBody(req, limit = 10_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) reject(new HttpError(413, "მოთხოვნა ძალიან დიდია"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "null"));
      } catch {
        reject(new HttpError(400, "არასწორი JSON"));
      }
    });
    req.on("error", reject);
  });
}

const status = () => ({ version: VERSION, naps2: existsSync(config.naps2Path), settings });

async function route(req) {
  const url = new URL(req.url, "http://127.0.0.1");
  const key = `${req.method} ${url.pathname}`;

  if (key === "GET /status") return status();
  if (key === "GET /devices") return { devices: await listDevices() };
  if (key === "PUT /settings") {
    settings = validateSettings(await readBody(req));
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    log("პარამეტრები შეიცვალა:", JSON.stringify(settings));
    return status();
  }
  if (key === "POST /scan") {
    if (scanning) throw new HttpError(409, "სკანერი დაკავებულია, დაელოდეთ წინა სკანირების დასრულებას");
    scanning = true;
    try {
      return { pages: await scan() };
    } finally {
      scanning = false;
    }
  }
  throw new HttpError(404, "მისამართი ვერ მოიძებნა");
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const send = (code, body, headers = {}) => {
    res.writeHead(code, { "Cache-Control": "no-store", Vary: "Origin", ...headers });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };

  // DNS rebinding: მოთხოვნა მხოლოდ 127.0.0.1/localhost მისამართით
  if (!allowedHosts.has(req.headers.host ?? "")) return send(403, { error: "აკრძალულია" });
  // მხოლოდ კლინიკის საიტიდან (Origin-ის გარეშე — მაგ. სხვა პროგრამიდან — უარი)
  if (!origin || !allowedOrigins.has(origin)) {
    log("უარყოფილი Origin:", origin ?? "(არ არის)", req.method, req.url);
    return send(403, { error: "ამ საიტიდან სკანერთან წვდომა აკრძალულია" });
  }

  const cors = { "Access-Control-Allow-Origin": origin };
  if (req.method === "OPTIONS") {
    return send(204, undefined, {
      ...cors,
      "Access-Control-Allow-Methods": "GET, POST, PUT",
      "Access-Control-Allow-Headers": "Content-Type",
      // Chrome/Edge: საჯარო საიტიდან localhost-ზე მოთხოვნის ნებართვა (Private Network Access)
      "Access-Control-Allow-Private-Network": "true",
      "Access-Control-Max-Age": "600",
    });
  }

  try {
    send(200, await route(req), { ...cors, "Content-Type": "application/json; charset=utf-8" });
  } catch (err) {
    const code = err instanceof HttpError ? err.status : 500;
    if (code === 500) log("შეცდომა:", err.stack || err.message);
    send(code, { error: err instanceof HttpError ? err.message : "აგენტის შიდა შეცდომა" }, {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
    });
  }
});

if (!allowedOrigins.size) {
  log("გაფრთხილება: config.json-ში allowedOrigins ცარიელია — ყველა მოთხოვნა უარყოფილი იქნება");
}

server.on("error", (err) => {
  log("სერვერი ვერ გაეშვა:", err.code === "EADDRINUSE" ? `პორტი ${config.port} დაკავებულია (აგენტი უკვე გაშვებულია?)` : err.message);
  process.exit(1);
});

server.listen(config.port, "127.0.0.1", () => {
  log(`სკანერის აგენტი ${VERSION}: http://127.0.0.1:${config.port}, საიტები: ${[...allowedOrigins].join(", ") || "(არცერთი)"}`);
});
