import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Home } from "./pages/home/home";
import { Portaria } from "./pages/portaria/portaria";
import { Cadastro } from "../inform-aluno-api/src/components/cadastro";
import { RegistroUsuario } from "./pages/auth/registrousuario";
import { EsqueciSenha } from "./pages/auth/esquecisenha";
import { RedefinirSenha } from "./pages/auth/redefinirsenha";
import { EscolhaInicial } from "./pages/auth/escolhainicial";
import { AdminDashboard } from "./pages/adm/admindashboard";
import { PrivateRoute } from "./components/privateroute";
import { ControleInatividade } from "./components/inatividade";
import { DiretoriaDashboard } from "./pages/diretoria/diretoriadashboard";
import { CadastroConvidado } from "./pages/convite/cadastroconvite";
import { AprovacaoTerceiro } from "./pages/aprovacao/aprovacaoterceiro";
import { ProfessorDashboard } from "./pages/professor/professordashboard";
import { PainelResponsavel } from "./pages/responsavel/painelresponsavel";
import { SecretariaTela } from "./pages/secretaria/secretariatela";
import { AlunoDashboard } from "./pages/aluno/alunodashboard";

function App() {
  return (
    <BrowserRouter>
      {/* Encerra a sessão após 15 minutos sem atividade do usuário */}
      <ControleInatividade />
      <Routes>
        {/* Rotas Públicas */}
        <Route path="/" element={<Home />} />
        <Route path="/registrar" element={<RegistroUsuario />} />
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        <Route path="/redefinir-senha/:token" element={<RedefinirSenha />} />
        <Route path="/escolha" element={<EscolhaInicial />} />

        {/* Rotas Privadas */}
        <Route
          path="/cadastro"
          element={
            <PrivateRoute>
              <Cadastro />
            </PrivateRoute>
          }
        />
        <Route
          path="/portaria"
          element={
            <PrivateRoute>
              <Portaria />
            </PrivateRoute>
          }
        />

        <Route path="/convite/:token" element={<CadastroConvidado />} />

        {/* Aprovação do 3º responsável (botões do e-mail do pai/mãe) */}
        <Route path="/aprovar-terceiro/:token" element={<AprovacaoTerceiro />} />

        {/* Rota Privada de Admin */}
        <Route
          path="/admin"
          element={
            <PrivateRoute allowedRoles={["ADMIN"]}>
              <AdminDashboard />
            </PrivateRoute>
          }
        />

        <Route
          path="/diretoria"
          element={
            <PrivateRoute allowedRoles={["DIRETOR", "COORDENADOR", "GESTOR", "ADMIN"]}>
              <DiretoriaDashboard />
            </PrivateRoute>
          }
        />

        {/* Dashboard do Aluno: apenas as próprias notas e matérias */}
        <Route
          path="/aluno"
          element={
            <PrivateRoute allowedRoles={["ALUNO", "ADMIN"]}>
              <AlunoDashboard />
            </PrivateRoute>
          }
        />

        {/* Painel do Professor: lançar notas e acompanhamento */}
        <Route
          path="/professor"
          element={
            <PrivateRoute allowedRoles={["PROFESSOR", "ADMIN"]}>
              <ProfessorDashboard />
            </PrivateRoute>
          }
        />

        {/* Painel do Responsável: notas e acompanhamento dos filhos */}
        <Route
          path="/painel"
          element={
            <PrivateRoute allowedRoles={["RESPONSAVEL", "ADMIN"]}>
              <PainelResponsavel />
            </PrivateRoute>
          }
        />

        {/* Painel da Secretaria: ajuste de fotos do pré-cadastro (sem exclusão) */}
        <Route
          path="/secretaria"
          element={
            <PrivateRoute allowedRoles={["SECRETARIA", "ADMIN"]}>
              <SecretariaTela />
            </PrivateRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
export default App;
