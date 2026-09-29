// ============================================================
// ENCERRAMENTO DE SESSÃO (usado por todos os "Sair" do sistema)
//
// Revoga o token NO SERVIDOR (rota POST /api/auth/logout — a sessão
// deixa de valer imediatamente, não apenas no navegador) e só então
// limpa o localStorage. Chamada é best-effort: se a rede falhar, o
// localStorage é limpo mesmo assim.
//
// Ao final também dispara EVENTO_SESSAO_ENCERRADA para as telas
// limparem o que depende de usuário — em especial a senha digitada na
// tela de login, que pode já estar montada quando o logout acontece
// (nesse caso o React não remonta a rota e o valor ficaria na caixa).
// ============================================================

import { API } from "./api";

export const EVENTO_SESSAO_ENCERRADA = "informaluno:sessao-encerrada";

export function finalizarSessao(): void {
  const token = localStorage.getItem("token");
  if (token) {
    fetch(`${API}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
  localStorage.removeItem("token");
  localStorage.removeItem("usuarioLogado");
  window.dispatchEvent(new Event(EVENTO_SESSAO_ENCERRADA));
}
