// Smoke das CONVERSAS INDIVIDUAIS do chat — fio por aluno (família × professor),
// canal Diretoria, CORRESPONDÊNCIA (responsável × secretaria/coordenador/
// diretoria/gestor), listas por perfil e bolinhas de não lidas.
// Uso: node smoke-chat.js   (backend em 127.0.0.1:8787 no ar)
// Resíduo: mensagens com prefixo "Smoke chat:" são removidas pela auditoria D1 final.
const BASE = "http://127.0.0.1:8787";
const SENHA = "informaluno123";
const ALUNO_DEMO = 56; // filho do aluno.pai (mat 990208)
const ALUNO_NAO_FILHO = 1; // não é filho de aluno.pai

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
    if (process.env.DEBUG_404 && r.status >= 400) {
      console.log(
        `DEBUG ${met} ${BASE + rota} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`
      );
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

const q = (fio, desde = 0) =>
  `?conversa=${fio.conversa}` +
  `&professor_id=${fio.professor_id}&aluno_id=${fio.aluno_id}` +
  `&destino=${encodeURIComponent(fio.destino || "")}` +
  (desde > 0 ? `&desde=${desde}` : "");

const linhaFio = (lista, fio) =>
  (Array.isArray(lista) ? lista : []).find(
    (c) =>
      c.conversa === fio.conversa &&
      c.professor_id === fio.professor_id &&
      c.aluno_id === fio.aluno_id &&
      (c.destino || "") === (fio.destino || "")
  );

const main = async () => {
  // ---------- ADMIN: repoe senhas do elenco (auto-cura) ----------
  const admin = await login("admin@informaluno.com", "admin123");
  check("Login ADMIN (guardiao das senhas)", !!admin);
  if (admin) {
    const usuarios = await req("GET", "/api/admin/usuarios", { token: admin.token });
    for (const em of [
      "professor.rafael@informaluno.com",
      "professor.aline@informaluno.com",
      "diretor@informaluno.com",
      "coordenador@informaluno.com",
      "secretaria@informaluno.com",
      "aluno.pai@informaluno.com",
      "aluno@informaluno.com",
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
  const rafael = await login("professor.rafael@informaluno.com");
  const aline = await login("professor.aline@informaluno.com");
  const diretor = await login("diretor@informaluno.com");
  const coordenador = await login("coordenador@informaluno.com");
  const secretaria = await login("secretaria@informaluno.com");
  const pai = await login("aluno.pai@informaluno.com");
  const aluno = await login("aluno@informaluno.com");
  check("Login PROFESSOR (rafael)", !!rafael);
  check("Login PROFESSOR (aline)", !!aline);
  check("Login DIRETOR", !!diretor);
  check("Login COORDENADOR", !!coordenador);
  check("Login SECRETARIA", !!secretaria);
  check("Login RESPONSAVEL (pai)", !!pai);
  check("Login ALUNO", !!aluno);
  if (!rafael || !aline || !diretor || !coordenador || !secretaria || !pai || !aluno) {
    console.log("SEM SESSOES - abortando");
    process.exit(falhas);
  }

  // ---------- PROTECOES ----------
  let r = await req("GET", "/api/chat/conversas");
  check("Conversas sem token -> 401", r.status === 401, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/mensagens?conversa=DIRETORIA&professor_id=1&aluno_id=0");
  check("Mensagens sem token -> 401", r.status === 401, `HTTP ${r.status}`);

  r = await req("POST", "/api/chat/mensagens", { body: { texto: "x" } });
  check("POST sem token -> 401", r.status === 401, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/conversas", { token: secretaria.token });
  check("SECRETARIA acessa o chat", r.status === 200, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/conversas", { token: aluno.token });
  check("ALUNO nao usa o chat -> 403", r.status === 403, `HTTP ${r.status}`);

  // ---------- LISTAS POR PERFIL ----------
  r = await req("GET", "/api/chat/conversas", { token: rafael.token });
  const rafaelId = r.status === 200 && r.data ? r.data.eu : 0;
  const listaRafael = r.data && r.data.conversas ? r.data.conversas : [];
  check("Lista do PROFESSOR carrega (campo eu)", r.status === 200 && !!rafaelId, `HTTP ${r.status}`);
  check(
    "Lista do PROFESSOR tem o contato Diretoria",
    listaRafael.some((c) => c.conversa === "DIRETORIA" && c.contatoTipo === "DIRETORIA")
  );
  check(
    "Lista do PROFESSOR tem os alunos (conversa com a familia)",
    listaRafael.some((c) => c.conversa === "FAMILIA" && c.contatoTipo === "ALUNO"),
    `linhas=${listaRafael.length}`
  );

  r = await req("GET", "/api/chat/conversas", { token: pai.token });
  const paiId = r.status === 200 && r.data ? r.data.eu : 0;
  const listaPai = r.data && r.data.conversas ? r.data.conversas : [];
  check("Lista do RESPONSAVEL carrega", r.status === 200 && !!paiId, `HTTP ${r.status}`);
  const linhasProfPai = listaPai.filter((c) => c.contatoTipo === "PROFESSOR");
  check(
    "Lista do RESPONSAVEL traz 1 barra por professor (filho no subtitulo)",
    linhasProfPai.length >= 3 && linhasProfPai.every((c) => c.contatoSubtitulo),
    `linhas=${linhasProfPai.length}`
  );
  const canaisPai = listaPai.filter((c) => c.contatoTipo === "EQUIPE");
  check(
    "RESPONSAVEL tem os 4 canais diretos da escola",
    canaisPai.length === 4 &&
      ["Secretaria", "Coordenador", "Diretoria", "Gestor"].every((n) =>
        canaisPai.some((c) => c.contatoNome === n && c.conversa === "CORRESPONDENCIA")
      ),
    `canais=${canaisPai.map((c) => c.contatoNome).join("|")}`
  );

  r = await req("GET", "/api/chat/conversas", { token: diretor.token });
  const listaDiretor = r.data && r.data.conversas ? r.data.conversas : [];
  const linhasProfDir = listaDiretor.filter((c) => c.contatoTipo === "PROFESSOR");
  check(
    "Lista da DIRETORIA tem um fio por professor",
    r.status === 200 &&
      linhasProfDir.length >= 2 &&
      linhasProfDir.every((c) => c.conversa === "DIRETORIA"),
    `linhas=${listaDiretor.length}`
  );
  check(
    "Fio do rafael aparece na lista da diretoria",
    linhasProfDir.some((c) => c.professor_id === rafaelId)
  );
  check(
    "Lista da DIRETORIA traz os responsaveis (correspondencia)",
    listaDiretor.some((c) => c.contatoTipo === "RESPONSAVEL" && c.destino === "DIRETOR"),
    `linhas=${listaDiretor.length}`
  );

  r = await req("GET", "/api/chat/conversas", { token: coordenador.token });
  check("COORDENADOR (equipe) tambem lista as conversas", r.status === 200, `HTTP ${r.status}`);

  // ---------- FLUXO FAMILIA: professor -> familia ----------
  const fioFamilia = {
    conversa: "FAMILIA",
    professor_id: rafaelId,
    aluno_id: ALUNO_DEMO,
    destino: "",
  };
  r = await req("POST", "/api/chat/mensagens", {
    token: rafael.token,
    body: { ...fioFamilia, texto: "Smoke chat: professor cumprimenta a familia" },
  });
  check("Professor envia para a familia do aluno -> 201", r.status === 201, `HTTP ${r.status}`);
  check(
    "Resposta devolve o fio e o autor",
    !!r.data &&
      !!r.data.mensagem &&
      r.data.mensagem.conversa === "FAMILIA" &&
      r.data.mensagem.professor_id === rafaelId &&
      r.data.mensagem.aluno_id === ALUNO_DEMO &&
      r.data.mensagem.destino === "" &&
      !!r.data.mensagem.autor_nome
  );

  r = await req("GET", "/api/chat/conversas", { token: pai.token });
  const linhaPai = linhaFio(r.data && r.data.conversas, fioFamilia);
  check(
    "Bolinha de nao-lidas na barra do professor (para o pai)",
    !!linhaPai && linhaPai.naoLidas >= 1,
    linhaPai ? `naoLidas=${linhaPai.naoLidas}` : "linha ausente"
  );

  r = await req("GET", "/api/chat/mensagens" + q(fioFamilia), { token: pai.token });
  check(
    "Pai le a conversa (historico + campo eu)",
    r.status === 200 &&
      Array.isArray(r.data.mensagens) &&
      r.data.mensagens.length >= 1 &&
      r.data.eu === paiId,
    `HTTP ${r.status} n=${r.data && r.data.mensagens ? r.data.mensagens.length : 0}`
  );
  const ids = r.data && r.data.mensagens ? r.data.mensagens.map((m) => m.id) : [];
  check(
    "Historico em ordem cronologica",
    ids.length > 0 && ids.every((v, i) => i === 0 || ids[i - 1] < v)
  );

  r = await req("GET", "/api/chat/conversas", { token: pai.token });
  const linhaPaiApos = linhaFio(r.data && r.data.conversas, fioFamilia);
  check(
    "Bolinha zera quando o pai abre a conversa (marcada como lida)",
    !!linhaPaiApos && linhaPaiApos.naoLidas === 0,
    linhaPaiApos ? `naoLidas=${linhaPaiApos.naoLidas}` : "linha ausente"
  );

  r = await req("POST", "/api/chat/mensagens", {
    token: pai.token,
    body: { ...fioFamilia, texto: "Smoke chat: familia responde" },
  });
  check("Pai responde no mesmo fio -> 201", r.status === 201, `HTTP ${r.status}`);
  const msgPaiId = r.data && r.data.mensagem ? r.data.mensagem.id : 0;

  r = await req("GET", "/api/chat/conversas", { token: rafael.token });
  const linhaRafael = linhaFio(r.data && r.data.conversas, fioFamilia);
  check(
    "Bolinha de nao-lidas na barra do aluno (para o professor)",
    !!linhaRafael && linhaRafael.naoLidas >= 1,
    linhaRafael ? `naoLidas=${linhaRafael.naoLidas}` : "linha ausente"
  );

  r = await req("POST", "/api/chat/mensagens", {
    token: pai.token,
    body: { ...fioFamilia, texto: "Smoke chat: mensagem nova para o polling" },
  });
  const msgNovaId = r.data && r.data.mensagem ? r.data.mensagem.id : 0;
  r = await req("GET", "/api/chat/mensagens" + q(fioFamilia, msgPaiId), {
    token: rafael.token,
  });
  check(
    "?desde devolve so as mensagens posteriores",
    r.status === 200 &&
      Array.isArray(r.data.mensagens) &&
      r.data.mensagens.length === 1 &&
      r.data.mensagens[0].id === msgNovaId,
    `n=${r.data && r.data.mensagens ? r.data.mensagens.length : 0}`
  );

  // ---------- FLUXO DIRETORIA: professor x equipe ----------
  const fioDir = { conversa: "DIRETORIA", professor_id: rafaelId, aluno_id: 0, destino: "" };
  r = await req("POST", "/api/chat/mensagens", {
    token: rafael.token,
    body: { ...fioDir, texto: "Smoke chat: duvida de infraestrutura" },
  });
  check("Professor envia no fio da Diretoria -> 201", r.status === 201, `HTTP ${r.status}`);
  const msgDirProfId = r.data && r.data.mensagem ? r.data.mensagem.id : 0;

  r = await req("GET", "/api/chat/conversas", { token: diretor.token });
  const linhaDirDiretor = linhaFio(r.data && r.data.conversas, fioDir);
  check(
    "Bolinha na barra do professor (para a diretoria)",
    !!linhaDirDiretor && linhaDirDiretor.naoLidas >= 1,
    linhaDirDiretor ? `naoLidas=${linhaDirDiretor.naoLidas}` : "linha ausente"
  );

  r = await req("GET", "/api/chat/mensagens" + q(fioDir), { token: diretor.token });
  check(
    "Diretor le o fio do professor",
    r.status === 200 &&
      Array.isArray(r.data.mensagens) &&
      r.data.mensagens.some((m) => m.id === msgDirProfId),
    `HTTP ${r.status}`
  );

  r = await req("POST", "/api/chat/mensagens", {
    token: diretor.token,
    body: { ...fioDir, texto: "Smoke chat: diretoria responde" },
  });
  check("Diretor responde no fio do professor -> 201", r.status === 201, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/conversas", { token: rafael.token });
  const linhaDirRafael = linhaFio(r.data && r.data.conversas, fioDir);
  check(
    "Bolinha no contato Diretoria (para o professor)",
    !!linhaDirRafael && linhaDirRafael.naoLidas >= 1,
    linhaDirRafael ? `naoLidas=${linhaDirRafael.naoLidas}` : "linha ausente"
  );

  // ---------- FLUXO CORRESPONDENCIA: responsavel x equipe da escola ----------
  const fioSec = {
    conversa: "CORRESPONDENCIA",
    professor_id: paiId,
    aluno_id: 0,
    destino: "SECRETARIA",
  };
  r = await req("POST", "/api/chat/mensagens", {
    token: pai.token,
    body: { ...fioSec, texto: "Smoke chat: pai fala direto com a secretaria" },
  });
  check("Pai envia direto para a SECRETARIA -> 201", r.status === 201, `HTTP ${r.status}`);
  const msgSecId = r.data && r.data.mensagem ? r.data.mensagem.id : 0;
  check(
    "Mensagem carrega o destino da correspondencia",
    !!r.data && !!r.data.mensagem && r.data.mensagem.destino === "SECRETARIA",
    r.data && r.data.mensagem ? `destino=${r.data.mensagem.destino}` : "sem mensagem"
  );

  r = await req("GET", "/api/chat/conversas", { token: secretaria.token });
  const secretariaId = r.status === 200 && r.data ? r.data.eu : 0;
  const listaSec = r.data && r.data.conversas ? r.data.conversas : [];
  check(
    "Lista da secretaria traz so responsaveis (CORRESPONDENCIA)",
    r.status === 200 &&
      listaSec.length > 0 &&
      listaSec.every((c) => c.contatoTipo === "RESPONSAVEL" && c.conversa === "CORRESPONDENCIA"),
    `linhas=${listaSec.length}`
  );
  const linhaSec = linhaFio(listaSec, fioSec);
  check(
    "Secretaria ve a barra do responsavel com bolinha",
    !!linhaSec && linhaSec.naoLidas >= 1 && linhaSec.contatoTipo === "RESPONSAVEL",
    linhaSec ? `naoLidas=${linhaSec.naoLidas}` : "linha ausente"
  );

  r = await req("GET", "/api/chat/mensagens" + q(fioSec), { token: secretaria.token });
  check(
    "Secretaria le a correspondencia (campo eu)",
    r.status === 200 &&
      Array.isArray(r.data.mensagens) &&
      r.data.mensagens.some((m) => m.id === msgSecId) &&
      r.data.eu === secretariaId,
    `HTTP ${r.status}`
  );

  r = await req("POST", "/api/chat/mensagens", {
    token: secretaria.token,
    body: { ...fioSec, texto: "Smoke chat: secretaria responde o pai" },
  });
  check("Secretaria responde no mesmo fio -> 201", r.status === 201, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/conversas", { token: pai.token });
  const linhaSecPai = linhaFio(r.data && r.data.conversas, fioSec);
  check(
    "Bolinha de volta para o pai no canal Secretaria",
    !!linhaSecPai && linhaSecPai.naoLidas >= 1,
    linhaSecPai ? `naoLidas=${linhaSecPai.naoLidas}` : "linha ausente"
  );

  const fioDirPai = {
    conversa: "CORRESPONDENCIA",
    professor_id: paiId,
    aluno_id: 0,
    destino: "DIRETOR",
  };
  r = await req("POST", "/api/chat/mensagens", {
    token: pai.token,
    body: { ...fioDirPai, texto: "Smoke chat: pai fala com a diretoria" },
  });
  check("Pai envia direto para a DIRETORIA -> 201", r.status === 201, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/conversas", { token: diretor.token });
  const linhaDirPai = linhaFio(r.data && r.data.conversas, fioDirPai);
  check(
    "Diretor ve a barra do responsavel com bolinha",
    !!linhaDirPai && linhaDirPai.naoLidas >= 1 && linhaDirPai.contatoTipo === "RESPONSAVEL",
    linhaDirPai ? `naoLidas=${linhaDirPai.naoLidas}` : "linha ausente"
  );

  r = await req("GET", "/api/chat/conversas", { token: coordenador.token });
  const listaCoord = r.data && r.data.conversas ? r.data.conversas : [];
  check(
    "Lista do COORDENADOR tem professores + responsaveis (destino COORDENADOR)",
    r.status === 200 &&
      listaCoord.some((c) => c.contatoTipo === "PROFESSOR") &&
      listaCoord.some((c) => c.contatoTipo === "RESPONSAVEL" && c.destino === "COORDENADOR"),
    `linhas=${listaCoord.length}`
  );

  // ---------- ISOLAMENTO (403) ----------
  r = await req("GET", "/api/chat/mensagens" + q(fioFamilia), { token: aline.token });
  check("Outro professor nao le o fio da familia -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await req("POST", "/api/chat/mensagens", {
    token: aline.token,
    body: { ...fioFamilia, texto: "Smoke chat: intruso" },
  });
  check("Outro professor nao escreve no fio da familia -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await req("POST", "/api/chat/mensagens", {
    token: aline.token,
    body: { ...fioDir, texto: "Smoke chat: fio de terceiro" },
  });
  check("Professor nao usa o fio da Diretoria de outro -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/mensagens" + q(fioDir), { token: pai.token });
  check("Pai nao entra no canal da Diretoria (professor x equipe) -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/mensagens" + q(fioSec), { token: coordenador.token });
  check("Coordenador nao le o canal da Secretaria -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/mensagens" + q(fioSec), { token: aline.token });
  check("Professor nao le correspondencia -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/mensagens" + q(fioDirPai), { token: secretaria.token });
  check("Secretaria nao le o canal da Diretoria -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/mensagens" + q(fioDir), { token: secretaria.token });
  check("Secretaria nao entra no canal professor x Diretoria -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await req(
    "GET",
    "/api/chat/mensagens" +
      q({ conversa: "CORRESPONDENCIA", professor_id: 999999, aluno_id: 0, destino: "SECRETARIA" }),
    { token: pai.token }
  );
  check("Pai nao le correspondencia de outro responsavel -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/mensagens" + q({ ...fioFamilia, aluno_id: ALUNO_NAO_FILHO }), {
    token: pai.token,
  });
  check("Pai nao le fio de aluno que nao e filho -> 403", r.status === 403, `HTTP ${r.status}`);

  // ---------- VALIDACOES ----------
  r = await req("POST", "/api/chat/mensagens", {
    token: rafael.token,
    body: { ...fioFamilia, texto: "   " },
  });
  check("Mensagem vazia -> 400", r.status === 400, `HTTP ${r.status}`);

  r = await req("POST", "/api/chat/mensagens", {
    token: rafael.token,
    body: { ...fioFamilia, texto: "x".repeat(1001) },
  });
  check("Mensagem de 1001 caracteres -> 400", r.status === 400, `HTTP ${r.status}`);

  r = await req("POST", "/api/chat/mensagens", {
    token: rafael.token,
    body: { conversa: "XYZ", professor_id: rafaelId, aluno_id: 0, texto: "oi" },
  });
  check("Conversa desconhecida no POST -> 400", r.status === 400, `HTTP ${r.status}`);

  r = await req("GET", "/api/chat/mensagens", { token: rafael.token });
  check("GET mensagens sem o fio (sem params) -> 400", r.status === 400, `HTTP ${r.status}`);

  r = await req("POST", "/api/chat/mensagens", {
    token: pai.token,
    body: {
      conversa: "CORRESPONDENCIA",
      professor_id: paiId,
      aluno_id: 0,
      destino: "ADMIN",
      texto: "oi",
    },
  });
  check("Destino desconhecido na correspondencia -> 400", r.status === 400, `HTTP ${r.status}`);

  r = await req(
    "GET",
    "/api/chat/mensagens?conversa=CORRESPONDENCIA&professor_id=1&aluno_id=0",
    { token: pai.token }
  );
  check("CORRESPONDENCIA sem destino no GET -> 400", r.status === 400, `HTTP ${r.status}`);

  console.log("");
  console.log(falhas === 0 ? "SMOKE CHAT: TUDO VERDE" : `SMOKE CHAT: ${falhas} FALHA(S)`);
  process.exit(falhas);
};

main();
