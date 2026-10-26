/**
 * ბაზის სრული ექსპორტი SQL ფაილად (სტრუქტურა + მონაცემები) — mysqldump-ის გარეშე.
 *   npm run db:export                → backups/<ბაზა>-YYYY-MM-DD_HHMM.sql
 *   npm run db:export -- out.sql     → მითითებულ ფაილში
 *
 * აღდგენა (ცარიელ ან არსებულ ბაზაში — ცხრილები თავიდან იქმნება):
 *   mysql -h <host> -u <user> -p <ბაზა> < backups/clinic-....sql
 *   (ან HeidiSQL / DBeaver / phpMyAdmin: „SQL ფაილის გაშვება“)
 *
 * ⚠ ფაილი შეიცავს პაციენტების პერსონალურ და სამედიცინო მონაცემებს — ინახეთ დაცულად, git-ში არ შედის (backups/).
 * პაციენტების ფაილები (DOCUMENTS_DIR / storage/documents) ცალკე დაარეზერვეთ — ბაზაში მხოლოდ მათი გზებია.
 */
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { once } from "node:events";
import mariadb from "mariadb";
import { getDbConfig } from "@/lib/db-config";

const BATCH = 500;

const pad = (n: number) => String(n).padStart(2, "0");
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

async function main() {
  const config = getDbConfig();
  const file = path.resolve(process.argv[2] ?? path.join("backups", `${config.database}-${stamp}.sql`));
  mkdirSync(path.dirname(file), { recursive: true });

  // dateStrings — თარიღები ზუსტად ისე, როგორც ბაზაშია (დროის სარტყლის გარდაქმნის გარეშე)
  const conn = await mariadb.createConnection({ ...config, charset: "utf8mb4", dateStrings: true, bigIntAsNumber: false, connectTimeout: 20_000 });
  const out = createWriteStream(file, { encoding: "utf8" });
  const write = async (s: string) => {
    if (!out.write(s)) await once(out, "drain");
  };

  try {
    // TIMESTAMP სვეტები სესიის სარტყელში ბრუნდება — UTC-ში ვიღებთ, აღდგენისასაც UTC-ა (TIME_ZONE = +00:00)
    await conn.query("SET time_zone = '+00:00'");
    const [{ version }] = await conn.query("SELECT VERSION() AS version");
    await write(
      [
        `-- Clinic-Soft: ბაზის ექსპორტი`,
        `-- ბაზა: ${config.database} · სერვერი: ${version} · ${now.toISOString()}`,
        `-- აღდგენა: mysql -u <user> -p <ბაზა> < ${path.basename(file)}`,
        "",
        "SET NAMES utf8mb4;",
        "SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS = 0;",
        "SET @OLD_UNIQUE_CHECKS = @@UNIQUE_CHECKS, UNIQUE_CHECKS = 0;",
        "SET @OLD_SQL_MODE = @@SQL_MODE, SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';",
        "SET @OLD_TIME_ZONE = @@TIME_ZONE, TIME_ZONE = '+00:00';",
        "",
        "",
      ].join("\n"),
    );

    const tables: { name: string; type: string }[] = (
      await conn.query(
        "SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
      )
    ).map((r: { name: string; type: string }) => ({ name: r.name, type: r.type }));

    const summary: [string, number][] = [];
    for (const { name } of tables.filter((t) => t.type === "BASE TABLE")) {
      const [create] = await conn.query(`SHOW CREATE TABLE \`${name}\``);
      await write(`-- ─── ${name} ───\nDROP TABLE IF EXISTS \`${name}\`;\n${create["Create Table"]};\n\n`);

      // გენერირებული სვეტები (მაგ. patients.phone_digits) ბაზა თავად ავსებს — INSERT-ში არ იწერება
      const columns: string[] = (
        await conn.query(
          "SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND EXTRA NOT LIKE '%GENERATED%' ORDER BY ORDINAL_POSITION",
          [name],
        )
      ).map((r: { c: string }) => r.c);
      const columnList = columns.map((c) => `\`${c}\``).join(", ");

      let count = 0;
      let batch: string[] = [];
      const flush = async () => {
        if (!batch.length) return;
        await write(`INSERT INTO \`${name}\` (${columnList}) VALUES\n${batch.join(",\n")};\n`);
        batch = [];
      };
      const stream = conn.queryStream({ sql: `SELECT ${columnList} FROM \`${name}\``, rowsAsArray: true });
      for await (const row of stream as AsyncIterable<unknown[]>) {
        batch.push(`(${row.map((v) => conn.escape(v as never)).join(", ")})`);
        count++;
        if (batch.length >= BATCH) await flush();
      }
      await flush();
      await write("\n");
      summary.push([name, count]);
    }

    for (const { name } of tables.filter((t) => t.type === "VIEW")) {
      const [view] = await conn.query(`SHOW CREATE VIEW \`${name}\``);
      await write(`DROP VIEW IF EXISTS \`${name}\`;\n${view["Create View"]};\n\n`);
    }

    await write(
      [
        "SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;",
        "SET UNIQUE_CHECKS = @OLD_UNIQUE_CHECKS;",
        "SET SQL_MODE = @OLD_SQL_MODE;",
        "SET TIME_ZONE = @OLD_TIME_ZONE;",
        "",
      ].join("\n"),
    );
    out.end();
    await once(out, "finish");

    const rows = summary.reduce((n, [, c]) => n + c, 0);
    console.log(`✔ ${file}`);
    console.log(`  ცხრილი: ${summary.length}, ჩანაწერი: ${rows}`);
    for (const [t, c] of summary.filter(([, c]) => c > 0)) console.log(`  ${t}: ${c}`);
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error("ექსპორტი ვერ შესრულდა:", error instanceof Error ? error.message : error);
  process.exit(1);
});
