import React, { useState, useEffect, useRef } from "react";
import { finalizarSessao } from "../../components/sessao";
import {
  Container,
  Card,
  Table,
  Button,
  Navbar,
  Nav,
  Badge,
  Modal,
  Form,
  InputGroup,
  Alert,
  Row,
  Col,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { abrirEmNovaAba } from "../atestado/abrirarquivo";
import { RegrasSenha } from "../../components/regrassenha";
import { regrasPendentes, regrasEmUmaLinha } from "../../components/senhas";
import "../cadastro/Cadastro.css";
import { API } from "../../components/api";

interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: string;
  criado_em: string;
  aluno_id?: number | null;
  aluno_nome?: string | null;
}

interface AlunoCadastrado {
  id: number;
  nome: string;
  matricula: string;
  cpf: string;
  status: string;
  foto_aluno: string | null;
  pai_nome: string | null;
  pai_cpf: string | null;
  foto_pai: string | null;
  mae_nome: string | null;
  mae_cpf: string | null;
  foto_mae: string | null;
}

// Linha do log de acessos (logins) exibido no painel do admin
interface LogAcesso {
  id: number;
  tipo: string;
  usuario_nome: string;
  usuario_email: string;
  papel: string;
  criado_em: string;
}

// Linha do log de acessos temporários/terceiros criados
interface LogTerceiro {
  id: number;
  tipo: string;
  status: string;
  convidado_nome: string | null;
  criado_em: string;
  expira_em: string;
  solicitante: string | null;
  aluno_nome: string | null;
  matricula: string | null;
}

// Opções de perfis/cargos do sistema escolar
const ROLES_DISPONIVEIS = [
  { valor: "DIRETOR", rotulo: "👔 Diretor / Reitor" },
  { valor: "COORDENADOR", rotulo: "📋 Coordenador Pedagógico" },
  { valor: "GESTOR", rotulo: "📊 Gestor / Coordenação" },
  { valor: "PROFESSOR", rotulo: "👨‍🏫 Professor" },
  { valor: "SECRETARIA", rotulo: "📋 Secretaria" },
  { valor: "ASSISTENTE_SOCIAL", rotulo: "🤝 Assistente Social" },
  { valor: "ALUNO", rotulo: "🎓 Aluno" },
  { valor: "PORTARIA", rotulo: "🛡️ Agente de Portaria" },
  { valor: "MOTORISTA", rotulo: "🚐 Motorista da Van" },
  { valor: "RESPONSAVEL", rotulo: "👨‍👩‍👧 Responsável Legal" },
  { valor: "ADMIN", rotulo: "⚡ Administrador Master" },
];

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [mensagem, setMensagem] = useState<{ tipo: "success" | "danger"; texto: string } | null>(null);

  // Estados dos Modais
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<Usuario | null>(null);
  const [showModalSenha, setShowModalSenha] = useState(false);
  const [showModalExcluir, setShowModalExcluir] = useState(false);
  const [showModalRole, setShowModalRole] = useState(false);

  const [novaSenha, setNovaSenha] = useState("");
  const [novoRole, setNovoRole] = useState("");

  // Destino do e-mail de teste — em branco, a API usa o e-mail do admin logado
  const [emailDestino, setEmailDestino] = useState("");

  // Pré-cadastros de alunos (tela de cadastro: aluno + pai + mãe)
  const [alunos, setAlunos] = useState<AlunoCadastrado[]>([]);
  const [alunoSelecionado, setAlunoSelecionado] = useState<AlunoCadastrado | null>(null);
  const [showModalExcluirAluno, setShowModalExcluirAluno] = useState(false);

  // Log de acessos (logins) + acessos temporários/terceiros criados
  const [logAcessos, setLogAcessos] = useState<LogAcesso[]>([]);
  const [logTerceiros, setLogTerceiros] = useState<LogTerceiro[]>([]);
  const [carregandoLog, setCarregandoLog] = useState(true);

  // Vínculo da conta ALUNO com um registro de aluno (notas/matérias)
  const [showModalVinculo, setShowModalVinculo] = useState(false);
  const [usuarioVinculo, setUsuarioVinculo] = useState<Usuario | null>(null);
  const [vinculoAlunoId, setVinculoAlunoId] = useState("");
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);

  // Headers com o token de sessão (exigido pelas rotas /api/admin)
  const authHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  });

  // Envia um e-mail de teste (valida o SMTP configurado no backend).
  // Com destino digitado, encaminha para esse e-mail; em branco, a API usa
  // o e-mail do próprio administrador logado.
  const testarEmail = async () => {
    try {
      const destino = emailDestino.trim();
      const res = await fetch(`${API}/api/admin/testar-email`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(destino ? { para: destino } : {}),
      });
      if (res.status === 401 || res.status === 403) {
        finalizarSessao();
        navigate("/");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setMensagem({ tipo: "danger", texto: data.error || "Erro ao testar e-mail." });
        return;
      }
      if (data.modo === "enviado") {
        setMensagem({
          tipo: "success",
          texto: `✅ ${data.message} | ${data.conexao || ""}`,
        });
      } else {
        setMensagem({
          tipo: "danger",
          texto: `⚠️ ${data.message} | Conexão SMTP: ${data.conexao || "não testada"}`,
        });
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Erro na requisição ao servidor." });
    }
  };

  // Buscar todos os usuários do banco de dados
  const carregarUsuarios = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/usuarios`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setUsuarios(data);
      } else if (res.status === 401 || res.status === 403) {
        // Sessão inválida/expirada: volta para a tela de login
        finalizarSessao();
        navigate("/");
      } else {
        setMensagem({ tipo: "danger", texto: "Falha ao carregar a lista de usuários." });
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Erro de conexão com o servidor." });
    } finally {
      setLoading(false);
    }
  };

  // Buscar os pré-cadastros de alunos com responsáveis
  const carregarAlunos = async () => {
    try {
      const res = await fetch(`${API}/api/admin/alunos`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAlunos(data);
      }
    } catch {
      setAlunos([]);
    }
  };

  // Buscar o log de acessos + acessos temporários/terceiros criados
  const carregarLog = async () => {
    setCarregandoLog(true);
    try {
      const res = await fetch(`${API}/api/admin/log`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setLogAcessos(data.acessos || []);
        setLogTerceiros(data.terceiros || []);
      }
    } catch {
      setLogAcessos([]);
      setLogTerceiros([]);
    } finally {
      setCarregandoLog(false);
    }
  };

  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    carregarUsuarios();
    carregarAlunos();
    carregarLog();
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */

  // 1. Redefinir Senha
  const handleRedefinirSenha = async () => {
    if (!usuarioSelecionado || !novaSenha) return;

    // Padrão de senha exigido pela API (recusa com 400) — avisamos antes
    const pendentes = regrasPendentes(novaSenha);
    if (pendentes.length > 0) {
      setMensagem({
        tipo: "danger",
        texto: `Senha fora do padrão de segurança. ${regrasEmUmaLinha(pendentes)}`,
      });
      return;
    }

    try {
      const res = await fetch(`${API}/api/admin/usuarios/${usuarioSelecionado.id}/senha`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ novaSenha }),
      });

      const data = await res.json();

      if (res.ok) {
        setMensagem({ tipo: "success", texto: `Senha de ${usuarioSelecionado.nome} redefinida com sucesso!` });
        setShowModalSenha(false);
        setNovaSenha("");
      } else if (Array.isArray(data.erros) && data.erros.length > 0) {
        setMensagem({ tipo: "danger", texto: `${data.error} ${regrasEmUmaLinha(data.erros)}` });
      } else {
        setMensagem({ tipo: "danger", texto: data.error || "Erro ao redefinir senha." });
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Erro na requisição ao servidor." });
    }
  };

  // 2. Alterar Cargo / Perfil
  const handleAlterarRole = async () => {
    if (!usuarioSelecionado || !novoRole) return;

    try {
      const res = await fetch(`${API}/api/admin/usuarios/${usuarioSelecionado.id}/role`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ novoRole }),
      });

      const data = await res.json();

      if (res.ok) {
        setMensagem({ tipo: "success", texto: `Cargo de ${usuarioSelecionado.nome} alterado para ${novoRole}!` });
        setShowModalRole(false);
        carregarUsuarios();
      } else {
        setMensagem({ tipo: "danger", texto: data.error || "Erro ao alterar cargo." });
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Erro na requisição ao servidor." });
    }
  };

  // 3. Excluir Usuário
  const handleExcluirUsuario = async () => {
    if (!usuarioSelecionado) return;

    try {
      const res = await fetch(`${API}/api/admin/usuarios/${usuarioSelecionado.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });

      const data = await res.json();

      if (res.ok) {
        setMensagem({ tipo: "success", texto: `Usuário ${usuarioSelecionado.nome} excluído com sucesso!` });
        setShowModalExcluir(false);
        carregarUsuarios();
      } else {
        setMensagem({ tipo: "danger", texto: data.error || "Erro ao excluir usuário." });
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Erro na requisição ao servidor." });
    }
  };

  // 4. Excluir pré-cadastro de aluno (aluno + responsáveis)
  const handleExcluirAluno = async () => {
    if (!alunoSelecionado) return;

    try {
      const res = await fetch(`${API}/api/admin/alunos/${alunoSelecionado.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });

      const data = await res.json();

      if (res.ok) {
        setMensagem({
          tipo: "success",
          texto: `Pré-cadastro de ${alunoSelecionado.nome} excluído do banco!`,
        });
        setShowModalExcluirAluno(false);
        carregarAlunos();
      } else {
        setMensagem({ tipo: "danger", texto: data.error || "Erro ao excluir pré-cadastro." });
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Erro na requisição ao servidor." });
    }
  };

  // === Modal de fotos do pré-cadastro (aluno, pai e mãe) ===
  type AlvoFoto = "aluno" | "pai" | "mae";
  const [showModalFotos, setShowModalFotos] = useState(false);
  const [fotos, setFotos] = useState<{ aluno: string | null; pai: string | null; mae: string | null }>({
    aluno: null,
    pai: null,
    mae: null,
  });
  const [alvoEdicao, setAlvoEdicao] = useState<AlvoFoto | null>(null);
  const [modoEdicao, setModoEdicao] = useState<"file" | "camera">("file");
  const videoFotoRef = useRef<HTMLVideoElement | null>(null);

  const rotuloAlvo: Record<AlvoFoto, string> = { aluno: "Aluno", pai: "Responsável", mae: "2º Responsável" };

  const pararCameraFoto = () => {
    const v = videoFotoRef.current;
    if (v && v.srcObject) {
      (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
  };

  const iniciarCameraFoto = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoFotoRef.current) {
        videoFotoRef.current.srcObject = stream;
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Não foi possível acessar a câmera." });
      setModoEdicao("file");
    }
  };

  const salvarFoto = async (chave: AlvoFoto, foto: string) => {
    if (!alunoSelecionado) return;
    try {
      const res = await fetch(`${API}/api/admin/alunos/${alunoSelecionado.id}/foto`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ alvo: chave, foto }),
      });
      const data = await res.json();
      if (res.ok) {
        setFotos((prev) => {
          const novo = { ...prev };
          novo[chave] = foto;
          return novo;
        });
        setMensagem({ tipo: "success", texto: `Foto do ${rotuloAlvo[chave]} atualizada com sucesso!` });
        pararCameraFoto();
        carregarAlunos();
      } else {
        setMensagem({ tipo: "danger", texto: data.error || "Erro ao salvar a foto." });
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Erro na requisição ao servidor." });
    }
  };

  const handleArquivoFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !alvoEdicao) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) salvarFoto(alvoEdicao, reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const capturarCameraFoto = () => {
    const v = videoFotoRef.current;
    if (!v || !alvoEdicao) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      salvarFoto(alvoEdicao, canvas.toDataURL("image/jpeg"));
    }
  };

  const selecionarAlvoFoto = (chave: AlvoFoto) => {
    pararCameraFoto();
    if (alvoEdicao === chave) {
      setAlvoEdicao(null);
      return;
    }
    setAlvoEdicao(chave);
    setModoEdicao("file");
  };

  const abrirModalFotos = (a: AlunoCadastrado) => {
    setAlunoSelecionado(a);
    setFotos({ aluno: a.foto_aluno, pai: a.foto_pai, mae: a.foto_mae });
    setAlvoEdicao(null);
    setModoEdicao("file");
    setShowModalFotos(true);
  };

  const fecharModalFotos = () => {
    pararCameraFoto();
    setShowModalFotos(false);
    setAlvoEdicao(null);
    setModoEdicao("file");
  };

  // 5. Vincular a conta ALUNO a um aluno (habilita o dashboard de notas)
  const abrirModalVinculo = (u: Usuario) => {
    setUsuarioVinculo(u);
    setVinculoAlunoId(u.aluno_id ? String(u.aluno_id) : "");
    setShowModalVinculo(true);
  };

  const salvarVinculo = async () => {
    if (!usuarioVinculo || salvandoVinculo) return;
    setSalvandoVinculo(true);
    try {
      const res = await fetch(
        `${API}/api/admin/usuarios/${usuarioVinculo.id}/aluno`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({
            aluno_id: vinculoAlunoId === "" ? null : Number(vinculoAlunoId),
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setMensagem({ tipo: "success", texto: `Vínculo de ${usuarioVinculo.nome} atualizado!` });
        setShowModalVinculo(false);
        carregarUsuarios();
      } else {
        setMensagem({ tipo: "danger", texto: data.error || "Erro ao salvar o vínculo." });
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Erro na requisição ao servidor." });
    } finally {
      setSalvandoVinculo(false);
    }
  };

  const handleLogout = () => {
    finalizarSessao();
    navigate("/");
  };

  // Cor visual personalizada por tipo de cargo
  const getBadgeRole = (role: string) => {
    switch (role) {
      case "ADMIN":
        return <Badge bg="danger">⚡ ADMIN</Badge>;
      case "DIRETOR":
        return <Badge bg="dark">👔 DIRETOR / REITOR</Badge>;
      case "GESTOR":
        return <Badge bg="info" text="dark">📊 GESTOR</Badge>;
      case "PROFESSOR":
        return <Badge bg="primary">👨‍🏫 PROFESSOR</Badge>;
      case "SECRETARIA":
        return <Badge bg="info" text="dark">📋 SECRETARIA</Badge>;
      case "ASSISTENTE_SOCIAL":
        return <Badge bg="success">🤝 ASSISTENTE SOCIAL</Badge>;
      case "ALUNO":
        return <Badge bg="secondary">🎓 ALUNO</Badge>;
      case "PORTARIA":
        return <Badge bg="warning" text="dark">🛡️ PORTARIA</Badge>;
      case "MOTORISTA":
        return <Badge bg="warning" text="dark">🚐 MOTORISTA</Badge>;
      default:
        return <Badge bg="success">👨‍👩‍👧 RESPONSÁVEL</Badge>;
    }
  };

  // Filtro de busca na tabela
  const usuariosFiltrados = usuarios.filter(
    (u) =>
      u.nome.toLowerCase().includes(busca.toLowerCase()) ||
      u.email.toLowerCase().includes(busca.toLowerCase()) ||
      u.role.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: "#f1f5f9" }}>
      {/* NAVBAR */}
      <Navbar expand="lg" className="portaria-navbar px-4 text-white shadow-sm">
        <Navbar.Brand className="fw-bold fs-5 text-white d-flex align-items-center">
          <span className="status-indicator bg-danger"></span>
          InformAluno <span className="ms-2 fs-6 fw-normal text-light opacity-75">| Gestão Administrativa</span>
        </Navbar.Brand>
        <Nav className="ms-auto d-flex align-items-center gap-2">
          <Button
            variant="outline-light"
            size="sm"
            onClick={() =>
              window.history.length > 1 ? window.history.back() : (window.location.href = "/")
            }
          >
            ← Voltar
          </Button>
          <InputGroup size="sm" className="flex-shrink-1">
            <Form.Control
              type="email"
              placeholder="Encaminhar para outro e-mail…"
              aria-label="E-mail de destino do e-mail de teste"
              title="Em branco, envia para o e-mail do admin logado"
              value={emailDestino}
              onChange={(e) => setEmailDestino(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  testarEmail();
                }
              }}
              style={{ width: "230px" }}
            />
            <Button variant="outline-light" size="sm" onClick={testarEmail}>
              ✉️ Testar E-mail
            </Button>
          </InputGroup>
          <Button variant="outline-light" size="sm" onClick={handleLogout}>
            🚪 Sair do Sistema
          </Button>
        </Nav>
      </Navbar>

      <Container className="my-4">
        {mensagem && (
          <Alert variant={mensagem.tipo} dismissible onClose={() => setMensagem(null)}>
            {mensagem.texto}
          </Alert>
        )}

        <Card className="cadastro-card shadow-lg">
          <Card.Header className="cadastro-header d-flex justify-content-between align-items-center py-3 px-4">
            <div>
              <h4 className="m-0 fw-bold fs-5">Painel de Controle de Usuários</h4>
              <small className="opacity-75">Atribuição de cargos, redefinição de senhas e gestão total do sistema</small>
            </div>
            <Badge bg="light" text="dark" className="fs-6 px-3 py-2">
              Total: {usuarios.length} cadastrados
            </Badge>
          </Card.Header>

          <Card.Body className="p-4">
            {/* Barra de Busca */}
            <Row className="mb-4">
              <Col md={6}>
                <InputGroup>
                  <InputGroup.Text className="bg-white">🔍</InputGroup.Text>
                  <Form.Control
                    type="text"
                    placeholder="Buscar por nome, e-mail ou cargo..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="form-control-custom"
                  />
                </InputGroup>
              </Col>
            </Row>

            {/* Tabela de Usuários */}
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status"></div>
                <p className="mt-2 text-muted">Carregando dados dos usuários...</p>
              </div>
            ) : (
              <Table responsive hover className="align-middle border">
                <thead className="table-light">
                  <tr>
                    <th>ID</th>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Cargo / Perfil</th>
                    <th>Data de Cadastro</th>
                    <th className="text-center">Ações Administrador</th>
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-muted">
                        Nenhum usuário encontrado.
                      </td>
                    </tr>
                  ) : (
                    usuariosFiltrados.map((u) => (
                      <tr key={u.id}>
                        <td className="fw-bold text-secondary">#{u.id}</td>
                        <td className="fw-semibold">{u.nome}</td>
                        <td>{u.email}</td>
                        <td>
                          {getBadgeRole(u.role)}
                          {u.aluno_nome && (
                            <div className="small text-muted">🎓 {u.aluno_nome}</div>
                          )}
                        </td>
                        <td className="small text-muted">
                          {u.criado_em ? new Date(u.criado_em).toLocaleDateString("pt-BR") : "N/A"}
                        </td>
                        <td className="text-center">
                          <div className="d-flex justify-content-center gap-2">
                            <Button
                              variant="outline-dark"
                              size="sm"
                              onClick={() => {
                                setUsuarioSelecionado(u);
                                setNovoRole(u.role);
                                setShowModalRole(true);
                              }}
                            >
                              👔 Alterar Cargo
                            </Button>
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => {
                                setUsuarioSelecionado(u);
                                setShowModalSenha(true);
                              }}
                            >
                              🔑 Senha
                            </Button>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              disabled={u.role === "ADMIN"}
                              onClick={() => {
                                setUsuarioSelecionado(u);
                                setShowModalExcluir(true);
                              }}
                            >
                              🗑️ Excluir
                            </Button>
                            {u.role === "ALUNO" && (
                              <Button
                                variant="outline-success"
                                size="sm"
                                onClick={() => abrirModalVinculo(u)}
                                title="Vincular esta conta a um aluno (notas/matrículas)"
                              >
                                🎓 Vincular
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            )}
          </Card.Body>
        </Card>

        {/* CARD 2: PRÉ-CADASTROS DE ALUNOS (tela de cadastro) */}
        <Card className="cadastro-card shadow-lg mt-4">
          <Card.Header className="cadastro-header d-flex justify-content-between align-items-center py-3 px-4">
            <div>
              <h4 className="m-0 fw-bold fs-5">Alunos Cadastrados (Pré-Cadastros)</h4>
              <small className="opacity-75">
                Registros da tela de cadastro — aluno e responsáveis
              </small>
            </div>
            <Badge bg="light" text="dark" className="fs-6 px-3 py-2">
              Total: {alunos.length} cadastros
            </Badge>
          </Card.Header>

          <Card.Body className="p-4">
            {alunos.length === 0 ? (
              <p className="text-center text-muted py-4 mb-0">
                Nenhum pré-cadastro de aluno encontrado.
              </p>
            ) : (
              <Table responsive hover className="align-middle border">
                <thead className="table-light">
                  <tr>
                    <th>ID</th>
                    <th>Aluno</th>
                    <th>Matrícula</th>
                    <th>Responsável</th>
                    <th>2º Responsável</th>
                    <th>Status</th>
                    <th className="text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {alunos.map((a) => (
                    <tr key={a.id}>
                      <td className="fw-bold text-secondary">#{a.id}</td>
                      <td className="fw-semibold">{a.nome}</td>
                      <td>{a.matricula}</td>
                      <td className="small">
                        {a.pai_nome || "—"}
                        {a.pai_cpf && <div className="text-muted">CPF: {a.pai_cpf}</div>}
                      </td>
                      <td className="small">
                        {a.mae_nome || "—"}
                        {a.mae_cpf && <div className="text-muted">CPF: {a.mae_cpf}</div>}
                      </td>
                      <td>
                        {a.status === "PENDENTE_VALIDACAO" ? (
                          <Badge bg="warning" text="dark">⏳ Pendente</Badge>
                        ) : (
                          <Badge bg="success">✔ {a.status}</Badge>
                        )}
                      </td>
                      <td className="text-center">
                        <div className="d-flex gap-2 justify-content-center">
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => abrirModalFotos(a)}
                          >
                            📷 Fotos
                          </Button>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => {
                              setAlunoSelecionado(a);
                              setShowModalExcluirAluno(true);
                            }}
                          >
                            🗑️ Excluir Cadastro
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card.Body>
        </Card>

        {/* CARD 3: LOG DE ACESSOS + ACESSOS TEMPORÁRIOS/TERCEIROS CRIADOS */}
        <Card className="cadastro-card shadow-lg mt-4">
          <Card.Header className="cadastro-header d-flex justify-content-between align-items-center py-3 px-4">
            <div>
              <h4 className="m-0 fw-bold fs-5">📋 Log de Acessos &amp; Terceiros</h4>
              <small className="opacity-75">
                Quem acessou o sistema e os acessos temporários criados — histórico completo
              </small>
            </div>
            <div className="d-flex gap-2 align-items-center">
              <Badge bg="light" text="dark" className="fs-6 px-3 py-2">
                {logAcessos.length} acessos
              </Badge>
              <Badge bg="light" text="dark" className="fs-6 px-3 py-2">
                {logTerceiros.length} temporários
              </Badge>
              <Button
                size="sm"
                variant="outline-light"
                onClick={carregarLog}
                disabled={carregandoLog}
                title="Atualizar log"
              >
                🔄
              </Button>
            </div>
          </Card.Header>

          <Card.Body className="p-4">
            {carregandoLog ? (
              <div className="text-center py-4">
                <div className="spinner-border text-primary" role="status"></div>
              </div>
            ) : (
              <Row className="g-4">
                <Col lg={6}>
                  <h6 className="fw-bold mb-2">🔑 Acessos (logins)</h6>
                  <Table responsive hover size="sm" className="align-middle border">
                    <thead className="table-light">
                      <tr>
                        <th>Data / Hora</th>
                        <th>Usuário</th>
                        <th>Cargo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logAcessos.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-center py-3 text-muted">
                            Nenhum acesso registrado ainda.
                          </td>
                        </tr>
                      ) : (
                        logAcessos.map((a) => (
                          <tr key={"ac" + a.id}>
                            <td className="small text-nowrap text-muted">
                              {a.criado_em ? a.criado_em.slice(0, 16) : "—"}
                            </td>
                            <td className="small">
                              <strong>{a.usuario_nome}</strong>
                              <div className="text-muted">{a.usuario_email}</div>
                            </td>
                            <td>
                              <Badge bg="secondary">{a.papel}</Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </Col>

                <Col lg={6}>
                  <h6 className="fw-bold mb-2">🕒 Acessos temporários / terceiros criados</h6>
                  <Table responsive hover size="sm" className="align-middle border">
                    <thead className="table-light">
                      <tr>
                        <th>Data / Hora</th>
                        <th>Aluno</th>
                        <th>Solicitante</th>
                        <th>Tipo</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logTerceiros.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-3 text-muted">
                            Nenhum acesso temporário criado ainda.
                          </td>
                        </tr>
                      ) : (
                        logTerceiros.map((t) => (
                          <tr key={"tc" + t.id}>
                            <td className="small text-nowrap text-muted">
                              {t.criado_em ? t.criado_em.slice(0, 16) : "—"}
                            </td>
                            <td className="small">
                              <strong>{t.aluno_nome || "—"}</strong>
                              {t.matricula && <div className="text-muted">{t.matricula}</div>}
                            </td>
                            <td className="small">{t.solicitante || "—"}</td>
                            <td className="small">
                              {t.tipo === "TERCEIRO_RESPONSAVEL" ? (
                                <Badge bg="info" text="dark">Terceiro</Badge>
                              ) : (
                                <Badge bg="secondary">Portaria</Badge>
                              )}
                            </td>
                            <td>
                              {t.status === "APROVADO" ? (
                                <Badge bg="success">APROVADO</Badge>
                              ) : t.status === "REJEITADO" ? (
                                <Badge bg="danger">REJEITADO</Badge>
                              ) : t.status === "UTILIZADO" ? (
                                <Badge bg="primary">UTILIZADO</Badge>
                              ) : t.status === "EXPIRADO" ? (
                                <Badge bg="secondary">EXPIRADO</Badge>
                              ) : (
                                <Badge bg="warning" text="dark">{t.status || "—"}</Badge>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </Col>
              </Row>
            )}
          </Card.Body>
        </Card>
      </Container>

      {/* MODAL 1: ALTERAR CARGO / PERFIL */}
      <Modal show={showModalRole} onHide={() => setShowModalRole(false)} centered>
        <Modal.Header closeButton className="bg-light">
          <Modal.Title className="fs-5 fw-bold">👔 Alterar Cargo do Usuário</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {usuarioSelecionado && (
            <>
              <p>
                Defina a nova função/cargo para <strong>{usuarioSelecionado.nome}</strong>.
              </p>
              <Form.Group className="mb-3">
                <Form.Label className="form-label-custom">Selecione o Novo Cargo</Form.Label>
                <Form.Select
                  className="form-control-custom"
                  value={novoRole}
                  onChange={(e) => setNovoRole(e.target.value)}
                >
                  {ROLES_DISPONIVEIS.map((role) => (
                    <option key={role.valor} value={role.valor}>
                      {role.rotulo}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModalRole(false)}>
            Cancelar
          </Button>
          <Button variant="success" onClick={handleAlterarRole}>
            Salvar Novo Cargo
          </Button>
        </Modal.Footer>
      </Modal>

      {/* MODAL 2: REDEFINIR SENHA */}
      <Modal show={showModalSenha} onHide={() => setShowModalSenha(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5 fw-bold">🔑 Redefinir Senha de Acesso</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {usuarioSelecionado && (
            <>
              <p>
                Redefinindo a senha do usuário <strong>{usuarioSelecionado.nome}</strong> (<code>{usuarioSelecionado.email}</code>).
              </p>
              <Form.Group className="mb-3">
                <Form.Label className="form-label-custom">Nova Senha</Form.Label>
                <Form.Control
                  type="password"
                  placeholder="Digite a nova senha"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  className="form-control-custom"
                />
              </Form.Group>
              {/* Normas da senha, com ✓/○ acompanhando o que está sendo digitado */}
              <RegrasSenha senha={novaSenha} />
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModalSenha(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleRedefinirSenha} disabled={!novaSenha}>
            Confirmar Nova Senha
          </Button>
        </Modal.Footer>
      </Modal>

      {/* MODAL 3: EXCLUIR USUÁRIO */}
      <Modal show={showModalExcluir} onHide={() => setShowModalExcluir(false)} centered>
        <Modal.Header closeButton className="bg-danger text-white">
          <Modal.Title className="fs-5 fw-bold">Confirmar Exclusão</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {usuarioSelecionado && (
            <p className="m-0">
              Tem certeza que deseja excluir a conta de <strong>{usuarioSelecionado.nome}</strong>?
              <br />
              <small className="text-danger fw-bold">Esta ação removerá o usuário do banco de dados.</small>
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModalExcluir(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleExcluirUsuario}>
            Sim, Excluir
          </Button>
        </Modal.Footer>
      </Modal>

      {/* MODAL 4: EXCLUIR PRÉ-CADASTRO DE ALUNO */}
      <Modal show={showModalExcluirAluno} onHide={() => setShowModalExcluirAluno(false)} centered>
        <Modal.Header closeButton className="bg-danger text-white">
          <Modal.Title className="fs-5 fw-bold">Excluir Pré-Cadastro</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {alunoSelecionado && (
            <p className="m-0">
              Tem certeza que deseja excluir o cadastro de{" "}
              <strong>{alunoSelecionado.nome}</strong> (matrícula {alunoSelecionado.matricula})?
              <br />
              <small className="text-danger fw-bold">
                O aluno e os responsáveis serão removidos e a portaria deixará de
                identificá-los.
              </small>
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModalExcluirAluno(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleExcluirAluno}>
            Sim, Excluir Cadastro
          </Button>
        </Modal.Footer>
      </Modal>

      {/* MODAL 5: FOTOS DO PRÉ-CADASTRO (visualizar / anexo / câmera) */}
      <Modal show={showModalFotos} onHide={fecharModalFotos} centered size="lg">
        <Modal.Header closeButton className="bg-light">
          <Modal.Title className="fs-5 fw-bold">
            📷 Fotos do Cadastro {alunoSelecionado ? `— ${alunoSelecionado.nome}` : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            {(["aluno", "pai", "mae"] as AlvoFoto[]).map((chave) => (
              <Col md={4} key={chave}>
                <Card className="text-center h-100 border">
                  <Card.Header className="fw-bold bg-white">{rotuloAlvo[chave]}</Card.Header>
                  <Card.Body className="d-flex flex-column align-items-center">
                    {fotos[chave] ? (
                      <img
                        src={fotos[chave] as string}
                        alt={rotuloAlvo[chave]}
                        className="rounded-circle border mb-2"
                        style={{ width: "96px", height: "96px", objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        className="text-muted d-flex align-items-center justify-content-center mb-2 border rounded bg-light"
                        style={{ width: "96px", height: "96px" }}
                      >
                        Sem foto
                      </div>
                    )}
                    <div className="d-flex gap-2">
                      {fotos[chave] && (
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => abrirEmNovaAba(fotos[chave] as string, "Foto")}
                        >
                          👁️ Ver
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={alvoEdicao === chave ? "primary" : "outline-secondary"}
                        onClick={() => selecionarAlvoFoto(chave)}
                      >
                        ✏️ Alterar
                      </Button>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>

          {alvoEdicao && (
            <div className="border rounded p-3 mt-3 bg-light">
              <div className="fw-bold mb-2">
                Alterando a foto do: <strong>{rotuloAlvo[alvoEdicao]}</strong>
              </div>

              <div className="d-flex gap-2 mb-3">
                <Button
                  size="sm"
                  variant={modoEdicao === "file" ? "primary" : "outline-primary"}
                  onClick={() => {
                    pararCameraFoto();
                    setModoEdicao("file");
                  }}
                >
                  📎 Anexar Arquivo
                </Button>
                <Button
                  size="sm"
                  variant={modoEdicao === "camera" ? "primary" : "outline-primary"}
                  onClick={() => {
                    setModoEdicao("camera");
                    iniciarCameraFoto();
                  }}
                >
                  📷 Câmera ao Vivo
                </Button>
              </div>

              {modoEdicao === "file" ? (
                <Form.Control type="file" accept="image/*" onChange={handleArquivoFoto} />
              ) : (
                <div className="text-center">
                  <video
                    ref={videoFotoRef}
                    autoPlay
                    playsInline
                    className="rounded border bg-dark w-100"
                    style={{ maxHeight: "280px" }}
                  />
                  <Button size="sm" variant="danger" className="mt-2" onClick={capturarCameraFoto}>
                    📸 Capturar e Salvar
                  </Button>
                </div>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={fecharModalFotos}>
            Fechar
          </Button>
        </Modal.Footer>
      </Modal>

      {/* MODAL 6: VINCULAR CONTA ALUNO A UM ALUNO (notas/matrículas) */}
      <Modal show={showModalVinculo} onHide={() => setShowModalVinculo(false)} centered>
        <Modal.Header closeButton className="bg-light">
          <Modal.Title className="fs-5 fw-bold">🎓 Vincular Aluno à Conta</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {usuarioVinculo && (
            <>
              <p>
                Vincule a conta de <strong>{usuarioVinculo.nome}</strong>{" "}
                (<code>{usuarioVinculo.email}</code>) a um aluno da escola para que ele
                veja as próprias notas e matérias no dashboard.
              </p>
              <Form.Group className="mb-3">
                <Form.Label className="form-label-custom">Aluno</Form.Label>
                <Form.Select
                  className="form-control-custom"
                  value={vinculoAlunoId}
                  onChange={(e) => setVinculoAlunoId(e.target.value)}
                >
                  <option value="">— Sem vínculo —</option>
                  {alunos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} (matrícula {a.matricula})
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModalVinculo(false)}>
            Cancelar
          </Button>
          <Button variant="success" onClick={salvarVinculo} disabled={salvandoVinculo}>
            {salvandoVinculo ? "Salvando..." : "Salvar Vínculo"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};