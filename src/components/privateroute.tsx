import React from "react";
import { Navigate } from "react-router-dom";

interface PrivateRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

// Guarda de rotas: exige sessão (localStorage "usuarioLogado").
// Se "allowedRoles" for informado, exige também um dos perfis listados.
export const PrivateRoute: React.FC<PrivateRouteProps> = ({
  children,
  allowedRoles,
}) => {
  let usuario: { role?: string } | null = null;

  try {
    const bruto = localStorage.getItem("usuarioLogado");
    usuario = bruto ? JSON.parse(bruto) : null;
  } catch {
    usuario = null;
  }

  // Sem sessão válida → volta para a Home (tela de login)
  if (!usuario) {
    return <Navigate to="/" replace />;
  }

  // Sessão válida, mas perfil sem permissão → Home
  if (allowedRoles && !allowedRoles.includes(usuario.role ?? "")) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
