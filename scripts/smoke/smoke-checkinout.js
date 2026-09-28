// Smoke do CHECK-IN/CHECK-OUT — portaria, van, professor e cards da diretoria
// Uso: node smoke-checkinout.js   (backend em 127.0.0.1:8787 no ar)
// Resíduo: registros "Aluno Smoke Checkin" + linha de foto do professor
// são removidos pela auditoria D1 final.
const BASE = "http://127.0.0.1:8787";
const SENHA = "informaluno123";
const ALUNO_ID = 56; // aluno demo (mat 990208)
// Id fora da família do pai de teste — serve para provar que o responsável
// NÃO grava movimento de aluno que não é filho dele.
const ALUNO_FORA_DA_FAMILIA = 999999;
const FOTO_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let falhas = 0;
const check = (nome, ok, det = "") => {
  console.log((ok ? "PASS  " : "FAIL  ") + nome + (det ? "  [" + det + "]" : ""));
  if (!ok) falhas++;
};

const req = async (met, rota, opts = {}) => {
  try {
    const r = await fetch(BASE + rota, {
      method: met,
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: "Bearer " + opts.token } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try {
      data = await r.json();
    } catch {
      data = null;
    }
    return { status: r.status, data };
  } catch (e) {
    return { status: 0, data: { error: String(e) } };
  }
};

const login = async (email, senha = SENHA) => {
  const r = await req("POST", "/api/auth/login", { body: { email, senha } });
  return r.status === 200 && r.data && r.data.token ? r.data : null;
};

const ehMovimento = (m) => m === "CHECKIN" || m === "CHECKOUT";

// Relógio de Brasília (America/Sao_Paulo) no MESMO formato que a API grava em
// data_hora. Serve para provar que o registro não está em UTC: gravado em UTC
// a hora sairia 3h adiantada e este confronto falharia.
const brasilia = () => {
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
  const g = (tipo) => (partes.find((p) => p.type === tipo) || {}).value || "00";
  const hora = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")} ${hora}:${g("minute")}:${g("second")}`;
};

const segundos = (hhmmss) => {
  const [h, m, s] = String(hhmmss || "0:0:0").split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
};

const ehDataHoraBrasilia = (v) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v || "");

const main = async () => {
  // ---------- ADMIN: repoe senhas do elenco (auto-cura) ----------
  // A UI do /admin permite redefinir senha e muda o valor do cast;
  // restauramos antes de testar para o smoke nunca quebrar por isso.
  const admin = await login("admin@informaluno.com", "admin123");
  check("Login ADMIN (guardiao das senhas)", !!admin);
  if (admin) {
    const usuarios = await req("GET", "/api/admin/usuarios", { token: admin.token });
    for (const em of [
      "portaria@informaluno.com",
      "motorista@informaluno.com",
      "professor.rafael@informaluno.com",
      "aluno.pai@informaluno.com",
      "diretor@informaluno.com",
    ]) {
      const u = Array.isArray(usuarios.data)
        ? usuarios.data.find((x) => x.email === em)
        : null;
      if (u) {
        const pr = await req("PATCH", `/api/admin/usuarios/${u.id}/senha`, {
          token: admin.token,
          body: { novaSenha: SENHA },
        });
        if (pr.status !== 200) check(`Senha reposta em ${em}`, false, `HTTP ${pr.status}`);
      } else {
        check(`Usuario do elenco encontrado: ${em}`, false);
      }
    }
  }

  // ---------- LOGINS ----------
  const portaria = await login("portaria@informaluno.com");
  const motorista = await login("motorista@informaluno.com");
  const professor = await login("professor.rafael@informaluno.com");
  const pai = await login("aluno.pai@informaluno.com");
  const diretor = await login("diretor@informaluno.com");
  check("Login PORTARIA", !!portaria);
  check("Login MOTORISTA", !!motorista);
  check("Login PROFESSOR", !!professor);
  check("Login RESPONSAVEL (bloqueio)", !!pai);
  check("Login DIRETOR", !!diretor);
  if (!portaria || !motorista || !professor || !pai || !diretor) {
    console.log("SEM SESSOES - abortando");
    process.exit(falhas);
  }

  // ---------- PROTECOES ----------
  let r = await req("POST", "/api/portaria/registrar-entrada", {
    body: { pessoaId: ALUNO_ID, nome: "X", tipo: "ALUNO", detalhe: "1" },
  });
  check("Portaria sem token -> 401", r.status === 401, `HTTP ${r.status}`);

  r = await req("POST", "/api/portaria/registrar-entrada", {
    token: pai.token,
    body: { pessoaId: ALUNO_FORA_DA_FAMILIA, nome: "X", tipo: "ALUNO", detalhe: "1" },
  });
  check("RESPONSAVEL sem vinculo com o aluno -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await req("POST", "/api/portaria/registrar-entrada", {
    token: pai.token,
    body: { pessoaId: ALUNO_ID, nome: "X", tipo: "PROFESSOR", detalhe: "X" },
  });
  check("RESPONSAVEL nao registra professor -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await req("PATCH", "/api/professor/reconhecimento", {
    token: pai.token,
    body: { foto: FOTO_1PX, materia: "X" },
  });
  check("RESPONSAVEL nao usa rota de professor -> 403", r.status === 403, `HTTP ${r.status}`);

  // ---------- VALIDACOES ----------
  r = await req("POST", "/api/portaria/registrar-entrada", {
    token: portaria.token,
    body: { pessoaId: ALUNO_ID, nome: "X", tipo: "ALUNO" },
  });
  check("Registro incompleto (sem detalhe) -> 400", r.status === 400, `HTTP ${r.status}`);

  r = await req("PATCH", "/api/professor/reconhecimento", {
    token: professor.token,
    body: { materia: "X" },
  });
  check("Foto obrigator -> 400", r.status === 400, `HTTP ${r.status}`);

  r = await req("PATCH", "/api/professor/reconhecimento", {
    token: professor.token,
    body: { foto: FOTO_1PX },
  });
  check("Matéria obrigator -> 400", r.status === 400, `HTTP ${r.status}`);

  // ---------- PORTARIA: ALTERNA CHECKIN -> CHECKOUT ----------
  const registro = {
    pessoaId: ALUNO_ID,
    nome: "Aluno Smoke Checkin",
    tipo: "ALUNO",
    detalhe: "990208",
    metodoValidacao: "BIOMETRIA_FACIAL",
  };
  r = await req("POST", "/api/portaria/registrar-entrada", {
    token: portaria.token,
    body: registro,
  });
  const mov1 = r.data ? r.data.movimento : null;
  check("1º registro da portaria -> 201 com movimento", r.status === 201 && ehMovimento(mov1), `HTTP ${r.status} mov=${mov1}`);
  const dataHora1 = r.data ? r.data.dataHora : null;
  check(
    "Resposta devolve a data/hora gravada (Brasilia)",
    ehDataHoraBrasilia(dataHora1),
    dataHora1 || "sem dataHora"
  );
  check(
    "Data gravada é o DIA corrente de Brasilia",
    !!dataHora1 && dataHora1.slice(0, 10) === brasilia().slice(0, 10),
    `${dataHora1} x ${brasilia()}`
  );

  r = await req("POST", "/api/portaria/registrar-entrada", {
    token: portaria.token,
    body: registro,
  });
  const mov2 = r.data ? r.data.movimento : null;
  // As duas validações acontecem a poucos segundos — bem dentro da janela de
  // 2 minutos do totem. A regra é por contagem do dia (sem janela de tempo):
  // o 2º toque tem que ser check-out, nunca um segundo check-in.
  check(
    "2 validacoes seguidas (dentro de 2 min) alternam checkin -> checkout",
    r.status === 201 && ehMovimento(mov2) && mov2 !== mov1,
    `1=${mov1} 2=${mov2}`
  );
  const dataHora2 = r.data ? r.data.dataHora : null;
  check(
    "2º registro tambem devolve data/hora",
    ehDataHoraBrasilia(dataHora2),
    dataHora2 || "sem dataHora"
  );

  // ---------- RESPONSAVEL: valida o PRÓPRIO FILHO pela portaria ----------
  // O /escolha convida o pai/mãe a "validar a entrada pela portaria"; sem este
  // passe o POST voltava 403 e o check-in do responsável simplesmente não
  // aparecia (nem entrada, nem saída, nem nome no rastreio).
  r = await req("POST", "/api/portaria/registrar-entrada", {
    token: pai.token,
    body: registro,
  });
  check(
    "RESPONSAVEL registra o PRÓPRIO filho -> 201 com movimento",
    r.status === 201 && ehMovimento(r.data ? r.data.movimento : null),
    `HTTP ${r.status} mov=${r.data ? r.data.movimento : "?"}`
  );

  // ---------- VAN: devolve o movimento ----------
  r = await req("POST", "/api/van/registrar", {
    token: motorista.token,
    body: { alunoId: ALUNO_ID },
  });
  check(
    "Van devolve movimento junto da validação facial",
    r.status === 201 && ehMovimento(r.data ? r.data.movimento : null),
    `HTTP ${r.status} mov=${r.data ? r.data.movimento : "?"}`
  );
  const dataHoraVan = r.data ? r.data.dataHora : null;
  check(
    "Van devolve a data/hora gravada (Brasilia)",
    ehDataHoraBrasilia(dataHoraVan),
    dataHoraVan || "sem dataHora"
  );
  check(
    "Mensagem (dia/hora do aviso) bate com o horario gravado",
    !!dataHoraVan &&
      typeof r.data.quando === "string" &&
      r.data.quando.includes(dataHoraVan.slice(11, 16)),
    `${r.data && r.data.quando ? r.data.quando : "?"} x ${dataHoraVan || "?"}`
  );

  // ---------- PROFESSOR: cadastra foto e entra no reconhecimento ----------
  const materiaSmoke = "Matemática Smoke " + Date.now();
  r = await req("PATCH", "/api/professor/reconhecimento", {
    token: professor.token,
    body: { foto: FOTO_1PX, materia: materiaSmoke },
  });
  check("PROFESSOR salva foto -> 200", r.status === 200, `HTTP ${r.status}`);

  r = await req("GET", "/api/professor/reconhecimento", { token: professor.token });
  check(
    "GET devolve foto e matéria salvas",
    r.status === 200 && r.data && r.data.foto === FOTO_1PX && r.data.materia === materiaSmoke
  );

  r = await req("GET", "/api/verificar/candidatos", { token: portaria.token });
  const profCand =
    r.status === 200 &&
    (r.data || []).some(
      (c) => c.eh_professor && c.foto_professor === FOTO_1PX && c.materia === materiaSmoke
    );
  check("Professor aparece nos candidatos faciais", profCand, `HTTP ${r.status}`);

  // ---------- SEGURANCA: a lista de rostos e o CPF nao ficam abertos ----------
  r = await req("GET", "/api/verificar/candidatos");
  check(
    "GET /api/verificar/candidatos SEM token -> 401",
    r.status === 401,
    `HTTP ${r.status}`
  );
  r = await req("GET", "/api/verificar/candidatos", { token: professor.token });
  check(
    "GET /api/verificar/candidatos com perfil de PROFESSOR -> 403",
    r.status === 403,
    `HTTP ${r.status}`
  );
  r = await req("POST", "/api/verificar", { body: { foto: FOTO_1PX } });
  check("POST /api/verificar SEM token -> 401", r.status === 401, `HTTP ${r.status}`);
  r = await req("POST", "/api/cadastro", { body: { nome: "X", matricula: "0" } });
  check("POST /api/cadastro SEM token -> 401", r.status === 401, `HTTP ${r.status}`);
  r = await req("POST", "/api/cadastro", {
    token: professor.token,
    body: { nome: "X", matricula: "0" },
  });
  check(
    "POST /api/cadastro com perfil de PROFESSOR -> 403",
    r.status === 403,
    `HTTP ${r.status}`
  );

  // ---------- DASHBOARD DA DIRETORIA: cards + feed ----------
  r = await req("GET", "/api/diretoria/dashboard", { token: diretor.token });
  const resumo = r.data ? r.data.resumo : null;
  check(
    "Resumo traz os cards de checkout",
    r.status === 200 && resumo && typeof resumo.alunosCheckoutHoje === "number" && typeof resumo.professoresCheckoutHoje === "number",
    `alunosCO=${resumo ? resumo.alunosCheckoutHoje : "?"} profCO=${resumo ? resumo.professoresCheckoutHoje : "?"}`
  );
  check(
    "Card de alunos com checkout >= 1 (a propria smoke fez checkout)",
    !!resumo && resumo.alunosCheckoutHoje >= 1,
    `=${resumo ? resumo.alunosCheckoutHoje : "?"}`
  );
  const temMovimento =
    r.status === 200 &&
    ((r.data && r.data.ultimosRegistros) || []).some((reg) => ehMovimento(reg.movimento));
  check("Feed da diretoria traz movimento por registro", temMovimento);

  // ---------- FIDEDIGNIDADE DA DATA/HORA (Brasília, nunca UTC) ----------
  const feed = (r.data && r.data.ultimosRegistros) || [];
  // O rastreio precisa dizer PASSOU QUEM passou: nome junto do movimento.
  const nomesNoRastreio = feed
    .filter((x) => ehMovimento(x.movimento))
    .map((x) => x.nome)
    .join(",");
  check(
    "Rastreio traz o NOME da pessoa reconhecida",
    feed.some((x) => ehMovimento(x.movimento) && x.nome === "Aluno Smoke Checkin"),
    `nomes=[${nomesNoRastreio}]`
  );
  const horasDoFeed = feed
    .filter((x) => x.nome === "Aluno Smoke Checkin")
    .map((x) => x.hora)
    .join(",");
  check(
    "Feed mostra EXATAMENTE a hora que a API devolveu",
    !!dataHora2 && feed.some((reg) => reg.nome === "Aluno Smoke Checkin" && reg.hora === dataHora2.slice(11)),
    `feed=[${horasDoFeed}] x resposta=${dataHora2 || "?"}`
  );
  const agoraBrt = brasilia();
  check(
    "Hora do feed bate com o relogio de Brasilia (sem +3h de UTC)",
    feed.some(
      (reg) =>
        reg.nome === "Aluno Smoke Checkin" &&
        Math.abs(segundos(reg.hora) - segundos(agoraBrt.slice(11))) <= 180
    ),
    `agora=${agoraBrt.slice(11)} feed=[${horasDoFeed}]`
  );

  console.log(
    `\nSMOKE CHECKIN/CHECKOUT: ${falhas === 0 ? "TUDO VERDE" : "COM FALHAS"} - ${falhas} FAIL`
  );
  process.exit(falhas);
};

main().catch((e) => {
  console.log("ERRO FATAL: " + String(e));
  process.exit(1);
});
