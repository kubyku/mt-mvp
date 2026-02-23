import fs from "node:fs";
import path from "node:path";
import { db } from "./connection.js";

function nowIso(): string {
  return new Date().toISOString();
}

function resolveMigrationsDir(): string {
  const srcPath = path.resolve(process.cwd(), "src/db/migrations");
  if (fs.existsSync(srcPath)) return srcPath;
  return path.resolve(process.cwd(), "dist/db/migrations");
}

export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationDir = resolveMigrationsDir();
  const files = fs
    .readdirSync(migrationDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const appliedRows = db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[];
  const applied = new Set(appliedRows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)").run(file, nowIso());
    });
    tx();
    // eslint-disable-next-line no-console
    console.log(`[migration] applied ${file}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}
