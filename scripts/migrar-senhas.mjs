// ============================================================
// MIGRAÇÃO ONE-TIME: senhas em texto puro → hash PBKDF2
//
// Varre o D1 local (SQLite em .wrangler/state) e regrava como hash
// todo valor de `usuarios.senha` que ainda não esteja no formato
// pbkdf2$... (contas criadas antes da troca para hash).
//
// IMPORTANTE: rode com o `npm run api` PARADO — o arquivo do banco
// fica travado pelo wrangler enquanto o dev está no ar.
//
// Uso: node scripts/migrar-senhas.mjs
// ============================================================

import { DatabaseSync } from "node:sqlite";
import { readdirSync, existsSync } from "node:fs";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirD1 = join(raiz, "inform-aluno-api", ".wrangler", "state", "v3", "d1");

// Mesmos parâmetros de inform-aluno-api/src/senha.ts
const ITERACOES = 100_000;

function hashSenha(senha) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(senha, salt, ITERACOES, 32, "sha256");
  return `pbkdf2$${ITERACOES}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

if (!existsSync(dirD1)) {
  console.error("D1 local não encontrado em:", dirD1);
  process.exit(1);
}

// Procura os arquivos .sqlite do D1 (objetos miniflare em qualquer subpasta)
const candidatos = [];
const fila = [dirD1];
while (fila.length) {
  const atual = fila.pop();
  for (const entrada of readdirSync(atual, { withFileTypes: true })) {
    const caminho = join(atual, entrada.name);
    if (entrada.isDirectory()) fila.push(caminho);
    else if (entrada.name.endsWith(".sqlite")) candidatos.push(caminho);
  }
}

if (!candidatos.length) {
  console.error("Nenhum arquivo .sqlite do D1 encontrado (o dev já rodou alguma vez?).");
  process.exit(1);
}

let totalMigradas = 0;
let totalJaOk = 0;
let bancosComTabela = 0;

for (const arquivo of candidatos) {
  let db;
  try {
    db = new DatabaseSync(arquivo, { readOnly: false });
    const temTabela = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'")
      .get();
    if (!temTabela) {
      db.close();
      continue;
    }
    bancosComTabela += 1;

    const linhas = db
      .prepare("SELECT id, email, senha FROM usuarios")
      .all();

    const atualizar = db.prepare("UPDATE usuarios SET senha = ? WHERE id = ?");
    for (const linha of linhas) {
      const valor = String(linha.senha ?? "");
      if (valor.startsWith("pbkdf2$")) {
        totalJaOk += 1;
        continue;
      }
      atualizar.run(hashSenha(valor), linha.id);
      totalMigradas += 1;
      console.log(`  migrada: ${linha.email} (id ${linha.id})`);
    }
    db.close();
  } catch (e) {
    console.error(`Falha em ${arquivo}:`, String(e));
    if (db) {
      try {
        db.close();
      } catch {
        /* ignora */
      }
    }
    process.exit(1);
  }
}

console.log(
  `\nMIGRAÇÃO DE SENHAS: ${totalMigradas} migrada(s), ${totalJaOk} já em hash, ` +
    `${bancosComTabela} banco(s) com a tabela usuarios.`
);
process.exit(0);
