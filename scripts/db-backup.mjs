// ============================================================
// BACKUP DO D1 LOCAL (npm run db:backup)
//
// Exporta o banco local inteiro para SQL em backups/<data-hora>.sql
// com o `wrangler d1 export --local`. A pasta backups/ está no
// .gitignore (contém dados dos usuários).
//
// Rode com o `npm run api` PARADO para evitar travamento de arquivo.
// ============================================================

import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirBackup = join(raiz, "backups");
mkdirSync(dirBackup, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const saida = join(dirBackup, `inform-aluno-db-${ts}.sql`);

execSync(
  `npx wrangler d1 export inform-aluno-db --local --output="${saida}"`,
  { cwd: join(raiz, "inform-aluno-api"), stdio: "inherit" }
);

const tamanho = statSync(saida).size;
console.log(`\nBackup gerado: ${saida} (${(tamanho / 1024).toFixed(1)} KB)`);

// Mantém apenas os 10 backups mais recentes
const backups = readdirSync(dirBackup)
  .filter((a) => a.startsWith("inform-aluno-db-") && a.endsWith(".sql"))
  .map((a) => ({ nome: a, t: statSync(join(dirBackup, a)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
for (const velho of backups.slice(10)) {
  console.log(`Descartando backup antigo: ${velho.nome}`);
  rmSync(join(dirBackup, velho.nome), { force: true });
}
