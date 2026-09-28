// ============================================================
// BASE DA API — único lugar que diz para onde o front manda as requisições
//
// Em produção a URL vem da variável de build VITE_API_URL:
//   VITE_API_URL=https://inform-aluno-api.<seu-dominio>.workers.dev npm run build
//
// Sem a variável (dev local), vale o wrangler dev de sempre.
// O replace final evita "//api/..." quando a URL é colada com barra no fim.
// ============================================================

const configurada = import.meta.env.VITE_API_URL as string | undefined;

export const API: string = (
  configurada && configurada.length > 0 ? configurada : "http://127.0.0.1:8787"
).replace(/\/+$/, "");
