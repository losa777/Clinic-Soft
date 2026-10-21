import type { Metadata } from "next";
import { Noto_Sans_Georgian } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// georgian subset მოიცავს მთავრულსაც (U+1C90–1CBF) — საჭიროა `uppercase`-ისთვის
const notoSansGeorgian = Noto_Sans_Georgian({
  variable: "--font-noto-georgian",
  subsets: ["georgian", "latin"],
});

export const metadata: Metadata = {
  title: { default: "კლინიკა", template: "%s · კლინიკა" },
  description: "კლინიკის მართვის სისტემა",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ka" className={`${notoSansGeorgian.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster theme="light" position="top-center" richColors />
      </body>
    </html>
  );
}
