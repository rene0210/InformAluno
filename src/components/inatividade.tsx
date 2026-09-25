import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { finalizarSessao } from "./sessao";

// Timeout de INATIVIDADE da sessão: se o usuário ficar 15 minutos sem nenhuma
// interação (mouse, teclado, rolagem ou toque), o login é encerrado e ele
// volta para a Home com o aviso do motivo. Qualquer evento de atividade
// reinicia a contagem. A checagem roda de tempos em tempos (e não um timer
// por evento) para não criar/destruir timers a cada movimento do mouse.
const INTERVALO_INATIVIDADE_MS = 15 * 60 * 1000; // 15 minutos parado
const INTERVALO_CHECAGEM_MS = 30 * 1000; // conferência a cada 30s

const EVENTOS_ATIVIDADE = [
  "mousemove",
  "mousedown",
  "keydown",
  "wheel",
  "touchstart",
  "touchmove",
  "scroll",
] as const;

export const ControleInatividade: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let ultimoContato = Date.now();

    const marcarAtividade = () => {
      ultimoContato = Date.now();
    };

    for (const evento of EVENTOS_ATIVIDADE) {
      window.addEventListener(evento, marcarAtividade, { passive: true });
    }

    const verificar = window.setInterval(() => {
      // Sem sessão (não logado) não há o que expirar — e a contagem não
      // deve correr "às costas" para explodir no momento do login.
      const temSessao =
        !!localStorage.getItem("token") || !!localStorage.getItem("usuarioLogado");
      if (!temSessao) {
        ultimoContato = Date.now();
        return;
      }

      if (Date.now() - ultimoContato >= INTERVALO_INATIVIDADE_MS) {
        // Encerra a sessão (mesmas chaves do "Sair" das telas) e volta
        // para a Home avisando por que o usuário foi deslogado.
        finalizarSessao();
        navigate("/", { state: { sessaoInativa: true } });
      }
    }, INTERVALO_CHECAGEM_MS);

    return () => {
      window.clearInterval(verificar);
      for (const evento of EVENTOS_ATIVIDADE) {
        window.removeEventListener(evento, marcarAtividade);
      }
    };
  }, [navigate]);

  return null;
};
