import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * dev რეჟიმში Next სხვა მისამართიდან (არა localhost) შემოსულ მოთხოვნებს dev-რესურსებზე (/_next/hmr…) ბლოკავს —
 * ტელეფონიდან / სხვა კომპიუტერიდან (http://10.1.20.245:3000) გვერდი ჩანს, მაგრამ ღილაკები და ჩატი არ მუშაობს.
 * ნებადართულია ამ კომპიუტერის ქსელური IP-ები (ავტომატურად) + .env.local-ის DEV_ALLOWED_ORIGINS (მძიმით, მაგ. "clinic-pc").
 * production-ზე (npm start) არ მოქმედებს.
 */
function devOrigins(): string[] {
  const own = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && !a.internal && (a.family === "IPv4" || (a.family as unknown) === 4))
    .map((a) => a!.address);
  const extra = (process.env.DEV_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...own, ...extra])];
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: devOrigins(),
  experimental: {
    // dev-ის ფაილური ქეში (.next/dev/cache) გამორთულია: Next 16.4.2-ში ფაილის შეცვლის შემდეგ ძველი ქეშით გაშვებისას
    // Turbopack root chunk-ზე ყოველ კავშირზე „restart“-ს აგზავნის — გვერდი უსასრულოდ ხელახლა იტვირთება
    // (მეორე გაშვებაზე სწორდება). ფასი — dev-ის პირველი კომპილაცია ყოველ გაშვებაზე. build-ის ქეში ჩართულია.
    turbopackFileSystemCacheForDev: false,
    // პაციენტის დოკუმენტები Server Action-ით იტვირთება (ლიმიტები: src/lib/patient-schema.ts, ჯამში 40 MB).
    // proxy-ის ბუფერი ლიმიტზე მეტ body-ს ჩუმად წყვეტს, ამიტომ ორივე ერთნაირად უნდა გაიზარდოს.
    serverActions: { bodySizeLimit: "45mb" },
    proxyClientMaxBodySize: "45mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
