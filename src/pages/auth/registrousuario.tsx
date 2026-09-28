import React, { useState } from "react";
import { Container, Card, Form, Button, Navbar, Alert } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { TermosModal, PrivacidadeModal } from "../../components/legaltermos";
import "../cadastro/Cadastro.css";

export const RegistroUsuario: React.FC = () => {
  const navigate = useNavigate();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [role, setRole] = useState("RESPONSAVEL");
  const [aceiteTermos, setAceiteTermos] = useState(false);
  const [showTermos, setShowTermos] = useState(false);
  const [showPrivacidade, setShowPrivacidade] = useState(false);

  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (senha !== confirmaSenha) {
      setErro("As senhas não coincidem.");
      return;
    }

    if (!aceiteTermos) {
      setErro(
        "Para criar a conta, é necessário aceitar os Termos de Uso e a Política de Privacidade (LGPD).",
      );
      return;
    }

    setCarregando(true);

    try {
      const resposta = await fetch("http://127.0.0.1:8787/api/auth/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, senha, role }),
      });

      const dados = await resposta.json();

      if (resposta.ok) {
        // 1. Grava a sessão do usuário logado
        localStorage.setItem("usuarioLogado", JSON.stringify(dados.usuario));
        // Token da sessão criada junto com a conta: as próximas telas
        // (/cadastro) mandam Authorization para gravar o pré-cadastro.
        if (dados.token) localStorage.setItem("token", dados.token);

        setSucesso(
          "Conta criada com sucesso! Redirecionando para a etapa de validação facial...",
        );

        // 2. Redirecionamento direto sem pedir login novamente
        setTimeout(() => {
          if (dados.usuario.role === "PORTARIA" || dados.usuario.role === "MOTORISTA") {
            navigate("/portaria");
          } else {
            navigate("/cadastro"); // Tela com Câmera e Captura Facial
          }
        }, 1200);
      } else {
        setErro(dados.error || "Erro ao registrar conta.");
      }
    } catch {
      setErro("Não foi possível conectar ao servidor.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div
      className="d-flex flex-column min-vh-100"
      style={{ backgroundColor: "#f1f5f9" }}
    >
      <Navbar expand="lg" className="portaria-navbar px-4 text-white shadow-sm">
        <Navbar.Brand className="fw-bold fs-5 text-white d-flex align-items-center">
          <span className="status-indicator"></span>
          InformAluno{" "}
          <span className="ms-2 fs-6 fw-normal text-light opacity-75">
            | Criar Conta
          </span>
        </Navbar.Brand>
        <div className="ms-auto">
          <Button
            variant="outline-light"
            size="sm"
            onClick={() =>
              window.history.length > 1
                ? window.history.back()
                : (window.location.href = "/")
            }
          >
            ← Voltar
          </Button>
        </div>
      </Navbar>

      <Container className="my-auto py-5" style={{ maxWidth: "500px" }}>
        <Card className="cadastro-card shadow-lg">
          <Card.Header className="cadastro-header text-center py-3">
            <h4 className="m-0 fw-bold fs-5">Criar Nova Conta</h4>
            <small className="opacity-75">
              Passo 1 de 2: Credenciais de acesso
            </small>
          </Card.Header>

          <Card.Body className="p-4">
            {erro && <Alert variant="danger">{erro}</Alert>}
            {sucesso && <Alert variant="success">{sucesso}</Alert>}

            <Form onSubmit={handleRegistro}>
              <Form.Group className="mb-3">
                <Form.Label className="form-label-custom">
                  Nome Completo
                </Form.Label>
                <Form.Control
                  type="text"
                  className="form-control-custom"
                  placeholder="Seu nome completo"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="form-label-custom">E-mail</Form.Label>
                <Form.Control
                  type="email"
                  className="form-control-custom"
                  placeholder="seu.email@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="form-label-custom">
                  Tipo de Perfil
                </Form.Label>
                <Form.Select
                  className="form-control-custom"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="RESPONSAVEL">
                    Responsável Legal
                  </option>
                  <option value="PORTARIA">Funcionário</option>
                  <option value="MOTORISTA">🚐 Motorista da Van</option>
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="form-label-custom">Senha</Form.Label>
                <Form.Control
                  type="password"
                  className="form-control-custom"
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
              </Form.Group>

              <Form.Group className="mb-4">
                <Form.Label className="form-label-custom">
                  Confirmar Senha
                </Form.Label>
                <Form.Control
                  type="password"
                  className="form-control-custom"
                  placeholder="••••••••"
                  value={confirmaSenha}
                  onChange={(e) => setConfirmaSenha(e.target.value)}
                  required
                />
              </Form.Group>

              <Form.Check
                type="checkbox"
                id="aceite-termos"
                className="mb-3 custom-control-lg"
                checked={aceiteTermos}
                onChange={(e) => setAceiteTermos(e.target.checked)}
                label={
                  <span className="small text-muted">
                    Li e aceito os{" "}
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 align-baseline text-decoration-underline"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowTermos(true);
                      }}
                    >
                      Termos de Uso
                    </Button>{" "}
                    e a{" "}
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 align-baseline text-decoration-underline"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowPrivacidade(true);
                      }}
                    >
                      Política de Privacidade & LGPD
                    </Button>
                    , incluindo o consentimento para o tratamento da minha
                    imagem facial (dado sensível) com a finalidade de segurança
                    de acesso na portaria, nos termos do art. 11 da LGPD.
                  </span>
                }
              />

              <Button
                type="submit"
                className="btn-primary-custom w-100 mb-3"
                disabled={carregando}
              >
                {carregando
                  ? "Criando Conta..."
                  : "Avançar para Validação Facial →"}
              </Button>

              <div className="text-center">
                <span className="text-muted small me-2">
                  Já possui uma conta?
                </span>
                <Button
                  variant="link"
                  className="p-0 text-decoration-none fw-bold"
                  onClick={() => navigate("/")}
                >
                  Fazer Login
                </Button>
              </div>
            </Form>
          </Card.Body>
        </Card>
      </Container>

      {/* Modais de Termos/ LGPD (mesmos da Home) */}
      <TermosModal show={showTermos} onHide={() => setShowTermos(false)} />
      <PrivacidadeModal
        show={showPrivacidade}
        onHide={() => setShowPrivacidade(false)}
      />
    </div>
  );
};
