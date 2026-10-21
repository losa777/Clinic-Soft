import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
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
