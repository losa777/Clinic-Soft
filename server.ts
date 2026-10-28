/**
 * აპლიკაციის სერვერი: Next.js + ჩატის Socket.IO ერთ http(s) სერვერზე და ერთ პორტზე (Next-ის custom server).
 * Next-ის Route Handler-ებს WebSocket-ის მხარდაჭერა არ აქვს, ამიტომ `next dev` / `next start`-ის ნაცვლად:
 *   npm run dev    → tsx server.ts --dev
 *   npm start      → tsx server.ts        (npm run build-ის შემდეგ)
 * პორტი/მისამართი: PORT (3000), HOST (ყველა ინტერფეისი). Socket.IO-ს მისამართი — CHAT_SOCKET_PATH.
 * HTTPS: .env.local-ში HTTPS_KEY_FILE და HTTPS_CERT_FILE (npm run https:setup) — მაშინ PORT https-ზე მუშაობს;
 * იმავე პორტზე http:// (მისამართი სქემის გარეშე აკრეფილი) → https:// გადამისამართება;
 * HTTP_REDIRECT_PORT (მაგ. 80) — სხვა პორტის http:// მოთხოვნებიც https-ზე გადამისამართდება.
 * ეს ფაილი Next-ის bundle-ში არ შედის — tsx უშვებს პირდაპირ. ჩატის realtime კოდის შეცვლისას გადატვირთეთ.
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import { loadEnvConfig } from "@next/env";

const dev = process.argv.includes("--dev");
// NODE_ENV Next-ის ჩატვირთვამდე (Windows-ის npm სკრიპტებში `NODE_ENV=... cmd` არ მუშაობს)
(process.env as Record<string, string>).NODE_ENV = dev ? "development" : "production";
// .env.local — სერვერის შექმნამდე (სერტიფიკატის ფაილები); Next prepare()-ში იგივეს ხელახლა კითხულობს
loadEnvConfig(process.cwd(), dev);

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || undefined;

/** სერტიფიკატი .env.local-იდან (ფარდობითი გზა — პროექტის საქაღალდიდან) ან null — http. */
function tlsOptions(): { key: Buffer; cert: Buffer } | null {
  const keyFile = process.env.HTTPS_KEY_FILE?.trim();
  const certFile = process.env.HTTPS_CERT_FILE?.trim();
  if (!keyFile || !certFile) return null;
  trustClinicCa(process.env.HTTPS_CA_FILE?.trim() || path.join(path.dirname(path.resolve(certFile)), "clinic-ca.crt"));
  return { key: readFileSync(path.resolve(keyFile)), cert: readFileSync(path.resolve(certFile)) };
}

/**
 * Next სერვერი ზოგჯერ საკუთარ თავს მიმართავს (Server Action-ის redirect-ის გვერდი) — Node-მა კლინიკის CA უნდა
 * ენდოს, სხვაგვარად: UNABLE_TO_VERIFY_LEAF_SIGNATURE. სისტემის სანდო ცენტრებს ემატება (არ ცვლის).
 */
// Node 22.19+/24.5+ (@types/node 20-ში ჯერ არ არის აღწერილი)
const nodeTls = tls as typeof tls & {
  setDefaultCACertificates?: (certs: string[]) => void;
  getCACertificates?: (type: "default") => string[];
};

function trustClinicCa(caFile: string) {
  if (!existsSync(caFile)) return;
  if (!nodeTls.setDefaultCACertificates || !nodeTls.getCACertificates) {
    console.warn(`! Node ${process.version}: კლინიკის CA-ს დასამატებლად გაუშვით NODE_EXTRA_CA_CERTS=${caFile}-ით`);
    return;
  }
  nodeTls.setDefaultCACertificates([...nodeTls.getCACertificates("default"), readFileSync(caFile, "utf8")]);
}

async function main() {
  const tls = tlsOptions();
  // https.Server Node-ში http.Server-ის API-ს იმეორებს — Next და Socket.IO ორივეს ერთნაირად იყენებს
  const server = (tls ? createHttpsServer(tls) : createHttpServer()) as HttpServer;
  const { default: next } = await import("next");
  const app = next({ dev, httpServer: server, hostname: hostname ?? "localhost", port });
  await app.prepare();

  // .env.local-ს Next კითხულობს prepare()-ში — ბაზა/AUTH_SECRET-ის მომხმარებელი მოდულები მხოლოდ ამის შემდეგ
  const { attachChatServer } = await import("@/modules/chat/realtime/socket-server");
  attachChatServer(server);

  // upgrade (WebSocket): Socket.IO თავის მისამართს თვითონ იღებს, დანარჩენს (HMR) Next — პირველ მოთხოვნაზე ერთვება
  const handle = app.getRequestHandler();
  server.on("request", (req, res) => {
    // HSTS: ბრაუზერი ამ საიტზე მხოლოდ https-ით შევა (180 დღე) — მხოლოდ https პასუხზე
    if (tls) res.setHeader("Strict-Transport-Security", "max-age=15552000");
    void handle(req, res);
  });

  const scheme = tls ? "https" : "http";
  const ready = () => {
    console.log(`> მზადაა: ${scheme}://${hostname ?? "localhost"}:${port} (${dev ? "development" : "production"})`);
    // საცავი (იგივე წესი, რაც src/lib/document-storage.ts documentsRoot — იქაური მოდული server-only-ია, tsx-ში არ იტვირთება)
    const custom = process.env.DOCUMENTS_DIR?.trim();
    const storage = path.resolve(custom || path.join(process.cwd(), "storage", "documents"));
    console.log(`> ფაილების საცავი: ${storage}${custom ? "" : " (DOCUMENTS_DIR ცარიელია — პროექტის საქაღალდე)"}${existsSync(storage) ? "" : " — საქაღალდე ჯერ არ არსებობს"}`);
  };
  if (!tls) {
    server.listen(port, hostname, ready);
    return;
  }

  const redirect = createHttpServer((req, res) => {
    const host = (req.headers.host ?? "localhost").replace(/:\d+$/, "");
    res.writeHead(301, { Location: `https://${host}${port === 443 ? "" : `:${port}`}${req.url ?? "/"}` });
    res.end();
  });
  // ერთ პორტზე ორივე: TLS-ის პირველი ბაიტი 0x16 (ClientHello) → https, სხვა (http-ის „GET ...“) → გადამისამართება
  net
    .createServer((socket) => {
      socket.setTimeout(30_000, () => socket.destroy());
      socket.on("error", () => socket.destroy());
      socket.once("data", (chunk) => {
        socket.setTimeout(0);
        socket.pause();
        socket.unshift(chunk);
        (chunk[0] === 0x16 ? server : redirect).emit("connection", socket);
        process.nextTick(() => socket.resume());
      });
    })
    .listen(port, hostname, ready);

  const redirectPort = Number(process.env.HTTP_REDIRECT_PORT || 0);
  if (redirectPort && redirectPort !== port) {
    redirect.listen(redirectPort, hostname, () => console.log(`> http://…:${redirectPort} → https (გადამისამართება)`));
  }
}

main().catch((error) => {
  console.error("სერვერი ვერ გაეშვა:", error);
  process.exit(1);
});
