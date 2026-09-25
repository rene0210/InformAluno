// ============================================================
// AGREGADOR DA SUÍTE DE VERIFICAÇÃO (npm run smoke)
//
// Roda, nesta ordem:
//   1. teste de reprodutibilidade do schema.sql (offline)
//   2. os 5 smokes de runtime (exigem backend em 127.0.0.1:8787)
//
// Sai com código ≠ 0 se qualquer suíte falhar.
// ============================================================

import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "..");

const passos = [
  ["schema fresh (banco novo)", join(raiz, "scripts", "schema-fresh-test.mjs")],
  ["smoke novas features", join(aqui, "smoke-novas-features.js")],
  ["smoke cards clicáveis + notas por matéria", join(aqui, "smoke-cards-notas.js")],
  ["smoke chat (conversas)", join(aqui, "smoke-chat.js")],
  ["smoke check-in/check-out", join(aqui, "smoke-checkinout.js")],
  ["smoke motorista + van", join(aqui, "smoke-motorista-van.js")],
];

let suitesComFalha = 0;
for (const [nome, arquivo] of passos) {
  console.log(`\n================ ${nome} ================`);
  const resultado = spawnSync(process.execPath, [arquivo], { cwd: raiz, stdio: "inherit" });
  if (resultado.status !== 0) {
    suitesComFalha += 1;
    console.log(`>>>> FALHOU: ${nome} (exit ${resultado.status})`);
  }
}

console.log(
  `\nSMOKE GERAL: ${
    suitesComFalha === 0
      ? `TUDO VERDE (${passos.length} suítes)`
      : `${suitesComFalha} SUÍTE(S) COM FALHA de ${passos.length}`
  }`
);
process.exit(suitesComFalha > 0 ? 1 : 0);
