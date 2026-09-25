import React, { useState } from "react";
import {
  Container,
  Card,
  Form,
  Button,
  Row,
  Col,
  Navbar,
  Nav,
  Modal,
  Badge,
  Alert,
} from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import { TermosModal, PrivacidadeModal } from "../../components/legaltermos";
import "../cadastro/Cadastro.css";

export const Home: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Vem do timeout de inatividade (15 min): avisa o usuário por que saiu
  const localizacao = useLocation();
  const [sessaoInativa, setSessaoInativa] = useState(
    () => (localizacao.state as { sessaoInativa?: boolean } | null)?.sessaoInativa === true
  );

  const [showTermos, setShowTermos] = useState(false);
  const [showPrivacidade, setShowPrivacidade] = useState(false);

  // Modal "Esqueceu a senha"
  const [showEsqueciSenha, setShowEsqueciSenha] = useState(false);
  const [emailEsqueci, setEmailEsqueci] = useState("");
  const [erroEsqueci, setErroEsqueci] = useState<string | null>(null);
  const [sucessoEsqueci, setSucessoEsqueci] = useState<string | null>(null);
  const [linkSimulado, setLinkSimulado] = useState<string | null>(null);
  const [enviandoEsqueci, setEnviandoEsqueci] = useState(false);

  const abrirEsqueciSenha = () => {
    // Reseta o estado da caixa toda vez que abre
    setEmailEsqueci("");
    setErroEsqueci(null);
    setSucessoEsqueci(null);
    setLinkSimulado(null);
    setShowEsqueciSenha(true);
  };

  const handleEsqueciSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroEsqueci(null);
    setSucessoEsqueci(null);
    setLinkSimulado(null);
    setEnviandoEsqueci(true);

    try {
      const resposta = await fetch("http://127.0.0.1:8787/api/recuperar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailEsqueci }),
      });
      const dados = await resposta.json();

      if (resposta.ok) {
        setSucessoEsqueci(dados.message);
        // Modo simulação: o backend retorna o link para testes
        if (dados.linkSimulado) setLinkSimulado(dados.linkSimulado);
      } else {
        setErroEsqueci(dados.error || "Erro ao solicitar a redefinição de senha.");
      }
    } catch {
      setErroEsqueci("Não foi possível conectar ao servidor.");
    } finally {
      setEnviandoEsqueci(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      const resposta = await fetch("http://127.0.0.1:8787/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });

      const dados = await resposta.json();

      if (resposta.ok) {
        
        localStorage.setItem("usuarioLogado", JSON.stringify(dados.usuario));
        // Token de sessão exigido pelas rotas protegidas (/api/admin, /api/diretoria)
        if (dados.token) localStorage.setItem("token", dados.token);

        if (dados.usuario.role === "ADMIN") {
          navigate("/admin");
        } else if (
          dados.usuario.role === "DIRETOR" ||
          dados.usuario.role === "COORDENADOR" ||
          dados.usuario.role === "GESTOR"
        ) {
          navigate("/diretoria");
        } else if (dados.usuario.role === "PORTARIA" || dados.usuario.role === "MOTORISTA") {
          navigate("/portaria");
        } else if (dados.usuario.role === "PROFESSOR") {
          navigate("/professor");
        } else if (dados.usuario.role === "SECRETARIA") {
          navigate("/secretaria");
        } else if (dados.usuario.role === "ALUNO") {
          navigate("/aluno");
        } else {
          // RESPONSAVEL e afins: tela de escolha (portaria, cadastro ou painel)
          navigate("/escolha");
        }
      } else {
        setErro(dados.error || "E-mail ou senha incorretos.");
      }
    } catch (err) {
      console.error("Erro na tentativa de login:", err);
      setErro("Não foi possível conectar ao servidor. Verifique sua conexão.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div
      className="d-flex flex-column min-vh-100"
      style={{ backgroundColor: "#f1f5f9" }}
    >
      {/* --- NAVBAR SUPERIOR --- */}
      <Navbar expand="lg" className="portaria-navbar px-4 text-white shadow-sm">
        <Navbar.Brand className="fw-bold fs-5 text-white d-flex align-items-center">
          <span className="status-indicator"></span>
          InformAluno
          <span className="ms-2 fs-6 fw-normal text-light opacity-75">
            | Portal de Acesso
          </span>
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
          <Button
            variant="outline-light"
            size="sm"
            className="px-3 rounded-2 fw-semibold"
            onClick={() => navigate("/registrar")}
          >
            ✍️ Criar Conta / Registrar
          </Button>
        </Nav>
      </Navbar>

      {/* --- CONTEÚDO PRINCIPAL --- */}
      <Container className="my-auto py-5">
        <Row className="align-items-center justify-content-center g-5">
          {/* Apresentação do Sistema */}
          <Col lg={6} className="text-center text-lg-start">
            <Badge bg="primary" className="mb-3 px-3 py-2 fs-6">
              Segurança & Biometria Escolar
            </Badge>
            <h1 className="fw-bold display-5 text-dark mb-3">
              Controle de Acesso Escolar Inteligente
            </h1>
            <p className="text-secondary fs-5 mb-4">
              Plataforma corporativa para gestão de entrada e saída de alunos
              com verificação biometria facial, controle de responsáveis e
              validação em tempo real na portaria.
            </p>
            <div className="d-flex gap-3 justify-content-center justify-content-lg-start">
              <Button
                variant="primary"
                size="lg"
                className="btn-primary-custom px-4"
                onClick={() => navigate("/registrar")}
              >
                Criar Minha Conta
              </Button>
            </div>
          </Col>

          {/* Form / Card de Login */}
          <Col lg={5} md={8}>
            <Card className="cadastro-card shadow-lg">
              <Card.Header className="cadastro-header text-center py-3">
                <h4 className="m-0 fw-bold fs-5">Acesse sua Conta</h4>
                <small className="opacity-75">
                  Informe suas credenciais registradas
                </small>
              </Card.Header>

              <Card.Body className="p-4">
                {sessaoInativa && (
                  <Alert
                    variant="warning"
                    dismissible
                    onClose={() => setSessaoInativa(false)}
                  >
                    Sessão encerrada por inatividade — você ficou 15 minutos
                    sem atividade. Entre novamente para continuar.
                  </Alert>
                )}
                {erro && <Alert variant="danger">{erro}</Alert>}

                <Form onSubmit={handleLogin}>
                  <Form.Group className="mb-3">
                    <Form.Label className="form-label-custom">
                      E-mail Cadastrado
                    </Form.Label>
                    <Form.Control
                      type="email"
                      className="form-control-custom"
                      placeholder="seu.email@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </Form.Group>

                  <Form.Group className="mb-4">
                    <Form.Label className="form-label-custom">
                      Senha de Acesso
                    </Form.Label>
                    <Form.Control
                      type="password"
                      className="form-control-custom"
                      placeholder="••••••••"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      required
                    />
                  </Form.Group>

                  <Button
                    type="submit"
                    className="btn-primary-custom w-100 mb-3 fs-6"
                    disabled={carregando}
                  >
                    {carregando ? "Entrando..." : "🔐 Entrar no Sistema"}
                  </Button>

                  <hr className="my-3 text-secondary opacity-25" />

                  <div className="text-center">
                    <span className="text-muted small me-2">
                      Ainda não tem conta?
                    </span>
                    <Button
                      variant="link"
                      className="p-0 text-decoration-none fw-bold"
                      onClick={() => navigate("/registrar")}
                    >
                      Cadastre-se aqui
                    </Button>
                  </div>

                  <div className="text-center mt-2">
                    <Button
                      variant="link"
                      className="p-0 text-decoration-none small text-muted"
                      onClick={abrirEsqueciSenha}
                    >
                      🔑 Esqueceu a senha?
                    </Button>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      {/* --- RODAPÉ COM TERMOS E SEGURANÇA --- */}
      <footer className="mt-auto py-3 bg-dark text-white border-top border-secondary">
        <Container className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-2">
          <div className="small text-muted">
            &copy; {new Date().getFullYear()} InformAluno. Todos os direitos
            reservados.
          </div>

          <div className="d-flex gap-3 small">
            <Button
              variant="link"
              className="text-light text-decoration-none p-0 opacity-75 opacity-100-hover"
              onClick={() => setShowTermos(true)}
            >
              Termos de Uso
            </Button>
            <span className="text-muted">|</span>
            <Button
              variant="link"
              className="text-light text-decoration-none p-0 opacity-75 opacity-100-hover"
              onClick={() => setShowPrivacidade(true)}
            >
              Política de Privacidade & LGPD
            </Button>
          </div>
        </Container>
      </footer>

      {/* --- MODAL 1: TERMOS DE USO --- */}
      <TermosModal show={showTermos} onHide={() => setShowTermos(false)} />

      {/* --- MODAL 2: POLÍTICA DE PRIVACIDADE E LGPD --- */}
      <PrivacidadeModal
        show={showPrivacidade}
        onHide={() => setShowPrivacidade(false)}
      />

      {/* --- MODAL: ESQUECEU A SENHA --- */}
      <Modal
        show={showEsqueciSenha}
        onHide={() => setShowEsqueciSenha(false)}
        centered
      >
        <Modal.Header closeButton className="bg-light">
          <Modal.Title className="fw-bold fs-5">
            🔑 Esqueceu a senha?
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          {erroEsqueci && <Alert variant="danger">{erroEsqueci}</Alert>}
          {sucessoEsqueci && <Alert variant="success">{sucessoEsqueci}</Alert>}

          {linkSimulado ? (
            <Alert variant="warning" className="mb-0">
              <strong>Modo simulação (sem provedor de e-mail):</strong>
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline-dark"
                  onClick={() => {
                    setShowEsqueciSenha(false);
                    navigate(
                      linkSimulado.replace("http://localhost:5173", "")
                    );
                  }}
                >
                  Abrir o link de redefinição →
                </Button>
              </div>
            </Alert>
          ) : (
            <Form onSubmit={handleEsqueciSenha}>
              <Form.Group className="mb-3">
                <Form.Label className="form-label-custom">
                  E-mail cadastrado
                </Form.Label>
                <Form.Control
                  type="email"
                  className="form-control-custom"
                  placeholder="seu.email@exemplo.com"
                  value={emailEsqueci}
                  onChange={(e) => setEmailEsqueci(e.target.value)}
                  required
                  autoFocus
                />
              </Form.Group>

              <Button
                type="submit"
                className="btn-primary-custom w-100 fs-6"
                disabled={enviandoEsqueci}
              >
                {enviandoEsqueci ? "Enviando..." : "📩 Enviar link de redefinição"}
              </Button>
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={() => setShowEsqueciSenha(false)}
          >
            Fechar
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
