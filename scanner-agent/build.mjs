/**
 * სკანერის აგენტის ინსტალატორის აწყობა: scanner-agent/dist/ClinicScanAgentSetup.exe
 *   npm run scanner:build
 *
 * 1. agent.mjs → ერთი CommonJS ფაილი (esbuild)
 * 2. Node.js Single Executable Application: node.exe + აგენტი = ClinicScanAgent.exe (კომპიუტერზე Node.js არ სჭირდება)
 * 3. exe → „ფანჯრის გარეშე“ (PE subsystem: GUI) — ფონზე ეშვება, კონსოლის ფანჯარა არ ჩნდება
 * 4. IExpress (Windows-ში ჩაშენებული): exe + installer/*.ps1 → ClinicScanAgentSetup.exe, რომელიც setup.ps1-ს უშვებს
 *
 * საჭიროა Windows (IExpress) და Node.js 24 (მისი node.exe ხდება აგენტის საფუძველი).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { inject } from "postject";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(ROOT, "dist", "work");
const OUT = path.join(ROOT, "dist", "ClinicScanAgentSetup.exe");
const EXE = path.join(WORK, "ClinicScanAgent.exe");
const SCRIPTS = ["setup.ps1", "common.ps1", "tray.ps1", "uninstall.ps1"];

if (process.platform !== "win32") throw new Error("ინსტალატორი აიწყობა მხოლოდ Windows-ზე (IExpress)");

rmSync(path.join(ROOT, "dist"), { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// 1. ერთი ფაილი
console.log("1/4 აგენტის აწყობა (esbuild)...");
await build({
  entryPoints: [path.join(ROOT, "agent.mjs")],
  outfile: path.join(WORK, "agent.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  logLevel: "error",
  // import.meta.url exe-ში არ გამოიყენება (isSea() → process.execPath)
  logOverride: { "empty-import-meta": "silent" },
});

// 2. Single Executable Application
console.log("2/4 ClinicScanAgent.exe (Node.js SEA)...");
const seaConfig = path.join(WORK, "sea-config.json");
writeFileSync(
  seaConfig,
  JSON.stringify({ main: path.join(WORK, "agent.cjs"), output: path.join(WORK, "sea-prep.blob"), disableExperimentalSEAWarning: true, useCodeCache: false }),
);
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });
copyFileSync(process.execPath, EXE);
await inject(EXE, "NODE_SEA_BLOB", readFileSync(path.join(WORK, "sea-prep.blob")), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
});

// 3. PE header: Subsystem 3 (console) → 2 (GUI) — ფანჯრის გარეშე
console.log("3/4 ფანჯრის გარეშე გაშვება (GUI subsystem)...");
const exe = readFileSync(EXE);
const pe = exe.readUInt32LE(0x3c);
if (exe.toString("latin1", pe, pe + 4) !== "PE\0\0") throw new Error("PE header ვერ მოიძებნა");
const subsystemOffset = pe + 24 + 68; // optional header + Subsystem
if (exe.readUInt16LE(subsystemOffset) !== 3) throw new Error(`მოულოდნელი subsystem: ${exe.readUInt16LE(subsystemOffset)}`);
exe.writeUInt16LE(2, subsystemOffset);
writeFileSync(EXE, exe);

// 4. IExpress
console.log("4/4 ინსტალატორი (IExpress)...");
for (const f of SCRIPTS) {
  // Windows PowerShell 5.1 ქართულ ტექსტს სწორად კითხულობს მხოლოდ UTF-8 BOM-ით
  const text = readFileSync(path.join(ROOT, "installer", f), "utf8").replace(/^﻿/, "").replace(/\r?\n/g, "\r\n");
  writeFileSync(path.join(WORK, f), "﻿" + text, "utf8");
}
const files = ["ClinicScanAgent.exe", ...SCRIPTS];
const sed = [
  "[Version]",
  "Class=IEXPRESS",
  "SEDVersion=3",
  "[Options]",
  "PackagePurpose=InstallApp",
  "ShowInstallProgramWindow=1",
  "HideExtractAnimation=1",
  "UseLongFileName=1",
  "InsideCompressed=0",
  "CAB_FixedSize=0",
  "CAB_ResvCodeSigning=0",
  "RebootMode=N",
  "InstallPrompt=%InstallPrompt%",
  "DisplayLicense=%DisplayLicense%",
  "FinishMessage=%FinishMessage%",
  "TargetName=%TargetName%",
  "FriendlyName=%FriendlyName%",
  "AppLaunched=%AppLaunched%",
  "PostInstallCmd=%PostInstallCmd%",
  "AdminQuietInstCmd=%AdminQuietInstCmd%",
  "UserQuietInstCmd=%UserQuietInstCmd%",
  "SourceFiles=SourceFiles",
  "[Strings]",
  "InstallPrompt=",
  "DisplayLicense=",
  "FinishMessage=",
  `TargetName=${OUT}`,
  "FriendlyName=Clinic Scan Agent",
  "AppLaunched=powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File setup.ps1",
  "PostInstallCmd=<None>",
  "AdminQuietInstCmd=",
  "UserQuietInstCmd=",
  ...files.map((f, i) => `FILE${i}="${f}"`),
  "[SourceFiles]",
  `SourceFiles0=${WORK}\\`,
  "[SourceFiles0]",
  ...files.map((_, i) => `%FILE${i}%=`),
  "",
].join("\r\n");
const sedFile = path.join(WORK, "setup.sed");
writeFileSync(sedFile, sed, "latin1");
execFileSync("iexpress.exe", ["/N", "/Q", sedFile], { stdio: "inherit" });
if (!existsSync(OUT)) throw new Error("IExpress-მა ინსტალატორი ვერ შექმნა");

const mb = (f) => (readFileSync(f).byteLength / 1024 / 1024).toFixed(1);
console.log(`✔ ${OUT} (${mb(OUT)} MB; აგენტი ${mb(EXE)} MB)`);
