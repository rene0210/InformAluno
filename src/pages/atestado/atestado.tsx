import React from "react";
import { Button } from "react-bootstrap";
import { abrirEmNovaAba } from "./abrirarquivo";

// Abre o atestado (data URL de PDF/imagem) em outra aba usando Blob.
const abrirAtestado = (dataUrl: string): void => abrirEmNovaAba(dataUrl, "Atestado");

interface AtestadoBotaoProps {
  /** data URL do anexo (application/pdf ou image/*) */
  atestado?: string | null;
  /** nome original do arquivo (ex.: atestado.pdf) */
  nome?: string | null;
  rotulo?: string;
  size?: "sm" | "lg";
}

// Botão "📎 Ver atestado" — some quando não há anexo.
export const AtestadoBotao: React.FC<AtestadoBotaoProps> = ({
  atestado,
  nome,
  rotulo,
  size = "sm",
}) => {
  if (!atestado) return null;
  return (
    <Button
      variant="outline-danger"
      size={size}
      onClick={() => abrirAtestado(atestado)}
      title={nome || "Atestado"}
    >
      📎 {rotulo || "Ver atestado"}
    </Button>
  );
};
