/* Smoke das 4 features novas - InformAluno
   A) Editar pai/mae pelo card do hub (+ e-mail aos responsaveis)
   B) Dashboard do ALUNO (apenas notas + materias)
   C) Log de acessos + terceiros (admin completo / diretoria 30 dias)
   D) GESTOR com acesso a tela da diretoria
   + finalizacao do elenco de apresentacao (gestor, aluno e aluno demo com notas)

   Dados de teste descartaveis: matricula 990207 / CPFs 991000027xx.
   Elenco de apresentacao (gestor@, aluno@, aluno.pai@) fica permanente. */

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

const registrar = async (nome, email) => {
  const r = await req("POST", "/api/auth/registro", {
    body: { nome, email, senha: SENHA, role: "RESPONSAVEL" },
  });
  return r.status;
};

const main = async () => {
  // ---------- ADMIN ----------
  const admin = await login("admin@informaluno.com", "admin123");
  check("Login do admin master", !!admin);
  if (!admin) {
    console.log("SEM ADMIN - abortando");
    process.exit(1);
  }
  const tokenAdmin = admin.token;

  let usuarios = await req("GET", "/api/admin/usuarios", { token: tokenAdmin });
  const acharUsuario = (email) =>
    Array.isArray(usuarios.data) ? usuarios.data.find((u) => u.email === email) : null;

  // ---------- RESET DE EXECUCOES ANTERIORES (idempotencia) ----------
  const preAlunos = await req("GET", "/api/admin/alunos", { token: tokenAdmin });
  const alunoSujo = (preAlunos.data || []).find((a) => a.matricula === "990207");
  if (alunoSujo) {
    await req("DELETE", `/api/admin/alunos/${alunoSujo.id}`, { token: tokenAdmin });
    console.log("[reset] aluno de teste anterior removido");
  }
  usuarios = await req("GET", "/api/admin/usuarios", { token: tokenAdmin });
  for (const em of ["smoke.pai@informaluno.com", "smoke.intruso@informaluno.com"]) {
    const u = acharUsuario(em);
    if (u) {
      await req("DELETE", `/api/admin/usuarios/${u.id}`, { token: tokenAdmin });
      console.log(`[reset] usuario de teste anterior removido: ${em}`);
    }
  }
  usuarios = await req("GET", "/api/admin/usuarios", { token: tokenAdmin });

  // ---------- ELENCO DE APRESENTACAO (idempotente, permanente) ----------
  const garantirRole = async (email, nome, role) => {
    let u = acharUsuario(email);
    if (!u) {
      const st = await registrar(nome, email);
      usuarios = await req("GET", "/api/admin/usuarios", { token: tokenAdmin });
      u = acharUsuario(email);
      check(`Cria conta de apresentacao ${email} (HTTP ${st})`, !!u);
    }
    if (u && u.role !== role) {
      const r = await req("PATCH", `/api/admin/usuarios/${u.id}/role`, {
        token: tokenAdmin,
        body: { novoRole: role },
      });
      u = { ...u, role };
      check(`Cargo ${role} aplicado em ${email}`, r.status === 200, `HTTP ${r.status}`);
    }
    return u;
  };

  await garantirRole("gestor@informaluno.com", "Gestor Apresentacao", "GESTOR");
  const alunoUser = await garantirRole("aluno@informaluno.com", "Aluno Apresentacao", "ALUNO");
  const paiDemoUser = await garantirRole("aluno.pai@informaluno.com", "Pai do Aluno Demo", "RESPONSAVEL");

  // Repoe senhas do elenco (caso tenham sido redefinidas pela UI do /admin)
  for (const em of [
    "gestor@informaluno.com",
    "aluno@informaluno.com",
    "aluno.pai@informaluno.com",
    "professor.rafael@informaluno.com",
    "secretaria@informaluno.com",
    "diretor@informaluno.com",
  ]) {
    const u = acharUsuario(em);
    if (u) {
      const pr = await req("PATCH", `/api/admin/usuarios/${u.id}/senha`, {
        token: tokenAdmin,
        body: { novaSenha: SENHA },
      });
      if (pr.status !== 200) check(`Senha reposta em ${em}`, false, `HTTP ${pr.status}`);
    }
  }

  const sessaoGestor = await login("gestor@informaluno.com");
  const sessaoAluno = await login("aluno@informaluno.com");
  const sessaoPaiDemo = await login("aluno.pai@informaluno.com");
  check("Login do GESTOR", !!sessaoGestor);
  check("Login do ALUNO", !!sessaoAluno);
  check("Login do pai do aluno demo", !!sessaoPaiDemo);

  // ---------- ALUNO DEMO (matricula 990208) + NOTAS ----------
  let filhosDemo = await req("GET", "/api/cadastro/filhos", {
    token: sessaoPaiDemo ? sessaoPaiDemo.token : "",
  });
  let demo = (filhosDemo.data.filhos || []).find((f) => f.matricula === "990208");
  if (!demo) {
    const r = await req("POST", "/api/cadastro", {
      body: {
        usuario_id: paiDemoUser.id,
        nome: "Aluno Demonstracao InformAluno",
        matricula: "990208",
        responsavelNome: "Pai Demonstracao",
        cpf: "99100002801",
        responsavel2Nome: "Mae Demonstracao",
        cpf2: "99100002802",
        cpfAluno: "99100002803",
        serie: "6º Ano A",
      },
    });
    check(`Cria aluno demonstracao (HTTP ${r.status})`, r.status < 300);
    filhosDemo = await req("GET", "/api/cadastro/filhos", {
      token: sessaoPaiDemo ? sessaoPaiDemo.token : "",
    });
    demo = (filhosDemo.data.filhos || []).find((f) => f.matricula === "990208");
  }
  check("Aluno demonstracao disponivel", !!demo);

  const sessaoProf = await login("professor.rafael@informaluno.com");
  if (sessaoProf && demo) {
    const notas = [8.5, 7, 9, 8];
    let notasOk = true;
    for (let b = 1; b <= 4; b++) {
      const notaR = await req("PUT", "/api/professor/notas", {
        token: sessaoProf.token,
        body: { aluno_id: demo.id, bimestre: b, materia: "Matemática", nota: notas[b - 1] },
      });
      if (notaR.status !== 200) notasOk = false;
    }
    check("Notas 1o-4o bimestre lancadas no aluno demo", notasOk);
  } else {
    check("Notas 1o-4o bimestre lancadas no aluno demo", false, "sem sessao de professor");
  }

  // ============================================================
  // FEATURE A - EDITAR PAI/MAE PELO CARD
  // ============================================================
  console.log("\n--- FEATURE A: editar responsaveis pelo card ---");
  await registrar("Smoke Pai", "smoke.pai@informaluno.com");
  const sessaoPai = await login("smoke.pai@informaluno.com");
  check("Login do pai de teste", !!sessaoPai);

  let filhos = await req("GET", "/api/cadastro/filhos", {
    token: sessaoPai ? sessaoPai.token : "",
  });
  let meuFilho = (filhos.data.filhos || []).find((f) => f.matricula === "990207");
  if (!meuFilho) {
    const r = await req("POST", "/api/cadastro", {
      body: {
        usuario_id: sessaoPai.usuario.id,
        nome: "Aluno Smoke Edit",
        matricula: "990207",
        responsavelNome: "Smoke Pai Edit",
        cpf: "99100002701",
        responsavel2Nome: "Smoke Mae Edit",
        cpf2: "99100002702",
        cpfAluno: "99100002703",
      },
    });
    check(`Criacao do aluno de teste (HTTP ${r.status})`, r.status < 300);
    filhos = await req("GET", "/api/cadastro/filhos", {
      token: sessaoPai ? sessaoPai.token : "",
    });
    meuFilho = (filhos.data.filhos || []).find((f) => f.matricula === "990207");
  }
  check("Hub lista o aluno de teste", !!meuFilho);
  if (!meuFilho) {
    throw new Error("sem aluno de teste - abortando");
  }
  check(
    "Cartao traz ids/telefones/fotos dos pais",
    !!(
      meuFilho.pai_id &&
      meuFilho.mae_id &&
      "pai_telefone" in meuFilho &&
      "mae_telefone" in meuFilho &&
      "pai_foto" in meuFilho
    )
  );
  check("Nome do pai vem no cartao", meuFilho.pai === "Smoke Pai Edit");

  // Secretaria ve TODOS os alunos no hub
  const sessaoSec = await login("secretaria@informaluno.com");
  const filhosSec = await req("GET", "/api/cadastro/filhos", {
    token: sessaoSec ? sessaoSec.token : "",
  });
  const secLista = filhosSec.data.filhos || [];
  check(
    "Secretaria ve todos os alunos no hub",
    secLista.length > (filhos.data.filhos || []).length &&
      secLista.some((f) => f.matricula === "990207"),
    `secretaria=${secLista.length} pai=${(filhos.data.filhos || []).length}`
  );

  const putEdit = (token, body) => req("PUT", "/api/cadastro/responsaveis", { token, body });

  let r = await putEdit(sessaoPai.token, {
    aluno_id: meuFilho.id,
    pai: { id: meuFilho.pai_id, nome: "Smoke Pai Editado", telefone: "11 99999-0001" },
    mae: { id: meuFilho.mae_id, nome: "Smoke Mae Editada", telefone: "" },
  });
  check(
    "PUT edicao pelo pai -> 200 alterado=true (e-mail disparado)",
    r.status === 200 && r.data && r.data.alterado === true,
    JSON.stringify(r.data)
  );

  filhos = await req("GET", "/api/cadastro/filhos", { token: sessaoPai.token });
  meuFilho = (filhos.data.filhos || []).find((f) => f.matricula === "990207");
  check(
    "Edicao persistida (nome + telefone)",
    meuFilho.pai === "Smoke Pai Editado" && meuFilho.pai_telefone === "11 99999-0001"
  );

  r = await putEdit(sessaoPai.token, {
    aluno_id: meuFilho.id,
    pai: { id: meuFilho.pai_id, nome: "Smoke Pai Editado", telefone: "11 99999-0001" },
    mae: { id: meuFilho.mae_id, nome: "Smoke Mae Editada", telefone: "" },
  });
  check(
    "PUT sem mudancas -> alterado=false (sem e-mail)",
    r.status === 200 && r.data && r.data.alterado === false,
    JSON.stringify(r.data)
  );

  r = await putEdit(sessaoPai.token, {
    aluno_id: meuFilho.id,
    pai: { id: meuFilho.pai_id, nome: "   ", telefone: "" },
  });
  check("PUT nome vazio -> 400", r.status === 400, `HTTP ${r.status}`);

  r = await putEdit(sessaoPai.token, {
    aluno_id: 999999,
    pai: { id: meuFilho.pai_id, nome: "X", telefone: "" },
  });
  check("PUT aluno inexistente -> 404", r.status === 404, `HTTP ${r.status}`);

  await registrar("Smoke Intruso", "smoke.intruso@informaluno.com");
  const sessaoIntruso = await login("smoke.intruso@informaluno.com");
  r = await putEdit(sessaoIntruso.token, {
    aluno_id: meuFilho.id,
    pai: { id: meuFilho.pai_id, nome: "Intruso", telefone: "" },
  });
  check("PUT sem vinculo -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await putEdit(sessaoSec.token, {
    aluno_id: meuFilho.id,
    pai: { id: meuFilho.pai_id, nome: "Smoke Pai Editado", telefone: "11 99999-0002" },
  });
  check(
    "PUT pela secretaria -> 200 alterado=true",
    r.status === 200 && r.data && r.data.alterado === true,
    `HTTP ${r.status}`
  );

  // ---------- REMOÇÃO PELO 🗑 DO MODAL "EDITAR RESPONSÁVEL" ----------
  // (idempotente: se a rodada anterior parou no meio, o 2º já pode estar fora)
  if (meuFilho && meuFilho.mae_id) {
    r = await putEdit(sessaoPai.token, {
      aluno_id: meuFilho.id,
      mae: { id: meuFilho.mae_id, remover: true },
    });
    check(
      "PUT remover o 2º responsavel -> 200 alterado=true",
      r.status === 200 && r.data && r.data.alterado === true,
      JSON.stringify(r.data)
    );
  } else {
    check("PUT remover o 2º responsavel -> 200 alterado=true", !!meuFilho, "2º ja removido");
  }

  filhos = await req("GET", "/api/cadastro/filhos", { token: sessaoPai.token });
  meuFilho = (filhos.data.filhos || []).find((f) => f.matricula === "990207");
  check(
    "2º responsavel some do cartao apos remover",
    !!meuFilho && !meuFilho.mae_id && !meuFilho.mae,
    meuFilho ? `mae=${meuFilho.mae} mae_id=${meuFilho.mae_id}` : "sem filho"
  );

  r = await putEdit(sessaoPai.token, {
    aluno_id: meuFilho.id,
    pai: { id: meuFilho.pai_id, remover: true },
  });
  check(
    "PUT remover o ultimo responsavel -> 400",
    r.status === 400 && !!r.data && /manter ao menos/i.test(r.data.error || ""),
    `HTTP ${r.status} ${r.data && r.data.error ? r.data.error : ""}`
  );

  // a remoção recusada não pode ter mexido no cadastro
  filhos = await req("GET", "/api/cadastro/filhos", { token: sessaoPai.token });
  meuFilho = (filhos.data.filhos || []).find((f) => f.matricula === "990207");
  check(
    "Ultimo responsavel continua no cartao",
    !!meuFilho && !!meuFilho.pai_id && meuFilho.pai === "Smoke Pai Editado",
    meuFilho ? `pai=${meuFilho.pai}` : "sem filho"
  );

  // ============================================================
  // FEATURE B - DASHBOARD DO ALUNO
  // ============================================================
  console.log("\n--- FEATURE B: dashboard do ALUNO ---");
  if (sessaoAluno && demo && alunoUser) {
    // comeca sem vinculo
    r = await req("PATCH", `/api/admin/usuarios/${alunoUser.id}/aluno`, {
      token: tokenAdmin,
      body: { aluno_id: null },
    });
    check("Remove vinculo inicial (HTTP 200)", r.status === 200, `HTTP ${r.status}`);

    r = await req("GET", "/api/aluno/dashboard", { token: sessaoAluno.token });
    check(
      "Dashboard sem vinculo -> aluno=null",
      r.status === 200 && r.data && r.data.aluno === null,
      `HTTP ${r.status}`
    );

    r = await req("PATCH", `/api/admin/usuarios/${alunoUser.id}/aluno`, {
      token: tokenAdmin,
      body: { aluno_id: 999999 },
    });
    check("Vincular aluno inexistente -> 404", r.status === 404, `HTTP ${r.status}`);
    r = await req("PATCH", `/api/admin/usuarios/${alunoUser.id}/aluno`, {
      token: tokenAdmin,
      body: { aluno_id: "abc" },
    });
    check("Vincular aluno_id invalido -> 400", r.status === 400, `HTTP ${r.status}`);

    r = await req("PATCH", `/api/admin/usuarios/${alunoUser.id}/aluno`, {
      token: tokenAdmin,
      body: { aluno_id: demo.id },
    });
    check("Vincula conta ALUNO ao aluno demo", r.status === 200, `HTTP ${r.status}`);

    r = await req("GET", "/api/aluno/dashboard", { token: sessaoAluno.token });
    check(
      "Dashboard mostra o proprio aluno",
      r.status === 200 && r.data.aluno && r.data.aluno.id === demo.id,
      r.data && r.data.aluno ? r.data.aluno.nome : "sem aluno"
    );
    const notasDemo = (r.data && r.data.notas) || [];
    const cobertos = [1, 2, 3, 4].filter((b) =>
      notasDemo.some((n) => n.bimestre === b)
    );
    check(
      "Dashboard traz as 4 notas (b1-b4 cobertos)",
      cobertos.length === 4,
      `bimestres=${JSON.stringify(cobertos)} total=${notasDemo.length}`
    );
    check("Dashboard traz a lista de materias", r.data && Array.isArray(r.data.materias));

    r = await req("GET", "/api/aluno/dashboard", { token: sessaoPai.token });
    check("RESPONSAVEL nao acessa /api/aluno/* -> 403", r.status === 403, `HTTP ${r.status}`);

    r = await req("GET", "/api/aluno/dashboard", { token: tokenAdmin });
    check("ADMIN tambem acessa /api/aluno/dashboard -> 200", r.status === 200);
  } else {
    check("Feature B completa", false, "sem sessao/aluno demo");
  }

  // ============================================================
  // FEATURE C - LOG DE ACESSOS + TERCEIROS
  // ============================================================
  console.log("\n--- FEATURE C: log de acessos e terceiros ---");
  r = await req("GET", "/api/admin/log", { token: tokenAdmin });
  check(
    "GET /api/admin/log -> 200 com acessos + terceiros",
    r.status === 200 && Array.isArray(r.data.acessos) && Array.isArray(r.data.terceiros),
    `acessos=${r.data && r.data.acessos ? r.data.acessos.length : 0} terceiros=${r.data && r.data.terceiros ? r.data.terceiros.length : 0}`
  );
  check(
    "Log do admin registra o login do pai de teste",
    (r.data.acessos || []).some((a) => a.usuario_email === "smoke.pai@informaluno.com")
  );

  const sessaoDiretor = await login("diretor@informaluno.com");
  check("Login do DIRETOR de apresentacao", !!sessaoDiretor);
  r = await req("GET", "/api/diretoria/log", {
    token: sessaoDiretor ? sessaoDiretor.token : "",
  });
  check(
    "Diretoria ve o log (janela 30 dias)",
    r.status === 200 && r.data && r.data.janela_dias === 30,
    `HTTP ${r.status}`
  );
  check(
    "Log da diretoria traz acesso recente",
    (r.data.acessos || []).some((a) => a.usuario_email === "smoke.pai@informaluno.com")
  );

  r = await req("GET", "/api/diretoria/log", { token: sessaoPai.token });
  check("RESPONSAVEL nao acessa o log da diretoria -> 403", r.status === 403, `HTTP ${r.status}`);
  r = await req("GET", "/api/admin/log", {
    token: sessaoDiretor ? sessaoDiretor.token : "",
  });
  check("DIRETOR nao acessa o log do admin -> 403", r.status === 403, `HTTP ${r.status}`);
  r = await req("GET", "/api/admin/log", { token: sessaoAluno ? sessaoAluno.token : "" });
  check("ALUNO nao acessa o log do admin -> 403", r.status === 403, `HTTP ${r.status}`);

  // terceiro criado aparece no log
  r = await req("POST", "/api/convite/terceiro", {
    token: sessaoPai.token,
    body: {
      aluno_id: meuFilho.id,
      nome: "Smoke Terceiro Log",
      cpf: "99100002704",
      foto: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ",
    },
  });
  check("Terceiro criado no aluno de teste", r.status >= 200 && r.status < 300, `HTTP ${r.status}`);

  r = await req("GET", "/api/admin/log", { token: tokenAdmin });
  check(
    "Log lista o terceiro criado",
    (r.data.terceiros || []).some(
      (t) => t.aluno_nome === "Aluno Smoke Edit" || t.convidado_nome === "Smoke Terceiro Log"
    )
  );

  // ============================================================
  // FEATURE D (backend) - GESTOR na diretoria
  // ============================================================
  console.log("\n--- FEATURE D: GESTOR na diretoria ---");
  r = await req("GET", "/api/diretoria/dashboard", { token: sessaoGestor.token });
  check("GESTOR acessa /api/diretoria/dashboard -> 200", r.status === 200, `HTTP ${r.status}`);
  r = await req("GET", "/api/diretoria/log", { token: sessaoGestor.token });
  check("GESTOR acessa /api/diretoria/log -> 200", r.status === 200, `HTTP ${r.status}`);
  r = await req("GET", "/api/professor/alunos", { token: sessaoGestor.token });
  check("GESTOR nao acessa rotas de professor -> 403", r.status === 403, `HTTP ${r.status}`);

  // ============================================================
  // FEATURE E - PRE-CADASTRO ACEITA 1 RESPONSAVEL (o outro e opcional)
  // ============================================================
  console.log("\n--- FEATURE E: cadastro com apenas 1 responsavel ---");
  const FOTO_FAKE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ";

  const acharAluno = async (matricula) => {
    const lista = await req("GET", "/api/admin/alunos", { token: tokenAdmin });
    const alunos = Array.isArray(lista.data) ? lista.data : [];
    return alunos.find((a) => a.matricula === matricula) || null;
  };

  // Idempotencia: remove sobras de uma rodada anterior
  for (const mat of ["990215", "990216", "990217", "990218"]) {
    const antigo = await acharAluno(mat);
    if (antigo) {
      await req("DELETE", `/api/admin/alunos/${antigo.id}`, { token: tokenAdmin });
    }
  }

  // (1) Só o 1º responsável -> 201
  let r1 = await req("POST", "/api/cadastro", {
    body: {
      usuario_id: paiDemoUser.id,
      nome: "Aluno Um Responsavel",
      matricula: "990215",
      serie: "7º Ano B",
      cpfAluno: "99100002915",
      responsavelNome: "Resp Unico Smoke",
      cpf: "99100002901",
      fotoResponsavel: FOTO_FAKE,
      fotoAluno: FOTO_FAKE,
    },
  });
  check("Cadastro com apenas 1 responsavel -> 201", r1.status === 201, `HTTP ${r1.status}`);
  const alunoUm = await acharAluno("990215");
  check(
    "1 responsavel ocupa o slot principal",
    !!alunoUm && !!alunoUm.pai_nome && !alunoUm.mae_nome,
    alunoUm ? `pai=${alunoUm.pai_nome} mae=${alunoUm.mae_nome}` : "aluno nao encontrado"
  );

  // (2) Só o 2º responsável (1º removido na tela) -> promovido ao slot 1
  let r2 = await req("POST", "/api/cadastro", {
    body: {
      usuario_id: paiDemoUser.id,
      nome: "Aluno So Segundo Responsavel",
      matricula: "990216",
      serie: "7º Ano B",
      cpfAluno: "99100002916",
      responsavel2Nome: "Resp Promovido Smoke",
      cpf2: "99100002902",
      fotoResponsavel2: FOTO_FAKE,
      fotoAluno: FOTO_FAKE,
    },
  });
  check("Cadastro só com o 2º responsavel -> 201", r2.status === 201, `HTTP ${r2.status}`);
  const alunoDois = await acharAluno("990216");
  check(
    "2º responsavel promovido ao slot principal",
    !!alunoDois && !!alunoDois.pai_nome && !alunoDois.mae_nome,
    alunoDois ? `pai=${alunoDois.pai_nome}` : "aluno nao encontrado"
  );

  // (3) Nenhum responsável -> 400
  const r3 = await req("POST", "/api/cadastro", {
    body: {
      nome: "Aluno Sem Responsavel",
      matricula: "990217",
      serie: "7º Ano B",
      cpfAluno: "99100002917",
    },
  });
  check("Cadastro sem nenhum responsavel -> 400", r3.status === 400, `HTTP ${r3.status}`);
  check(
    "Mensagem cobra ao menos 1 responsavel",
    !!(r3.data && /respons.vel/i.test(r3.data.error || "")),
    r3.data && r3.data.error ? r3.data.error : "sem mensagem"
  );

  // (4) Convite de 3º liberado mesmo com 1 responsável
  if (alunoUm && sessaoPaiDemo) {
    const r4 = await req("POST", "/api/convite/gerar", {
      token: sessaoPaiDemo.token,
      body: { aluno_id: alunoUm.id },
    });
    check(
      "Convite de 3º com aluno de 1 responsavel -> 201",
      r4.status === 201,
      `HTTP ${r4.status}`
    );
  } else {
    check("Convite de 3º com aluno de 1 responsavel -> 201", false, "aluno/sessao ausente");
  }

  // (5) REMOÇÃO DO 1º RESPONSÁVEL COM O 2º PRESENTE -> promoção do 2º
  let r5 = await req("POST", "/api/cadastro", {
    body: {
      usuario_id: paiDemoUser.id,
      nome: "Aluno Dois Responsaveis",
      matricula: "990218",
      serie: "7º Ano B",
      cpfAluno: "99100002918",
      responsavelNome: "Resp Primeiro Smoke",
      cpf: "99100002904",
      responsavel2Nome: "Resp Segundo Smoke",
      cpf2: "99100002905",
      fotoResponsavel: FOTO_FAKE,
      fotoResponsavel2: FOTO_FAKE,
      fotoAluno: FOTO_FAKE,
    },
  });
  check("Cadastro com 2 responsaveis -> 201", r5.status === 201, `HTTP ${r5.status}`);

  let filhosPromo = await req("GET", "/api/cadastro/filhos", {
    token: sessaoPaiDemo ? sessaoPaiDemo.token : "",
  });
  const promo = (filhosPromo.data.filhos || []).find((f) => f.matricula === "990218");
  check(
    "Aluno de 2 responsaveis com os dois slots ocupados",
    !!promo && !!promo.pai_id && !!promo.mae_id,
    promo ? `pai_id=${promo.pai_id} mae_id=${promo.mae_id}` : "aluno nao encontrado"
  );

  if (promo) {
    const idPaiAntigo = promo.pai_id;
    const idMaeAntiga = promo.mae_id;

    r = await putEdit(tokenAdmin, {
      aluno_id: promo.id,
      pai: { id: promo.pai_id, remover: true },
    });
    check(
      "PUT remover o 1º responsavel (2º presente) -> 200 alterado=true",
      r.status === 200 && r.data && r.data.alterado === true,
      JSON.stringify(r.data)
    );
    check(
      "Resposta cita a remocao do responsavel",
      !!(r.data && r.data.alteracoes && /removido/i.test(r.data.alteracoes.join(" | "))),
      r.data && r.data.alteracoes ? r.data.alteracoes.join(" | ") : "sem alteracoes"
    );

    filhosPromo = await req("GET", "/api/cadastro/filhos", {
      token: sessaoPaiDemo ? sessaoPaiDemo.token : "",
    });
    const promoDepois = (filhosPromo.data.filhos || []).find(
      (f) => f.matricula === "990218"
    );
    check(
      "2º promovido ao slot principal apos remover o 1º",
      !!promoDepois &&
        promoDepois.pai_id === idMaeAntiga &&
        !promoDepois.mae_id &&
        promoDepois.pai === "Resp Segundo Smoke",
      promoDepois
        ? `pai_id=${promoDepois.pai_id} (esperado ${idMaeAntiga}) pai=${promoDepois.pai} mae_id=${promoDepois.mae_id}`
        : "aluno sumiu"
    );
    check(
      "Responsavel removido nao deixou rastro no cartao",
      !!promoDepois && promoDepois.pai_id !== idPaiAntigo,
      promoDepois ? `pai_id=${promoDepois.pai_id} antigo=${idPaiAntigo}` : "sem aluno"
    );

    // com um único responsável de novo, a remoção volta a ser recusada
    r = await putEdit(tokenAdmin, {
      aluno_id: promo.id,
      pai: { id: idMaeAntiga, remover: true },
    });
    check(
      "PUT remover o responsavel ja promovido (unico) -> 400",
      r.status === 400 && /manter ao menos/i.test(r.data && r.data.error ? r.data.error : ""),
      `HTTP ${r.status}`
    );

    // O modal continua aberto após a remoção e ainda rotula o bloco
    // restante como "2º" (chave "mae") — a edição não pode sumir em silêncio
    r = await putEdit(tokenAdmin, {
      aluno_id: promo.id,
      mae: { id: idMaeAntiga, nome: "Resp Segundo Editado Depois", telefone: "" },
    });
    check(
      "Edicao vinda com a chave antiga (apos promocao) ainda e aplicada",
      r.status === 200 && r.data && r.data.alterado === true,
      `HTTP ${r.status} ${JSON.stringify(r.data)}`
    );

    const ultimo = await acharAluno("990218");
    check(
      "Edicao pos-promocao persistiu no banco",
      !!ultimo && ultimo.pai_nome === "Resp Segundo Editado Depois",
      ultimo ? `pai_nome=${ultimo.pai_nome}` : "aluno sumiu"
    );
  } else {
    check("PUT remover o 1º responsavel (2º presente) -> 200 alterado=true", false, "sem aluno");
  }

  // ---------- LIMPEZA: dados de teste descartaveis ----------
  console.log("\n--- LIMPEZA ---");
  for (const mat of ["990215", "990216", "990218"]) {
    const extra = await acharAluno(mat);
    if (extra) {
      const dl = await req("DELETE", `/api/admin/alunos/${extra.id}`, { token: tokenAdmin });
      check(`Limpeza: aluno ${mat} removido`, dl.status === 200, `HTTP ${dl.status}`);
    }
  }
  const limpezaAluno = await req("DELETE", `/api/admin/alunos/${meuFilho.id}`, {
    token: tokenAdmin,
  });
  check(
    "Limpeza: aluno de teste removido (convites em cascata)",
    limpezaAluno.status === 200,
    `HTTP ${limpezaAluno.status}`
  );

  usuarios = await req("GET", "/api/admin/usuarios", { token: tokenAdmin });
  for (const em of ["smoke.pai@informaluno.com", "smoke.intruso@informaluno.com"]) {
    const u = acharUsuario(em);
    if (u) {
      const dr = await req("DELETE", `/api/admin/usuarios/${u.id}`, { token: tokenAdmin });
      check(`Limpeza: usuario ${em} removido`, dr.status === 200, `HTTP ${dr.status}`);
    }
  }

  // estado final do elenco: aluno@ vinculado ao aluno demo
  usuarios = await req("GET", "/api/admin/usuarios", { token: tokenAdmin });
  const gestorFinal = acharUsuario("gestor@informaluno.com");
  const alunoFinal = acharUsuario("aluno@informaluno.com");
  check("Elenco: gestor@ com cargo GESTOR", !!gestorFinal && gestorFinal.role === "GESTOR");
  check(
    "Elenco: aluno@ ALUNO vinculado ao aluno demo",
    !!alunoFinal && alunoFinal.role === "ALUNO" && alunoFinal.aluno_id === (demo ? demo.id : -1),
    alunoFinal ? `aluno_id=${alunoFinal.aluno_id}` : "sem usuario"
  );
};

main()
  .then(() => {
    console.log(`\nSMOKE NOVAS FEATURES: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error("ERRO FATAL:", e);
    console.log(`\nSMOKE NOVAS FEATURES: ${pass} PASS / ${fail} FAIL (abortado)`);
    process.exit(1);
  });
