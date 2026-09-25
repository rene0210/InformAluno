import React, { useState, useEffect } from "react";
import { finalizarSessao } from "../../components/sessao";
import {
  Container,
  Row,
  Col,
  Card,
  Table,
  Badge,
  Button,
  Navbar,
  Nav,
  Alert,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import "../cadastro/Cadastro.css";

interface AlunoInfo {
  id: number;
  nome: string;
  matricula: string;
  foto_base64: string | null;
}

interface NotaAluno {
  /** Matéria da grade escolar ('' = nota antiga, sem matéria) */
  materia: string;
  bimestre: number;
  nota: number;
}

interface MateriaAluno {
  nome: string;
  materia: string;
}

// Dashboard do cargo ALUNO: apenas as próprias notas e as matérias.
// O aluno é identificado pelo vínculo usuarios.aluno_id (feito pelo admin).
export const AlunoDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [aluno, setAluno] = useState<AlunoInfo | null>(null);
  const [notas, setNotas] = useState<NotaAluno[]>([]);
  const [materias, setMaterias] = useState<MateriaAluno[]>([]);

  const authHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  });

  const carregarDados = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8787/api/aluno/dashboard", {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAluno(data.aluno || null);
        setNotas(data.notas || []);
        setMaterias(data.materias || []);
      } else if (res.status === 401 || res.status === 403) {
        finalizarSessao();
        navigate("/");
        return;
      }
    } catch (err) {
      console.error("Erro ao carregar o dashboard do aluno:", err);
    } finally {
      setLoading(false);
    }
  };

  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    carregarDados();
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */

  const handleLogout = () => {
    finalizarSessao();
    navigate("/");
  };

  // Média das matérias daquele bimestre (agora há uma nota por matéria)
  const notaDoBimestre = (b: number): number | null => {
    const doBimestre = notas.filter((n) => n.bimestre === b);
    if (doBimestre.length === 0) return null;
    const mediaBimestre = doBimestre.reduce((soma, n) => soma + n.nota, 0) / doBimestre.length;
    return Math.round(mediaBimestre * 10) / 10;
  };

  const media =
    notas.length > 0
      ? notas.reduce((soma, n) => soma + n.nota, 0) / notas.length
      : null;

  // Matérias agrupadas (disciplina + professores que a ministram)
  const agrupadas: Array<{ materia: string; professores: string[] }> = [];
  for (const m of materias) {
    const existente = agrupadas.find((g) => g.materia === m.materia);
    if (existente) {
      if (!existente.professores.includes(m.nome)) existente.professores.push(m.nome);
    } else {
      agrupadas.push({ materia: m.materia, professores: [m.nome] });
    }
  }

  const corNota = (nota: number): string => {
    if (nota >= 7) return "success";
    if (nota >= 5) return "warning";
    return "danger";
  };

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: "#f8fafc" }}>
      {/* NAVBAR */}
      <Navbar expand="lg" className="portaria-navbar px-4 text-white shadow-sm">
        <Navbar.Brand className="fw-bold fs-5 text-white d-flex align-items-center">
          <span className="status-indicator bg-success"></span>
          InformAluno <span className="ms-2 fs-6 fw-normal text-light opacity-75">| Área do Aluno</span>
        </Navbar.Brand>
        <Nav className="ms-auto d-flex align-items-center gap-3">
          <Button
            variant="outline-light"
            size="sm"
            onClick={() =>
              window.history.length > 1 ? window.history.back() : (window.location.href = "/")
            }
          >
            ← Voltar
          </Button>
          <Button variant="outline-light" size="sm" onClick={carregarDados}>
            🔄 Atualizar
          </Button>
          <Button variant="outline-light" size="sm" onClick={handleLogout}>
            🚪 Sair
          </Button>
        </Nav>
      </Navbar>

      <Container className="my-4">
        {loading && (
          <div className="text-center py-4">
            <div className="spinner-border text-primary" role="status"></div>
            <p className="mt-2 text-muted">Carregando suas notas e matérias...</p>
          </div>
        )}

        {!loading && !aluno && (
          <Alert variant="info" className="shadow-sm">
            <Alert.Heading className="fs-6 fw-bold">🎓 Conta ainda não vinculada</Alert.Heading>
            <p className="mb-0">
              Sua conta ainda não está vinculada a um aluno da escola. Procure a secretaria para
              fazer o vínculo e ver suas notas e matérias por aqui.
            </p>
          </Alert>
        )}

        {!loading && aluno && (
          <>
            {/* IDENTIFICAÇÃO */}
            <Row className="g-3 mb-4">
              <Col md={12}>
                <Card className="border-0 shadow-sm text-white" style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
                  <Card.Body className="p-4 d-flex align-items-center gap-3">
                    {aluno.foto_base64 ? (
                      <img
                        src={aluno.foto_base64}
                        alt={aluno.nome}
                        className="rounded-circle border border-white border-2"
                        style={{ width: "72px", height: "72px", objectFit: "cover" }}
                      />
                    ) : (
                      <div className="display-6 opacity-50">🎓</div>
                    )}
                    <div>
                      <h6 className="text-uppercase opacity-75 fw-bold m-0">Bem-vindo(a)</h6>
                      <h3 className="fw-extrabold m-0">{aluno.nome}</h3>
                      <span className="opacity-75 small">Matrícula {aluno.matricula}</span>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            {/* NOTAS DO ANO */}
            <Card className="shadow-sm border-0 mb-4">
              <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom d-flex justify-content-between align-items-center">
                <span>📚 Notas do Ano (média por bimestre)</span>
                {media !== null && (
                  <Badge bg="primary" className="px-3 py-2">
                    Média: {media.toFixed(1).replace(".", ",")}
                  </Badge>
                )}
              </Card.Header>
              <Card.Body className="p-0">
                <Table hover responsive className="m-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th className="text-center">1º Bimestre</th>
                      <th className="text-center">2º Bimestre</th>
                      <th className="text-center">3º Bimestre</th>
                      <th className="text-center">4º Bimestre</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {[1, 2, 3, 4].map((b) => {
                        const nota = notaDoBimestre(b);
                        return (
                          <td key={b} className="text-center">
                            {nota === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <Badge bg={corNota(nota)} className="px-3 py-2 fs-6">
                                {nota.toFixed(1).replace(".", ",")}
                              </Badge>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </Table>
                {notas.length === 0 && (
                  <p className="text-center text-muted py-3 mb-0">
                    Nenhuma nota lançada ainda.
                  </p>
                )}
              </Card.Body>
            </Card>

            {/* MATÉRIAS / DISCIPLINAS */}
            <Card className="shadow-sm border-0">
              <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom d-flex justify-content-between align-items-center">
                <span>📖 Matérias</span>
                <small className="text-muted fw-normal">
                  {agrupadas.length} disciplina{agrupadas.length === 1 ? "" : "s"}
                </small>
              </Card.Header>
              <Card.Body className="p-0">
                <Table hover responsive className="m-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Matéria / Disciplina</th>
                      <th>Professor(a)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agrupadas.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="text-center py-4 text-muted">
                          Nenhuma matéria cadastrada ainda.
                        </td>
                      </tr>
                    ) : (
                      agrupadas.map((g) => (
                        <tr key={g.materia}>
                          <td className="fw-semibold">
                            <Badge bg="info" text="dark" className="me-2">
                              {g.materia}
                            </Badge>
                          </td>
                          <td>{g.professores.join(", ")}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </>
        )}
      </Container>
    </div>
  );
};
