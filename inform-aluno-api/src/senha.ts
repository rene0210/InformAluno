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
