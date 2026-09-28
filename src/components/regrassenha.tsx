import React from "react";
import { Alert } from "react-bootstrap";
import { REGRAS_SENHA, regrasPendentes } from "./senhas";

interface RegrasSenhaProps {
  /** Senha digitada agora: as regras cumpridas saem em ✓ e as faltantes em ○ */
  senha?: string;
  titulo?: string;
  variant?: "warning" | "danger" | "info";
}

/**
 * Alerta com o padrão de senha (ver `senhas.ts` para as regras).
 *
 * Nos formulários de criação/troca ele fica visível — ✓/○ acompanham o que
 * está sendo digitado; no login ele só aparece quando a tentativa falha.
 */
export const RegrasSenha: React.FC<RegrasSenhaProps> = ({
  senha = "",
  titulo = "Padrão de senha exigido",
  variant = "warning",
}) => {
  const pendentes = new Set(regrasPendentes(senha));
  return (
    <Alert variant={variant} className="small">
      <strong className="d-block mb-1">{titulo}</strong>
      <ul className="mb-0 ps-3">
        {REGRAS_SENHA.map((regra) => {
          const faltando = pendentes.has(regra);
          return (
            <li key={regra} className={faltando ? "" : "text-success"}>
              {faltando ? "○" : "✓"} {regra}
            </li>
          );
        })}
      </ul>
    </Alert>
  );
};
