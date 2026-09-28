/**
 * Padrão de senha exigido pelo InformAluno.
 *
 * Estas são as MESMAS frases que a API devolve em `erros` quando recusa uma
 * senha (`inform-aluno-api/src/senha.ts`) — a validação de quem manda no
 * servidor é lá, aqui é só para a pessoa ver as normas antes de errar.
 *
 * Cobrem os pontos que criam ou trocam senha: criação de conta, "Esqueci a
 * senha" e redefinição pelo painel do admin. O LOGIN não cobra nada (contas
 * antigas continuam entrando), mas ao falhar ele mostra o alerta de normas
 * como orientação.
 */
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

/** Regras que a senha ainda NÃO cumpre — [] = senha válida. */
export const regrasPendentes = (senha: string): string[] => {
  const pendentes: string[] = [];
  if (senha.length < 8) pendentes.push(REGRAS_SENHA[0]);
  if (!/[A-Z]/.test(senha)) pendentes.push(REGRAS_SENHA[1]);
  if (!/[a-z]/.test(senha)) pendentes.push(REGRAS_SENHA[2]);
  if (!/[^A-Za-z0-9]/.test(senha)) pendentes.push(REGRAS_SENHA[3]);
  if (temSequencia(senha)) pendentes.push(REGRAS_SENHA[4]);
  return pendentes;
};

/** Normas não cumpridas em uma frase só (para caber num Alert de erro). */
export const regrasEmUmaLinha = (erros: string[]): string => erros.join(" • ");
