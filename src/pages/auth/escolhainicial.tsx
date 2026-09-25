import React from "react";
import { Container, Card, Button, Navbar } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import "../cadastro/Cadastro.css";

export const EscolhaInicial: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: "#f1f5f9" }}>
      <Navbar expand="lg" className="portaria-navbar px-4 text-white shadow-sm">
        <Navbar.Brand className="fw-bold fs-5 text-white d-flex align-items-center">
          <span className="status-indicator"></span>
          InformAluno{" "}
          <span className="ms-2 fs-6 fw-normal text-light opacity-75">
            | O que deseja fazer?
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

      <Container className="my-auto py-5" style={{ maxWidth: "1020px" }}>
        <div className="text-center mb-4">
          <h4 className="fw-bold text-dark">Bem-vindo(a)! Escolha uma opção</h4>
          <p className="text-muted mb-0">
            Valide a entrada pela portaria, cadastre outro filho ou acompanhe
            as notas e o acompanhamento escolar.
          </p>
        </div>

        <div className="d-flex flex-column flex-md-row gap-4 justify-content-center">
          {/* Opção1: Verificação Facial */}
          <Card
            className="cadastro-card shadow-lg text-center p-4 border-0"
            style={{ cursor: "pointer", maxWidth: "340px", flex: "1" }}
            onClick={() => navigate("/portaria")}
          >
            <Card.Body>
              <div className="display-5 mb-3">📷</div>
              <h5 className="fw-bold">Verificação Facial</h5>
              <p className="text-muted small mb-3">
                Ir direto para a tela da portaria e reconhecer o aluno pelo rosto.
              </p>
              <Button className="btn-primary-custom w-100">
                Acessar Portaria →
              </Button>
            </Card.Body>
          </Card>

          {/* Opção2: Cadastro de aluno */}
          <Card
            className="cadastro-card shadow-lg text-center p-4 border-0"
            style={{ cursor: "pointer", maxWidth: "340px", flex: "1" }}
            onClick={() => navigate("/cadastro")}
          >
            <Card.Body>
              <div className="display-5 mb-3">✍️</div>
              <h5 className="fw-bold">Cadastrar Aluno</h5>
              <p className="text-muted small mb-3">
                Fazer o pré-cadastro de outro filho (mátrícula, fotos e responsáveis).
              </p>
              <Button variant="outline-secondary" className="w-100 fw-bold">
                Ir para Cadastro →
              </Button>
            </Card.Body>
          </Card>

          {/* Opção3: Notas e acompanhamento (painel do responsável) */}
          <Card
            className="cadastro-card shadow-lg text-center p-4 border-0"
            style={{ cursor: "pointer", maxWidth: "340px", flex: "1" }}
            onClick={() => navigate("/painel")}
          >
            <Card.Body>
              <div className="display-5 mb-3">📚</div>
              <h5 className="fw-bold">Notas e Acompanhamento</h5>
              <p className="text-muted small mb-3">
                Acompanhe as notas do seu filho, leia as observações dos
                professores e registre atualizações (ex.: doença ou falta).
              </p>
              <Button variant="outline-success" className="w-100 fw-bold">
                Abrir Painel →
              </Button>
            </Card.Body>
          </Card>
        </div>
      </Container>
    </div>
  );
};
