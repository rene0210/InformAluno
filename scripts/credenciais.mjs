// ============================================================
// CREDENCIAIS DE TESTE — nunca versionadas
//
// Vêm de inform-aluno-api/.dev.vars (gitignored, o MESMO arquivo que já
// guarda RESEND_API_KEY e SMTP_PASS) ou das variáveis de ambiente (CI).
//
// Setup de um clone novo:
//   1) copie inform-aluno-api/.dev.vars.example para .dev.vars
//   2) preencha ADMIN_SENHA e ELENCO_SENHA (e o restante das credenciais)
//
// Nada disso vai para o Git: o repositório público não contém senha alguma.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DEV_VARS = path.resolve(DIR, "..", "inform-aluno-api", ".dev.vars");

const ler = (chave) => {
  const env = process.env[chave];
  if (env && env.trim()) return env.trim();

  try {
    for (const linha of fs.readFileSync(DEV_VARS, "utf8").split(/\r?\n/)) {
      const i = linha.indexOf("=");
      if (i > 0 && linha.slice(0, i).trim() === chave) {
        const valor = linha.slice(i + 1).trim();
        if (valor) return valor;
      }
    }
  } catch {
    // arquivo ainda não existe — a mensagem abaixo orienta o setup
  }
  return "";
};

/**
 * Devolve a credencial pedida ou ENCERRA o teste com instruções claras
 * (nada de login falhando com "senha incorreta" e mascarando o motivo).
 */
export const credencial = (chave) => {
  const valor = ler(chave);
  if (!valor) {
    console.error(`\n[credenciais] ${chave} não encontrada.`);
    console.error("  1) copie inform-aluno-api/.dev.vars.example -> inform-aluno-api/.dev.vars");
    console.error(`  2) preencha ${chave} nesse arquivo (local, não vai para o Git)`);
    console.error(`  (ou exporte a variável de ambiente ${chave})\n`);
    process.exit(1);
  }
  return valor;
};
