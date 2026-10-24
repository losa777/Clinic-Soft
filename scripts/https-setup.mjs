/**
 * HTTPS კლინიკის ქსელში: კლინიკის საკუთარი „სანდო ცენტრი“ (CA) და სერვერის სერტიფიკატი (OpenSSL-ით).
 *
 *   npm run https:setup                      — ამ კომპიუტერის სახელი და ყველა IPv4 მისამართი
 *   npm run https:setup -- --name clinic-pc --ip 10.1.20.245   — დამატებითი სახელი/IP (რამდენჯერაც საჭიროა)
 *
 * შედეგი — certs/ (git-ში არ შედის):
 *   clinic-ca.key   — CA-ს გასაღები. საიდუმლოა: ინახება მხოლოდ სერვერზე (ან სეიფში), არავის გადაეცემა.
 *   clinic-ca.crt   — CA-ს სერტიფიკატი: ყენდება კლინიკის ყველა კომპიუტერზე (install-clinic-ca.cmd).
 *   server.key/.crt — სერვერის გასაღები და სერტიფიკატი (.env.local: HTTPS_KEY_FILE / HTTPS_CERT_FILE).
 *
 * განმეორებით გაშვება (ახალი IP, ვადის განახლება): CA რჩება — კომპიუტერებზე ხელახლა დაყენება არ სჭირდება,
 * იცვლება მხოლოდ სერვერის სერტიფიკატი. OpenSSL: Git for Windows-ს მოყვება (Git Bash), ან PATH-ში.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname, networkInterfaces } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "certs");
const file = (name) => path.join(dir, name);
const CA_DAYS = 3650;
// ბრაუზერები კერძო CA-ს სერტიფიკატზე ვადის შეზღუდვას არ აწესებენ; 825 დღე — ~2 წელი 3 თვე
const SERVER_DAYS = 825;

function openssl(args) {
  try {
    return execFileSync("openssl", args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error("✖ OpenSSL ვერ მოიძებნა. გაუშვით Git Bash-იდან (Git for Windows-ს მოყვება) ან დაამატეთ openssl PATH-ში.");
      process.exit(1);
    }
    console.error(error.stderr?.toString() || error.message);
    process.exit(1);
  }
}

// --name X / --ip Y (რამდენჯერმე)
const names = new Set(["localhost", hostname().toLowerCase()]);
const ips = new Set(["127.0.0.1"]);
for (const a of Object.values(networkInterfaces()).flat()) {
  if (a && !a.internal && (a.family === "IPv4" || a.family === 4)) ips.add(a.address);
}
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--name" && argv[i + 1]) names.add(argv[++i].toLowerCase());
  else if (argv[i] === "--ip" && argv[i + 1]) ips.add(argv[++i]);
}

mkdirSync(dir, { recursive: true });

if (!existsSync(file("clinic-ca.key"))) {
  openssl([
    "req", "-x509", "-new", "-nodes", "-newkey", "rsa:3072", "-sha256", "-days", String(CA_DAYS),
    "-keyout", file("clinic-ca.key"), "-out", file("clinic-ca.crt"),
    "-subj", "/CN=Clinic-Soft Local CA/O=Clinic",
    "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
    "-addext", "keyUsage=critical,keyCertSign,cRLSign",
  ]);
  console.log("✔ შეიქმნა კლინიკის CA: certs/clinic-ca.crt (10 წელი)");
} else {
  console.log("✔ კლინიკის CA უკვე არსებობს — გამოიყენება იგივე (კომპიუტერებზე ხელახლა დაყენება არ სჭირდება)");
}

const san = [...[...names].map((n) => `DNS:${n}`), ...[...ips].map((ip) => `IP:${ip}`)].join(",");
const ext = file("server.ext");
writeFileSync(
  ext,
  [
    "basicConstraints=critical,CA:FALSE",
    "keyUsage=critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth",
    `subjectAltName=${san}`,
  ].join("\n"),
);
openssl(["req", "-new", "-nodes", "-newkey", "rsa:2048", "-keyout", file("server.key"), "-out", file("server.csr"), "-subj", `/CN=${hostname().toLowerCase()}`]);
openssl([
  "x509", "-req", "-sha256", "-days", String(SERVER_DAYS),
  "-in", file("server.csr"), "-CA", file("clinic-ca.crt"), "-CAkey", file("clinic-ca.key"), "-CAcreateserial",
  "-extfile", ext, "-out", file("server.crt"),
]);
rmSync(file("server.csr"));
rmSync(ext);
copyFileSync(path.join(root, "scripts", "install-clinic-ca.ps1"), file("install-clinic-ca.ps1"));
copyFileSync(path.join(root, "scripts", "install-clinic-ca.cmd"), file("install-clinic-ca.cmd"));

const until = openssl(["x509", "-in", file("server.crt"), "-noout", "-enddate"]).trim().replace("notAfter=", "");
console.log(`✔ სერვერის სერტიფიკატი: certs/server.crt (ვადა: ${until})`);
console.log(`  მისამართები: ${[...names, ...ips].join(", ")}`);
console.log(`
შემდეგი ნაბიჯები:
  1) .env.local-ში:
       HTTPS_KEY_FILE=certs/server.key
       HTTPS_CERT_FILE=certs/server.crt
       AUTH_TRUST_HOST=true
       # სურვილისამებრ — http:// მისამართის გადამისამართება https-ზე:
       # HTTP_REDIRECT_PORT=80
  2) გადატვირთეთ სერვერი (npm start / npm run dev) — გაიხსნება https://${[...ips].find((ip) => ip !== "127.0.0.1") ?? "localhost"}:3000
  3) კლინიკის ყველა კომპიუტერზე (ერთხელ): დააკოპირეთ certs/clinic-ca.crt და certs/install-clinic-ca.cmd
     ერთ საქაღალდეში და გაუშვით install-clinic-ca.cmd (ადმინისტრატორის უფლებით) — შემდეგ ბრაუზერი გაფრთხილებას აღარ აჩვენებს.
     clinic-ca.key არ დააკოპიროთ!
  4) სკანერის აგენტი: config.json-ის allowedOrigins-ში დაამატეთ ახალი https:// მისამართი.`);
