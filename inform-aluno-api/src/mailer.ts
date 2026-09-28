// ============================================================
// ENVIO DE E-MAIL — RESEND (API HTTP) ou SMTP (TLS via cloudflare:sockets)
//
// Configuração em desenvolvimento: inform-aluno-api/.dev.vars
// (copie de .dev.vars.example e preencha); em produção use
// `wrangler secret put RESEND_API_KEY` / `SMTP_PASS` etc.
//
// RESEND (preferido quando RESEND_API_KEY existe):
//   RESEND_API_KEY=re_...          chave da conta (https://resend.com/api-keys)
//   RESEND_FROM=InformAluno <onboarding@resend.dev>
//
//   É o mesmo `resend.emails.send({ from, to, subject, html })` do SDK,
//   chamado por fetch puro — aqui roda dentro do Worker do Cloudflare e
//   um pacote a menos no bundle. A API é idêntica.
//
// SMTP (fallback — usado quando NÃO há chave da Resend):
//   SMTP_HOST=smtp.gmail.com
//   SMTP_PORT=465            465 = TLS direto | 587 = STARTTLS
//   SMTP_USER=seu.email@gmail.com
//   SMTP_PASS=<senha de app, sem espacos>
//   EMAIL_FROM=InformAluno Secretaria <seu.email@gmail.com>
//   APP_URL=http://localhost:5173
//
// SEM credencial nenhuma das duas tudo roda em MODO LOG: o conteúdo é
// impresso no console e nenhuma operação do sistema falha por causa disso.
// As notificações NUNCA quebram o fluxo principal.
// ============================================================

import { connect } from "cloudflare:sockets";

export interface MailEnv {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  EMAIL_FROM?: string;
  APP_URL?: string;
}

export interface MailConfig {
  host: string;
  port: number;
  starttls: boolean;
  user: string;
  pass: string;
  fromHeader: string;
  fromAddress: string;
}

export interface ResultadoEnvio {
  ok: boolean;
  modo: "enviado" | "log" | "sem-destinatario";
  error?: string;
  /** Prova do envio: id retornado pela Resend ou nada no SMTP. */
  detalhe?: string;
}

export interface ResendConfig {
  apiKey: string;
  from: string;
}

// ------------------------------------------------------------
// Configuração
// ------------------------------------------------------------

export const urlAplicacao = (env: MailEnv): string =>
  (env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

export const mailConfigFromEnv = (env: MailEnv): MailConfig | null => {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;

  const port = Number(env.SMTP_PORT || "465") || 465;
  const fromHeader = env.EMAIL_FROM || env.SMTP_USER;
  // Extrai o endereço de "Nome <endereco>" (ou usa a cadeia cru)
  const encontrado = fromHeader.match(/<([^>]+)>/);
  const fromAddress = encontrado ? encontrado[1] : fromHeader;

  return {
    host: env.SMTP_HOST,
    port,
    starttls: port === 587,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    fromHeader,
    fromAddress,
  };
};

// Resend — presente a chave, ela TEM PRIORIDADE sobre o SMTP.
// O "de" aceita "Nome <endereco>" ou só o endereco (formato da API).
export const resendFromEnv = (env: MailEnv): ResendConfig | null => {
  const apiKey = (env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;

  const from = (env.RESEND_FROM || env.EMAIL_FROM || env.SMTP_USER || "").trim();
  if (!from) return null;

  return { apiKey, from };
};

// ------------------------------------------------------------
// Utilidades de codificação
// ------------------------------------------------------------

const b64Texto = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const quebrar76 = (s: string): string => s.replace(/(.{76})/g, "$1\r\n");

// ------------------------------------------------------------
// Conexão e leitura de linhas SMTP
// ------------------------------------------------------------

interface Conexao {
  socket: Socket;
  buffer: string;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
}

const novaConexao = (host: string, port: number, starttls: boolean): Conexao => {
  const socket = connect(
    { hostname: host, port },
    { secureTransport: starttls ? "starttls" : "on", allowHalfOpen: false }
  );
  return {
    socket,
    buffer: "",
    reader: socket.readable.getReader(),
    writer: socket.writable.getWriter(),
  };
};

const trocarParaTls = (conn: Conexao): Conexao => {
  const novo = conn.socket.startTls();
  return {
    socket: novo,
    buffer: "",
    reader: novo.readable.getReader(),
    writer: novo.writable.getWriter(),
  };
};

const fechar = (conn: Conexao): void => {
  try {
    conn.socket.close();
  } catch {
    /* já encerrada */
  }
};

const comTimeout = async <T>(
  promessa: Promise<T>,
  ms: number,
  rotulo: string
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expirou = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Tempo esgotado (${rotulo}).`)),
      ms
    );
  });
  try {
    return await Promise.race([promessa, expirou]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const proximaLinha = async (conn: Conexao, timeoutMs: number): Promise<string> => {
  for (;;) {
    const idx = conn.buffer.indexOf("\n");
    if (idx >= 0) {
      const linha = conn.buffer.slice(0, idx).replace(/\r$/, "");
      conn.buffer = conn.buffer.slice(idx + 1);
      return linha;
    }
    const resultado = await comTimeout(conn.reader.read(), timeoutMs, "leitura SMTP");
    if (resultado.done) {
      throw new Error("Conexão encerrada pelo servidor SMTP.");
    }
    if (resultado.value && resultado.value.length > 0) {
      conn.buffer += new TextDecoder().decode(resultado.value);
    }
  }
};

interface RespostaSmtp {
  codigo: number;
  texto: string;
}

// Linhas "250-..." continuam até uma linha "250 " final
const lerResposta = async (conn: Conexao, timeoutMs = 20000): Promise<RespostaSmtp> => {
  let texto = "";
  for (;;) {
    const linha = await proximaLinha(conn, timeoutMs);
    texto += linha + "\n";
    if (linha.length >= 4 && linha[3] === " ") {
      const codigo = Number.parseInt(linha.slice(0, 3), 10);
      if (Number.isNaN(codigo)) {
        throw new Error(`Resposta SMTP inválida: ${linha}`);
      }
      return { codigo, texto };
    }
    if (linha.length < 4) {
      throw new Error(`Resposta SMTP malformada: ${linha}`);
    }
  }
};

const escrever = async (conn: Conexao, texto: string): Promise<void> => {
  const bytes = new TextEncoder().encode(texto + "\r\n");
  await comTimeout(conn.writer.write(bytes), 20000, "escrita SMTP");
};

const exigir = (resposta: RespostaSmtp, esperados: number[], oque: string): void => {
  if (!esperados.includes(resposta.codigo)) {
    throw new Error(
      `SMTP recusou ${oque} (código ${resposta.codigo}): ${resposta.texto.trim()}`
    );
  }
};

// ------------------------------------------------------------
// Resend (API HTTP)
// ------------------------------------------------------------

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Mesmo contrato do SDK `resend.emails.send({ from, to, subject, html })`,
// chamado por fetch puro: aqui o código roda dentro do Worker do
// Cloudflare e não empacotamos o SDK.
const resendEnviar = async (
  config: ResendConfig,
  destinatarios: string[],
  assunto: string,
  html: string
): Promise<string> => {
  const resposta = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: destinatarios,
      subject: assunto,
      html,
    }),
  });

  const corpo = (await resposta.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };

  if (!resposta.ok) {
    throw new Error(
      `Resend recusou (HTTP ${resposta.status}): ${corpo.message || "sem detalhe"}`
    );
  }

  return corpo.id || "";
};

// Prova de credencial: a Resend não tem endpoint de "ping" barato — a
// chave enviada aqui é do tipo "só envia" (GET /domains devolve 401),
// então a prova é o próprio envio: `notificar` devolve o id da mensagem.

// ------------------------------------------------------------
// Protocolo SMTP completo
// ------------------------------------------------------------

const smtpEnviar = async (
  config: MailConfig,
  destinatarios: string[],
  assunto: string,
  html: string
): Promise<void> => {
  let conn = novaConexao(config.host, config.port, config.starttls);

  try {
    // Saudação do servidor
    const saudacao = await lerResposta(conn);
    exigir(saudacao, [220], "a saudação inicial");

    const ehlo = async (): Promise<void> => {
      const dominio = config.fromAddress.split("@")[1] || "informaluno";
      await escrever(conn, `EHLO ${dominio}`);
      const r = await lerResposta(conn);
      exigir(r, [250], "o EHLO");
    };

    await ehlo();

    // STARTTLS na porta 587
    if (config.starttls) {
      await escrever(conn, "STARTTLS");
      const r = await lerResposta(conn);
      exigir(r, [220], "o STARTTLS");
      conn = trocarParaTls(conn);
      await ehlo();
    }

    // AUTH LOGIN (usuário e senha em base64)
    await escrever(conn, "AUTH LOGIN");
    exigir(await lerResposta(conn), [334], "o início da autenticação");
    await escrever(conn, b64Texto(config.user));
    exigir(await lerResposta(conn), [334], "o usuário SMTP");
    await escrever(conn, b64Texto(config.pass));
    exigir(
      await lerResposta(conn),
      [235],
      "a autenticação (verifique usuário/senha de app)"
    );

    // Envelope do e-mail
    await escrever(conn, `MAIL FROM:<${config.fromAddress}>`);
    exigir(await lerResposta(conn), [250], "o remetente");

    for (const para of destinatarios) {
      await escrever(conn, `RCPT TO:<${para}>`);
      exigir(await lerResposta(conn), [250, 251], `o destinatário ${para}`);
    }

    // Corpo (DATA) — cabeçalhos MIME UTF-8 com corpo em base64
    await escrever(conn, "DATA");
    exigir(await lerResposta(conn), [354], "o comando DATA");

    const mensagem =
      [
        `From: ${config.fromHeader}`,
        `To: ${destinatarios.join(", ")}`,
        `Subject: =?UTF-8?B?${b64Texto(assunto)}?=`,
        `Date: ${new Date().toUTCString()}`,
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: base64",
      ].join("\r\n") +
      "\r\n\r\n" +
      quebrar76(b64Texto(html)) +
      "\r\n";

    // Dot-stuffing: linha que começa com "." vira ".."
    const paraDados = mensagem.replace(/(^|\r\n)\./g, "$1..");
    await escrever(conn, paraDados + ".");
    exigir(await lerResposta(conn), [250], "o conteúdo do e-mail");

    try {
      await escrever(conn, "QUIT");
    } catch {
      /* encerramento best-effort */
    }
  } finally {
    fechar(conn);
  }
};

// ------------------------------------------------------------
// API pública
// ------------------------------------------------------------

// Nunca lança exceção: sempre devolve um resultado.
export const notificar = async (
  env: MailEnv,
  destinatarios: string[],
  assunto: string,
  html: string
): Promise<ResultadoEnvio> => {
  const para = Array.from(
    new Set(destinatarios.map((d) => String(d).trim()).filter((d) => d.includes("@")))
  );

  if (para.length === 0) {
    console.log(`[EMAIL] "${assunto}" — sem destinatários; nada enviado.`);
    return { ok: true, modo: "sem-destinatario" };
  }

  const resend = resendFromEnv(env);
  const config = mailConfigFromEnv(env);
  if (!resend && !config) {
    console.log(`[EMAIL/LOG] Para: ${para.join(", ")} | Assunto: ${assunto}`);
    return { ok: true, modo: "log" };
  }

  try {
    // Resend tem prioridade; SMTP fica como fallback sem chave.
    if (resend) {
      const id = await resendEnviar(resend, para, assunto, html);
      console.log(
        `[EMAIL/RESEND] Enviado para ${para.join(", ")} | ${assunto}${
          id ? ` | id=${id}` : ""
        }`
      );
      return { ok: true, modo: "enviado", detalhe: id ? `Resend id ${id}` : "Resend" };
    }

    await smtpEnviar(config as MailConfig, para, assunto, html);
    console.log(`[EMAIL] Enviado para ${para.join(", ")} | ${assunto}`);
    return { ok: true, modo: "enviado" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[EMAIL] Falha ao enviar "${assunto}": ${msg}`);
    return { ok: false, modo: "log", error: msg };
  }
};

// Teste de conectividade: conecta, lê a saudação (220) e sai.
// Serve para provar que o socket SMTP responde sem precisar de credenciais.
export const testarConexaoSMTP = async (
  host: string,
  port: number
): Promise<{ ok: boolean; detalhe: string }> => {
  let conn: Conexao | null = null;
  try {
    conn = novaConexao(host, port, port === 587);
    const r = await comTimeout(lerResposta(conn), 15000, "saudação SMTP");
    if (r.codigo !== 220) {
      return { ok: false, detalhe: `${host}:${port} respondeu código ${r.codigo}` };
    }
    try {
      await escrever(conn, "QUIT");
    } catch {
      /* best-effort */
    }
    const primeira = r.texto.trim().split("\n")[0];
    return { ok: true, detalhe: `${host}:${port} -> "${primeira}"` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, detalhe: msg };
  } finally {
    if (conn) fechar(conn);
  }
};

// ------------------------------------------------------------
// Destinatários
// ------------------------------------------------------------

// E-mails do(s) responsável(eis) vinculado(s) ao aluno
// (tabela responsavel_usuario com fallback por CPF de segurança)
export const emailsResponsavelAluno = async (
  db: D1Database,
  alunoId: number | string
): Promise<string[]> => {
  const emails = new Set<string>();

  try {
    const porVinculo = await db
      .prepare(
        `SELECT DISTINCT u.email
         FROM alunos a
         JOIN responsaveis r ON (a.responsavel_id = r.id OR a.responsavel2_id = r.id)
         JOIN responsavel_usuario ru ON ru.responsavel_id = r.id
         JOIN usuarios u ON u.id = ru.usuario_id
         WHERE a.id = ?`
      )
      .bind(alunoId)
      .all<{ email: string }>();
    for (const linha of porVinculo.results || []) emails.add(linha.email);
  } catch {
    /* tabela pode não existir em bancos antigos */
  }

  try {
    const porCpf = await db
      .prepare(
        `SELECT DISTINCT u.email
         FROM alunos a
         JOIN responsaveis r ON (a.responsavel_id = r.id OR a.responsavel2_id = r.id)
         JOIN seguranca_usuario su ON su.cpf = r.cpf
         JOIN usuarios u ON u.id = su.usuario_id
         WHERE a.id = ?`
      )
      .bind(alunoId)
      .all<{ email: string }>();
    for (const linha of porCpf.results || []) emails.add(linha.email);
  } catch {
    /* tabela pode não existir em bancos antigos */
  }

  return Array.from(emails);
};

// Professores + diretoria/coordenação (quem recebe avisos da escola)
export const emailsProfessoresEDiretoria = async (
  db: D1Database
): Promise<string[]> => {
  try {
    const r = await db
      .prepare(
        "SELECT email FROM usuarios WHERE role IN ('PROFESSOR', 'DIRETOR', 'COORDENADOR')"
      )
      .all<{ email: string }>();
    return (r.results || []).map((linha) => linha.email);
  } catch {
    return [];
  }
};

// Secretaria + coordenação (avisos operacionais, ex.: reconhecimento na van)
export const emailsSecretariaECoordenador = async (
  db: D1Database
): Promise<string[]> => {
  try {
    const r = await db
      .prepare(
        "SELECT email FROM usuarios WHERE role IN ('SECRETARIA', 'COORDENADOR')"
      )
      .all<{ email: string }>();
    return (r.results || []).map((linha) => linha.email);
  } catch {
    return [];
  }
};
