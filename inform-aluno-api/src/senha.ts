// ============================================================
// HASH DE SENHAS — PBKDF2-SHA256 via WebCrypto (Cloudflare Workers)
//
// Formato armazenado: pbkdf2$<iterações>$<salt base64>$<hash base64>
//   - salt aleatório de 16 bytes por senha
//   - 100.000 iterações de PBKDF2-SHA256
//   - hash de 32 bytes derivado
//
// Senhas antigas gravadas em texto puro (formato SEM o prefixo
// "pbkdf2$") ainda são aceitas no login e são REESCRITAS como hash
// logo na primeira autenticação bem-sucedida (migração preguiçosa).
// ============================================================

const ITERACOES = 100_000;
const PREFIXO = "pbkdf2$";
const TAM_SALT = 16;
const TAM_HASH = 32;

const paraBytes = (texto: string): Uint8Array => new TextEncoder().encode(texto);

const paraBase64 = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const deBase64 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

// Deriva o hash com os parâmetros do formato armazenado
async function derivar(senha: string, salt: Uint8Array, iteracoes: number): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey("raw", paraBytes(senha), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iteracoes },
    chave as CryptoKey,
    TAM_HASH * 8
  );
  return new Uint8Array(bits);
}

// Comparação em tempo constante (não vaza o ponto de divergência)
function iguais(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

// ============================================================
// PADRÃO DE SEGURANÇA DA SENHA
//
// Exigido em TODO ponto que CRIA ou TROCA senha: /api/auth/registro,
// /api/recuperar-senha/:token (tela "Esqueci a senha") e
// /api/admin/usuarios/:id/senha (painel do admin).
//
// O LOGIN não valida nada: contas antigas com senha fraca continuam
// entrando e só são cobradas na próxima troca de senha (migração
// preguiçosa, como já acontece com o hash). Por isso o login errado
// devolve só "E-mail ou senha incorretos" — o alerta com as normas é
// montado pelo front com estas MESMAS frases
// (src/components/senhas.tsx).
// ============================================================

export const REGRAS_SENHA = [
  "Pelo menos 8 caracteres",
  "Pelo menos 1 letra maiúscula (A-Z)",
  "Pelo menos 1 letra minúscula (a-z)",
  "Pelo menos 1 caractere especial (ex.: @ # $ % & ! ?)",
  "Sem sequências óbvias como abc, cba ou 123",
];

/** abc / cba / 123 / 321 — 3 caracteres em sequência contínua. */
const temSequencia = (senha: string): boolean => {
  const texto = senha.toLowerCase();
  for (let i = 0; i + 2 < texto.length; i++) {
    const a = texto.charCodeAt(i);
    const b = texto.charCodeAt(i + 1);
    const c = texto.charCodeAt(i + 2);
    if (b - a === 1 && c - b === 1) return true; // crescente
    if (a - b === 1 && b - c === 1) return true; // decrescente
  }
  return false;
};

/**
 * Devolve as regras que a senha ainda NÃO cumpre — [] = senha válida.
 */
export const validarSenhaForte = (senha: string): string[] => {
  const pendentes: string[] = [];
  if (senha.length < 8) pendentes.push(REGRAS_SENHA[0]);
  if (!/[A-Z]/.test(senha)) pendentes.push(REGRAS_SENHA[1]);
  if (!/[a-z]/.test(senha)) pendentes.push(REGRAS_SENHA[2]);
  if (!/[^A-Za-z0-9]/.test(senha)) pendentes.push(REGRAS_SENHA[3]);
  if (temSequencia(senha)) pendentes.push(REGRAS_SENHA[4]);
  return pendentes;
};

/** Recusa padrão (400): mensagem curta + a lista de normas não cumpridas. */
export const recusaSenha = (
  senha: string
): { error: string; erros: string[] } | null => {
  const erros = validarSenhaForte(senha);
  if (erros.length === 0) return null;
  return { error: "Senha fora do padrão de segurança.", erros };
};

/** Gera o valor completo a ser gravado em `usuarios.senha`. */
export async function hashSenha(senha: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(TAM_SALT));
  const hash = await derivar(senha, salt, ITERACOES);
  return `${PREFIXO}${ITERACOES}$${paraBase64(salt)}$${paraBase64(hash)}`;
}

/**
 * Verifica a senha digitada contra o valor armazenado.
 * `upgrade = true` quando a verificação usou texto puro (senha legada)
 * e o chamador DEVE regravar a senha com `hashSenha`.
 */
export async function verificarSenha(
  senha: string,
  armazenado: string
): Promise<{ ok: boolean; upgrade: boolean }> {
  if (armazenado.startsWith(PREFIXO)) {
    const partes = armazenado.slice(PREFIXO.length).split("$");
    if (partes.length !== 3) return { ok: false, upgrade: false };
    const [iterStr, saltB64, hashB64] = partes;
    const iteracoes = Number(iterStr);
    if (!Number.isFinite(iteracoes) || iteracoes <= 0) return { ok: false, upgrade: false };
    try {
      const derivado = await derivar(senha, deBase64(saltB64), iteracoes);
      return { ok: iguais(derivado, deBase64(hashB64)), upgrade: false };
    } catch {
      return { ok: false, upgrade: false };
    }
  }

  // Legado: valor em texto puro (contas antigas) — comparação em tempo
  // constante e sinaliza upgrade para ser hasheada no próximo login.
  const ok = iguais(paraBytes(senha), paraBytes(armazenado));
  return { ok, upgrade: ok };
}
