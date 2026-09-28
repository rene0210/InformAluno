// Auditoria somente-leitura do banco local (D1/miniflare).
// Não altera nada: abre em modo read-only e só imprime contagens.
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir =
  "inform-aluno-api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const arquivos = readdirSync(dir).filter((f) => f.endsWith(".sqlite"));

// Escolhe o banco de produção local: precisa ter responsavel_usuario
// (os outros são bancos de teste/schema-fresh).
let db = null;
for (const f of arquivos) {
  try {
    const tentativa = new DatabaseSync(join(dir, f), { readOnly: true });
    const tem = tentativa
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='responsavel_usuario'"
      )
      .get();
    if (tem) {
      db = tentativa;
      console.log(`[db] ${f}`);
      break;
    }
    const alunos = tentativa
      .prepare(
        "SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='alunos'"
      )
      .get();
    console.log(
      `[skip] ${f}: responsavel_usuario ausente (alunos=${alunos.c ? "sim" : "nao"})`
    );
    tentativa.close();
  } catch (e) {
    console.log(`[skip] ${f}: ${String(e.message || e)}`);
  }
}
if (!db) {
  console.log("Nenhum banco com a tabela 'alunos' encontrado.");
  process.exit(1);
}

const q = (sql) => db.prepare(sql).get();
const linhas = (sql) => db.prepare(sql).all();

console.log("\n--- volumes ---");
console.log("alunos:", q("SELECT COUNT(*) c FROM alunos").c);
console.log("responsaveis:", q("SELECT COUNT(*) c FROM responsaveis").c);
console.log(
  "responsavel_usuario:",
  q("SELECT COUNT(*) c FROM responsavel_usuario").c
);
console.log("usuarios:", q("SELECT COUNT(*) c FROM usuarios").c);

console.log("\n--- integridade referencial (FKs estao ON?) ---");
console.log(
  "PRAGMA foreign_keys:",
  db.prepare("PRAGMA foreign_keys").get()
);

console.log("\n--- órfãos ---");
console.log(
  "alunos apontando p/ responsavel inexistente:",
  q(`SELECT COUNT(*) c FROM alunos a
     WHERE (a.responsavel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM responsaveis r WHERE r.id = a.responsavel_id))
        OR (a.responsavel2_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM responsaveis r WHERE r.id = a.responsavel2_id))
        OR (a.responsavel3_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM responsaveis r WHERE r.id = a.responsavel3_id))`).c
);
console.log(
  "responsavel_usuario p/ responsavel inexistente:",
  q(`SELECT COUNT(*) c FROM responsavel_usuario ru
     WHERE NOT EXISTS (SELECT 1 FROM responsaveis r WHERE r.id = ru.responsavel_id)`).c
);
console.log(
  "responsavel_usuario p/ usuario inexistente:",
  q(`SELECT COUNT(*) c FROM responsavel_usuario ru
     WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = ru.usuario_id)`).c
);
console.log(
  "responsaveis sem nenhum aluno (higienizacao pendente):",
  q(`SELECT COUNT(*) c FROM responsaveis r
     WHERE NOT EXISTS (SELECT 1 FROM alunos a WHERE a.responsavel_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM alunos a WHERE a.responsavel2_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM alunos a WHERE a.responsavel3_id = r.id)`).c
);
console.log(
  "alunos sem NENHUM responsavel:",
  q(
    "SELECT COUNT(*) c FROM alunos WHERE responsavel_id IS NULL AND responsavel2_id IS NULL"
  ).c
);

console.log("\n--- invariantes de negócio ---");
console.log(
  "alunos com responsavel2 mas SEM responsavel1 (slot 1 vazio):",
  q(
    "SELECT COUNT(*) c FROM alunos WHERE responsavel_id IS NULL AND responsavel2_id IS NOT NULL"
  ).c
);
console.log(
  "responsaveis com CPF repetido (viaria UNIQUE):",
  q(
    "SELECT COUNT(*) c FROM (SELECT cpf FROM responsaveis GROUP BY cpf HAVING COUNT(*) > 1)"
  ).c
);
console.log(
  "alunos com mesmo responsavel nos slots 1 e 2:",
  q(
    "SELECT COUNT(*) c FROM alunos WHERE responsavel_id IS NOT NULL AND responsavel_id = responsavel2_id"
  ).c
);

console.log("\n--- dados reais protegidos ---");
console.log(
  "matricula 212121 (Rafaella):",
  JSON.stringify(
    linhas(
      "SELECT matricula, nome, responsavel_id, responsavel2_id FROM alunos WHERE matricula = '212121'"
    )
  )
);
console.log(
  "usuario 13:",
  JSON.stringify(linhas("SELECT id, nome, email FROM usuarios WHERE id = 13"))
);

console.log("\n--- lixo de smoke (deveria estar zerado) ---");
console.log(
  "alunos 9902xx/SRS-001 (990208 = aluno demo, esperado):",
  JSON.stringify(
    linhas(
      "SELECT id, matricula, nome FROM alunos WHERE matricula LIKE '9902%' OR matricula LIKE 'SRS-%'"
    )
  )
);
console.log(
  "usuarios smoke:",
  q(
    "SELECT COUNT(*) c FROM usuarios WHERE email LIKE 'smoke.%@informaluno.com' OR email LIKE 'repro.%@informaluno.com'"
  ).c
);

console.log("\n--- todos os alunos ---");
console.log(
  JSON.stringify(
    linhas("SELECT id, matricula, nome FROM alunos ORDER BY id"),
    null,
    1
  )
);

db.close();
