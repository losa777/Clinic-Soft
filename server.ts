/**
 * აპლიკაციის სერვერი: Next.js + ჩატის Socket.IO ერთ http სერვერზე და ერთ პორტზე (Next-ის custom server).
 * Next-ის Route Handler-ებს WebSocket-ის მხარდაჭერა არ აქვს, ამიტომ `next dev` / `next start`-ის ნაცვლად:
 *   npm run dev    → tsx server.ts --dev
 *   npm start      → tsx server.ts        (npm run build-ის შემდეგ)
 * პორტი/მისამართი: PORT (3000), HOST (ყველა ინტერფეისი). Socket.IO-ს მისამართი — CHAT_SOCKET_PATH.
 * ეს ფაილი Next-ის bundle-ში არ შედის — tsx უშვებს პირდაპირ. ჩატის realtime კოდის შეცვლისას გადატვირთეთ.
 */
import { createServer } from "node:http";

const dev = process.argv.includes("--dev");
// NODE_ENV Next-ის ჩატვირთვამდე (Windows-ის npm სკრიპტებში `NODE_ENV=... cmd` არ მუშაობს)
(process.env as Record<string, string>).NODE_ENV = dev ? "development" : "production";

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || undefined;

async function main() {
  const { default: next } = await import("next");
  const httpServer = createServer();
  const app = next({ dev, httpServer, hostname: hostname ?? "localhost", port });
  await app.prepare();

  // .env.local-ს Next კითხულობს prepare()-ში — ბაზა/AUTH_SECRET-ის მომხმარებელი მოდულები მხოლოდ ამის შემდეგ
  const { attachChatServer } = await import("@/modules/chat/realtime/socket-server");
  attachChatServer(httpServer);

  // upgrade (WebSocket): Socket.IO თავის მისამართს თვითონ იღებს, დანარჩენს (HMR) Next — პირველ მოთხოვნაზე ერთვება
  const handle = app.getRequestHandler();
  httpServer.on("request", (req, res) => void handle(req, res));

  httpServer.listen(port, hostname, () => {
    console.log(`> მზადაა: http://${hostname ?? "localhost"}:${port} (${dev ? "development" : "production"})`);
  });
}

main().catch((error) => {
  console.error("სერვერი ვერ გაეშვა:", error);
  process.exit(1);
});
