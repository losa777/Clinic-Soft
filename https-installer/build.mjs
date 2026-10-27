/**
 * HTTPS-ის სერვერის ინსტალატორის აწყობა: https-installer/dist/ClinicHttpsServerSetup.exe
 *   npm run https:build
 *
 * IExpress (Windows-ში ჩაშენებული): server-setup.ps1 + კლიენტის სკრიპტები → ერთი exe, რომელიც server-setup.ps1-ს უშვებს.
 * კლიენტის ინსტალატორს (ClinicCertificateSetup.exe) სერვერზე ქმნის server-setup.ps1 — მასში კლინიკის სანდო
 * ცენტრი და სერვერის მისამართია ჩადებული, ამიტომ წინასწარ ვერ აიწყობა.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(ROOT, "dist", "work");
const OUT = path.join(ROOT, "dist", "ClinicHttpsServerSetup.exe");
const SCRIPTS = ["server-setup.ps1", "client-setup.ps1", "client-trust.ps1"];

if (process.platform !== "win32") throw new Error("ინსტალატორი აიწყობა მხოლოდ Windows-ზე (IExpress)");

rmSync(path.join(ROOT, "dist"), { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

for (const f of SCRIPTS) {
  // Windows PowerShell 5.1 ქართულ ტექსტს სწორად კითხულობს მხოლოდ UTF-8 BOM-ით
  const text = readFileSync(path.join(ROOT, f), "utf8").replace(/^﻿/, "").replace(/\r?\n/g, "\r\n");
  writeFileSync(path.join(WORK, f), "﻿" + text, "utf8");
}
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
  "FriendlyName=Clinic HTTPS Server",
  "AppLaunched=powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File server-setup.ps1",
  "PostInstallCmd=<None>",
  "AdminQuietInstCmd=",
  "UserQuietInstCmd=",
  ...SCRIPTS.map((f, i) => `FILE${i}="${f}"`),
  "[SourceFiles]",
  `SourceFiles0=${WORK}\\`,
  "[SourceFiles0]",
  ...SCRIPTS.map((_, i) => `%FILE${i}%=`),
  "",
].join("\r\n");
const sedFile = path.join(WORK, "setup.sed");
writeFileSync(sedFile, sed, "latin1");
execFileSync("iexpress.exe", ["/N", "/Q", sedFile], { stdio: "inherit" });
if (!existsSync(OUT)) throw new Error("IExpress-მა ინსტალატორი ვერ შექმნა");
rmSync(WORK, { recursive: true, force: true });
console.log(`✔ ${OUT} (${(readFileSync(OUT).byteLength / 1024).toFixed(0)} KB)`);
