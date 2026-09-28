/* Smoke: Cards clicaveis da diretoria + Notas por materia (grade escolar)
   - Cadastro com serie (campo unico "6º Ano A") gravado e lido em /api/admin/alunos
   - Dashboard da diretoria: detalhes (nomes por tras de cada card) + contagens
     por PESSOA DISTINTA batendo com o tamanho das listas + serie nos detalhes
   - Grade escolar: catálogo de materias no professor/painel/aluno; PUT de nota
     exige materia existente na grade; notas com materia em todas as telas

   Escrita minima e idempotente: 1 PUT de nota no aluno demo (b3, Matematica, 9 —
   mesmo valor do smoke-novas-features, entao nao briga com ele).
   Limpeza: aluno "Smoke Serie Cards" criado e excluido no proprio script. */

const API = "http://127.0.0.1:8787";
const SENHA = "informaluno123";
let pass = 0;
let fail = 0;

const check = (nome, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`PASS  ${nome}${extra ? "  [" + extra + "]" : ""}`);
  } else {
    fail++;
    console.log(`FAIL  ${nome}${extra ? "  [" + extra + "]" : ""}`);
  }
};

const req = async (method, path, opts = {}) => {
  const { token, body } = opts;
  try {
    const res = await fetch(API + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* corpo nao-json */
    }
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, data: { error: String(e) } };
  }
};

const login = async (email, senha = SENHA) => {
  const r = await req("POST", "/api/auth/login", { body: { email, senha } });
  return r.status === 200 && r.data && r.data.token ? r.data : null;
};

const main = async () => {
  // ---------- ADMIN + HEAL ----------
  const admin = await login("admin@informaluno.com", "admin123");
  check("Login do admin master", !!admin);
  if (!admin) {
    console.log("SEM ADMIN - abortando");
    process.exit(1);
  }
  const tokenAdmin = admin.token;

  const usuarios = await req("GET", "/api/admin/usuarios", { token: tokenAdmin });
  const acharUsuario = (email) =>
    Array.isArray(usuarios.data) ? usuarios.data.find((u) => u.email === email) : null;

  const garantirLogin = async (email) => {
    let sessao = await login(email);
    if (!sessao) {
      const u = acharUsuario(email);
      if (u) {
        await req("PATCH", `/api/admin/usuarios/${u.id}/senha`, {
          token: tokenAdmin,
          body: { novaSenha: SENHA },
        });
        sessao = await login(email);
      }
    }
    return sessao;
  };

  // ============================================================
  // SECAO 1 - SERIE NO PRE-CADASTRO (escrita + leitura + limpeza)
  // ============================================================
  console.log("\n--- SECAO 1: serie no cadastro ---");

  // Reset de execucao anterior (idempotencia)
  let alunosAdmin = await req("GET", "/api/admin/alunos", { token: tokenAdmin });
  const sujo = (alunosAdmin.data || []).find((a) => a.matricula === "SRS-001");
  if (sujo) {
    await req("DELETE", `/api/admin/alunos/${sujo.id}`, { token: tokenAdmin });
    console.log("[reset] aluno SRS-001 anterior removido");
  }

  const rCad = await req("POST", "/api/cadastro", {
    token: tokenAdmin,
    body: {
      usuario_id: null,
      nome: "Smoke Serie Cards",
      matricula: "SRS-001",
      serie: "7º Ano B",
      cpfAluno: "99100007703",
      responsavelNome: "Pai Smoke Serie",
      cpf: "99100007701",
      responsavel2Nome: "Mae Smoke Serie",
      cpf2: "99100007702",
      status: "PENDENTE_VALIDACAO",
    },
  });
  check(`Pre-cadastro com serie criado (HTTP ${rCad.status})`, rCad.status < 300);

  alunosAdmin = await req("GET", "/api/admin/alunos", { token: tokenAdmin });
  const criado = (alunosAdmin.data || []).find((a) => a.matricula === "SRS-001");
  check("Aluno SRS-001 listado no admin", !!criado);
  check(
    "Serie '7º Ano B' gravada no aluno",
    !!criado && criado.serie === "7º Ano B",
    criado ? `serie="${criado.serie}"` : "aluno ausente"
  );

  // ============================================================
  // SECAO 2 - CARDS CLICAVEIS DA DIRETORIA
  // ============================================================
  console.log("\n--- SECAO 2: cards da diretoria ---");

  const diretor = await garantirLogin("diretor@informaluno.com");
  check("Login do diretor (com heal de senha)", !!diretor);

  const rDash = await req("GET", "/api/diretoria/dashboard", {
    token: diretor ? diretor.token : "",
  });
  check(`Dashboard da diretoria -> 200 (HTTP ${rDash.status})`, rDash.status === 200);
  if (rDash.status === 200) {
    const d = rDash.data || {};
    const det = d.detalhes || {};
    check(
      "detalhes com as 4 listas de cards",
      Array.isArray(det.alunosPresentes) &&
        Array.isArray(det.alunosCheckout) &&
        Array.isArray(det.professoresPresentes) &&
        Array.isArray(det.professoresCheckout)
    );

    const r = d.resumo || {};
    check(
      "Card Alunos Presentes: contagem distinta = tamanho da lista",
      r.totalAlunosHoje === (det.alunosPresentes || []).length,
      `resumo=${r.totalAlunosHoje} lista=${(det.alunosPresentes || []).length}`
    );
    check(
      "Card Alunos Check-out: contagem distinta = tamanho da lista",
      r.alunosCheckoutHoje === (det.alunosCheckout || []).length,
      `resumo=${r.alunosCheckoutHoje} lista=${(det.alunosCheckout || []).length}`
    );
    check(
      "Card Professores Presentes: contagem distinta = tamanho da lista",
      r.totalProfessoresHoje === (det.professoresPresentes || []).length,
      `resumo=${r.totalProfessoresHoje} lista=${(det.professoresPresentes || []).length}`
    );
    check(
      "Card Professores Check-out: contagem distinta = tamanho da lista",
      r.professoresCheckoutHoje === (det.professoresCheckout || []).length,
      `resumo=${r.professoresCheckoutHoje} lista=${(det.professoresCheckout || []).length}`
    );

    check(
      "Detalhe dos alunos traz serie (agrupamento por turma)",
      (det.alunosPresentes || []).every(
        (a) => typeof a.nome === "string" && typeof a.serie === "string" && typeof a.hora === "string"
      )
    );
    check(
      "Detalhe dos professores traz materia e hora",
      (det.professoresPresentes || []).every(
        (p) => typeof p.nome === "string" && typeof p.hora === "string"
      )
    );

    check("Tabela 'por Serie/Turma' e lista", Array.isArray(d.alunosPorSerie));
    if ((r.totalAlunosHoje || 0) > 0) {
      check(
        "Presentes > 0 => tabela por serie com agrupamento",
        Array.isArray(d.alunosPorSerie) &&
          d.alunosPorSerie.length >= 1 &&
          d.alunosPorSerie.every((i) => typeof i.serie === "string" && i.quantidade >= 1),
        JSON.stringify(d.alunosPorSerie)
      );
    }
  }

  // ============================================================
  // SECAO 3 - GRADE ESCOLAR (materias + notas por materia)
  // ============================================================
  console.log("\n--- SECAO 3: grade escolar de notas ---");

  // Aluno demo (matricula 990208) para o PUT idempotente
  const demo = (alunosAdmin.data || []).find((a) => a.matricula === "990208");

  const prof = await garantirLogin("professor.rafael@informaluno.com");
  check("Login do professor", !!prof);

  const rProfAlunos = await req("GET", "/api/professor/alunos", {
    token: prof ? prof.token : "",
  });
  check(`Professor/alunos -> 200 (HTTP ${rProfAlunos.status})`, rProfAlunos.status === 200);
  if (rProfAlunos.status === 200) {
    const grade = rProfAlunos.data.materias || [];
    check(`Grade escolar no professor (>= 8 materias: ${grade.length})`, grade.length >= 8);
    check("Grade contem 'Matemática'", grade.includes("Matemática"));
    const lista = rProfAlunos.data.alunos || [];
    check(
      "Notas do professor trazem materia",
      lista.every((a) => Array.isArray(a.notas) && a.notas.every((n) => typeof n.materia === "string"))
    );
  }

  if (demo && prof) {
    const rNota = await req("PUT", "/api/professor/notas", {
      token: prof.token,
      body: { aluno_id: demo.id, bimestre: 3, materia: "Matemática", nota: 9 },
    });
    check(`PUT nota com materia -> 200 (HTTP ${rNota.status})`, rNota.status === 200);

    const rSemMateria = await req("PUT", "/api/professor/notas", {
      token: prof.token,
      body: { aluno_id: demo.id, bimestre: 3, nota: 8 },
    });
    check(
      "PUT nota SEM materia -> 400",
      rSemMateria.status === 400,
      `HTTP ${rSemMateria.status}`
    );

    const rForaGrade = await req("PUT", "/api/professor/notas", {
      token: prof.token,
      body: { aluno_id: demo.id, bimestre: 3, materia: "Danza Moderna", nota: 8 },
    });
    check(
      "PUT nota com materia FORA da grade -> 400",
      rForaGrade.status === 400,
      `HTTP ${rForaGrade.status}`
    );
  } else {
    check("PUT nota com materia -> 200", false, "sem aluno demo ou professor");
  }

  // Painel do responsavel: grade inteira + notas com materia
  const pai = await garantirLogin("aluno.pai@informaluno.com");
  check("Login do responsavel", !!pai);
  const rPai = await req("GET", "/api/painel/alunos", { token: pai ? pai.token : "" });
  check(`Painel/alunos -> 200 (HTTP ${rPai.status})`, rPai.status === 200);
  if (rPai.status === 200) {
    const grade = rPai.data.materias || [];
    check(`Grade escolar no painel do pai (>= 8: ${grade.length})`, grade.length >= 8);
    const filhos = rPai.data.alunos || [];
    check("Pai enxerga ao menos 1 filho", filhos.length >= 1);
    check(
      "Notas dos filhos trazem materia",
      filhos.every((f) => Array.isArray(f.notas) && f.notas.every((n) => typeof n.materia === "string"))
    );
    const demoFilho = filhos.find((f) => f.matricula === "990208");
    check(
      "Filho demo com notas de bimestre disponiveis",
      !!demoFilho && demoFilho.notas.length >= 1,
      demoFilho ? `${demoFilho.notas.length} notas` : "filho demo ausente"
    );
  }

  // Dashboard do aluno: notas com materia
  const aluno = await garantirLogin("aluno@informaluno.com");
  check("Login do aluno", !!aluno);
  const rAluno = await req("GET", "/api/aluno/dashboard", { token: aluno ? aluno.token : "" });
  check(`Aluno/dashboard -> 200 (HTTP ${rAluno.status})`, rAluno.status === 200);
  if (rAluno.status === 200) {
    check(
      "Notas do aluno trazem materia",
      (rAluno.data.notas || []).every((n) => typeof n.materia === "string")
    );
    check("Aluno recebe a lista de materias", Array.isArray(rAluno.data.materias));
  }

  // ---------- LIMPEZA ----------
  if (criado) {
    await req("DELETE", `/api/admin/alunos/${criado.id}`, { token: tokenAdmin });
    const depois = await req("GET", "/api/admin/alunos", { token: tokenAdmin });
    check(
      "Aluno SRS-001 removido apos o teste",
      !(depois.data || []).some((a) => a.matricula === "SRS-001")
    );
  }

  console.log(`\nTOTAL: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
};

main().catch((e) => {
  console.error("Erro fatal no smoke:", e);
  process.exit(1);
});
