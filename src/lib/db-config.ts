function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`გარემოს ცვლადი ${name} არ არის მითითებული (.env.local)`);
  return value;
}

/** ბაზის პარამეტრები .env.local-იდან (DB_*). */
export function getDbConfig() {
  return {
    host: required("DB_HOST"),
    port: Number(process.env.DB_PORT ?? 3306),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    database: required("DB_NAME"),
  };
}

export function getDatabaseUrl(): string {
  const c = getDbConfig();
  return `mysql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.password)}@${c.host}:${c.port}/${c.database}`;
}
