// ============================================================
// ENCERRAMENTO DE SESSÃO (usado por todos os "Sair" do sistema)
//
// Revoga o token NO SERVIDOR (rota POST /api/auth/logout — a sessão
// deixa de valer imediatamente, não apenas no navegador) e só então
// limpa o localStorage. Chamada é best-effort: se a rede falhar, o
// localStorage é limpo mesmo assim.
// ============================================================

const API = "http://127.0.0.1:8787";

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
}
