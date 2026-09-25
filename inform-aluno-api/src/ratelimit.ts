// ============================================================
// RATE LIMIT DE LOGIN (proteção contra força-bruta)
//
// Conta APENAS tentativas FALHAS por e-mail+IP dentro de uma janela
// deslizante simples; um login bem-sucedido zera o contador. Ao estourar
// o limite, o login responde 429 até a janela expirar.
//
// Limite: 10 falhas em 5 minutos por (e-mail + IP).
//
// Observação de implantação: o estado é em memória do isolate — em
// produção multi-isolate do Workers o limite vale por isolate (defesa
// em profundidade; para limite global use Cloudflare Rate Limiting).
// ============================================================

const JANELA_MS = 5 * 60 * 1000;
const MAX_FALHAS = 10;

interface Registro {
  falhas: number;
  janelaInicio: number;
}

const registros = new Map<string, Registro>();

// Evita crescimento indefinido: descarta janelas vencidas quando o mapa fica grande
function podar(agora: number): void {
  if (registros.size < 5000) return;
  for (const [chave, reg] of registros) {
    if (agora - reg.janelaInicio >= JANELA_MS) registros.delete(chave);
  }
}

/** true = excedeu o limite (chamador deve responder 429). */
export function loginBloqueado(chave: string): boolean {
  const agora = Date.now();
  const reg = registros.get(chave);
  if (!reg) return false;
  if (agora - reg.janelaInicio >= JANELA_MS) {
    registros.delete(chave);
    return false;
  }
  return reg.falhas >= MAX_FALHAS;
}

/** Registra uma tentativa de login com senha errada. */
export function registrarFalha(chave: string): void {
  const agora = Date.now();
  podar(agora);
  const reg = registros.get(chave);
  if (!reg || agora - reg.janelaInicio >= JANELA_MS) {
    registros.set(chave, { falhas: 1, janelaInicio: agora });
    return;
  }
  reg.falhas += 1;
}

/** Login bem-sucedido: zera a contagem da chave. */
export function limparFalhas(chave: string): void {
  registros.delete(chave);
}
