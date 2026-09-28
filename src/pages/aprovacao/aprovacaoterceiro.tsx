import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Card, Container, Spinner } from "react-bootstrap";
import "../cadastro/Cadastro.css";
import { API } from "../../components/api";

interface Solicitacao {
  aluno_nome: string;
  matricula: string;
  terceiro_nome: string | null;
}

// Página pública de aprovação: abre pelo botão do e-mail que o pai e a
// mãe recebem. O token dela (aprovacao_token) é diferente do link do
// convidado — quem tem o link de cadastro não consegue se aprovar.
export const AprovacaoTerceiro: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [solicitacao, setSolicitacao] = useState<Solicitacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [decidindo, setDecidindo] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    const carregar = async () => {
      try {
        const res = await fetch(`${API}/api/aprovacao/${token}`);
        const data = await res.json();
        if (res.ok) {
          setSolicitacao(data);
        } else {
          setErro(data.error || "Link de aprovação inválido.");
        }
      } catch {
        setErro("Erro de conexão com o servidor.");
      } finally {
        setLoading(false);
      }
    };
    if (token) carregar();
  }, [token]);

  const decidir = async (decisao: "APROVAR" | "REJEITAR") => {
    setDecidindo(true);
    setErro(null);
    try {
      const res = await fetch(`${API}/api/aprovacao/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao }),
      });
      const data = await res.json();
      if (res.ok) {
        setResultado(data.message || "Decisão registrada.");
      } else {
        setErro(data.error || "Não foi possível registrar a decisão.");
      }
    } catch {
      setErro("Erro de conexão com o servidor.");
    } finally {
      setDecidindo(false);
    }
  };

  return (
    <Container className="py-5" style={{ maxWidth: "640px" }}>
      <Button
        variant="link"
        className="text-decoration-none mb-3 px-0"
        onClick={() => navigate("/")}
      >
        ← Voltar
      </Button>

      <Card className="shadow-sm border-0">
        <Card.Body className="p-4 p-md-5">
          <h4 className="fw-bold mb-1">🛡️ Aprovação de terceiro responsável</h4>
          <p className="text-muted mb-4">
            Revise a solicitação abaixo e aprove ou rejeite. A decisão é
            enviada por e-mail para os responsáveis do aluno.
          </p>

          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" role="status" />
              <p className="mt-2 text-muted">Validando o link...</p>
            </div>
          ) : resultado ? (
            <Alert variant="success" className="mb-0">
              <Alert.Heading as="h6" className="fw-bold">
                Decisão registrada ✅
              </Alert.Heading>
              <p className="mb-0">{resultado}</p>
            </Alert>
          ) : erro ? (
            <Alert variant="danger" className="mb-0">
              {erro}
            </Alert>
          ) : solicitacao ? (
            <>
              <Card className="bg-light border-0 mb-4">
                <Card.Body>
                  <div className="d-flex align-items-center gap-3 flex-wrap">
                    <div>
                      <small className="text-muted d-block">Solicitante</small>
                      <strong>{solicitacao.terceiro_nome || "—"}</strong>
                    </div>
                    <div>
                      <small className="text-muted d-block">Aluno(a)</small>
                      <strong>
                        {solicitacao.aluno_nome}{" "}
                        <span className="text-muted fw-normal">
                          ({solicitacao.matricula})
                        </span>
                      </strong>
                    </div>
                  </div>
                </Card.Body>
              </Card>

              <div className="d-flex gap-3 flex-wrap">
                <Button
                  variant="success"
                  size="lg"
                  disabled={decidindo}
                  onClick={() => decidir("APROVAR")}
                >
                  ✓ Aprovar
                </Button>
                <Button
                  variant="outline-danger"
                  size="lg"
                  disabled={decidindo}
                  onClick={() => decidir("REJEITAR")}
                >
                  ✕ Rejeitar
                </Button>
              </div>
            </>
          ) : null}
        </Card.Body>
      </Card>
    </Container>
  );
};
