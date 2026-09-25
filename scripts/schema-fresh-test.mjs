// ============================================================
// TESTE DE REPRODUZIBILIDADE DO schema.sql
//
// Monta um banco NOVO em SQLite (node:sqlite) aplicando o schema.sql
// inteiro e valida o que precisa existir num ambiente recém-criado:
// coluna `serie` em alunos, catálogo de matérias seedado, admin com
// senha em hash e constraints das notas. Roda offline (sem backend).
//
// Uso: node scripts/schema-fresh-test.mjs
// ============================================================

import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(join(raiz, "inform-aluno-api", "schema.sql"), "utf8");

let falhas = 0;
const check = (nome, ok, detalhe = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} - ${nome}${!ok && detalhe ? ` (${detalhe})` : ""}`);
  if (!ok) falhas++;
};

const dir = mkdtempSync(join(tmpdir(), "informaluno-schema-"));
try {
  const db = new DatabaseSync(join(dir, "fresh.sqlite"));
  db.exec(schema);
  check("schema.sql executa sem erro", true);

  const colunasAlunos = db
    .prepare("PRAGMA table_info(alunos)")
    .all()
    .map((c) => c.name);
  check("alunos tem a coluna serie", colunasAlunos.includes("serie"), colunasAlunos.join(","));
  check(
    "alunos mantém foto_base64/status/responsavel3",
    colunasAlunos.includes("foto_base64") &&
      colunasAlunos.includes("status") &&
      colunasAlunos.includes("responsavel3_id")
  );

  const tabelas = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((r) => r.name);
  const essenciais = [
    "sessoes",
    "log_acessos",
    "redefinicao_senha",
    "registros_entrada",
    "professores",
    "notas",
    "materias",
    "acompanhamentos",
    "responsavel_usuario",
    "chat_mensagens",
    "chat_leituras",
    "autorizacoes_temporarias",
  ];
  check(
    "todas as tabelas essenciais existem",
    essenciais.every((t) => tabelas.includes(t)),
    essenciais.filter((t) => !tabelas.includes(t)).join(",")
  );

  const nMaterias = db.prepare("SELECT COUNT(*) AS c FROM materias").get().c;
  check("catálogo materias com 8 disciplinas seedadas", nMaterias === 8, `achou ${nMaterias}`);

  const admin = db
    .prepare("SELECT senha FROM usuarios WHERE email = 'admin@informaluno.com'")
    .get();
  check(
    "admin inicial com senha em hash pbkdf2",
    !!admin && String(admin.senha).startsWith("pbkdf2$")
  );

  const sqlNotas = db
    .prepare("SELECT sql FROM sqlite_master WHERE name = 'notas'")
    .get().sql;
  check(
    "notas com UNIQUE(aluno_id, bimestre, materia)",
    !!sqlNotas && sqlNotas.includes("UNIQUE (aluno_id, bimestre, materia)")
  );

  // Insert de cadastro completo (espelha o POST /api/cadastro com serie)
  try {
    db.exec(
      `INSERT INTO responsaveis (nome, cpf) VALUES ('Resp Fresh', '11122233344');
       INSERT INTO alunos (matricula, nome, serie, responsavel_id, status)
       VALUES ('SRS-FRESH', 'Aluno Fresh', '6º Ano A',
               (SELECT id FROM responsaveis WHERE cpf = '11122233344'), 'PENDENTE_VALIDACAO');`
    );
    check("pré-cadastro com serie grava sem erro", true);
  } catch (e) {
    check("pré-cadastro com serie grava sem erro", false, String(e));
  }

  db.close();
} catch (e) {
  check("schema.sql executa sem erro", false, String(e));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`SCHEMA FRESH: ${falhas === 0 ? "TUDO VERDE" : `${falhas} FAIL`}`);
process.exit(falhas > 0 ? 1 : 0);
