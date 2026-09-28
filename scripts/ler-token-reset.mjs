// Lê o token de redefinição de senha mais recente (e ainda não usado)
// de um e-mail, direto no D1 local.
//
//   node scripts/ler-token-reset.mjs e2e.email.pai@x.com
//
// Por que existe: com SMTP configurado a API NÃO devolve mais
// `linkSimulado` na resposta (o link sai por e-mail) — o e2e precisa do
// token de outra forma para concluir a troca. Sem SMTP, o script não é
// usado (o e2e pega o link na própria resposta).
//
// Somente leitura: abre o banco em modo read-only.
import { DatabaseSync } from "node:sqlite";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const email = process.argv[2];
if (!email) {
  console.error("uso: node scripts/ler-token-reset.mjs <email>");
  process.exit(2);
}

// Caminho resolvido a partir deste arquivo (funciona com cwd em qualquer lugar)
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(raiz, "inform-aluno-api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject");

if (!existsSync(dir)) {
  console.error("banco local nao encontrado (dev parado ou primeiro run)");
  process.exit(1);
}

let db = null;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sqlite"))) {
  try {
    const tentativa = new DatabaseSync(join(dir, f), { readOnly: true });
    const ok = tentativa
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='redefinicao_senha'"
      )
      .get();
    if (ok) {
      db = tentativa;
      break;
    }
    tentativa.close();
  } catch {
    /* arquivo que não é o banco */
  }
}

if (!db) {
  console.error("tabela redefinicao_senha nao encontrada");
  process.exit(1);
}

const linha = db
  .prepare(
    `SELECT r.token
       FROM redefinicao_senha r
       JOIN usuarios u ON u.id = r.usuario_id
      WHERE u.email = ?
        AND r.usado_em IS NULL
        AND r.expira_em > datetime('now')
      ORDER BY r.id DESC
      LIMIT 1`
  )
  .get(email);
db.close();

if (!linha) {
  console.error("nenhum token valido para " + email);
  process.exit(1);
}

process.stdout.write(String(linha.token));
