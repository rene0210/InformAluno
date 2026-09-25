// Smoke do CHECK-IN/CHECK-OUT — portaria, van, professor e cards da diretoria
// Uso: node smoke-checkinout.js   (backend em 127.0.0.1:8787 no ar)
// Resíduo: registros "Aluno Smoke Checkin" + linha de foto do professor
// são removidos pela auditoria D1 final.
const BASE = "http://127.0.0.1:8787";
const SENHA = "informaluno123";
const ALUNO_ID = 56; // aluno demo (mat 990208)
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
    body: { pessoaId: ALUNO_ID, nome: "X", tipo: "ALUNO", detalhe: "1" },
  });
  check("RESPONSAVEL nao registra na portaria -> 403", r.status === 403, `HTTP ${r.status}`);

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

  r = await req("POST", "/api/portaria/registrar-entrada", {
    token: portaria.token,
    body: registro,
  });
  const mov2 = r.data ? r.data.movimento : null;
  check(
    "2º registro ALTERNA o movimento",
    r.status === 201 && ehMovimento(mov2) && mov2 !== mov1,
    `1=${mov1} 2=${mov2}`
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

  r = await req("GET", "/api/verificar/candidatos");
  const profCand =
    r.status === 200 &&
    (r.data || []).some(
      (c) => c.eh_professor && c.foto_professor === FOTO_1PX && c.materia === materiaSmoke
    );
  check("Professor aparece nos candidatos faciais", profCand, `HTTP ${r.status}`);

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

  console.log(
    `\nSMOKE CHECKIN/CHECKOUT: ${falhas === 0 ? "TUDO VERDE" : "COM FALHAS"} - ${falhas} FAIL`
  );
  process.exit(falhas);
};

main().catch((e) => {
  console.log("ERRO FATAL: " + String(e));
  process.exit(1);
});
