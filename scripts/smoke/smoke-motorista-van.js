/* Smoke do cargo MOTORISTA + van - InformAluno
   - Registro publico com role MOTORISTA
   - POST /api/van/registrar: 401/403/400/404 + 201 com dia/hora
   - Registro gravado em registros_entrada (tipo VAN) e visivel na diretoria
   - Aviso (e-mail) para pai + secretaria + coordenador */

import { credencial } from "../credenciais.mjs";

const API = process.env.API_URL || "http://127.0.0.1:8787";
const SENHA = credencial("ELENCO_SENHA");
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
  const admin = await login("admin@informaluno.com", credencial("ADMIN_SENHA"));
  check("Login do admin master", !!admin);
  if (!admin) process.exit(1);
  const tokenAdmin = admin.token;

  // ---------- 1. Conta motorista (registro publico com role MOTORISTA) ----------
  let usuarios = await req("GET", "/api/admin/usuarios", { token: tokenAdmin });
  let motorista = (usuarios.data || []).find((u) => u.email === "motorista@informaluno.com");
  if (!motorista) {
    const r = await req("POST", "/api/auth/registro", {
      body: {
        nome: "Motorista Apresentacao",
        email: "motorista@informaluno.com",
        senha: SENHA,
        role: "MOTORISTA",
      },
    });
    check("Registro publico aceita role MOTORISTA", r.status === 201, `HTTP ${r.status}`);
    if (r.data && r.data.usuario) {
      check("Registro nasce com cargo MOTORISTA", r.data.usuario.role === "MOTORISTA", r.data.usuario.role);
    }
    usuarios = await req("GET", "/api/admin/usuarios", { token: tokenAdmin });
    motorista = (usuarios.data || []).find((u) => u.email === "motorista@informaluno.com");
  }
  check("Conta motorista@ existe", !!motorista);
  if (motorista) check("Cargo da conta = MOTORISTA", motorista.role === "MOTORISTA", motorista.role);

  // ---------- 1b. Repoe senhas do elenco (caso tenham sido redefinidas pela UI do /admin) ----------
  for (const em of [
    "motorista@informaluno.com",
    "portaria@informaluno.com",
    "aluno.pai@informaluno.com",
    "diretor@informaluno.com",
  ]) {
    const u = (usuarios.data || []).find((x) => x.email === em);
    if (u) {
      const pr = await req("PATCH", `/api/admin/usuarios/${u.id}/senha`, {
        token: tokenAdmin,
        body: { novaSenha: SENHA },
      });
      if (pr.status !== 200) check(`Senha reposta em ${em}`, false, `HTTP ${pr.status}`);
    }
  }

  // ---------- 2. Aluno demo (destino do embarque) ----------
  const alunos = await req("GET", "/api/admin/alunos", { token: tokenAdmin });
  const demo = (alunos.data || []).find((a) => a.matricula === "990208");
  check("Aluno demonstracao disponivel", !!demo);
  if (!demo) {
    console.log("SEM ALUNO DEMO - abortando");
    process.exit(1);
  }

  // ---------- 3. Sessoes de teste ----------
  const sessaoMotorista = await login("motorista@informaluno.com");
  const sessaoPortaria = await login("portaria@informaluno.com");
  const sessaoPai = await login("aluno.pai@informaluno.com");
  check("Login do MOTORISTA", !!sessaoMotorista);
  check("Login do PORTARIA", !!sessaoPortaria);
  check("Login do pai do aluno demo", !!sessaoPai);

  // ---------- 4. Protecoes da rota ----------
  let r = await req("POST", "/api/van/registrar", { body: { alunoId: demo.id } });
  check("Sem token -> 401", r.status === 401, `HTTP ${r.status}`);

  r = await req("POST", "/api/van/registrar", {
    token: sessaoPai.token,
    body: { alunoId: demo.id },
  });
  check("RESPONSAVEL -> 403", r.status === 403, `HTTP ${r.status}`);

  r = await req("POST", "/api/van/registrar", {
    token: sessaoPortaria.token,
    body: { alunoId: demo.id },
  });
  check("PORTARIA -> 403 (van e do motorista)", r.status === 403, `HTTP ${r.status}`);

  r = await req("POST", "/api/van/registrar", { token: sessaoMotorista.token, body: {} });
  check("MOTORISTA sem alunoId -> 400", r.status === 400, `HTTP ${r.status}`);

  r = await req("POST", "/api/van/registrar", {
    token: sessaoMotorista.token,
    body: { alunoId: 999999 },
  });
  check("MOTORISTA aluno inexistente -> 404", r.status === 404, `HTTP ${r.status}`);

  r = await req("GET", "/api/diretoria/dashboard", { token: sessaoMotorista.token });
  check("MOTORISTA nao acessa /api/diretoria/* -> 403", r.status === 403, `HTTP ${r.status}`);

  // ---------- 5. Embarque ----------
  r = await req("POST", "/api/van/registrar", {
    token: sessaoMotorista.token,
    body: { alunoId: demo.id },
  });
  check(
    "Embarque registrado -> 201",
    r.status === 201 && r.data && r.data.success === true,
    `HTTP ${r.status}`
  );
  check(
    "Resposta traz dia/hora (Brasilia)",
    r.data && typeof r.data.quando === "string" && /2026/.test(r.data.quando),
    r.data ? r.data.quando : "sem quando"
  );
  check(
    "Resposta indica modo do aviso de e-mail",
    r.data && typeof r.data.avisoEmail === "string",
    r.data ? r.data.avisoEmail : "?"
  );

  // ---------- 6. Registro visivel na diretoria (feed tipo VAN) ----------
  const sessaoDiretor = await login("diretor@informaluno.com");
  const dir = await req("GET", "/api/diretoria/dashboard", {
    token: sessaoDiretor ? sessaoDiretor.token : "",
  });
  const feed = (dir.data && dir.data.ultimosRegistros) || [];
  check(
    "Feed da diretoria mostra o embarque (tipo VAN)",
    feed.some((reg) => reg.tipo === "VAN" && reg.nome === "Aluno Demonstracao InformAluno"),
    feed.length ? `${feed[0].tipo} / ${feed[0].nome}` : "feed vazio"
  );

  // ---------- 7. Elenco ----------
  usuarios = await req("GET", "/api/admin/usuarios", { token: tokenAdmin });
  const final = (usuarios.data || []).find((u) => u.email === "motorista@informaluno.com");
  check("Elenco: motorista@ permanente com cargo MOTORISTA", !!final && final.role === "MOTORISTA");
};

main()
  .then(() => {
    console.log(`\nSMOKE MOTORISTA/VAN: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error("ERRO FATAL:", e);
    console.log(`\nSMOKE MOTORISTA/VAN: ${pass} PASS / ${fail} FAIL (abortado)`);
    process.exit(1);
  });
