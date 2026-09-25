import React, { useState } from "react";
import { Container, Card, Form, Button, Navbar, Alert } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import "../cadastro/Cadastro.css";

export const EsqueciSenha: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [linkSimulado, setLinkSimulado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const handleSolicitar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    setLinkSimulado(null);
    setCarregando(true);

    try {
      const resposta = await fetch("http://127.0.0.1:8787/api/recuperar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const dados = await resposta.json();

      if (resposta.ok) {
        setSucesso(dados.message);
        // Modo simulação: o backend retorna o link para testes
        if (dados.linkSimulado) setLinkSimulado(dados.linkSimulado);
      } else {
        setErro(dados.error || "Erro ao solicitar a redefinição de senha.");
      }
    } catch {
      setErro("Não foi possível conectar ao servidor.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: "#f1f5f9" }}>
      <Navbar expand="lg" className="portaria-navbar px-4 text-white shadow-sm">
        <Navbar.Brand className="fw-bold fs-5 text-white d-flex align-items-center">
          <span className="status-indicator"></span>
          InformAluno{" "}
          <span className="ms-2 fs-6 fw-normal text-light opacity-75">
            | Recuperar Senha
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
            <h4 className="m-0 fw-bold fs-5">🔑 Esqueceu a senha?</h4>
            <small className="opacity-75">
              Enviaremos um link de redefinição para o seu e-mail
            </small>
          </Card.Header>

          <Card.Body className="p-4">
            {erro && <Alert variant="danger">{erro}</Alert>}
            {sucesso && <Alert variant="success">{sucesso}</Alert>}

            {linkSimulado && (
              <Alert variant="warning">
                <strong>Modo simulação (sem provedor de e-mail):</strong>
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline-dark"
                    onClick={() => navigate(linkSimulado.replace("http://localhost:5173", ""))}
                  >
                    Abrir o link de redefinição →
                  </Button>
                </div>
              </Alert>
            )}

            <Form onSubmit={handleSolicitar}>
              <Form.Group className="mb-3">
                <Form.Label className="form-label-custom">E-mail cadastrado</Form.Label>
                <Form.Control
                  type="email"
                  className="form-control-custom"
                  placeholder="seu.email@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Form.Group>

              <Button
                type="submit"
                className="btn-primary-custom w-100 mb-3 fs-6"
                disabled={carregando}
              >
                {carregando ? "Enviando..." : "📩 Enviar link de redefinição"}
              </Button>
            </Form>

            <hr className="my-3 text-secondary opacity-25" />

            <div className="text-center">
              <span className="text-muted small me-2">Lembrou a senha?</span>
              <Button
                variant="link"
                className="p-0 text-decoration-none fw-bold"
                onClick={() => navigate("/")}
              >
                Voltar ao login
              </Button>
            </div>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
};
