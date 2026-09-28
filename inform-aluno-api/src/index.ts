import { Hono } from "hono";
import type { Context, Next } from "hono";
import { cors } from "hono/cors";
import {
  notificar,
  emailsResponsavelAluno,
  emailsProfessoresEDiretoria,
  emailsSecretariaECoordenador,
  urlAplicacao,
  testarConexaoSMTP,
  mailConfigFromEnv,
} from "./mailer";
import {
  emailBoasVindas,
  emailResetSenha,
  emailSenhaAlteradaPeloUsuario,
  emailSenhaRedefinidaPeloAdmin,
  emailCargoAlterado,
  emailNota,
  emailAcompanhamentoResponsavel,
  emailAcompanhamentoEscola,
  emailFotoAtualizada,
  emailDadosResponsavelAlterado,
  emailReconhecimentoVan,
  emailPreCadastro,
  emailTeste,
  emailConviteAprovacao,
  emailConviteResultado,
} from "./emailtemplates";
import { hashSenha, verificarSenha } from "./senha";
import { loginBloqueado, registrarFalha, limparFalhas } from "./ratelimit";

interface Env {
  DB: D1Database;
  // Credenciais SMTP — preenchidas em .dev.vars / wrangler secret
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  EMAIL_FROM?: string;
  APP_URL?: string;
  // Origens liberadas pelo CORS, separadas por vírgula (produção);
  // sem definição, valem as portas de desenvolvimento.
  CORS_ORIGINS?: string;
}

// Variáveis de sessão injetadas no contexto pelo middleware `autenticar`
interface SessionVars {
  usuarioId: number;
  usuarioRole: string;
}

const app = new Hono<{ Bindings: Env; Variables: SessionVars }>();

// Configuração Globais de CORS
// Origens permitidas vêm de CORS_ORIGINS (vírgula) em .dev.vars / vars de
// produção; sem configuração, valem as portas de desenvolvimento.
app.use(
  "/*",
  cors({
    origin: (origem, contexto) => {
      const bindings = (contexto.env ?? {}) as Env;
      const permitidas = (
        bindings.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174"
      )
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
      return permitidas.includes(origem) ? origem : null;
    },
    allowMethods: ["POST", "GET", "OPTIONS", "PUT", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Helper para tratar mensagens de erro com segurança no TypeScript
const getErrorMessage = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  return String(e);
};

// Helper para limpar e validar CPF (apenas números, máximo 11 dígitos)
const limparEValidarCPF = (cpfInput: unknown): { cpf: string; error?: string } => {
  if (!cpfInput) return { cpf: "" };
  
  // Remove pontos, traços e qualquer caractere não numérico
  const cpfLimpo = String(cpfInput).replace(/\D/g, "");

  if (cpfLimpo.length > 11) {
    return { cpf: cpfLimpo, error: "O CPF não pode ter mais de 11 dígitos." };
  }

  return { cpf: cpfLimpo };
};

// Consulta base dos pré-cadastros com as fotos de aluno, pai e mãe.
// Única fonte: usada pelo painel do admin e pela tela da secretaria.
const SQL_ALUNOS_COM_FOTOS = `
  SELECT 
    a.id,
    a.nome,
    a.matricula,
    a.serie,
    a.cpf,
    a.status,
    a.foto_base64 as foto_aluno,
    r1.nome as pai_nome,
    r1.cpf as pai_cpf,
    r1.foto_base64 as foto_pai,
    r2.nome as mae_nome,
    r2.cpf as mae_cpf,
    r2.foto_base64 as foto_mae
  FROM alunos a
  LEFT JOIN responsaveis r1 ON a.responsavel_id = r1.id
  LEFT JOIN responsaveis r2 ON a.responsavel2_id = r2.id
  ORDER BY a.id DESC
`;

// Atualiza (substitui) a foto de um pré-cadastro — aluno, pai ou mãe.
// Compartilhada pelas rotas do admin e da secretaria.
// Observação: este helper NUNCA exclui nada, só troca a imagem.
const atualizarFotoAluno = async (
  env: Env,
  id: string,
  alvo: unknown,
  foto: unknown
): Promise<{ status: 200 | 400 | 404; body: Record<string, unknown> }> => {
  if (!foto) {
    return { status: 400, body: { error: "Envie a nova foto." } };
  }
  if (alvo !== "aluno" && alvo !== "pai" && alvo !== "mae") {
    return { status: 400, body: { error: "Destino inválido (aluno, pai ou mae)." } };
  }

  const aluno = await env.DB
    .prepare("SELECT nome, responsavel_id, responsavel2_id FROM alunos WHERE id = ?")
    .bind(id)
    .first<{
      nome: string;
      responsavel_id: number | null;
      responsavel2_id: number | null;
    }>();

  if (!aluno) {
    return { status: 404, body: { error: "Pré-cadastro não encontrado." } };
  }

  if (alvo === "aluno") {
    await env.DB
      .prepare("UPDATE alunos SET foto_base64 = ? WHERE id = ?")
      .bind(foto, id)
      .run();
  } else if (alvo === "pai") {
    if (!aluno.responsavel_id) {
      return { status: 400, body: { error: "Este aluno não tem responsável vinculado." } };
    }
    await env.DB
      .prepare("UPDATE responsaveis SET foto_base64 = ? WHERE id = ?")
      .bind(foto, aluno.responsavel_id)
      .run();
  } else {
    if (!aluno.responsavel2_id) {
      return { status: 400, body: { error: "Este aluno não tem 2º responsável vinculado." } };
    }
    await env.DB
      .prepare("UPDATE responsaveis SET foto_base64 = ? WHERE id = ?")
      .bind(foto, aluno.responsavel2_id)
      .run();
  }

  // Aviso ao responsável: a imagem foi ajustada (admin ou secretaria)
  const rotulo =
    alvo === "aluno" ? "do aluno" : alvo === "pai" ? "do responsável" : "do 2º responsável";
  await notificar(
    env,
    await emailsResponsavelAluno(env.DB, id),
    `Foto ${rotulo} ${aluno.nome} atualizada`,
    emailFotoAtualizada(aluno.nome, rotulo)
  );

  return { status: 200, body: { success: true, message: "Foto atualizada com sucesso!" } };
};

// ============================================================
// MIDDLEWARE DE SESSÃO — protege /api/admin/* e /api/diretoria/*
// Exige header Authorization: Bearer <token> válido em `sessoes`.
// ============================================================
const autenticar =
  (rolesPermitidos: string[]) =>
  async (
    c: Context<{ Bindings: Env; Variables: SessionVars }>,
    next: Next
  ): Promise<Response | void> => {
    const auth = c.req.header("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (!token) {
      return c.json({ error: "Sessão ausente. Faça login novamente." }, 401);
    }

    const sessao = await c.env.DB.prepare(
      "SELECT s.usuario_id, u.role FROM sessoes s " +
        "JOIN usuarios u ON u.id = s.usuario_id " +
        "WHERE s.token = ? AND datetime(s.expira_em) > datetime('now')"
    )
      .bind(token)
      .first<{ usuario_id: number; role: string }>();

    if (!sessao) {
      return c.json({ error: "Sessão inválida ou expirada. Faça login novamente." }, 401);
    }

    if (!rolesPermitidos.includes(sessao.role)) {
      return c.json({ error: "Acesso restrito ao seu perfil." }, 403);
    }

    // Disponibiliza a sessão para os handlers (quem é / cargo de quem)
    c.set("usuarioId", sessao.usuario_id);
    c.set("usuarioRole", sessao.role);

    await next();
  };

// Rotas de administração: somente ADMIN
app.use("/api/admin/*", autenticar(["ADMIN"]));

// Rotas da diretoria: ADMIN, DIRETOR, COORDENADOR ou GESTOR
app.use("/api/diretoria/*", autenticar(["ADMIN", "DIRETOR", "COORDENADOR", "GESTOR"]));

// Rotas do professor: lançar notas e acompanhamentos
app.use("/api/professor/*", autenticar(["PROFESSOR", "ADMIN"]));

// Aluno: enxerga apenas o próprio dashboard de notas e matérias
app.use("/api/aluno/*", autenticar(["ALUNO", "ADMIN"]));

// Painel do responsável (pai/mãe): notas e acompanhamentos dos filhos
app.use("/api/painel/*", autenticar(["RESPONSAVEL", "ADMIN"]));

// Secretaria: ajustar fotos dos pré-cadastros (somente substituição,
// sem nenhuma rota de exclusão para este perfil)
app.use("/api/secretaria/*", autenticar(["SECRETARIA", "ADMIN"]));

// ============================================================
// 1. ROTAS EXCLUSIVAS DE ADMINISTRAÇÃO (/api/admin)
// ============================================================

// Listar todos os usuários do sistema
app.get("/api/admin/usuarios", async (c) => {
  try {
    const usuarios = await c.env.DB.prepare(
      "SELECT u.id, u.nome, u.email, u.role, u.criado_em, u.aluno_id, " +
        "al.nome AS aluno_nome " +
        "FROM usuarios u LEFT JOIN alunos al ON al.id = u.aluno_id " +
        "ORDER BY u.id DESC"
    ).all();

    return c.json(usuarios.results || [], 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao buscar usuários:", message);
    return c.json({ error: "Erro ao listar usuários", details: message }, 500);
  }
});

// Log completo do sistema (admin): acessos (logins) + acessos
// temporários/terceiros criados — sem limite de dias
app.get("/api/admin/log", async (c) => {
  try {
    const acessos = await c.env.DB.prepare(
      "SELECT id, tipo, usuario_nome, usuario_email, papel, criado_em " +
        "FROM log_acessos ORDER BY id DESC LIMIT 300"
    ).all();

    const terceiros = await c.env.DB.prepare(
      "SELECT at.id, at.tipo, at.status, at.convidado_nome, at.criado_em, at.expira_em, " +
        "u.nome AS solicitante, al.nome AS aluno_nome, al.matricula " +
        "FROM autorizacoes_temporarias at " +
        "LEFT JOIN usuarios u ON u.id = at.responsavel_id " +
        "LEFT JOIN alunos al ON al.id = at.aluno_id " +
        "ORDER BY at.id DESC LIMIT 300"
    ).all();

    return c.json(
      { acessos: acessos.results || [], terceiros: terceiros.results || [] },
      200
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota GET /api/admin/log:", message);
    return c.json({ error: "Erro ao carregar o log", details: message }, 500);
  }
});

// Redefinir a senha de um usuário específico
app.patch("/api/admin/usuarios/:id/senha", async (c) => {
  try {
    const id = c.req.param("id");
    const { novaSenha } = await c.req.json();

    if (!novaSenha || novaSenha.length < 4) {
      return c.json({ error: "A nova senha deve ter pelo menos 4 caracteres." }, 400);
    }

    const usuario = await c.env.DB.prepare("SELECT nome, email FROM usuarios WHERE id = ?")
      .bind(id)
      .first<{ nome: string; email: string }>();

    const res = await c.env.DB.prepare(
      "UPDATE usuarios SET senha = ? WHERE id = ?"
    )
      .bind(await hashSenha(String(novaSenha)), id)
      .run();

    if (res.meta.changes === 0) {
      return c.json({ error: "Usuário não encontrado." }, 404);
    }

    // Avisa ao usuário que a administração redefiniu a senha
    if (usuario) {
      await notificar(
        c.env,
        [usuario.email],
        "Sua senha foi redefinida pela administração",
        emailSenhaRedefinidaPeloAdmin(usuario.nome)
      );
    }

    return c.json({ success: true, message: "Senha redefinida com sucesso!" }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao redefinir senha:", message);
    return c.json({ error: "Erro ao redefinir senha", details: message }, 500);
  }
});

// Deletar a conta de um usuário
app.delete("/api/admin/usuarios/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const res = await c.env.DB.prepare("DELETE FROM usuarios WHERE id = ?")
      .bind(id)
      .run();

    if (res.meta.changes === 0) {
      return c.json({ error: "Usuário não encontrado." }, 404);
    }

    return c.json({ success: true, message: "Usuário excluído com sucesso!" }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao deletar usuário:", message);
    return c.json({ error: "Erro ao excluir usuário", details: message }, 500);
  }
});

// Vincular (ou remover) o aluno da conta com cargo ALUNO —
// é esse vínculo que permite ao aluno ver as próprias notas/matérias
app.patch("/api/admin/usuarios/:id/aluno", async (c) => {
  try {
    const id = c.req.param("id");
    const { aluno_id } = await c.req.json();

    const usuario = await c.env.DB.prepare("SELECT id FROM usuarios WHERE id = ?")
      .bind(id)
      .first();
    if (!usuario) {
      return c.json({ error: "Usuário não encontrado." }, 404);
    }

    if (aluno_id === null || aluno_id === undefined || aluno_id === "") {
      await c.env.DB.prepare("UPDATE usuarios SET aluno_id = NULL WHERE id = ?")
        .bind(id)
        .run();
      return c.json({ success: true, message: "Vínculo com o aluno removido!" }, 200);
    }

    const alunoIdNum = Number(aluno_id);
    if (!Number.isInteger(alunoIdNum) || alunoIdNum <= 0) {
      return c.json({ error: "Aluno inválido." }, 400);
    }
    const aluno = await c.env.DB.prepare("SELECT id FROM alunos WHERE id = ?")
      .bind(alunoIdNum)
      .first();
    if (!aluno) {
      return c.json({ error: "Aluno não encontrado." }, 404);
    }

    await c.env.DB.prepare("UPDATE usuarios SET aluno_id = ? WHERE id = ?")
      .bind(alunoIdNum, id)
      .run();
    return c.json({ success: true, message: "Vínculo com o aluno atualizado!" }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao vincular aluno ao usuário:", message);
    return c.json({ error: "Erro ao vincular aluno", details: message }, 500);
  }
});

// Alterar o cargo/perfil de um usuário
app.patch("/api/admin/usuarios/:id/role", async (c) => {
  try {
    const id = c.req.param("id");
    const { novoRole } = await c.req.json();

    if (!novoRole) {
      return c.json({ error: "Informe o novo cargo." }, 400);
    }

    const usuario = await c.env.DB.prepare(
      "SELECT nome, email, role FROM usuarios WHERE id = ?"
    )
      .bind(id)
      .first<{ nome: string; email: string; role: string }>();

    const res = await c.env.DB.prepare(
      "UPDATE usuarios SET role = ? WHERE id = ?"
    )
      .bind(novoRole, id)
      .run();

    if (res.meta.changes === 0) {
      return c.json({ error: "Usuário não encontrado." }, 404);
    }

    // Avisa ao usuário que o cargo dele mudou
    if (usuario && usuario.role !== novoRole) {
      await notificar(
        c.env,
        [usuario.email],
        "Seu cargo foi atualizado no InformAluno",
        emailCargoAlterado(usuario.nome, usuario.role, novoRole)
      );
    }

    return c.json({ success: true, message: "Cargo atualizado com sucesso!" }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao alterar cargo:", message);
    return c.json({ error: "Erro ao alterar cargo", details: message }, 500);
  }
});

// Listar pré-cadastros de alunos (tela de cadastro) com pai, mãe e fotos
app.get("/api/admin/alunos", async (c) => {
  try {
    const alunos = await c.env.DB.prepare(SQL_ALUNOS_COM_FOTOS).all();

    return c.json(alunos.results || [], 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao buscar alunos:", message);
    return c.json({ error: "Erro ao listar alunos", details: message }, 500);
  }
});

// Atualizar a foto de um pré-cadastro (aluno, pai ou mãe)
app.patch("/api/admin/alunos/:id/foto", async (c) => {
  try {
    const id = c.req.param("id");
    const { alvo, foto } = await c.req.json();

    const resultado = await atualizarFotoAluno(c.env, id, alvo, foto);
    return c.json(resultado.body, resultado.status);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao atualizar foto:", message);
    return c.json({ error: "Erro ao atualizar foto", details: message }, 500);
  }
});

// Excluir pré-cadastro de aluno (aluno + responsáveis que ficarem órfãos)
app.delete("/api/admin/alunos/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const aluno = await c.env.DB.prepare(
      "SELECT responsavel_id, responsavel2_id, responsavel3_id FROM alunos WHERE id = ?"
    )
      .bind(id)
      .first();

    if (!aluno) {
      return c.json({ error: "Pré-cadastro não encontrado." }, 404);
    }

    const res = await c.env.DB.prepare("DELETE FROM alunos WHERE id = ?")
      .bind(id)
      .run();

    if (res.meta.changes === 0) {
      return c.json({ error: "Pré-cadastro não encontrado." }, 404);
    }

    // Remove os responsáveis que não estão mais vinculados a nenhum aluno
    // (incluindo o 3º responsável — ele fica órfão quando o aluno é excluído)
    const limparResp = `
      DELETE FROM responsaveis 
      WHERE id = ? 
      AND id NOT IN (
        SELECT responsavel_id FROM alunos WHERE responsavel_id IS NOT NULL
        UNION
        SELECT responsavel2_id FROM alunos WHERE responsavel2_id IS NOT NULL
        UNION
        SELECT responsavel3_id FROM alunos WHERE responsavel3_id IS NOT NULL
      )
    `;
    if (aluno.responsavel_id) {
      await c.env.DB.prepare(limparResp).bind(aluno.responsavel_id).run();
    }
    if (aluno.responsavel2_id) {
      await c.env.DB.prepare(limparResp).bind(aluno.responsavel2_id).run();
    }
    if (aluno.responsavel3_id) {
      await c.env.DB.prepare(limparResp).bind(aluno.responsavel3_id).run();
    }

    return c.json({ success: true, message: "Pré-cadastro excluído com sucesso!" }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao deletar pré-cadastro de aluno:", message);
    return c.json({ error: "Erro ao excluir pré-cadastro", details: message }, 500);
  }
});

// ============================================================
// 2. ROTAS DE AUTENTICAÇÃO (Login e Criação de Contas)
// ============================================================

// Registrar novo usuário
app.post("/api/auth/registro", async (c) => {
  try {
    const { nome, email, senha, role } = await c.req.json();

    if (!nome || !email || !senha) {
      return c.json({ error: "Preencha todos os campos obrigatórios." }, 400);
    }

    // Whitelist: cargos que podem ser criados pelo auto-cadastro público.
    // ADMIN/DIRETOR só podem ser atribuídos por um administrador já logado.
    const rolesPublicos = ["RESPONSAVEL", "PORTARIA", "MOTORISTA"];
    const roleFinal = rolesPublicos.includes(role) ? role : "RESPONSAVEL";

    if (role && !rolesPublicos.includes(role)) {
      return c.json({ error: "Cargo de acesso não permitido no auto-cadastro." }, 400);
    }

    // Verificar se o e-mail já existe
    const usuarioExistente = await c.env.DB.prepare(
      "SELECT id FROM usuarios WHERE email = ?"
    )
      .bind(email)
      .first();

    if (usuarioExistente) {
      return c.json({ error: "E-mail já cadastrado no sistema." }, 400);
    }

    // Criar conta no banco D1 (senha gravada como hash PBKDF2)
    const res = await c.env.DB.prepare(
      "INSERT INTO usuarios (nome, email, senha, role, criado_em) VALUES (?, ?, ?, ?, datetime('now'))"
    )
      .bind(nome, email, await hashSenha(String(senha)), roleFinal)
      .run();

    const novoUsuario = {
      id: res.meta.last_row_id,
      nome,
      email,
      role: roleFinal,
    };

    // Boas-vindas por e-mail
    await notificar(
      c.env,
      [String(email)],
      "Bem-vindo ao InformAluno!",
      emailBoasVindas(String(nome), String(email), roleFinal)
    );

    return c.json({
      success: true,
      message: "Conta criada com sucesso!",
      usuario: novoUsuario,
    }, 201);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota /api/auth/registro:", message);
    return c.json({ error: "Erro ao criar conta", details: message }, 500);
  }
});

// Autenticar usuário
app.post("/api/auth/login", async (c) => {
  try {
    const { email, senha } = await c.req.json();

    if (!email || !senha) {
      return c.json({ error: "Informe o e-mail e a senha." }, 400);
    }

    // Rate limit contra força-bruta: só FALHAS contam; sucesso zera.
    const ip =
      (c.req.header("x-forwarded-for") || c.req.header("cf-connecting-ip") || "local")
        .split(",")[0]
        ?.trim() || "local";
    const chaveLogin = `${String(email).trim().toLowerCase()}|${ip}`;
    if (loginBloqueado(chaveLogin)) {
      return c.json(
        { error: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente." },
        429
      );
    }

    const usuario = await c.env.DB.prepare(
      "SELECT id, nome, email, role, senha FROM usuarios WHERE email = ?"
    )
      .bind(email)
      .first<{ id: number; nome: string; email: string; role: string; senha: string }>();

    const verificacao = usuario
      ? await verificarSenha(String(senha), usuario.senha)
      : { ok: false, upgrade: false };

    if (!usuario || !verificacao.ok) {
      registrarFalha(chaveLogin);
      return c.json({ error: "E-mail ou senha incorretos." }, 401);
    }

    limparFalhas(chaveLogin);

    // Migração preguiçosa: senhas antigas em texto puro são regravadas
    // como hash PBKDF2 logo nesta primeira autenticação bem-sucedida.
    if (verificacao.upgrade) {
      try {
        await c.env.DB.prepare("UPDATE usuarios SET senha = ? WHERE id = ?")
          .bind(await hashSenha(String(senha)), usuario.id)
          .run();
      } catch (erroUpgrade) {
        console.warn("Falha ao migrar senha para hash:", getErrorMessage(erroUpgrade));
      }
    }

    // Nunca devolve o hash/segredo no corpo da resposta
    const { senha: _senhaOculta, ...usuarioLogado } = usuario;

    // Cria a sessão (token exigido pelas rotas protegidas /api/admin e /api/diretoria)
    const token = crypto.randomUUID();
    const expiraEm = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12h

    await c.env.DB.prepare(
      "INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?, ?, ?)"
    )
      .bind(token, usuario.id, expiraEm)
      .run();

    // Log de acesso (best-effort: nunca derruba o login)
    try {
      await c.env.DB.prepare(
        "INSERT INTO log_acessos (tipo, usuario_id, usuario_nome, usuario_email, papel) " +
          "VALUES ('LOGIN', ?, ?, ?, ?)"
      )
        .bind(usuario.id, usuario.nome, usuario.email, usuario.role)
        .run();
    } catch (logErro) {
      console.warn("Falha ao gravar log de acesso:", getErrorMessage(logErro));
    }

    return c.json({
      success: true,
      message: "Login realizado com sucesso!",
      usuario: usuarioLogado,
      token,
    }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota /api/auth/login:", message);
    return c.json({ error: "Erro interno no login", details: message }, 500);
  }
});

// Logout: revoga a sessão NO SERVIDOR (o front também limpa o localStorage).
// Idempotente — responde sucesso mesmo sem token (sessão já encerrada).
app.post("/api/auth/logout", async (c) => {
  try {
    const auth = c.req.header("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token) {
      await c.env.DB.prepare("DELETE FROM sessoes WHERE token = ?").bind(token).run();
    }
    return c.json({ success: true, message: "Sessão encerrada." }, 200);
  } catch (e: unknown) {
    // Best-effort: nunca bloqueia o encerramento da sessão no front
    console.warn("Erro na rota /api/auth/logout:", getErrorMessage(e));
    return c.json({ success: true, message: "Sessão encerrada." }, 200);
  }
});

// ============================================================
// 2b. RECUPERAÇÃO DE SENHA (/api/recuperar-senha)
// ============================================================

// Normaliza textos para comparação (caixa, espaços e acentos)
const normalizarTexto = (t: unknown): string =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Etapa 1: solicitar o link de redefinição por e-mail
app.post("/api/recuperar-senha", async (c) => {
  try {
    const { email } = await c.req.json();

    if (!email || !String(email).includes("@")) {
      return c.json({ error: "Informe um e-mail válido." }, 400);
    }

    const usuario = await c.env.DB.prepare(
      "SELECT id, nome, email FROM usuarios WHERE email = ?"
    )
      .bind(String(email).trim())
      .first<{ id: number; nome: string; email: string }>();

    // Resposta única para não revelar se o e-mail existe ou não
    const mensagem =
      "Se o e-mail estiver cadastrado, um link de redefinição foi enviado. " +
      "O link expira em 30 minutos.";

    if (!usuario) {
      return c.json({ success: true, message: mensagem }, 200);
    }

    const token = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO redefinicao_senha (token, usuario_id, expira_em)
       VALUES (?, ?, datetime('now', '+30 minutes'))`
    )
      .bind(token, usuario.id)
      .run();

    const link = `${urlAplicacao(c.env)}/redefinir-senha/${token}`;
    console.log(`[RECUPERAÇÃO DE SENHA] Link para ${usuario.email}: ${link}`);

    // Envio real por SMTP. Sem credencial configurada (modo log), o link
    // continua vindo na resposta para manter o fluxo de testes do front.
    const envio = await notificar(
      c.env,
      [usuario.email],
      "Redefinição de senha — InformAluno",
      emailResetSenha(usuario.nome, link)
    );

    return c.json(
      envio.modo === "enviado"
        ? { success: true, message: mensagem }
        : { success: true, message: mensagem, linkSimulado: link },
      200
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota /api/recuperar-senha:", message);
    return c.json({ error: "Erro ao solicitar redefinição", details: message }, 500);
  }
});

// Etapa 2a: validar o token e informar se o usuário já tem cadastro de segurança
app.get("/api/recuperar-senha/:token", async (c) => {
  try {
    const token = c.req.param("token");

    const registro = await c.env.DB.prepare(
      `SELECT r.id, r.usado_em, r.expira_em, u.id AS usuario_id, u.nome, u.email
       FROM redefinicao_senha r
       JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.token = ?`
    )
      .bind(token)
      .first();

    if (!registro) {
      return c.json({ error: "Link inválido ou expirado." }, 404);
    }
    if (registro.usado_em) {
      return c.json({ error: "Este link já foi utilizado. Solicite um novo." }, 410);
    }
    // Comparação lexicográfica de DATETIME do SQLite funciona no mesmo formato
    const agora = new Date().toISOString().replace("T", " ").substring(0, 19);
    if (String(registro.expira_em) < agora) {
      return c.json({ error: "Link expirado. Solicite um novo." }, 410);
    }

    const seguranca = await c.env.DB.prepare(
      "SELECT pergunta1, pergunta2, pergunta3 FROM seguranca_usuario WHERE usuario_id = ?"
    )
      .bind(registro.usuario_id)
      .first();

    return c.json(
      {
        email: registro.email,
        temSeguranca: !!seguranca,
        perguntas: seguranca
          ? [seguranca.pergunta1, seguranca.pergunta2, seguranca.pergunta3]
          : null,
      },
      200
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao validar token de redefinição:", message);
    return c.json({ error: "Erro ao validar o link", details: message }, 500);
  }
});

// Etapa 2b: validar os dados de segurança e trocar a senha
app.post("/api/recuperar-senha/:token", async (c) => {
  try {
    const token = c.req.param("token");
    const { nome, cpf, perguntas, novaSenha } = await c.req.json();

    if (!nome || !cpf || !Array.isArray(perguntas) || perguntas.length !== 3) {
      return c.json(
        { error: "Preencha nome, CPF e as3 perguntas de segurança." },
        400
      );
    }
    if (!novaSenha || String(novaSenha).length < 4) {
      return c.json({ error: "A nova senha deve ter pelo menos 4 caracteres." }, 400);
    }

    const ids: number[] = perguntas.map((p: { id?: number }) => Number(p?.id));
    const respostas = perguntas.map((p: { resposta?: unknown }) => p?.resposta);
    const idsValidos =
      new Set(ids).size === 3 && ids.every((id: unknown) => Number.isInteger(id));
    const respostasOk =
      respostas.every((r: unknown) => String(r ?? "").trim().length > 0);
    if (!idsValidos || !respostasOk) {
      return c.json(
        { error: "Escolha3 perguntas distintas e responda todas." },
        400
      );
    }

    const cpfVal = limparEValidarCPF(cpf);
    if (cpfVal.error) {
      return c.json({ error: cpfVal.error }, 400);
    }
    if (cpfVal.cpf.length !== 11) {
      return c.json({ error: "O CPF deve ter11 dígitos." }, 400);
    }

    const registro = await c.env.DB.prepare(
      `SELECT r.id, r.usado_em, r.expira_em, r.usuario_id, u.email, u.nome AS nome_conta
       FROM redefinicao_senha r
       JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.token = ?`
    )
      .bind(token)
      .first<{
        id: number;
        usado_em: string | null;
        expira_em: string;
        usuario_id: number;
        email: string;
        nome_conta: string;
      }>();

    if (!registro) {
      return c.json({ error: "Link inválido ou expirado." }, 404);
    }
    if (registro.usado_em) {
      return c.json({ error: "Este link já foi utilizado. Solicite um novo." }, 410);
    }
    const agora = new Date().toISOString().replace("T", " ").substring(0, 19);
    if (String(registro.expira_em) < agora) {
      return c.json({ error: "Link expirado. Solicite um novo." }, 410);
    }

    // O nome informado precisa corresponder ao nome da conta
    if (normalizarTexto(nome) !== normalizarTexto(registro.nome_conta)) {
      return c.json({ error: "O nome informado não corresponde à conta." }, 400);
    }

    const existente = await c.env.DB.prepare(
      `SELECT cpf, pergunta1, resposta1, pergunta2, resposta2, pergunta3, resposta3
       FROM seguranca_usuario WHERE usuario_id = ?`
    )
      .bind(registro.usuario_id)
      .first<{
        cpf: string;
        pergunta1: number;
        resposta1: string;
        pergunta2: number;
        resposta2: string;
        pergunta3: number;
        resposta3: string;
      }>();

    if (existente) {
      // Já cadastrado: valida CPF e as3 respostas contra o banco
      if (String(existente.cpf) !== cpfVal.cpf) {
        return c.json({ error: "O CPF informado não corresponde ao cadastro." }, 400);
      }
      const pSalvas: Record<number, string> = {
        [existente.pergunta1]: existente.resposta1,
        [existente.pergunta2]: existente.resposta2,
        [existente.pergunta3]: existente.resposta3,
      };
      const cadastradas = [existente.pergunta1, existente.pergunta2, existente.pergunta3];
      const mesmoConjunto =
        ids.length === cadastradas.length &&
        ids.every((id: number) => cadastradas.includes(id));
      if (!mesmoConjunto) {
        return c.json(
          { error: "As perguntas selecionadas não correspondem às cadastradas." },
          400
        );
      }
      for (const p of perguntas) {
        const salva = pSalvas[p.id];
        if (!salva || normalizarTexto(salva) !== normalizarTexto(p.resposta)) {
          return c.json({ error: "Resposta incorreta em uma das perguntas." }, 400);
        }
      }
    } else {
      // Primeira vez: salva o cadastro de segurança e libera na hora
      await c.env.DB.prepare(
        `INSERT INTO seguranca_usuario
           (usuario_id, cpf, pergunta1, resposta1, pergunta2, resposta2, pergunta3, resposta3)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          registro.usuario_id,
          cpfVal.cpf,
          ids[0],
          normalizarTexto(respostas[0]),
          ids[1],
          normalizarTexto(respostas[1]),
          ids[2],
          normalizarTexto(respostas[2])
        )
        .run();
    }

    await c.env.DB.prepare("UPDATE usuarios SET senha = ? WHERE id = ?")
      .bind(await hashSenha(String(novaSenha)), registro.usuario_id)
      .run();

    await c.env.DB.prepare(
      "UPDATE redefinicao_senha SET usado_em = datetime('now') WHERE id = ?"
    )
      .bind(registro.id)
      .run();

    // Confirmação por e-mail: se não foi o próprio usuário, ele é avisado
    await notificar(
      c.env,
      [registro.email],
      "Sua senha foi alterada — InformAluno",
      emailSenhaAlteradaPeloUsuario(registro.nome_conta)
    );

    return c.json(
      { success: true, message: "Senha redefinida com sucesso! Já pode entrar." },
      200
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao redefinir senha:", message);
    return c.json({ error: "Erro ao redefinir a senha", details: message }, 500);
  }
});

// ============================================================
// 3. ROTAS DA PORTARIA (/api/portaria)
// ============================================================

// Define se o reconhecimento de hoje é ENTRADA (CHECKIN) ou SAÍDA (CHECKOUT):
// alterna por pessoa e dia — o 1º evento do dia vira check-in, o 2º check-out,
// e assim por diante. O lado do aluno (ALUNO/RESPONSAVEL/VAN) segue a MESMA
// sequência (é o aluno entrando/saindo, com ou sem acompanhante, pela
// portaria ou pela van); PROFESSOR tem sequência própria (ids de outra tabela).
const definirMovimento = async (
  db: D1Database,
  pessoaId: number,
  tipo: string
): Promise<"CHECKIN" | "CHECKOUT"> => {
  const filtro =
    tipo === "PROFESSOR" ? "AND tipo = 'PROFESSOR'" : "AND tipo <> 'PROFESSOR'";
  const total = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM registros_entrada
       WHERE pessoa_id = ? AND DATE(data_hora) = DATE('now') ${filtro}`
    )
    .bind(pessoaId)
    .first<{ n: number }>();
  return (total?.n || 0) % 2 === 0 ? "CHECKIN" : "CHECKOUT";
};

// Registrar entrada/saída validada na portaria (porteiro ou motorista).
// Sempre devolve o movimento (check-in/check-out) junto do resultado.
app.post(
  "/api/portaria/registrar-entrada",
  autenticar(["PORTARIA", "MOTORISTA", "ADMIN"]),
  async (c) => {
    try {
      const { pessoaId, nome, tipo, detalhe, metodoValidacao } = await c.req.json();

      if (!pessoaId || !nome || !tipo || !detalhe) {
        return c.json({ error: "Dados incompletos para registrar o movimento." }, 400);
      }

      const movimento = await definirMovimento(c.env.DB, Number(pessoaId), String(tipo));

      await c.env.DB.prepare(
        `INSERT INTO registros_entrada (pessoa_id, nome, tipo, detalhe, metodo_validacao, movimento) 
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(pessoaId, nome, tipo, detalhe, metodoValidacao || "BIOMETRIA_FACIAL", movimento)
        .run();

      return c.json(
        {
          success: true,
          movimento,
          message:
            movimento === "CHECKIN"
              ? "Entrada registrada (check-in) com sucesso!"
              : "Saída registrada (check-out) com sucesso!",
        },
        201
      );
    } catch (e: unknown) {
      const message = getErrorMessage(e);
      console.error("Erro ao registrar movimento na portaria:", message);
      return c.json({ error: "Erro ao registrar entrada", details: message }, 500);
    }
  }
);

// ============================================================
// 3b. ROTAS DA VAN (/api/van) — cargo MOTORISTA (mesmo padrão da portaria)
// ============================================================
// O motorista faz o reconhecimento facial do aluno na van; aqui o embarque
// é gravado e o aviso (com dia e hora) vai para pai/mãe + secretaria + coordenação.
app.post("/api/van/registrar", autenticar(["MOTORISTA", "ADMIN"]), async (c) => {
  try {
    const { alunoId } = await c.req.json();

    const alunoIdNum = Number(alunoId);
    if (!alunoIdNum || Number.isNaN(alunoIdNum)) {
      return c.json({ error: "Informe o aluno reconhecido." }, 400);
    }

    const aluno = await c.env.DB.prepare(
      "SELECT id, nome, matricula FROM alunos WHERE id = ?"
    )
      .bind(alunoIdNum)
      .first<{ id: number; nome: string; matricula: string }>();
    if (!aluno) {
      return c.json({ error: "Aluno não encontrado." }, 404);
    }

    // Embarque registrado (aparece no feed de registros da diretoria).
    // O movimento alterna por aluno/dia: 1º reconhecimento = check-in,
    // 2º = check-out (mesma sequência da portaria).
    const movimento = await definirMovimento(c.env.DB, aluno.id, "ALUNO");

    await c.env.DB.prepare(
      `INSERT INTO registros_entrada (pessoa_id, nome, tipo, detalhe, metodo_validacao, movimento)
       VALUES (?, ?, 'VAN', 'Van Escolar', 'BIOMETRIA_FACIAL', ?)`
    )
      .bind(aluno.id, aluno.nome, movimento)
      .run();

    // Destinatários: responsável vinculado (pai/mãe) + secretaria + coordenação
    const pais = await emailsResponsavelAluno(c.env.DB, aluno.id);
    const equipe = await emailsSecretariaECoordenador(c.env.DB);
    const destinatarios = Array.from(new Set([...pais, ...equipe]));

    // Dia e hora de Brasília, mesmo quando o servidor está em UTC
    const quando = new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "full",
      timeStyle: "short",
    });

    const envio = await notificar(
      c.env,
      destinatarios,
      `Reconhecimento facial na van — ${aluno.nome}`,
      emailReconhecimentoVan(aluno.nome, aluno.matricula, quando, movimento)
    );

    return c.json({
      success: true,
      message: "Embarque registrado! Responsáveis, secretaria e coordenação avisados.",
      aluno: aluno.nome,
      quando,
      movimento,
      avisoEmail: envio.modo,
    }, 201);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao registrar embarque na van:", message);
    return c.json({ error: "Erro ao registrar embarque na van", details: message }, 500);
  }
});

// ============================================================
// 3c. CHAT DA PLATAFORMA (/api/chat) — conversas individuais
// ============================================================
// Três tipos de fio:
//   DIRETORIA       — um fio por professor com a equipe da diretoria;
//   FAMILIA         — um fio por par professor × família de um aluno
//                     (o pai seleciona professores, o professor seleciona alunos);
//   CORRESPONDENCIA — o responsável manda mensagem direta para uma equipe
//                     da escola (coluna `destino`).
// Participam quem acessa /professor (PROFESSOR), /diretoria (DIRETOR,
// COORDENADOR, GESTOR, ADMIN), /secretaria (SECRETARIA) e o painel do
// responsável (RESPONSAVEL).
const CHAT_ROLES = [
  "PROFESSOR",
  "DIRETOR",
  "COORDENADOR",
  "GESTOR",
  "ADMIN",
  "RESPONSAVEL",
  "SECRETARIA",
];
const CHAT_EQUIPE = ["DIRETOR", "COORDENADOR", "GESTOR", "ADMIN"];
// Canais diretos que o responsável escolhe na lista de contatos
const DESTINOS = ["SECRETARIA", "COORDENADOR", "DIRETOR", "GESTOR"];
const NOME_DESTINO: Record<string, string> = {
  SECRETARIA: "Secretaria",
  COORDENADOR: "Coordenador",
  DIRETOR: "Diretoria",
  GESTOR: "Gestor",
};

type ChatMensagem = {
  id: number;
  autor_id: number;
  texto: string;
  criado_em: string;
  conversa: string;
  professor_id: number;
  aluno_id: number;
  destino: string;
  autor_nome: string;
  autor_role: string;
};

type FioChat = {
  conversa: string;
  professor_id: number;
  aluno_id: number;
  destino: string;
};

const SELECT_CHAT =
  "SELECT m.id, m.autor_id, m.texto, m.criado_em, " +
  "m.conversa, m.professor_id, m.aluno_id, m.destino, " +
  "u.nome AS autor_nome, u.role AS autor_role " +
  "FROM chat_mensagens m JOIN usuarios u ON u.id = m.autor_id";

// Mesmo critério do painel do responsável: é pai/mãe do aluno pelo vínculo
// do pré-cadastro (responsavel_usuario) ou pelo CPF de segurança.
const ehResponsavelDoAluno = async (
  db: D1Database,
  usuarioId: number,
  alunoId: number
): Promise<boolean> => {
  const dono = await db
    .prepare(
      `SELECT 1 FROM alunos a
       JOIN responsaveis r ON (a.responsavel_id = r.id OR a.responsavel2_id = r.id)
       WHERE a.id = ?
         AND (r.id IN (SELECT responsavel_id FROM responsavel_usuario WHERE usuario_id = ?)
              OR r.cpf IN (SELECT cpf FROM seguranca_usuario WHERE usuario_id = ?))
       LIMIT 1`
    )
    .bind(alunoId, usuarioId, usuarioId)
    .first();
  return !!dono;
};

// Quem pode ler e escrever em cada fio.
const podeUsarFio = async (
  db: D1Database,
  usuarioId: number,
  role: string,
  fio: FioChat
): Promise<boolean> => {
  if (fio.conversa === "DIRETORIA") {
    if (fio.professor_id <= 0 || fio.aluno_id !== 0) return false;
    if (role === "PROFESSOR") return fio.professor_id === usuarioId;
    return CHAT_EQUIPE.includes(role);
  }
  if (fio.conversa === "FAMILIA") {
    if (fio.professor_id <= 0 || fio.aluno_id <= 0) return false;
    if (role === "PROFESSOR") return fio.professor_id === usuarioId;
    if (role === "RESPONSAVEL") return ehResponsavelDoAluno(db, usuarioId, fio.aluno_id);
    return false;
  }
  if (fio.conversa === "CORRESPONDENCIA") {
    // No fio de correspondência, professor_id guarda o usuário responsável
    if (fio.professor_id <= 0 || fio.aluno_id !== 0) return false;
    if (!DESTINOS.includes(fio.destino)) return false;
    // O responsável conversa em qualquer canal da escola, mas só no próprio fio
    if (role === "RESPONSAVEL") return fio.professor_id === usuarioId;
    // O lado da escola: responde quem é o destino do canal (admin acompanha)
    if (role === "ADMIN") return true;
    return role === fio.destino;
  }
  return false;
};

// Monta e valida o fio vindo do cliente (query string ou json).
// Devolve null quando a conversa/destino não faz sentido.
const fioValido = (p: {
  conversa?: unknown;
  professor_id?: unknown;
  aluno_id?: unknown;
  destino?: unknown;
}): FioChat | null => {
  const conversa = typeof p.conversa === "string" ? p.conversa : "";
  if (!["DIRETORIA", "FAMILIA", "CORRESPONDENCIA"].includes(conversa)) return null;
  const fio: FioChat = {
    conversa,
    professor_id: Number(p.professor_id) || 0,
    aluno_id: Number(p.aluno_id) || 0,
    destino: conversa === "CORRESPONDENCIA" ? String(p.destino || "") : "",
  };
  if (conversa === "CORRESPONDENCIA" && !DESTINOS.includes(fio.destino)) return null;
  return fio;
};

// Abrir/polling de um fio marca tudo como lido para o usuário atual
// (é isso que zera a bolinha de notificação do contato).
const marcarFioComoLido = async (db: D1Database, usuarioId: number, fio: FioChat) => {
  const maximo = await db
    .prepare(
      "SELECT MAX(id) AS maximo FROM chat_mensagens " +
        "WHERE conversa = ? AND professor_id = ? AND aluno_id = ? AND destino = ?"
    )
    .bind(fio.conversa, fio.professor_id, fio.aluno_id, fio.destino)
    .first<{ maximo: number | null }>();
  if (!maximo?.maximo) return;
  await db
    .prepare(
      `INSERT INTO chat_leituras (usuario_id, conversa, professor_id, aluno_id, destino, ultimo_lido_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(usuario_id, conversa, professor_id, aluno_id, destino)
       DO UPDATE SET ultimo_lido_id = excluded.ultimo_lido_id, atualizado_em = datetime('now')`
    )
    .bind(usuarioId, fio.conversa, fio.professor_id, fio.aluno_id, fio.destino, maximo.maximo)
    .run();
};

// Contatos do usuário logado + última mensagem + não lidas (bolinhas).
app.get("/api/chat/conversas", autenticar(CHAT_ROLES), async (c) => {
  try {
    const usuarioId = c.get("usuarioId");
    const role = c.get("usuarioRole");

    type Base = FioChat & {
      contatoTipo: "ALUNO" | "PROFESSOR" | "DIRETORIA" | "EQUIPE" | "RESPONSAVEL";
      contatoNome: string;
      contatoSubtitulo: string;
    };
    const bases: Base[] = [];

    if (role === "RESPONSAVEL") {
      // Canais diretos com a escola: secretaria, coordenação, diretoria e gestão
      for (const d of DESTINOS) {
        bases.push({
          conversa: "CORRESPONDENCIA",
          professor_id: usuarioId,
          aluno_id: 0,
          destino: d,
          contatoTipo: "EQUIPE",
          contatoNome: NOME_DESTINO[d],
          contatoSubtitulo: "Canal direto",
        });
      }

      // Um contato por professor × cada um dos seus filhos
      const filhos = await c.env.DB.prepare(
        `SELECT DISTINCT a.id, a.nome, a.matricula
         FROM alunos a
         JOIN responsaveis r ON (a.responsavel_id = r.id OR a.responsavel2_id = r.id)
         WHERE r.id IN (SELECT responsavel_id FROM responsavel_usuario WHERE usuario_id = ?)
            OR r.cpf IN (SELECT cpf FROM seguranca_usuario WHERE usuario_id = ?)
         ORDER BY a.nome`
      )
        .bind(usuarioId, usuarioId)
        .all<{ id: number; nome: string; matricula: string }>();
      const professores = await c.env.DB.prepare(
        "SELECT id, nome FROM usuarios WHERE role = 'PROFESSOR' ORDER BY nome"
      ).all<{ id: number; nome: string }>();

      for (const p of professores.results || []) {
        for (const f of filhos.results || []) {
          bases.push({
            conversa: "FAMILIA",
            professor_id: p.id,
            aluno_id: f.id,
            destino: "",
            contatoTipo: "PROFESSOR",
            contatoNome: p.nome,
            contatoSubtitulo: `${f.nome} · mat. ${f.matricula}`,
          });
        }
      }
    } else if (role === "PROFESSOR") {
      // Professor: a diretoria + um contato por aluno (conversa com a família)
      bases.push({
        conversa: "DIRETORIA",
        professor_id: usuarioId,
        aluno_id: 0,
        destino: "",
        contatoTipo: "DIRETORIA",
        contatoNome: "Diretoria",
        contatoSubtitulo: "Equipe da diretoria",
      });
      const alunos = await c.env.DB.prepare(
        "SELECT id, nome, matricula FROM alunos ORDER BY nome"
      ).all<{ id: number; nome: string; matricula: string }>();
      for (const a of alunos.results || []) {
        bases.push({
          conversa: "FAMILIA",
          professor_id: usuarioId,
          aluno_id: a.id,
          destino: "",
          contatoTipo: "ALUNO",
          contatoNome: a.nome,
          contatoSubtitulo: `Matrícula ${a.matricula}`,
        });
      }
    } else if (role === "SECRETARIA") {
      // Secretaria: um fio por responsável que conversa com o canal dela
      const responsaveis = await c.env.DB.prepare(
        "SELECT id, nome FROM usuarios WHERE role = 'RESPONSAVEL' ORDER BY nome"
      ).all<{ id: number; nome: string }>();
      for (const p of responsaveis.results || []) {
        bases.push({
          conversa: "CORRESPONDENCIA",
          professor_id: p.id,
          aluno_id: 0,
          destino: "SECRETARIA",
          contatoTipo: "RESPONSAVEL",
          contatoNome: p.nome,
          contatoSubtitulo: "Responsável",
        });
      }
    } else {
      // Diretoria (DIRETOR/COORDENADOR/GESTOR/ADMIN): um fio por professor
      // + a correspondência dos responsáveis com o próprio cargo
      const professores = await c.env.DB.prepare(
        "SELECT id, nome FROM usuarios WHERE role = 'PROFESSOR' ORDER BY nome"
      ).all<{ id: number; nome: string }>();
      for (const p of professores.results || []) {
        bases.push({
          conversa: "DIRETORIA",
          professor_id: p.id,
          aluno_id: 0,
          destino: "",
          contatoTipo: "PROFESSOR",
          contatoNome: p.nome,
          contatoSubtitulo: "Canal com a diretoria",
        });
      }

      // Cada cargo abre a própria correspondência (admin acompanha a da diretoria)
      const meuDestino =
        role === "COORDENADOR" ? "COORDENADOR" : role === "GESTOR" ? "GESTOR" : "DIRETOR";
      const responsaveis = await c.env.DB.prepare(
        "SELECT id, nome FROM usuarios WHERE role = 'RESPONSAVEL' ORDER BY nome"
      ).all<{ id: number; nome: string }>();
      for (const p of responsaveis.results || []) {
        bases.push({
          conversa: "CORRESPONDENCIA",
          professor_id: p.id,
          aluno_id: 0,
          destino: meuDestino,
          contatoTipo: "RESPONSAVEL",
          contatoNome: p.nome,
          contatoSubtitulo: "Responsável",
        });
      }
    }

    // Última mensagem e contagem de não lidas por fio (depois filtramos os meus)
    const ultimos = await c.env.DB.prepare(
      `SELECT conversa, professor_id, aluno_id, destino, MAX(id) AS ultimo_id
       FROM chat_mensagens GROUP BY conversa, professor_id, aluno_id, destino`
    ).all<{
      conversa: string;
      professor_id: number;
      aluno_id: number;
      destino: string;
      ultimo_id: number;
    }>();

    const lidas = await c.env.DB.prepare(
      `SELECT m.conversa, m.professor_id, m.aluno_id, m.destino, COUNT(*) AS n
       FROM chat_mensagens m
       LEFT JOIN chat_leituras l
         ON l.usuario_id = ? AND l.conversa = m.conversa
        AND l.professor_id = m.professor_id AND l.aluno_id = m.aluno_id
        AND l.destino = m.destino
       WHERE m.autor_id <> ? AND m.id > COALESCE(l.ultimo_lido_id, 0)
       GROUP BY m.conversa, m.professor_id, m.aluno_id, m.destino`
    )
      .bind(usuarioId, usuarioId)
      .all<{
        conversa: string;
        professor_id: number;
        aluno_id: number;
        destino: string;
        n: number;
      }>();

    const chave = (cv: string, pf: number, al: number, dest: string) =>
      `${cv}:${pf}:${al}:${dest}`;
    const mapaLidas = new Map(
      (lidas.results || []).map((l) => [
        chave(l.conversa, l.professor_id, l.aluno_id, l.destino),
        l.n,
      ])
    );
    const mapaUltimos = new Map(
      (ultimos.results || []).map((u) => [
        chave(u.conversa, u.professor_id, u.aluno_id, u.destino),
        u.ultimo_id,
      ])
    );

    // Detalhes (texto/hora/autoria) das últimas mensagens dos meus contatos
    const ids = Array.from(mapaUltimos.values());
    const detalhes = new Map<number, { texto: string; criado_em: string; autor_id: number }>();
    if (ids.length > 0) {
      const res = await c.env.DB.prepare(
        `SELECT id, texto, criado_em, autor_id FROM chat_mensagens
         WHERE id IN (${ids.map(() => "?").join(",")})`
      )
        .bind(...ids)
        .all<{ id: number; texto: string; criado_em: string; autor_id: number }>();
      for (const d of res.results || []) detalhes.set(d.id, d);
    }

    const conversas = bases.map((b) => {
      const k = chave(b.conversa, b.professor_id, b.aluno_id, b.destino);
      const ultimoId = mapaUltimos.get(k);
      const det = ultimoId ? detalhes.get(ultimoId) : undefined;
      return {
        conversa: b.conversa,
        professor_id: b.professor_id,
        aluno_id: b.aluno_id,
        destino: b.destino,
        contatoTipo: b.contatoTipo,
        contatoNome: b.contatoNome,
        contatoSubtitulo: b.contatoSubtitulo,
        naoLidas: mapaLidas.get(k) || 0,
        ultimaTexto: det?.texto ?? null,
        ultimaEm: det?.criado_em ?? null,
        ultimaMinha: det ? det.autor_id === usuarioId : false,
      };
    });

    return c.json({ eu: usuarioId, conversas }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao listar conversas do chat:", message);
    return c.json({ error: "Erro ao carregar as conversas", details: message }, 500);
  }
});

// Lista as mensagens de um fio. Sem ?desde= devolve as 100 mais recentes;
// com ?desde=<id> devolve só as posteriores (polling do chat). Ler marca
// o fio como lido (zera a bolinha de notificação).
app.get("/api/chat/mensagens", autenticar(CHAT_ROLES), async (c) => {
  try {
    const fio = fioValido({
      conversa: c.req.query("conversa"),
      professor_id: c.req.query("professor_id"),
      aluno_id: c.req.query("aluno_id"),
      destino: c.req.query("destino"),
    });
    if (!fio) {
      return c.json(
        { error: "Conversa inválida (informe conversa, professor_id, aluno_id e destino)." },
        400
      );
    }
    if (!(await podeUsarFio(c.env.DB, c.get("usuarioId"), c.get("usuarioRole"), fio))) {
      return c.json({ error: "Você não participa desta conversa." }, 403);
    }

    const desde = Number(c.req.query("desde") || "0") || 0;
    const filtro =
      " WHERE m.conversa = ? AND m.professor_id = ? AND m.aluno_id = ? AND m.destino = ?";

    let mensagens: ChatMensagem[] = [];
    if (desde > 0) {
      const res = await c.env.DB.prepare(
        SELECT_CHAT + filtro + " AND m.id > ? ORDER BY m.id ASC LIMIT 100"
      )
        .bind(fio.conversa, fio.professor_id, fio.aluno_id, fio.destino, desde)
        .all<ChatMensagem>();
      mensagens = res.results || [];
    } else {
      const res = await c.env.DB.prepare(
        SELECT_CHAT + filtro + " ORDER BY m.id DESC LIMIT 100"
      )
        .bind(fio.conversa, fio.professor_id, fio.aluno_id, fio.destino)
        .all<ChatMensagem>();
      mensagens = (res.results || []).slice().reverse();
    }

    await marcarFioComoLido(c.env.DB, c.get("usuarioId"), fio);
    return c.json({ mensagens, eu: c.get("usuarioId") });
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao listar mensagens do chat:", message);
    return c.json({ error: "Erro ao carregar as mensagens", details: message }, 500);
  }
});

// Envia uma mensagem para um fio em que o usuário participa
app.post("/api/chat/mensagens", autenticar(CHAT_ROLES), async (c) => {
  try {
    const { conversa, professor_id, aluno_id, destino, texto } = await c.req.json();
    const fio = fioValido({ conversa, professor_id, aluno_id, destino });
    if (!fio) {
      return c.json({ error: "Conversa inválida." }, 400);
    }
    if (!(await podeUsarFio(c.env.DB, c.get("usuarioId"), c.get("usuarioRole"), fio))) {
      return c.json({ error: "Você não participa desta conversa." }, 403);
    }

    const textoLimpo = typeof texto === "string" ? texto.trim() : "";
    if (!textoLimpo) {
      return c.json({ error: "Escreva uma mensagem antes de enviar." }, 400);
    }
    if (textoLimpo.length > 1000) {
      return c.json({ error: "Mensagem muito longa (máximo de 1000 caracteres)." }, 400);
    }

    const inserido = await c.env.DB.prepare(
      "INSERT INTO chat_mensagens (autor_id, texto, conversa, professor_id, aluno_id, destino) " +
        "VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(
        c.get("usuarioId"),
        textoLimpo,
        fio.conversa,
        fio.professor_id,
        fio.aluno_id,
        fio.destino
      )
      .run();

    const mensagem = await c.env.DB.prepare(SELECT_CHAT + " WHERE m.id = ?")
      .bind(inserido.meta.last_row_id)
      .first<ChatMensagem>();

    return c.json({ mensagem }, 201);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao enviar mensagem do chat:", message);
    return c.json({ error: "Erro ao enviar a mensagem", details: message }, 500);
  }
});

// ============================================================
// 4. ROTAS DO DASHBOARD DE DIRETORIA / REITORIA (/api/diretoria)
// ============================================================

app.get("/api/diretoria/dashboard", async (c) => {
  try {
    // Presentes: lado do aluno (ALUNO, VAN e RESPONSAVEL acompanando)
    // compartilham a contagem — é o aluno que entrou hoje, por qual porta vier.
    // Conta PESSOAS distintas: a mesma matrícula pode gerar vários registros
    // no dia (ida/saída, van + portaria) e o card mostra quem está de fato.
    const totalAlunos = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT pessoa_id) as total FROM registros_entrada 
       WHERE tipo <> 'PROFESSOR' AND DATE(data_hora) = DATE('now')`
    ).first<{ total: number }>();

    const totalProfessores = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT pessoa_id) as total FROM registros_entrada 
       WHERE tipo = 'PROFESSOR' AND DATE(data_hora) = DATE('now')`
    ).first<{ total: number }>();

    // Já fizeram check-out hoje (verificação de saída) — pessoas distintas
    const alunosCheckout = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT pessoa_id) as total FROM registros_entrada 
       WHERE movimento = 'CHECKOUT' AND tipo <> 'PROFESSOR' AND pessoa_id IS NOT NULL
         AND DATE(data_hora) = DATE('now')`
    ).first<{ total: number }>();

    const professoresCheckout = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT pessoa_id) as total FROM registros_entrada 
       WHERE movimento = 'CHECKOUT' AND tipo = 'PROFESSOR' AND pessoa_id IS NOT NULL
         AND DATE(data_hora) = DATE('now')`
    ).first<{ total: number }>();

    // Detalhe dos cards clicáveis: quem são as pessoas por trás de cada número.
    // Os alunos vêm com a série/turma (agrupados por turma na tela do detalhe).
    const listaAlunosPresentes = await c.env.DB.prepare(
      `SELECT COALESCE(a.nome, r.nome) as nome, COALESCE(a.serie, '') as serie,
              MIN(TIME(r.data_hora)) as hora
       FROM registros_entrada r
       LEFT JOIN alunos a ON a.id = r.pessoa_id
       WHERE r.tipo <> 'PROFESSOR' AND r.pessoa_id IS NOT NULL
         AND DATE(r.data_hora) = DATE('now')
       GROUP BY r.pessoa_id, COALESCE(a.nome, r.nome), COALESCE(a.serie, '')
       ORDER BY serie, nome`
    ).all();

    const listaAlunosCheckout = await c.env.DB.prepare(
      `SELECT COALESCE(a.nome, r.nome) as nome, COALESCE(a.serie, '') as serie,
              MAX(TIME(r.data_hora)) as hora
       FROM registros_entrada r
       LEFT JOIN alunos a ON a.id = r.pessoa_id
       WHERE r.tipo <> 'PROFESSOR' AND r.movimento = 'CHECKOUT'
         AND r.pessoa_id IS NOT NULL AND DATE(r.data_hora) = DATE('now')
       GROUP BY r.pessoa_id, COALESCE(a.nome, r.nome), COALESCE(a.serie, '')
       ORDER BY serie, nome`
    ).all();

    const listaProfessoresPresentes = await c.env.DB.prepare(
      `SELECT r.nome, MAX(r.detalhe) as materia, MIN(TIME(r.data_hora)) as hora
       FROM registros_entrada r
       WHERE r.tipo = 'PROFESSOR' AND r.pessoa_id IS NOT NULL
         AND DATE(r.data_hora) = DATE('now')
       GROUP BY r.pessoa_id, r.nome
       ORDER BY r.nome`
    ).all();

    const listaProfessoresCheckout = await c.env.DB.prepare(
      `SELECT r.nome, MAX(r.detalhe) as materia, MAX(TIME(r.data_hora)) as hora
       FROM registros_entrada r
       WHERE r.tipo = 'PROFESSOR' AND r.movimento = 'CHECKOUT'
         AND r.pessoa_id IS NOT NULL AND DATE(r.data_hora) = DATE('now')
       GROUP BY r.pessoa_id, r.nome
       ORDER BY r.nome`
    ).all();

    // Alunos por série/turma — agrupa pela série real do cadastro do aluno
    const alunosPorSerie = await c.env.DB.prepare(
      `SELECT CASE WHEN COALESCE(a.serie, '') = '' THEN 'Sem série' ELSE a.serie END as serie,
              COUNT(DISTINCT r.pessoa_id) as quantidade
       FROM registros_entrada r
       LEFT JOIN alunos a ON a.id = r.pessoa_id
       WHERE r.tipo <> 'PROFESSOR' AND DATE(r.data_hora) = DATE('now')
       GROUP BY CASE WHEN COALESCE(a.serie, '') = '' THEN 'Sem série' ELSE a.serie END
       ORDER BY quantidade DESC`
    ).all();

    const professoresPresentes = await c.env.DB.prepare(
      `SELECT nome, detalhe as materia, TIME(data_hora) as hora_entrada 
       FROM registros_entrada 
       WHERE tipo = 'PROFESSOR' AND DATE(data_hora) = DATE('now')
       ORDER BY data_hora DESC`
    ).all();

    const ultimosRegistros = await c.env.DB.prepare(
      `SELECT id, nome, tipo, detalhe, metodo_validacao, movimento, TIME(data_hora) as hora 
       FROM registros_entrada 
       WHERE DATE(data_hora) = DATE('now')
       ORDER BY id DESC LIMIT 20`
    ).all();

    return c.json({
      resumo: {
        totalAlunosHoje: totalAlunos?.total || 0,
        totalProfessoresHoje: totalProfessores?.total || 0,
        alunosCheckoutHoje: alunosCheckout?.total || 0,
        professoresCheckoutHoje: professoresCheckout?.total || 0,
      },
      alunosPorSerie: alunosPorSerie.results || [],
      professoresPresentes: professoresPresentes.results || [],
      ultimosRegistros: ultimosRegistros.results || [],
      // Detalhe por trás de cada card (nomes; alunos agrupados por turma)
      detalhes: {
        alunosPresentes: listaAlunosPresentes.results || [],
        alunosCheckout: listaAlunosCheckout.results || [],
        professoresPresentes: listaProfessoresPresentes.results || [],
        professoresCheckout: listaProfessoresCheckout.results || [],
      },
    }, 200);

  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao carregar dados da diretoria:", message);
    return c.json({ error: "Erro ao carregar dashboard de diretoria", details: message }, 500);
  }
});

// ============================================================
// 5. ROTAS DE VERIFICAÇÃO E PRÉ-CADASTRO
// ============================================================

// Listar candidatos ao reconhecimento (fotos e dados para comparação facial no navegador)
app.get("/api/verificar/candidatos", async (c) => {
  try {
    const candidatos = await c.env.DB.prepare(
      `
      SELECT 
        a.id,
        a.nome,
        a.matricula,
        a.status,
        a.foto_base64 as foto_aluno,
        r1.nome as pai_nome,
        r1.foto_base64 as foto_pai,
        r2.nome as mae_nome,
        r2.foto_base64 as foto_mae,
        r3.nome as terceiro_nome,
        r3.foto_base64 as foto_terceiro
      FROM alunos a
      LEFT JOIN responsaveis r1 ON a.responsavel_id = r1.id
      LEFT JOIN responsaveis r2 ON a.responsavel2_id = r2.id
      LEFT JOIN responsaveis r3 ON a.responsavel3_id = r3.id
      ORDER BY a.id DESC
    `
    ).all();

    // Professores com foto cadastrada no painel deles também passam pelo
    // reconhecimento da portaria (saem marcados como eh_professor).
    const profs = await c.env.DB.prepare(
      "SELECT id, nome, materia, foto FROM professores WHERE foto IS NOT NULL ORDER BY id DESC"
    ).all<{ id: number; nome: string; materia: string; foto: string }>();

    const lista = [
      ...(candidatos.results || []),
      ...(profs.results || []).map((p) => ({
        id: p.id,
        nome: p.nome,
        matricula: "",
        status: "",
        foto_aluno: null,
        pai_nome: null,
        foto_pai: null,
        mae_nome: null,
        foto_mae: null,
        terceiro_nome: null,
        foto_terceiro: null,
        foto_professor: p.foto,
        materia: p.materia,
        eh_professor: true,
      })),
    ];

    return c.json(lista, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao buscar candidatos:", message);
    return c.json({ error: "Erro ao listar candidatos", details: message }, 500);
  }
});

// Verificar foto/biometria facial
app.post("/api/verificar", async (c) => {
  try {
    const { foto } = await c.req.json();
    if (!foto) return c.json({ error: "Foto obrigatória" }, 400);

    const aluno = await c.env.DB.prepare(
      `
      SELECT 
        alunos.id,
        alunos.nome as alunoNome, 
        alunos.matricula, 
        alunos.cpf as cpfAluno,
        alunos.status,
        r1.nome as nome_responsavel,
        r1.cpf as cpfResponsavel,
        r2.nome as nome_responsavel2,
        r2.cpf as cpfResponsavel2,
        r3.nome as nome_responsavel3,
        r3.cpf as cpfResponsavel3
      FROM alunos 
      LEFT JOIN responsaveis r1 ON alunos.responsavel_id = r1.id
      LEFT JOIN responsaveis r2 ON alunos.responsavel2_id = r2.id
      LEFT JOIN responsaveis r3 ON alunos.responsavel3_id = r3.id
      WHERE alunos.foto_base64 = ? OR r1.foto_base64 = ? OR r2.foto_base64 = ? OR r3.foto_base64 = ?
    `
    )
      .bind(foto, foto, foto, foto)
      .first();

    if (!aluno) return c.json({ error: "Cadastro não identificado" }, 404);

    return c.json(aluno, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota /api/verificar:", message);
    return c.json({ error: "Erro interno", details: message }, 500);
  }
});

// ============================================================
// HUB DA TELA DE CADASTRO — cartões dos alunos já cadastrados
// ============================================================

// Lista os alunos em cartões para o hub da tela de cadastro.
// RESPONSAVEL vê apenas os próprios filhos; SECRETARIA/ADMIN veem
// todos (permite que a secretaria edite os dados dos pais pelo card).
app.get(
  "/api/cadastro/filhos",
  autenticar(["RESPONSAVEL", "SECRETARIA", "ADMIN"]),
  async (c) => {
    try {
      const usuarioId = c.get("usuarioId");
      const usuarioRole = c.get("usuarioRole");

      const sqlBase = `
        SELECT a.id, a.nome, a.matricula, a.foto_base64,
               r1.nome AS pai, r2.nome AS mae,
               r1.id AS pai_id, r2.id AS mae_id,
               r1.telefone AS pai_telefone, r2.telefone AS mae_telefone,
               r1.foto_base64 AS pai_foto, r2.foto_base64 AS mae_foto
        FROM alunos a
        LEFT JOIN responsaveis r1 ON r1.id = a.responsavel_id
        LEFT JOIN responsaveis r2 ON r2.id = a.responsavel2_id`;

      type LinhaFilho = {
        id: number;
        nome: string;
        matricula: string;
        foto_base64: string | null;
        pai: string | null;
        mae: string | null;
        pai_id: number | null;
        mae_id: number | null;
        pai_telefone: string | null;
        mae_telefone: string | null;
        pai_foto: string | null;
        mae_foto: string | null;
      };

      const ehEquipe = usuarioRole === "SECRETARIA" || usuarioRole === "ADMIN";
      const filhos = ehEquipe
        ? await c.env.DB.prepare(sqlBase + " ORDER BY a.nome").all<LinhaFilho>()
        : await c.env.DB.prepare(
            sqlBase +
              ` WHERE r1.id IN (SELECT responsavel_id FROM responsavel_usuario WHERE usuario_id = ?)
                 OR r2.id IN (SELECT responsavel_id FROM responsavel_usuario WHERE usuario_id = ?)
                 OR r1.cpf IN (SELECT cpf FROM seguranca_usuario WHERE usuario_id = ?)
                 OR r2.cpf IN (SELECT cpf FROM seguranca_usuario WHERE usuario_id = ?)
              ORDER BY a.nome`
          )
            .bind(usuarioId, usuarioId, usuarioId, usuarioId)
            .all<LinhaFilho>();

      return c.json({ filhos: filhos.results || [] }, 200);
    } catch (e: unknown) {
      const message = getErrorMessage(e);
      console.error("Erro na rota GET /api/cadastro/filhos:", message);
      return c.json({ error: "Erro ao carregar os alunos", details: message }, 500);
    }
  }
);

// Edição dos dados do pai e da mãe pelo card do hub (pais vinculados,
// secretaria ou admin). Cada alteração gera um e-mail avisando os
// responsáveis do aluno.
app.put(
  "/api/cadastro/responsaveis",
  autenticar(["RESPONSAVEL", "SECRETARIA", "ADMIN"]),
  async (c) => {
    try {
      const usuarioId = c.get("usuarioId");
      const usuarioRole = c.get("usuarioRole");
      const body = await c.req.json();
      const alunoId = Number(body.aluno_id);

      if (!alunoId) {
        return c.json({ error: "Informe o aluno." }, 400);
      }

      const aluno = await c.env.DB.prepare(
        "SELECT id, nome, responsavel_id, responsavel2_id FROM alunos WHERE id = ?"
      )
        .bind(alunoId)
        .first<{
          id: number;
          nome: string;
          responsavel_id: number | null;
          responsavel2_id: number | null;
        }>();
      if (!aluno) {
        return c.json({ error: "Aluno não encontrado." }, 404);
      }

      // RESPONSAVEL só pode editar os pais dos próprios filhos
      if (usuarioRole === "RESPONSAVEL") {
        const permitido = await c.env.DB.prepare(
          `SELECT 1 FROM responsaveis r
           WHERE r.id IN (?, ?)
             AND ( r.id IN (SELECT responsavel_id FROM responsavel_usuario WHERE usuario_id = ?)
                OR r.cpf IN (SELECT cpf FROM seguranca_usuario WHERE usuario_id = ?) )
           LIMIT 1`
        )
          .bind(aluno.responsavel_id || -1, aluno.responsavel2_id || -1, usuarioId, usuarioId)
          .first();
        if (!permitido) {
          return c.json({ error: "Você não pode editar os dados deste aluno." }, 403);
        }
      }

      const alteracoes: string[] = [];

      // Aplica as mudanças de um dos lados. Retorna mensagem de erro ou
      // null quando tudo ok. O SLOT é resolvido pelo id no banco (e não
      // pela chave "pai"/"mae" do payload): depois de uma remoção, o 2º
      // responsável é promovido ao slot 1 e a tela, com o modal ainda
      // aberto, continua mandando a chave antiga — confiar nela faria a
      // edição ser descartada em silêncio.
      const processarAlvo = async (dados: unknown): Promise<string | null> => {
        if (!dados || typeof dados !== "object") return null;
        const campos = dados as Record<string, unknown>;
        const responsavelId = Number(campos.id) || 0;
        if (!responsavelId) return null;

        // Estado relido do banco: uma remoção no mesmo request já mudou
        // os slots (e protege contra tirar os dois de uma vez)
        const estado = await c.env.DB.prepare(
          "SELECT responsavel_id, responsavel2_id FROM alunos WHERE id = ?"
        )
          .bind(aluno.id)
          .first<{ responsavel_id: number | null; responsavel2_id: number | null }>();
        if (!estado) return "Aluno não encontrado.";

        const slot: "pai" | "mae" | null =
          estado.responsavel_id === responsavelId
            ? "pai"
            : estado.responsavel2_id === responsavelId
              ? "mae"
              : null;
        if (!slot) {
          return "O responsável enviado não está vinculado a este aluno.";
        }

        const rotulo = slot === "pai" ? "Responsável" : "2º Responsável";

        // Remoção pedida no modal (🗑): desvincula o responsável deste aluno.
        if (campos.remover === true) {
          const outroAgora =
            slot === "pai" ? estado.responsavel2_id : estado.responsavel_id;
          if (!outroAgora) {
            return "O aluno precisa manter ao menos um responsável.";
          }

          const removido = await c.env.DB.prepare(
            "SELECT id, nome FROM responsaveis WHERE id = ?"
          )
            .bind(responsavelId)
            .first<{ id: number; nome: string }>();
          if (!removido) return null;

          if (slot === "pai") {
            // O 2º responsável assume a vaga principal (mesmo critério
            // do pré-cadastro quando só existe um)
            await c.env.DB.prepare(
              "UPDATE alunos SET responsavel_id = responsavel2_id, responsavel2_id = NULL WHERE id = ?"
            )
              .bind(aluno.id)
              .run();
          } else {
            await c.env.DB.prepare(
              "UPDATE alunos SET responsavel2_id = NULL WHERE id = ?"
            )
              .bind(aluno.id)
              .run();
          }

          // Apaga o cadastro do responsável só quando nenhum outro aluno
          // (nem o 3º responsável) usar essa mesma pessoa
          const aindaUsado = await c.env.DB.prepare(
            `SELECT 1 FROM alunos
              WHERE responsavel_id = ? OR responsavel2_id = ? OR responsavel3_id = ?
              LIMIT 1`
          )
            .bind(responsavelId, responsavelId, responsavelId)
            .first();
          if (!aindaUsado) {
            await c.env.DB.prepare("DELETE FROM responsaveis WHERE id = ?")
              .bind(responsavelId)
              .run();
          }

          alteracoes.push(`Removido ${rotulo}: "${removido.nome}"`);
          return null;
        }

        const atual = await c.env.DB.prepare(
          "SELECT id, nome, telefone FROM responsaveis WHERE id = ?"
        )
          .bind(responsavelId)
          .first<{ id: number; nome: string; telefone: string | null }>();
        if (!atual) return null;

        const nomeNovo = String(campos.nome ?? "").trim();
        if (!nomeNovo) {
          return `O nome do ${rotulo.toLowerCase()} é obrigatório.`;
        }
        if (nomeNovo.length > 120) {
          return `O nome do ${rotulo.toLowerCase()} pode ter no máximo 120 caracteres.`;
        }
        const telNovo = String(campos.telefone ?? "").trim();
        if (telNovo.length > 30) {
          return `O telefone do ${rotulo.toLowerCase()} pode ter no máximo 30 caracteres.`;
        }

        let fotoNova: string | null = null;
        if (typeof campos.foto === "string" && campos.foto.length > 0) {
          if (!campos.foto.startsWith("data:image/")) {
            return "Foto inválida (envie uma imagem).";
          }
          if (campos.foto.length > 4000000) {
            return "Foto muito grande (máximo de ~3 MB).";
          }
          fotoNova = campos.foto;
        }

        const mudouNome = nomeNovo !== atual.nome;
        const mudouTelefone = telNovo !== (atual.telefone || "");

        if (mudouNome || mudouTelefone) {
          await c.env.DB.prepare(
            "UPDATE responsaveis SET nome = ?, telefone = ? WHERE id = ?"
          )
            .bind(nomeNovo, telNovo, responsavelId)
            .run();
        }
        if (mudouNome) {
          alteracoes.push(`Nome do ${rotulo.toLowerCase()}: "${atual.nome}" → "${nomeNovo}"`);
        }
        if (mudouTelefone) {
          alteracoes.push(
            `Telefone do ${rotulo.toLowerCase()}: "${atual.telefone || "não informado"}" → ` +
              `"${telNovo || "não informado"}"`
          );
        }

        if (fotoNova !== null) {
          await c.env.DB.prepare(
            "UPDATE responsaveis SET foto_base64 = ? WHERE id = ?"
          )
            .bind(fotoNova, responsavelId)
            .run();
          alteracoes.push(`Foto do ${rotulo.toLowerCase()} atualizada`);
        }

        return null;
      };

      const erroPai = await processarAlvo(body.pai);
      if (erroPai) return c.json({ error: erroPai }, 400);
      const erroMae = await processarAlvo(body.mae);
      if (erroMae) return c.json({ error: erroMae }, 400);

      if (alteracoes.length === 0) {
        return c.json(
          { success: true, alterado: false, message: "Nenhuma alteração para salvar." },
          200
        );
      }

      // Quem fez a edição (entra no corpo do e-mail de aviso)
      const editor = await c.env.DB.prepare("SELECT nome FROM usuarios WHERE id = ?")
        .bind(usuarioId)
        .first<{ nome: string }>();
      const nomeEditor = editor ? editor.nome : "Equipe da escola";

      await notificar(
        c.env,
        await emailsResponsavelAluno(c.env.DB, alunoId),
        `Dados do responsável atualizados — ${aluno.nome}`,
        emailDadosResponsavelAlterado(aluno.nome, nomeEditor, alteracoes)
      );

      return c.json(
        {
          success: true,
          alterado: true,
          message: "Dados atualizados! Os responsáveis foram avisados por e-mail.",
          alteracoes,
        },
        200
      );
    } catch (e: unknown) {
      const message = getErrorMessage(e);
      console.error("Erro na rota PUT /api/cadastro/responsaveis:", message);
      return c.json({ error: "Erro ao editar os responsáveis", details: message }, 500);
    }
  }
);

// Pré-cadastro completo (Aluno + Responsável + Biometria)
app.post("/api/cadastro", async (c) => {
  try {
    const body = await c.req.json();

    // Conta logada que está fazendo o pré-cadastro — vincula o pai/mãe
    // à conta, para o painel deles encontrarem os filhos depois.
    const usuarioId = Number(body.usuario_id) || 0;

    const nome = body.nome;
    const matricula = body.matricula;
    // 1º responsável (bloco removível — só um é obrigatório)
    const responsavelNome =
      typeof body.responsavelNome === "string" ? body.responsavelNome.trim() : "";
    const fotoResponsavel = body.fotoResponsavel || "";
    // 2º responsável (opcional — pode ficar em branco)
    const responsavel2Nome =
      typeof body.responsavel2Nome === "string" ? body.responsavel2Nome.trim() : "";
    const fotoResponsavel2 = body.fotoResponsavel2 || "";
    const fotoAluno = body.fotoAluno || body.foto || "";
    const status = body.status || "PENDENTE_VALIDACAO";
    // Série/turma do aluno em um campo só (ex.: "6º Ano A") — alimenta o
    // detalhe por turma nos cards clicáveis da diretoria.
    const serie = typeof body.serie === "string" ? body.serie.trim().slice(0, 40) : "";

    if (!nome || !matricula) {
      return c.json({ error: "Dados incompletos (aluno)." }, 400);
    }
    if (!responsavelNome && !responsavel2Nome) {
      return c.json({ error: "Informe ao menos um responsável." }, 400);
    }

    // Sem o 1º responsável, o 2º assume a vaga de principal: o aluno
    // fica sempre com um responsável no slot 1 (responsavel_id).
    const soTemSegundo = !responsavelNome && Boolean(responsavel2Nome);
    const nomeResp1 = soTemSegundo ? responsavel2Nome : responsavelNome;
    const cpfResp1Input = soTemSegundo ? body.cpf2 : body.cpf;
    const fotoResp1 = soTemSegundo ? fotoResponsavel2 : fotoResponsavel;
    const nomeResp2 = soTemSegundo ? "" : responsavel2Nome;
    const cpfResp2Input = soTemSegundo ? "" : body.cpf2;
    const fotoResp2 = soTemSegundo ? "" : fotoResponsavel2;

    // Sanitização e validação dos CPFs (só quando o responsável foi informado)
    const respCpfVal = limparEValidarCPF(cpfResp1Input);
    if (respCpfVal.error) {
      return c.json({ error: `CPF do responsável inválido: ${respCpfVal.error}` }, 400);
    }

    const resp2CpfVal = limparEValidarCPF(cpfResp2Input);
    if (resp2CpfVal.error) {
      return c.json({ error: `CPF do 2º responsável inválido: ${resp2CpfVal.error}` }, 400);
    }

    // Cada responsável informado precisa de CPF (a tabela é UNIQUE NOT NULL
    // e sem isso dois cadastros concorreriam pelo mesmo "" vazio).
    if (!respCpfVal.cpf) {
      return c.json({ error: "Informe o CPF do responsável." }, 400);
    }
    if (nomeResp2 && !resp2CpfVal.cpf) {
      return c.json({ error: "Informe o CPF do 2º responsável." }, 400);
    }

    const alunoCpfVal = limparEValidarCPF(body.cpfAluno);
    if (alunoCpfVal.error) {
      return c.json({ error: `CPF do aluno inválido: ${alunoCpfVal.error}` }, 400);
    }

    const cpfResponsavel = respCpfVal.cpf;
    const cpfResponsavel2 = resp2CpfVal.cpf;
    const cpfAluno = alunoCpfVal.cpf;

    if (cpfResponsavel && cpfResponsavel === cpfResponsavel2) {
      return c.json({ error: "Os CPFs dos responsáveis devem ser diferentes." }, 400);
    }

    // Verificar duplicidade de responsável por CPF (somente se informado)
    if (cpfResponsavel) {
      const responsavelExistente = await c.env.DB.prepare(
        "SELECT id FROM responsaveis WHERE cpf = ?"
      )
        .bind(cpfResponsavel)
        .first();

      if (responsavelExistente) {
        return c.json({ error: "CPF do responsável já está cadastrado — este aluno já foi pré-cadastrado." }, 409);
      }
    }

    // Verificar duplicidade do 2º responsável por CPF
    if (cpfResponsavel2) {
      const responsavel2Existente = await c.env.DB.prepare(
        "SELECT id FROM responsaveis WHERE cpf = ?"
      )
        .bind(cpfResponsavel2)
        .first();

      if (responsavel2Existente) {
        return c.json({ error: "CPF do 2º responsável já está cadastrado — este aluno já foi pré-cadastrado." }, 409);
      }
    }

    // Verificar duplicidade de matrícula
    const matriculaExistente = await c.env.DB.prepare(
      "SELECT id FROM alunos WHERE matricula = ?"
    )
      .bind(matricula)
      .first();

    if (matriculaExistente) {
      return c.json({ error: "Matrícula já está cadastrada no sistema." }, 409);
    }

    // Verificar duplicidade do CPF do aluno ANTES de inserir os responsáveis
    // (evita deixar pai/mãe órfãos quando o aluno já existe)
    if (cpfAluno) {
      const alunoCpfExistente = await c.env.DB.prepare(
        "SELECT id FROM alunos WHERE cpf = ?"
      )
        .bind(cpfAluno)
        .first();

      if (alunoCpfExistente) {
        return c.json({ error: "CPF do aluno já está cadastrado no sistema." }, 409);
      }
    }

    // 1. Inserir o 1º responsável (obrigatório) — CPF limpo, sem formatação
    const resResp = await c.env.DB.prepare(
      "INSERT INTO responsaveis (nome, cpf, foto_base64) VALUES (?, ?, ?)"
    )
      .bind(nomeResp1, cpfResponsavel, fotoResp1)
      .run();

    const idResponsavel = resResp.meta.last_row_id;

    // 2. Inserir o 2º responsável somente quando informado
    let idResponsavel2: number | null = null;
    if (nomeResp2) {
      const resResp2 = await c.env.DB.prepare(
        "INSERT INTO responsaveis (nome, cpf, foto_base64) VALUES (?, ?, ?)"
      )
        .bind(nomeResp2, cpfResponsavel2, fotoResp2)
        .run();

      idResponsavel2 = resResp2.meta.last_row_id;
    }

    // 3. Inserir o Aluno com os dois responsáveis (CPFs limpos)
    await c.env.DB.prepare(
      "INSERT INTO alunos (nome, matricula, cpf, serie, responsavel_id, responsavel2_id, foto_base64, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(nome, matricula, cpfAluno, serie, idResponsavel, idResponsavel2, fotoAluno, status)
      .run();

    // 4. Vincula a conta logada aos responsaveis criados — é esse vínculo
    //    que permite ao responsável ver os filhos no painel de notas.
    if (usuarioId) {
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO responsavel_usuario (responsavel_id, usuario_id) VALUES (?, ?)"
      )
        .bind(idResponsavel, usuarioId)
        .run();
      if (idResponsavel2) {
        await c.env.DB.prepare(
          "INSERT OR IGNORE INTO responsavel_usuario (responsavel_id, usuario_id) VALUES (?, ?)"
        )
          .bind(idResponsavel2, usuarioId)
          .run();
      }
    }

    // Confirmação por e-mail para a conta que fez o pré-cadastro
    if (usuarioId) {
      const conta = await c.env.DB.prepare("SELECT nome, email FROM usuarios WHERE id = ?")
        .bind(usuarioId)
        .first<{ nome: string; email: string }>();
      if (conta) {
        await notificar(
          c.env,
          [conta.email],
          `Pré-cadastro de ${nome} enviado`,
          emailPreCadastro(String(nome), String(matricula))
        );
      }
    }

    return c.json(
      {
        success: true,
        message: "Pré-cadastro enviado para validação na Portaria!",
      },
      201
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota /api/cadastro:", message);

    if (message.includes("UNIQUE constraint failed")) {
      return c.json({ error: "Dados já cadastrados (CPF ou matrícula duplicada)." }, 409);
    }

    return c.json({ error: "Erro ao cadastrar", details: message }, 500);
  }
});

// ============================================================
// 5. PROFESSOR — NOTAS E ACOMPANHAMENTO
// ============================================================

// Agrega notas e acompanhamentos a uma lista de alunos.
// Compartilhado pelas telas de professor e do responsável.
const agregarLayoutAlunos = async (
  db: D1Database,
  alunos: Array<{ id: number; nome: string; matricula: string; foto_base64: string | null }>
) => {
  const notas = await db
    .prepare("SELECT aluno_id, materia, bimestre, nota FROM notas")
    .all<{ aluno_id: number; materia: string; bimestre: number; nota: number }>();

  const acompanhamentos = await db
    .prepare(
      `SELECT ac.id, ac.aluno_id, ac.papel, ac.texto, ac.atestado_base64, ac.atestado_nome,
              ac.criado_em, u.nome AS autor_nome
       FROM acompanhamentos ac
       JOIN usuarios u ON u.id = ac.autor_id
       ORDER BY ac.criado_em DESC, ac.id DESC`
    )
    .all<{
      id: number;
      aluno_id: number;
      papel: string;
      texto: string;
      atestado_base64: string | null;
      atestado_nome: string | null;
      criado_em: string;
      autor_nome: string;
    }>();

  return alunos.map((aluno) => ({
    ...aluno,
    notas: (notas.results || []).filter((n) => n.aluno_id === aluno.id),
    acompanhamentos: (acompanhamentos.results || []).filter(
      (a) => a.aluno_id === aluno.id
    ),
  }));
};

// Grade escolar (catálogo de matérias) em ordem de exibição — alimenta o
// lançamento do professor e a grade de notas do responsável.
const gradeEscolar = async (db: D1Database): Promise<string[]> => {
  const res = await db
    .prepare("SELECT nome FROM materias ORDER BY ordem, nome")
    .all<{ nome: string }>();
  return (res.results || []).map((m) => m.nome);
};

// Base da tela do professor: todos os alunos com notas e acompanhamentos
// ============================================================
// RECONHECIMENTO FACIAL DO PROFESSOR (foto + matéria)
// ============================================================
// O professor cadastra a própria foto no painel dele; a partir daí a
// portaria o reconhece junto dos alunos (identificado como PROFESSOR).
app.get("/api/professor/reconhecimento", async (c) => {
  try {
    const linha = await c.env.DB.prepare(
      "SELECT foto, materia FROM professores WHERE usuario_id = ?"
    )
      .bind(c.get("usuarioId"))
      .first<{ foto: string | null; materia: string }>();

    return c.json({
      foto: linha?.foto ?? null,
      materia: linha?.materia ?? null,
    });
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao carregar reconhecimento do professor:", message);
    return c.json(
      { error: "Erro ao carregar o cadastro de reconhecimento", details: message },
      500
    );
  }
});

app.patch("/api/professor/reconhecimento", async (c) => {
  try {
    const { foto, materia } = await c.req.json();
    const fotoLimpa = typeof foto === "string" ? foto.trim() : "";
    const materiaLimpa = typeof materia === "string" ? materia.trim() : "";

    if (!fotoLimpa) {
      return c.json({ error: "Capture ou envie uma foto para o reconhecimento." }, 400);
    }
    if (!materiaLimpa) {
      return c.json({ error: "Informe a matéria que você ministra." }, 400);
    }

    const usuarioId = c.get("usuarioId");

    const atualizado = await c.env.DB.prepare(
      "UPDATE professores SET foto = ?, materia = ? WHERE usuario_id = ?"
    )
      .bind(fotoLimpa, materiaLimpa, usuarioId)
      .run();

    if (atualizado.meta.changes === 0) {
      // Primeira foto do professor: cria a linha dele em `professores`
      const inserido = await c.env.DB.prepare(
        "INSERT INTO professores (usuario_id, nome, materia, foto) " +
          "SELECT id, nome, ?, ? FROM usuarios WHERE id = ? AND role = 'PROFESSOR'"
      )
        .bind(materiaLimpa, fotoLimpa, usuarioId)
        .run();
      if (inserido.meta.changes === 0) {
        return c.json(
          { error: "Esta conta não é de professor — cadastro de foto indisponível." },
          400
        );
      }
    }

    return c.json({ success: true, foto: fotoLimpa, materia: materiaLimpa });
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao salvar reconhecimento do professor:", message);
    return c.json({ error: "Erro ao salvar a foto", details: message }, 500);
  }
});

app.get("/api/professor/alunos", async (c) => {
  try {
    const alunos = await c.env.DB.prepare(
      "SELECT id, nome, matricula, foto_base64 FROM alunos ORDER BY nome"
    ).all<{ id: number; nome: string; matricula: string; foto_base64: string | null }>();

    const detalhes = await agregarLayoutAlunos(c.env.DB, alunos.results || []);
    return c.json({ alunos: detalhes, materias: await gradeEscolar(c.env.DB) }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota GET /api/professor/alunos:", message);
    return c.json({ error: "Erro ao carregar alunos", details: message }, 500);
  }
});

// Lança (ou corrige) a nota do aluno no bimestre selecionado — upsert
app.put("/api/professor/notas", async (c) => {
  try {
    const { aluno_id, bimestre, materia, nota } = await c.req.json();

    const bimestreNum = Number(bimestre);
    const notaNum = Number(String(nota).replace(",", "."));
    const materiaNome = typeof materia === "string" ? materia.trim() : "";

    if (!aluno_id) {
      return c.json({ error: "Informe o aluno." }, 400);
    }
    if (![1, 2, 3, 4].includes(bimestreNum)) {
      return c.json({ error: "Bimestre inválido (informe 1 a 4)." }, 400);
    }
    if (!materiaNome) {
      return c.json({ error: "Informe a matéria." }, 400);
    }
    if (
      String(nota).trim() === "" ||
      Number.isNaN(notaNum) ||
      notaNum < 0 ||
      notaNum > 10
    ) {
      return c.json({ error: "A nota deve estar entre 0 e 10." }, 400);
    }

    // A matéria precisa fazer parte da grade escolar (catálogo de materias)
    const naGrade = await c.env.DB.prepare("SELECT id FROM materias WHERE nome = ?")
      .bind(materiaNome)
      .first<{ id: number }>();
    if (!naGrade) {
      return c.json({ error: "Matéria fora da grade escolar." }, 400);
    }

    const notaAnterior = await c.env.DB.prepare(
      "SELECT nota FROM notas WHERE aluno_id = ? AND bimestre = ? AND materia = ?"
    )
      .bind(aluno_id, bimestreNum, materiaNome)
      .first<{ nota: number }>();

    const aluno = await c.env.DB.prepare("SELECT id, nome FROM alunos WHERE id = ?")
      .bind(aluno_id)
      .first<{ id: number; nome: string }>();
    if (!aluno) {
      return c.json({ error: "Aluno não encontrado." }, 404);
    }

    await c.env.DB.prepare(
      `INSERT INTO notas (aluno_id, materia, bimestre, nota, professor_id, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(aluno_id, bimestre, materia) DO UPDATE SET
         nota = excluded.nota,
         professor_id = excluded.professor_id,
         atualizado_em = datetime('now')`
    )
      .bind(aluno_id, materiaNome, bimestreNum, notaNum, c.get("usuarioId"))
      .run();

    // Avisa o responsável: só quando nasce uma nota ou o valor muda — no
    // auto-save do professor o PUT pode reenviar o mesmo valor e não vale
    // a pena encher a caixa de entrada de e-mails iguais.
    const notaTexto = String(notaNum).replace(".", ",");
    const anteriorOk = notaAnterior !== null && notaAnterior !== undefined;
    const mudou = anteriorOk && Number(notaAnterior.nota) !== notaNum;
    if (!anteriorOk || mudou) {
      const destinosNota = await emailsResponsavelAluno(c.env.DB, aluno_id);
      await notificar(
        c.env,
        destinosNota,
        mudou
          ? `Nota corrigida: ${aluno.nome} — ${bimestreNum}º bimestre · ${materiaNome}`
          : `Nova nota: ${aluno.nome} — ${bimestreNum}º bimestre · ${materiaNome}`,
        emailNota(
          aluno.nome,
          bimestreNum,
          materiaNome,
          notaTexto,
          mudou ? String(notaAnterior.nota).replace(".", ",") : null
        )
      );
    }

    return c.json({ success: true, message: "Nota salva!" }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota PUT /api/professor/notas:", message);
    return c.json({ error: "Erro ao salvar a nota", details: message }, 500);
  }
});

// Registra acompanhamento do professor sobre o aluno
app.post("/api/professor/acompanhamentos", async (c) => {
  try {
    const { aluno_id, texto } = await c.req.json();
    const textoLimpo = String(texto || "").trim();

    if (!aluno_id || !textoLimpo) {
      return c.json({ error: "Aluno e texto são obrigatórios." }, 400);
    }
    if (textoLimpo.length > 500) {
      return c.json({ error: "O texto pode ter no máximo 500 caracteres." }, 400);
    }

    const autor = await c.env.DB.prepare("SELECT nome FROM usuarios WHERE id = ?")
      .bind(c.get("usuarioId"))
      .first<{ nome: string }>();

    const aluno = await c.env.DB.prepare("SELECT id, nome FROM alunos WHERE id = ?")
      .bind(aluno_id)
      .first<{ id: number; nome: string }>();
    if (!aluno) {
      return c.json({ error: "Aluno não encontrado." }, 404);
    }

    await c.env.DB.prepare(
      "INSERT INTO acompanhamentos (aluno_id, autor_id, papel, texto, criado_em) VALUES (?, ?, ?, ?, datetime('now'))"
    )
      .bind(aluno_id, c.get("usuarioId"), c.get("usuarioRole"), textoLimpo)
      .run();

    // Avisa pai e mãe: observação do professor sobre o filho
    await notificar(
      c.env,
      await emailsResponsavelAluno(c.env.DB, aluno_id),
      `Observação do professor sobre ${aluno.nome}`,
      emailAcompanhamentoResponsavel(
        aluno.nome,
        autor ? autor.nome : "Professor(a)",
        textoLimpo,
        `${urlAplicacao(c.env)}/painel`
      )
    );

    return c.json({ success: true, message: "Acompanhamento registrado!" }, 201);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota POST /api/professor/acompanhamentos:", message);
    return c.json({ error: "Erro ao registrar acompanhamento", details: message }, 500);
  }
});

// ============================================================
// ============================================================
// 5b. ALUNO — PRÓPRIAS NOTAS E MATÉRIAS (dashboard do cargo ALUNO)
// ============================================================

// Dashboard do aluno: ele vê apenas as próprias notas e as matérias
// (disciplinas) da escola. O aluno é identificado pelo vínculo
// `usuarios.aluno_id`, atribuído pelo admin.
app.get("/api/aluno/dashboard", async (c) => {
  try {
    const usuarioId = c.get("usuarioId");

    const vinculo = await c.env.DB.prepare(
      "SELECT aluno_id FROM usuarios WHERE id = ?"
    )
      .bind(usuarioId)
      .first<{ aluno_id: number | null }>();

    const alunoId = vinculo && vinculo.aluno_id ? Number(vinculo.aluno_id) : 0;
    if (!alunoId) {
      return c.json({ aluno: null, notas: [], materias: [] }, 200);
    }

    const aluno = await c.env.DB.prepare(
      "SELECT id, nome, matricula, foto_base64 FROM alunos WHERE id = ?"
    )
      .bind(alunoId)
      .first<{ id: number; nome: string; matricula: string; foto_base64: string | null }>();
    if (!aluno) {
      return c.json({ aluno: null, notas: [], materias: [] }, 200);
    }

    const notas = await c.env.DB.prepare(
      "SELECT materia, bimestre, nota FROM notas WHERE aluno_id = ? ORDER BY bimestre, materia"
    )
      .bind(alunoId)
      .all<{ materia: string; bimestre: number; nota: number }>();

    const materias = await c.env.DB.prepare(
      "SELECT nome, materia FROM professores ORDER BY materia, nome"
    ).all<{ nome: string; materia: string }>();

    return c.json(
      {
        aluno,
        notas: notas.results || [],
        materias: materias.results || [],
      },
      200
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota GET /api/aluno/dashboard:", message);
    return c.json({ error: "Erro ao carregar o dashboard do aluno", details: message }, 500);
  }
});

// 6. PAINEL DO RESPONSÁVEL (PAI/MÃE)
// ============================================================

// Filhos vinculados à conta logada, com notas e acompanhamentos
app.get("/api/painel/alunos", async (c) => {
  try {
    const usuarioId = c.get("usuarioId");

    // Vínculo feito no pré-cadastro (responsavel_usuario) + fallback por CPF
    const alunos = await c.env.DB.prepare(
      `SELECT DISTINCT a.id, a.nome, a.matricula, a.foto_base64
       FROM alunos a
       JOIN responsaveis r ON (a.responsavel_id = r.id OR a.responsavel2_id = r.id)
       WHERE r.id IN (SELECT responsavel_id FROM responsavel_usuario WHERE usuario_id = ?)
          OR r.cpf IN (SELECT cpf FROM seguranca_usuario WHERE usuario_id = ?)
       ORDER BY a.nome`
    )
      .bind(usuarioId, usuarioId)
      .all<{ id: number; nome: string; matricula: string; foto_base64: string | null }>();

    const detalhes = await agregarLayoutAlunos(c.env.DB, alunos.results || []);
    return c.json({ alunos: detalhes, materias: await gradeEscolar(c.env.DB) }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota GET /api/painel/alunos:", message);
    return c.json({ error: "Erro ao carregar seus filhos", details: message }, 500);
  }
});

// Filhos da conta logada em formato de cartão (nome, matrícula, foto,
// pai e mãe) — a tela de pré-cadastro usa para mostrar quem já existe
app.get("/api/painel/filhos", async (c) => {
  try {
    const usuarioId = c.get("usuarioId");

    const filhos = await c.env.DB.prepare(
      `SELECT DISTINCT a.id, a.nome, a.matricula, a.foto_base64,
              r1.nome AS pai, r2.nome AS mae
       FROM alunos a
       JOIN responsaveis rp ON (a.responsavel_id = rp.id OR a.responsavel2_id = rp.id)
       LEFT JOIN responsaveis r1 ON r1.id = a.responsavel_id
       LEFT JOIN responsaveis r2 ON r2.id = a.responsavel2_id
       WHERE rp.id IN (SELECT responsavel_id FROM responsavel_usuario WHERE usuario_id = ?)
          OR rp.cpf IN (SELECT cpf FROM seguranca_usuario WHERE usuario_id = ?)
       ORDER BY a.nome`
    )
      .bind(usuarioId, usuarioId)
      .all<{
        id: number;
        nome: string;
        matricula: string;
        foto_base64: string | null;
        pai: string | null;
        mae: string | null;
      }>();

    return c.json({ filhos: filhos.results || [] }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota GET /api/painel/filhos:", message);
    return c.json({ error: "Erro ao carregar seus filhos", details: message }, 500);
  }
});

// Adiciona um acompanhamento (ex.: filho doente) validando o vínculo familiar
app.post("/api/painel/acompanhamentos", async (c) => {
  try {
    const usuarioId = c.get("usuarioId");
    const { aluno_id, texto, atestado, atestado_nome } = await c.req.json();
    const textoLimpo = String(texto || "").trim();

    if (!aluno_id || !textoLimpo) {
      return c.json({ error: "Texto do acompanhamento é obrigatório." }, 400);
    }
    if (textoLimpo.length > 500) {
      return c.json({ error: "O texto pode ter no máximo 500 caracteres." }, 400);
    }

    // Atestado opcional: data URL de PDF/imagem, no máximo 2MB
    let atestadoDados: string | null = null;
    let atestadoArquivo: string | null = null;
    if (atestado) {
      const url = String(atestado);
      const tipoOk =
        /^data:(application\/pdf|image\/(jpeg|png|webp|gif));base64,[A-Za-z0-9+/]+={0,2}$/.test(
          url
        );
      if (!tipoOk) {
        return c.json(
          { error: "Atestado inválido: envie um PDF ou imagem (JPEG, PNG, WebP ou GIF)." },
          400
        );
      }
      if (url.length > 2_800_000) {
        return c.json({ error: "Atestado muito grande: o limite é 2MB." }, 400);
      }
      atestadoDados = url;
      atestadoArquivo = String(atestado_nome || "atestado").slice(0, 120);
    }

    // Só permite anotar em aluno vinculado à conta do responsável
    const filho = await c.env.DB.prepare(
      `SELECT a.id, a.nome
       FROM alunos a
       JOIN responsaveis r ON (a.responsavel_id = r.id OR a.responsavel2_id = r.id)
       WHERE a.id = ?
         AND (r.id IN (SELECT responsavel_id FROM responsavel_usuario WHERE usuario_id = ?)
              OR r.cpf IN (SELECT cpf FROM seguranca_usuario WHERE usuario_id = ?))`
    )
      .bind(aluno_id, usuarioId, usuarioId)
      .first<{ id: number; nome: string }>();

    if (!filho) {
      return c.json({ error: "Este aluno não está vinculado à sua conta." }, 403);
    }

    const autor = await c.env.DB.prepare("SELECT nome FROM usuarios WHERE id = ?")
      .bind(usuarioId)
      .first<{ nome: string }>();

    await c.env.DB.prepare(
      `INSERT INTO acompanhamentos
         (aluno_id, autor_id, papel, texto, atestado_base64, atestado_nome, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(aluno_id, usuarioId, c.get("usuarioRole"), textoLimpo, atestadoDados, atestadoArquivo)
      .run();

    // Avisa professores e diretoria: o responsável registrou um aviso
    await notificar(
      c.env,
      await emailsProfessoresEDiretoria(c.env.DB),
      `Aviso do responsável: ${filho.nome}`,
      emailAcompanhamentoEscola(
        filho.nome,
        autor ? autor.nome : "Responsável",
        textoLimpo,
        `${urlAplicacao(c.env)}/diretoria`
      )
    );

    return c.json({ success: true, message: "Acompanhamento registrado!" }, 201);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota POST /api/painel/acompanhamentos:", message);
    return c.json({ error: "Erro ao registrar acompanhamento", details: message }, 500);
  }
});

// ============================================================
// 7. DIRETORIA/COORDENAÇÃO — ANOTAÇÕES DE PAIS E PROFESSORES
// ============================================================

// Log de acessos + acessos temporários/terceiros criados,
// visível na diretoria apenas dos últimos 30 dias
app.get("/api/diretoria/log", async (c) => {
  try {
    const acessos = await c.env.DB.prepare(
      "SELECT id, tipo, usuario_nome, usuario_email, papel, criado_em " +
        "FROM log_acessos " +
        "WHERE datetime(criado_em) >= datetime('now', '-30 days') " +
        "ORDER BY id DESC LIMIT 300"
    ).all();

    const terceiros = await c.env.DB.prepare(
      "SELECT at.id, at.tipo, at.status, at.convidado_nome, at.criado_em, at.expira_em, " +
        "u.nome AS solicitante, al.nome AS aluno_nome, al.matricula " +
        "FROM autorizacoes_temporarias at " +
        "LEFT JOIN usuarios u ON u.id = at.responsavel_id " +
        "LEFT JOIN alunos al ON al.id = at.aluno_id " +
        "WHERE datetime(at.criado_em) >= datetime('now', '-30 days') " +
        "ORDER BY at.id DESC LIMIT 300"
    ).all();

    return c.json(
      {
        acessos: acessos.results || [],
        terceiros: terceiros.results || [],
        janela_dias: 30,
      },
      200
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota GET /api/diretoria/log:", message);
    return c.json({ error: "Erro ao carregar o log", details: message }, 500);
  }
});

// Feed único de todas as anotações (quem escreveu, cargo, aluno e data)
app.get("/api/diretoria/acompanhamentos", async (c) => {
  try {
    const acompanhamentos = await c.env.DB.prepare(
      `SELECT ac.id, ac.papel, ac.texto, ac.atestado_base64, ac.atestado_nome, ac.criado_em,
              u.nome AS autor_nome, a.nome AS aluno_nome, a.matricula
       FROM acompanhamentos ac
       JOIN usuarios u ON u.id = ac.autor_id
       JOIN alunos a ON a.id = ac.aluno_id
       ORDER BY ac.criado_em DESC, ac.id DESC`
    ).all<{
      id: number;
      papel: string;
      texto: string;
      atestado_base64: string | null;
      atestado_nome: string | null;
      criado_em: string;
      autor_nome: string;
      aluno_nome: string;
      matricula: string;
    }>();

    return c.json({ acompanhamentos: acompanhamentos.results || [] }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota GET /api/diretoria/acompanhamentos:", message);
    return c.json({ error: "Erro ao carregar anotações", details: message }, 500);
  }
});

// ============================================================
// 8. CONVITE DE RETIRADA (autorização temporária de acompanhante)
// ============================================================

// ------------------------------------------------------------
// LINK TEMPORÁRIO DE CADASTRO — TERCEIRO RESPONSÁVEL (12 HORAS)
//
// Após o pré-cadastro, a tela do cadastro gera um link válido por 12h.
// O terceiro abre o link e preenche nome/CPF/foto (mesma base dos
// blocos de responsável do cadastro padrão). A solicitação é enviada
// por e-mail para o pai e a mãe (e aparece no painel deles) — eles
// aprovam ou rejeitam. Aprovado, ele vira o 3º responsável do aluno.
// ------------------------------------------------------------

// Aplica a decisão (aprovado/rejeitado) e avisa os responsáveis.
const aplicarDecisaoConvite = async (
  env: Env,
  convite: { token: string; aluno_id: number },
  decisao: "APROVAR" | "REJEITAR"
): Promise<{ status: 200 | 400 | 404 | 409 | 410; body: Record<string, unknown> }> => {
  const aluno = await env.DB
    .prepare("SELECT id, nome, responsavel3_id FROM alunos WHERE id = ?")
    .bind(convite.aluno_id)
    .first<{ id: number; nome: string; responsavel3_id: number | null }>();
  if (!aluno) {
    return { status: 404, body: { error: "Aluno não encontrado." } };
  }

  const atual = await env.DB
    .prepare(
      `SELECT convidado_nome, status, datetime(expira_em) <= datetime('now') AS expirado
       FROM autorizacoes_temporarias WHERE token = ?`
    )
    .bind(convite.token)
    .first<{ convidado_nome: string | null; status: string; expirado: number }>();
  if (!atual) {
    return { status: 404, body: { error: "Solicitação não encontrada." } };
  }
  if (atual.expirado === 1 || atual.status === "EXPIRADO") {
    return { status: 410, body: { error: "A solicitação expirou (validade de 12 horas)." } };
  }
  if (atual.status !== "AGUARDANDO_CONFIRMACAO") {
    return { status: 410, body: { error: "Esta solicitação já foi avaliada." } };
  }

  const terceiro = String(atual.convidado_nome || "").trim() || "Terceiro responsável";
  const statusFinal = decisao === "APROVAR" ? "APROVADO" : "REJEITADO";

  if (decisao === "APROVAR") {
    if (aluno.responsavel3_id) {
      return { status: 409, body: { error: "Este aluno já possui um terceiro responsável." } };
    }

    const dados = await env.DB
      .prepare(
        "SELECT convidado_cpf, convidado_foto FROM autorizacoes_temporarias WHERE token = ?"
      )
      .bind(convite.token)
      .first<{ convidado_cpf: string; convidado_foto: string | null }>();

    const resResp = await env.DB
      .prepare("INSERT INTO responsaveis (nome, cpf, foto_base64) VALUES (?, ?, ?)")
      .bind(terceiro, dados ? dados.convidado_cpf : "", dados ? dados.convidado_foto : null)
      .run();

    const resVinculo = await env.DB
      .prepare(
        "UPDATE alunos SET responsavel3_id = ? WHERE id = ? AND responsavel3_id IS NULL"
      )
      .bind(resResp.meta.last_row_id, aluno.id)
      .run();
    if (resVinculo.meta.changes === 0) {
      return { status: 409, body: { error: "Este aluno já possui um terceiro responsável." } };
    }
  }

  // Guarda em SQL: só sai de AGUARDANDO_CONFIRMACAO se ainda estiver
  // pendente e dentro das 12 horas (proteção tipo CRIT-3)
  const resStatus = await env.DB
    .prepare(
      `UPDATE autorizacoes_temporarias
       SET status = ?, confirmado_em = datetime('now')
       WHERE token = ? AND status = 'AGUARDANDO_CONFIRMACAO'
         AND datetime(expira_em) > datetime('now')`
    )
    .bind(statusFinal, convite.token)
    .run();
  if (resStatus.meta.changes === 0) {
    return { status: 410, body: { error: "Solicitação inválida, expirada ou já avaliada." } };
  }

  // Resultado para o pai e a mãe
  await notificar(
    env,
    await emailsResponsavelAluno(env.DB, aluno.id),
    decisao === "APROVAR"
      ? `Terceiro responsável aprovado — ${aluno.nome}`
      : `Solicitação rejeitada — ${aluno.nome}`,
    emailConviteResultado(aluno.nome, terceiro, decisao === "APROVAR")
  );

  return {
    status: 200,
    body: {
      success: true,
      decisao: statusFinal,
      message:
        decisao === "APROVAR"
          ? `${terceiro} agora é 3º responsável de ${aluno.nome}.`
          : "Solicitação rejeitada.",
    },
  };
};

// Gerar o link temporário (12h) — chamado pela tela de cadastro,
// após o pré-cadastro, por um responsável vinculado (ou admin).
app.post("/api/convite/gerar", autenticar(["RESPONSAVEL", "ADMIN"]), async (c) => {
  try {
    const usuarioId = c.get("usuarioId");
    const usuarioRole = c.get("usuarioRole");
    const { aluno_id } = await c.req.json();

    if (!aluno_id) {
      return c.json({ error: "Informe o aluno." }, 400);
    }

    const aluno = await c.env.DB.prepare(
      `SELECT id, nome, responsavel_id, responsavel2_id, responsavel3_id
       FROM alunos WHERE id = ?`
    )
      .bind(aluno_id)
      .first<{
        id: number;
        nome: string;
        responsavel_id: number | null;
        responsavel2_id: number | null;
        responsavel3_id: number | null;
      }>();

    if (!aluno) {
      return c.json({ error: "Aluno não encontrado." }, 404);
    }

    // Só o pai/mãe vinculado ao aluno (ou admin) pode gerar o link
    if (usuarioRole !== "ADMIN") {
      const vinculo = await c.env.DB.prepare(
        `SELECT 1 FROM responsaveis r
         WHERE r.id IN (?, ?)
           AND (r.id IN (SELECT responsavel_id FROM responsavel_usuario WHERE usuario_id = ?)
                OR r.cpf IN (SELECT cpf FROM seguranca_usuario WHERE usuario_id = ?))`
      )
        .bind(aluno.responsavel_id, aluno.responsavel2_id, usuarioId, usuarioId)
        .first();
      if (!vinculo) {
        return c.json({ error: "Sem permissão para convidar um terceiro deste aluno." }, 403);
      }
    }

    if (!aluno.responsavel_id && !aluno.responsavel2_id) {
      return c.json(
        { error: "O aluno precisa ter ao menos um responsável cadastrado antes de convidar um terceiro." },
        400
      );
    }
    if (aluno.responsavel3_id) {
      return c.json(
        { error: "Este aluno já possui um terceiro responsável." },
        409
      );
    }

    // Um link ativo por aluno: pendentes antigos viram EXPIRADO
    await c.env.DB.prepare(
      `UPDATE autorizacoes_temporarias SET status = 'EXPIRADO'
       WHERE aluno_id = ? AND tipo = 'TERCEIRO_RESPONSAVEL'
         AND status IN ('AGUARDANDO_CADASTRO', 'AGUARDANDO_CONFIRMACAO')`
    )
      .bind(aluno_id)
      .run();

    const token = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO autorizacoes_temporarias
         (responsavel_id, aluno_id, token, tipo, status, expira_em)
       VALUES (?, ?, ?, 'TERCEIRO_RESPONSAVEL', 'AGUARDANDO_CADASTRO',
               datetime('now', '+12 hours'))`
    )
      .bind(usuarioId, aluno_id, token)
      .run();

    return c.json(
      {
        success: true,
        link: `${urlAplicacao(c.env)}/convite/${token}`,
        valido_por: "12 horas",
        aluno: aluno.nome,
      },
      201
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota POST /api/convite/gerar:", message);
    return c.json({ error: "Erro ao gerar o link", details: message }, 500);
  }
});

// Solicitação de 3º responsável para aluno JÁ cadastrado: o responsável
// preenche na hora (sem link) e a aprovação por e-mail do pai e da mãe
// segue o mesmo caminho do fluxo de convite (12h, um ativo por aluno).
app.post("/api/convite/terceiro", autenticar(["RESPONSAVEL", "SECRETARIA", "ADMIN"]), async (c) => {
  try {
    const usuarioId = c.get("usuarioId");
    const usuarioRole = c.get("usuarioRole");
    const { aluno_id, nome, cpf, foto } = await c.req.json();

    if (!aluno_id) {
      return c.json({ error: "Informe o aluno." }, 400);
    }

    const aluno = await c.env.DB.prepare(
      `SELECT a.id, a.nome, a.responsavel_id, a.responsavel2_id, a.responsavel3_id,
              r1.cpf AS cpf_pai, r2.cpf AS cpf_mae
       FROM alunos a
       LEFT JOIN responsaveis r1 ON r1.id = a.responsavel_id
       LEFT JOIN responsaveis r2 ON r2.id = a.responsavel2_id
       WHERE a.id = ?`
    )
      .bind(aluno_id)
      .first<{
        id: number;
        nome: string;
        responsavel_id: number | null;
        responsavel2_id: number | null;
        responsavel3_id: number | null;
        cpf_pai: string | null;
        cpf_mae: string | null;
      }>();

    if (!aluno) {
      return c.json({ error: "Aluno não encontrado." }, 404);
    }

    // Só o pai/mãe vinculado ao aluno (ou a equipe: admin/secretaria)
    // pode pedir o terceiro
    if (usuarioRole !== "ADMIN" && usuarioRole !== "SECRETARIA") {
      const vinculo = await c.env.DB.prepare(
        `SELECT 1 FROM responsaveis r
         WHERE r.id IN (?, ?)
           AND (r.id IN (SELECT responsavel_id FROM responsavel_usuario WHERE usuario_id = ?)
                OR r.cpf IN (SELECT cpf FROM seguranca_usuario WHERE usuario_id = ?))`
      )
        .bind(aluno.responsavel_id, aluno.responsavel2_id, usuarioId, usuarioId)
        .first();
      if (!vinculo) {
        return c.json({ error: "Sem permissão para cadastrar um terceiro deste aluno." }, 403);
      }
    }

    if (!aluno.responsavel_id && !aluno.responsavel2_id) {
      return c.json(
        { error: "O aluno precisa ter ao menos um responsável cadastrado antes de ter um terceiro." },
        400
      );
    }
    if (aluno.responsavel3_id) {
      return c.json({ error: "Este aluno já possui um terceiro responsável." }, 409);
    }

    // Validações do preenchimento (paridade com o bloco do pré-cadastro)
    if (!nome || !foto) {
      return c.json({ error: "Informe nome e foto do terceiro responsável." }, 400);
    }
    const cpfVal = limparEValidarCPF(cpf);
    if (cpfVal.error) {
      return c.json({ error: `CPF do terceiro responsável inválido: ${cpfVal.error}` }, 400);
    }
    if (cpfVal.cpf.length !== 11) {
      return c.json({ error: "Informe um CPF com 11 dígitos." }, 400);
    }
    if (cpfVal.cpf === aluno.cpf_pai || cpfVal.cpf === aluno.cpf_mae) {
      return c.json({ error: "O CPF do terceiro responsável deve ser diferente dos responsáveis do aluno." }, 400);
    }
    const cpfJaCadastrado = await c.env.DB.prepare(
      "SELECT id FROM responsaveis WHERE cpf = ?"
    )
      .bind(cpfVal.cpf)
      .first();
    if (cpfJaCadastrado) {
      return c.json({ error: "CPF do terceiro responsável já está cadastrado no sistema." }, 409);
    }

    // Um ativo por aluno: solicitações pendentes antigas viram EXPIRADO
    await c.env.DB.prepare(
      `UPDATE autorizacoes_temporarias SET status = 'EXPIRADO'
       WHERE aluno_id = ? AND tipo = 'TERCEIRO_RESPONSAVEL'
         AND status IN ('AGUARDANDO_CADASTRO', 'AGUARDANDO_CONFIRMACAO')`
    )
      .bind(aluno_id)
      .run();

    // Linha já preenchida, no mesmo status em que o fluxo de link chega
    const aprovacaoToken = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO autorizacoes_temporarias
         (responsavel_id, aluno_id, token, tipo, convidado_nome, convidado_cpf,
          convidado_telefone, convidado_foto, status, expira_em, aprovacao_token)
       VALUES (?, ?, ?, 'TERCEIRO_RESPONSAVEL', ?, ?, '', ?, 'AGUARDANDO_CONFIRMACAO',
               datetime('now', '+12 hours'), ?)`
    )
      .bind(usuarioId, aluno_id, crypto.randomUUID(), String(nome), cpfVal.cpf, String(foto), aprovacaoToken)
      .run();

    const urlAprovacao = `${urlAplicacao(c.env)}/aprovar-terceiro/${aprovacaoToken}`;
    await notificar(
      c.env,
      await emailsResponsavelAluno(c.env.DB, aluno_id),
      `Aprovação pendente: terceiro responsável — ${aluno.nome}`,
      emailConviteAprovacao(aluno.nome, String(nome), urlAprovacao)
    );

    return c.json(
      {
        success: true,
        message:
          "Solicitação enviada! Os responsáveis receberam um e-mail para aprovar ou rejeitar.",
      },
      201
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota POST /api/convite/terceiro:", message);
    return c.json({ error: "Erro ao solicitar terceiro responsável", details: message }, 500);
  }
});

// Pendências de aprovação no painel do responsável (pai/mãe)
app.get("/api/painel/convites", async (c) => {
  try {
    const usuarioId = c.get("usuarioId");

    const convites = await c.env.DB.prepare(
      `SELECT DISTINCT at.token, at.convidado_nome, at.convidado_foto, at.expira_em,
              a.id AS aluno_id, a.nome AS aluno_nome, a.matricula
       FROM autorizacoes_temporarias at
       JOIN alunos a ON a.id = at.aluno_id
       JOIN responsaveis r ON (a.responsavel_id = r.id OR a.responsavel2_id = r.id)
       WHERE at.tipo = 'TERCEIRO_RESPONSAVEL'
         AND at.status = 'AGUARDANDO_CONFIRMACAO'
         AND datetime(at.expira_em) > datetime('now')
         AND (r.id IN (SELECT responsavel_id FROM responsavel_usuario WHERE usuario_id = ?)
              OR r.cpf IN (SELECT cpf FROM seguranca_usuario WHERE usuario_id = ?))
       ORDER BY at.expira_em`
    )
      .bind(usuarioId, usuarioId)
      .all<{
        token: string;
        convidado_nome: string | null;
        convidado_foto: string | null;
        expira_em: string;
        aluno_id: number;
        aluno_nome: string;
        matricula: string;
      }>();

    return c.json({ convites: convites.results || [] }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota GET /api/painel/convites:", message);
    return c.json({ error: "Erro ao carregar aprovações", details: message }, 500);
  }
});

// Decisão pelo painel do responsável (sessão exigida + vínculo)
app.post("/api/convite/:token/aprovar", autenticar(["RESPONSAVEL", "ADMIN"]), async (c) => {
  try {
    const token = c.req.param("token");
    const { decisao } = await c.req.json();

    if (decisao !== "APROVAR" && decisao !== "REJEITAR") {
      return c.json({ error: "Decisão inválida (APROVAR ou REJEITAR)." }, 400);
    }

    const convite = await c.env.DB.prepare(
      `SELECT token, aluno_id FROM autorizacoes_temporarias
       WHERE token = ? AND tipo = 'TERCEIRO_RESPONSAVEL'`
    )
      .bind(token)
      .first<{ token: string; aluno_id: number }>();

    if (!convite) {
      return c.json({ error: "Solicitação não encontrada." }, 404);
    }

    // Só o pai/mãe daquele aluno (ou admin) decide
    const usuarioId = c.get("usuarioId");
    const usuarioRole = c.get("usuarioRole");
    if (usuarioRole !== "ADMIN") {
      const vinculo = await c.env.DB.prepare(
        `SELECT 1 FROM alunos a
         JOIN responsaveis r ON (a.responsavel_id = r.id OR a.responsavel2_id = r.id)
         WHERE a.id = ?
           AND (r.id IN (SELECT responsavel_id FROM responsavel_usuario WHERE usuario_id = ?)
                OR r.cpf IN (SELECT cpf FROM seguranca_usuario WHERE usuario_id = ?))`
      )
        .bind(convite.aluno_id, usuarioId, usuarioId)
        .first();
      if (!vinculo) {
        return c.json({ error: "Sem permissão para avaliar esta solicitação." }, 403);
      }
    }

    const resultado = await aplicarDecisaoConvite(c.env, convite, decisao);
    return c.json(resultado.body, resultado.status);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota POST /api/convite/:token/aprovar:", message);
    return c.json({ error: "Erro ao avaliar a solicitação", details: message }, 500);
  }
});

// Página pública de aprovação (botões do e-mail — token SÓ dos responsáveis)
app.get("/api/aprovacao/:token", async (c) => {
  try {
    const token = c.req.param("token");

    const info = await c.env.DB.prepare(
      `SELECT at.status, at.convidado_nome,
              datetime(at.expira_em) <= datetime('now') AS expirado,
              a.nome AS aluno_nome, a.matricula
       FROM autorizacoes_temporarias at
       JOIN alunos a ON a.id = at.aluno_id
       WHERE at.aprovacao_token = ? AND at.tipo = 'TERCEIRO_RESPONSAVEL'`
    )
      .bind(token)
      .first<{
        status: string;
        convidado_nome: string | null;
        expirado: number;
        aluno_nome: string;
        matricula: string;
      }>();

    if (!info) {
      return c.json({ error: "Link de aprovação inválido." }, 404);
    }
    if (info.expirado === 1 || info.status === "EXPIRADO") {
      return c.json({ error: "Esta solicitação expirou (validade de 12 horas)." }, 410);
    }
    if (info.status !== "AGUARDANDO_CONFIRMACAO") {
      return c.json({ error: "Esta solicitação já foi avaliada." }, 410);
    }

    return c.json(
      {
        aluno_nome: info.aluno_nome,
        matricula: info.matricula,
        terceiro_nome: info.convidado_nome,
      },
      200
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota GET /api/aprovacao:", message);
    return c.json({ error: "Erro ao validar o link", details: message }, 500);
  }
});

// Decisão vinda dos botões do e-mail (página pública com token próprio)
app.post("/api/aprovacao/:token", async (c) => {
  try {
    const token = c.req.param("token");
    const { decisao } = await c.req.json();

    if (decisao !== "APROVAR" && decisao !== "REJEITAR") {
      return c.json({ error: "Decisão inválida (APROVAR ou REJEITAR)." }, 400);
    }

    const convite = await c.env.DB.prepare(
      `SELECT token, aluno_id FROM autorizacoes_temporarias
       WHERE aprovacao_token = ? AND tipo = 'TERCEIRO_RESPONSAVEL'`
    )
      .bind(token)
      .first<{ token: string; aluno_id: number }>();

    if (!convite) {
      return c.json({ error: "Link de aprovação inválido." }, 404);
    }

    const resultado = await aplicarDecisaoConvite(c.env, convite, decisao);
    return c.json(resultado.body, resultado.status);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota POST /api/aprovacao:", message);
    return c.json({ error: "Erro ao avaliar a solicitação", details: message }, 500);
  }
});

// Ler o convite: valida token/expiração e devolve os dados do aluno p/ a tela
app.get("/api/convite/:token", async (c) => {
  try {
    const token = c.req.param("token");

    const convite = await c.env.DB.prepare(
      `SELECT
         a.nome AS aluno_nome,
         a.matricula AS aluno_turma,
         a.responsavel3_id,
         at.status,
         at.tipo,
         datetime(at.expira_em) <= datetime('now') AS expirado
       FROM autorizacoes_temporarias at
       JOIN alunos a ON a.id = at.aluno_id
       WHERE at.token = ?`
    )
      .bind(token)
      .first<{
        aluno_nome: string;
        aluno_turma: string;
        responsavel3_id: number | null;
        status: string;
        tipo: string;
        expirado: number;
      }>();

    if (!convite) {
      return c.json({ error: "Convite inválido." }, 404);
    }

    if (convite.expirado === 1 || convite.status === "EXPIRADO") {
      return c.json({ error: "Este convite expirou. Peça um novo ao responsável." }, 410);
    }

    if (convite.status !== "AGUARDANDO_CADASTRO") {
      return c.json({ error: "Este convite já foi utilizado ou está aguardando confirmação." }, 410);
    }

    // Terceiro responsável: não abre se o aluno já tem um terceiro aprovado
    if (convite.tipo === "TERCEIRO_RESPONSAVEL" && convite.responsavel3_id) {
      return c.json({ error: "Este aluno já possui um terceiro responsável." }, 410);
    }

    return c.json(
      {
        aluno_nome: convite.aluno_nome,
        aluno_turma: convite.aluno_turma,
        tipo: convite.tipo,
      },
      200
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota GET /api/convite:", message);
    return c.json({ error: "Erro ao validar convite", details: message }, 500);
  }
});

// Preencher o convite com os dados do convidado (foto, CPF, telefone)
// Dois fluxos pelo `tipo` do vínculo:
//  - CONVIDADO_PORTARIA: fluxo antigo, aguarda confirmação do responsável;
//  - TERCEIRO_RESPONSAVEL: dispara aprovação por e-mail para o pai e a mãe.
app.post("/api/convite/:token/cadastrar", async (c) => {
  try {
    const token = c.req.param("token");
    const { nome, cpf, telefone, foto } = await c.req.json();

    if (!nome || !foto) {
      return c.json({ error: "Nome e foto são obrigatórios." }, 400);
    }

    const cpfVal = limparEValidarCPF(cpf);
    if (cpfVal.error) {
      return c.json({ error: cpfVal.error }, 400);
    }
    if (cpfVal.cpf.length !== 11) {
      return c.json({ error: "Informe um CPF com 11 dígitos." }, 400);
    }

    // Lê o convite antes para saber o fluxo e validar a base (12h)
    const convite = await c.env.DB.prepare(
      `SELECT at.tipo, at.status, at.aluno_id,
              datetime(at.expira_em) <= datetime('now') AS expirado,
              a.nome AS aluno_nome, a.responsavel3_id
       FROM autorizacoes_temporarias at
       JOIN alunos a ON a.id = at.aluno_id
       WHERE at.token = ?`
    )
      .bind(token)
      .first<{
        tipo: string;
        status: string;
        aluno_id: number;
        expirado: number;
        aluno_nome: string;
        responsavel3_id: number | null;
      }>();

    if (
      !convite ||
      convite.expirado === 1 ||
      convite.status !== "AGUARDANDO_CADASTRO"
    ) {
      return c.json(
        { error: "Convite inválido, expirado ou já utilizado." },
        410
      );
    }

    const ehTerceiro = convite.tipo === "TERCEIRO_RESPONSAVEL";
    if (ehTerceiro && convite.responsavel3_id) {
      return c.json(
        { error: "Este aluno já possui um terceiro responsável." },
        410
      );
    }

    // O UPDATE só passa se o token existir, estiver no status inicial,
    // no tipo certo e dentro da validade — `changes === 0` = token ruim.
    const res = await c.env.DB.prepare(
      `UPDATE autorizacoes_temporarias
         SET convidado_nome = ?,
             convidado_cpf = ?,
             convidado_telefone = ?,
             convidado_foto = ?,
             status = 'AGUARDANDO_CONFIRMACAO'
       WHERE token = ?
         AND tipo = ?
         AND status = 'AGUARDANDO_CADASTRO'
         AND datetime(expira_em) > datetime('now')`
    )
      .bind(nome, cpfVal.cpf, telefone || "", foto, token, convite.tipo)
      .run();

    if (res.meta.changes === 0) {
      return c.json(
        { error: "Convite inválido, expirado ou já utilizado." },
        410
      );
    }

    // --- TERCEIRO RESPONSÁVEL: pede aprovação por e-mail ---
    if (ehTerceiro) {
      // Token próprio de aprovação: vai SÓ para o pai e a mãe (por e-mail).
      // Quem tem o link do convidado não recebe este token.
      const aprovacaoToken = crypto.randomUUID();
      await c.env.DB.prepare(
        "UPDATE autorizacoes_temporarias SET aprovacao_token = ? WHERE token = ?"
      )
        .bind(aprovacaoToken, token)
        .run();

      const urlAprovacao = `${urlAplicacao(c.env)}/aprovar-terceiro/${aprovacaoToken}`;
      await notificar(
        c.env,
        await emailsResponsavelAluno(c.env.DB, convite.aluno_id),
        `Aprovação pendente: terceiro responsável — ${convite.aluno_nome}`,
        emailConviteAprovacao(convite.aluno_nome, nome, urlAprovacao)
      );

      return c.json(
        {
          success: true,
          tipo: "TERCEIRO_RESPONSAVEL",
          message:
            "Cadastro enviado! Os responsáveis receberam um e-mail para aprovar ou rejeitar a solicitação.",
        },
        201
      );
    }

    return c.json(
      {
        success: true,
        tipo: "CONVIDADO_PORTARIA",
        message: "Cadastro temporário enviado para confirmação do responsável.",
      },
      201
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro na rota POST /api/convite:", message);
    return c.json({ error: "Erro ao cadastrar convidado", details: message }, 500);
  }
});

// Health check
// ============================================================
// 9. SECRETARIA — AJUSTE DE FOTOS DO PRÉ-CADASTRO (SEM EXCLUSÃO)
// ============================================================

// Lista dos pré-cadastros com as fotos (aluno, pai e mãe)
app.get("/api/secretaria/alunos", async (c) => {
  try {
    const alunos = await c.env.DB.prepare(SQL_ALUNOS_COM_FOTOS).all();
    return c.json(alunos.results || [], 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao listar alunos (secretaria):", message);
    return c.json({ error: "Erro ao listar alunos", details: message }, 500);
  }
});

// Ajusta (substitui) a foto de um pré-cadastro — mesma regra do admin.
// Não existe rota de exclusão para a secretaria: ela só corrige imagens.
app.patch("/api/secretaria/alunos/:id/foto", async (c) => {
  try {
    const { alvo, foto } = await c.req.json();
    const resultado = await atualizarFotoAluno(
      c.env,
      c.req.param("id"),
      alvo,
      foto
    );
    return c.json(resultado.body, resultado.status);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao atualizar foto (secretaria):", message);
    return c.json({ error: "Erro ao atualizar foto", details: message }, 500);
  }
});

// Atestados anexados pelos responsáveis — visualização da secretaria
app.get("/api/secretaria/atestados", async (c) => {
  try {
    const lista = await c.env.DB.prepare(
      `SELECT ac.id, ac.atestado_base64, ac.atestado_nome, ac.texto, ac.papel,
              ac.criado_em, u.nome AS autor_nome,
              a.id AS aluno_id, a.nome AS aluno_nome, a.matricula
       FROM acompanhamentos ac
       JOIN alunos a ON a.id = ac.aluno_id
       JOIN usuarios u ON u.id = ac.autor_id
       WHERE ac.atestado_base64 IS NOT NULL
       ORDER BY ac.criado_em DESC, ac.id DESC`
    ).all<{
      id: number;
      atestado_base64: string;
      atestado_nome: string | null;
      texto: string;
      papel: string;
      criado_em: string;
      autor_nome: string;
      aluno_id: number;
      aluno_nome: string;
      matricula: string;
    }>();

    return c.json({ atestados: lista.results || [] }, 200);
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao listar atestados (secretaria):", message);
    return c.json({ error: "Erro ao listar atestados", details: message }, 500);
  }
});

// ------------------------------------------------------------
// Teste de e-mail do painel do admin: envia mensagem de teste quando
// o SMTP está configurado; sem credencial opera em modo log e ainda
// verifica a conectividade de rede com o servidor SMTP.
// ------------------------------------------------------------
app.post("/api/admin/testar-email", async (c) => {
  try {
    const corpo = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const informado = String((corpo as { para?: unknown }).para || "").trim();

    const config = mailConfigFromEnv(c.env);

    // Destino padrão: e-mail do próprio administrador logado
    let destino = informado;
    if (!destino) {
      const admin = await c.env.DB.prepare("SELECT email FROM usuarios WHERE id = ?")
        .bind(c.get("usuarioId"))
        .first<{ email: string }>();
      destino = admin ? admin.email : "";
    }
    if (!destino || !destino.includes("@")) {
      return c.json({ error: "Informe um e-mail válido para o teste." }, 400);
    }

    const envio = await notificar(
      c.env,
      [destino],
      "Teste de envio — InformAluno",
      emailTeste()
    );

    // Prova de conectividade: lê a saudação (220) do servidor SMTP
    const conexao = await testarConexaoSMTP(
      config ? config.host : "smtp.gmail.com",
      config ? config.port : 465
    );

    return c.json(
      {
        success: true,
        configurado: Boolean(config),
        modo: envio.modo,
        erro: envio.error || null,
        conexao: conexao.ok
          ? `OK — ${conexao.detalhe}`
          : `FALHOU — ${conexao.detalhe}`,
        message: !config
          ? "SMTP não configurado: e-mail registrado em modo log. Preencha o arquivo .dev.vars para envio real."
          : envio.modo === "enviado"
          ? `E-mail de teste enviado para ${destino}.`
          : `Falha no envio: ${envio.error}`,
      },
      200
    );
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error("Erro ao testar e-mail:", message);
    return c.json({ error: "Erro ao testar e-mail", details: message }, 500);
  }
});

app.get("/api/ping", (c) => c.json({ status: "ok" }));

export default app;