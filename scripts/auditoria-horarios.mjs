/* Auditoria de data/hora de `registros_entrada` — SOMENTE LEITURA.

   Regra do sistema: toda gravação sai em America/Sao_Paulo (UTC-3 fixo,
   Brasil sem horário de verão desde 2019) via `formatarBrasilia()` de
   inform-aluno-api/src/index.ts. Portanto o invariant é simples:

       nenhum registro pode ficar À FRENTE do relógio de Brasília.

   Um registro em UTC aparece +3h no futuro — é exatamente o bug que deixava
   o feed da diretoria mostrando 13:36 quando eram 10:36.

   Limite desta checagem: um registro em UTC só fica "à frente" enquanto ele
   tiver menos de 3h. Por isso o histórico anterior à correção foi ajustado de
   forma única pela migração
   `migrations/historico/aplicadas/d1-hora-brasilia-registros-entrada.sql`;
   daqui para frente esta auditoria (junto do smoke de check-in/out) acusa
   qualquer regressão em minutos.

   Uso: node scripts/auditoria-horarios.mjs   (dev pode estar no ar)
*/
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = "inform-aluno-api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject";
let db = null;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sqlite"))) {
  try {
    const t = new DatabaseSync(join(dir, f), { readOnly: true });
    if (
      t
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='registros_entrada'"
        )
        .get()
    ) {
      db = t;
      break;
    }
    t.close();
  } catch {
    /* banco em uso por outra sessão — tenta o próximo */
  }
}
if (!db) {
  console.log("nenhum banco com registros_entrada encontrado");
  process.exit(1);
}

const linhas = (sql) => db.prepare(sql).all();

/** `YYYY-MM-DD HH:MM:SS` no horário de Brasília (mesmo formato gravado) */
const brasiliaAgora = () => {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t) => partes.find((p) => p.type === t)?.value ?? "00";
  const hora = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")} ${hora}:${g("minute")}:${g("second")}`;
};

const agoraUtc = new Date().toISOString().replace("T", " ").substring(0, 19);
const agoraBrt = brasiliaAgora();

console.log("--- relogios ---");
console.log(`  UTC      : ${agoraUtc}`);
console.log(`  Brasilia : ${agoraBrt}   (e o que o banco deve gravar)`);
console.log(
  `  deslocamento correto: ${Math.round(
    (Date.parse(agoraUtc.replace(" ", "T") + "Z") -
      Date.parse(agoraBrt.replace(" ", "T") + "Z")) /
      60000
  )} min`
);

console.log("\n--- ultimos 10 registros (id | data_hora | quem) ---");
for (const r of linhas(
  "SELECT id, nome, tipo, movimento, data_hora FROM registros_entrada ORDER BY id DESC LIMIT 10"
)) {
  console.log(
    `  ${String(r.id).padStart(3)} | ${r.data_hora} | ${r.tipo}/${
      r.movimento || "-"
    } | ${r.nome}`
  );
}

// Invariante principal: nada à frente do relógio de Brasília.
const folga = 5; // segundos de folga entre o relógio do script e o do workerd
const aFrente = linhas(
  `SELECT id, nome, data_hora FROM registros_entrada
    WHERE data_hora > datetime('${agoraBrt}', '+${folga} seconds')
    ORDER BY id DESC`
);
console.log("\n--- registros A FRENTE do relogio de Brasilia (seria UTC) ---");
if (aFrente.length === 0) {
  console.log("  nenhum  ✓");
} else {
  console.log(`  ${aFrente.length} registro(s):`);
  for (const a of aFrente) console.log(`  ${a.id}  ${a.data_hora}  ${a.nome}`);
}

console.log("\n--- registros criados hoje, agrupados pelo dia gravado ---");
for (const r of linhas(
  `SELECT substr(data_hora,1,10) AS dia, COUNT(*) AS n
     FROM registros_entrada GROUP BY dia ORDER BY dia DESC LIMIT 7`
)) {
  const ehHoje = r.dia === agoraBrt.slice(0, 10);
  console.log(`  ${r.dia}  n=${String(r.n).padStart(3)}${ehHoje ? "  ← hoje" : ""}`);
}

console.log("\n--- resumo por movimento ---");
for (const r of linhas(
  `SELECT COALESCE(movimento,'(sem movimento)') AS mov, COUNT(*) AS n
     FROM registros_entrada GROUP BY mov ORDER BY n DESC`
)) {
  console.log(`  ${r.mov}: ${r.n}`);
}

console.log(
  aFrente.length === 0
    ? "\nAUDITORIA DE HORARIOS: TUDO VERDE"
    : `\nAUDITORIA DE HORARIOS: ${aFrente.length} REGISTRO(S) AINDA EM UTC`
);

db.close();
process.exit(aFrente.length === 0 ? 0 : 1);
