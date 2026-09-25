import React, { useEffect, useState } from "react";
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
  Form,
  Alert,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AtestadoBotao } from "../atestado/atestado";
import { ChatPainel } from "../chat/chat";
import "../cadastro/Cadastro.css";

interface NotaResumo {
  /** Matéria da grade escolar ('' = nota antiga, lançada antes da grade) */
  materia: string;
  bimestre: number;
  nota: number;
}

interface AcompanhamentoResumo {
  id: number;
  papel: string;
  texto: string;
  atestado_base64: string | null;
  atestado_nome: string | null;
  criado_em: string;
  autor_nome: string;
}

// Solicitação de terceiro responsável aguardando aprovação do pai/mãe
interface ConvitePendente {
  token: string;
  convidado_nome: string | null;
  convidado_foto: string | null;
  expira_em: string;
  aluno_id: number;
  aluno_nome: string;
  matricula: string;
}

interface MeuFilho {
  id: number;
  nome: string;
  matricula: string;
  foto_base64: string | null;
  notas: NotaResumo[];
  acompanhamentos: AcompanhamentoResumo[];
}

interface Mensagem {
  tipo: "success" | "danger";
  texto: string;
}

// Painel do RESPONSÁVEL (pai/mãe): vê as notas dos filhos, lê o
// acompanhamento dos professores e registra atualizações (doença, falta...).
export const PainelResponsavel: React.FC = () => {
  const navigate = useNavigate();

  const [filhos, setFilhos] = useState<MeuFilho[]>([]);
  const [loading, setLoading] = useState(true);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  // Grade escolar (catálogo de matérias) e bimestre escolhido na grade
  const [materiasGrade, setMateriasGrade] = useState<string[]>([]);
  const [bimestreGrade, setBimestreGrade] = useState(1);

  // Texto em digitação, por filho
  const [textos, setTextos] = useState<Record<number, string>>({});
  const [salvandoId, setSalvandoId] = useState<number | null>(null);

  // Atestado anexado (opcional), por filho — validado aqui e no servidor
  const [anexos, setAnexos] = useState<Record<number, { nome: string; dados: string }>>({});

  // Pendências de aprovação de terceiro responsável
  const [convites, setConvites] = useState<ConvitePendente[]>([]);
  const [decidindoToken, setDecidindoToken] = useState<string | null>(null);

  const authHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  });

  const encerrarSessao = () => {
    finalizarSessao();
    navigate("/");
  };

  const tratarResposta = (res: Response): boolean => {
    if (res.status === 401 || res.status === 403) {
      encerrarSessao();
      return false;
    }
    return true;
  };

  const carregar = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8787/api/painel/alunos", {
        headers: authHeaders(),
      });
      if (!tratarResposta(res)) return;
      if (res.ok) {
        const data = await res.json();
        setFilhos(data.alunos || []);
        setMateriasGrade(data.materias || []);

        // Pendências de aprovação (terceiro responsável) — falha não derruba a tela
        try {
          const respConv = await fetch("http://127.0.0.1:8787/api/painel/convites", {
            headers: authHeaders(),
          });
          if (respConv.ok) {
            const dadosConv = await respConv.json();
            setConvites(dadosConv.convites || []);
          }
        } catch {
          /* pendências ficam para a próxima atualização */
        }
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Não foi possível conectar ao servidor." });
    } finally {
      setLoading(false);
    }
  };

  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    carregar();
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */

  const salvarAcompanhamento = async (alunoId: number) => {
    const texto = (textos[alunoId] || "").trim();
    if (!texto) {
      setMensagem({ tipo: "danger", texto: "Escreva a observação antes de enviar." });
      return;
    }
    setSalvandoId(alunoId);
    const anexo = anexos[alunoId];
    try {
      const res = await fetch(
        "http://127.0.0.1:8787/api/painel/acompanhamentos",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            aluno_id: alunoId,
            texto,
            atestado: anexo ? anexo.dados : undefined,
            atestado_nome: anexo ? anexo.nome : undefined,
          }),
        }
      );
      if (!tratarResposta(res)) return;
      const data = await res.json();
      if (res.ok) {
        setMensagem({
          tipo: "success",
          texto: anexo
            ? "Acompanhamento e atestado registrados!"
            : "Acompanhamento registrado!",
        });
        setTextos((prev) => {
          const novo = { ...prev };
          delete novo[alunoId];
          return novo;
        });
        setAnexos((prev) => {
          const novo = { ...prev };
          delete novo[alunoId];
          return novo;
        });
        await carregar();
      } else {
        setMensagem({ tipo: "danger", texto: data.error || "Erro ao registrar." });
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Não foi possível conectar ao servidor." });
    } finally {
      setSalvandoId(null);
    }
  };

  // Valida e guarda o atestado escolhido (PDF/imagem até 2MB)
  const selecionarAtestado = (alunoId: number, file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMensagem({ tipo: "danger", texto: "O atestado pode ter no máximo 2MB." });
      return;
    }
    const permitidos = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!permitidos.includes(file.type)) {
      setMensagem({
        tipo: "danger",
        texto: "Atestado inválido: envie um PDF ou imagem (JPEG, PNG, WebP ou GIF).",
      });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setAnexos((prev) => ({
        ...prev,
        [alunoId]: { nome: file.name, dados: String(reader.result) },
      }));
    };
    reader.readAsDataURL(file);
  };

  const removerAtestado = (alunoId: number) => {
    setAnexos((prev) => {
      const novo = { ...prev };
      delete novo[alunoId];
      return novo;
    });
  };

  // Aprovar ou rejeitar um terceiro responsável solicitado por link
  const decidirConvite = async (token: string, decisao: "APROVAR" | "REJEITAR") => {
    setDecidindoToken(token);
    try {
      const res = await fetch(`http://127.0.0.1:8787/api/convite/${token}/aprovar`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ decisao }),
      });
      if (!tratarResposta(res)) return;
      const data = await res.json();
      if (res.ok) {
        setMensagem({ tipo: "success", texto: data.message || "Decisão registrada." });
        setConvites((prev) => prev.filter((cv) => cv.token !== token));
      } else {
        setMensagem({ tipo: "danger", texto: data.error || "Erro ao avaliar a solicitação." });
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Não foi possível conectar ao servidor." });
    } finally {
      setDecidindoToken(null);
    }
  };

  // Média das matérias daquele bimestre (resumo do card do filho)
  const notaDoBimestre = (filho: MeuFilho, bimestre: number): number | null => {
    const doBimestre = filho.notas.filter((n) => n.bimestre === bimestre);
    if (doBimestre.length === 0) return null;
    const media = doBimestre.reduce((soma, n) => soma + n.nota, 0) / doBimestre.length;
    return Math.round(media * 10) / 10;
  };

  // Linhas da grade exibida: todas as matérias da escola + "Nota geral"
  // quando existem notas antigas (sem matéria) naquele bimestre.
  const linhasGrade = React.useMemo(() => {
    const temNotaAntiga = filhos.some((f) =>
      f.notas.some((n) => n.bimestre === bimestreGrade && n.materia === "")
    );
    return [...materiasGrade, ...(temNotaAntiga ? [""] : [])];
  }, [materiasGrade, filhos, bimestreGrade]);

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: "#f8fafc" }}>
      {/* NAVBAR */}
      <Navbar expand="lg" className="portaria-navbar px-4 text-white shadow-sm">
        <Navbar.Brand className="fw-bold fs-5 text-white d-flex align-items-center">
          <span className="status-indicator bg-primary"></span>
          InformAluno{" "}
          <span className="ms-2 fs-6 fw-normal text-light opacity-75">
            | Painel do Responsável
          </span>
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
          <Button
            variant="outline-light"
            size="sm"
            onClick={() => {
              setLoading(true);
              carregar();
            }}
          >
            🔄 Atualizar
          </Button>
          <Button variant="outline-light" size="sm" onClick={encerrarSessao}>
            🚪 Sair
          </Button>
        </Nav>
      </Navbar>

      <Container className="my-4">
        {mensagem && (
          <Alert variant={mensagem.tipo} onClose={() => setMensagem(null)} dismissible>
            {mensagem.texto}
          </Alert>
        )}

        {/* APROVAÇÕES DE TERCEIRO RESPONSÁVEL PENDENTES */}
        {convites.length > 0 && (
          <Card className="shadow-sm border-0 mb-4 border-start border-warning border-4">
            <Card.Header className="bg-white py-3">
              <span className="fw-bold fs-6">🤝 Aprovações pendentes</span>
              <small className="text-muted d-block">
                Alguém pediu para ser 3º responsável de um dos seus filhos —
                aprove ou rejeite.
              </small>
            </Card.Header>
            <Card.Body className="d-flex flex-column gap-3">
              {convites.map((cv) => (
                <div
                  key={cv.token}
                  className="d-flex align-items-center gap-3 flex-wrap border rounded p-3"
                >
                  {cv.convidado_foto ? (
                    <img
                      src={cv.convidado_foto}
                      alt=""
                      width={56}
                      height={56}
                      style={{ borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <Badge bg="secondary" className="fs-5">
                      👤
                    </Badge>
                  )}
                  <div className="flex-grow-1">
                    <div className="fw-bold">{cv.convidado_nome || "Solicitante"}</div>
                    <small className="text-muted">
                      para {cv.aluno_nome} ({cv.matricula}) — expira em{" "}
                      {cv.expira_em.slice(0, 16).replace(" ", " às ")}
                    </small>
                  </div>
                  <div className="d-flex gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      disabled={decidindoToken === cv.token}
                      onClick={() => decidirConvite(cv.token, "APROVAR")}
                    >
                      {decidindoToken === cv.token ? "Enviando..." : "✓ Aprovar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={decidindoToken === cv.token}
                      onClick={() => decidirConvite(cv.token, "REJEITAR")}
                    >
                      ✕ Rejeitar
                    </Button>
                  </div>
                </div>
              ))}
            </Card.Body>
          </Card>
        )}

        {/* GRADE DE NOTAS POR MATÉRIA — escolha o bimestre e veja a grade
            inteira da escola com as notas de cada filho */}
        {!loading && filhos.length > 0 && (
          <Card className="shadow-sm border-0 mb-4">
            <Card.Header className="bg-white py-3">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                <span className="fw-bold fs-6">
                  📚 Notas por Matéria — {bimestreGrade}º Bimestre
                </span>
                <span className="d-flex align-items-center gap-2">
                  <small className="text-muted">Selecionar bimestre:</small>
                  {[1, 2, 3, 4].map((b) => (
                    <Button
                      key={b}
                      size="sm"
                      variant={b === bimestreGrade ? "primary" : "outline-primary"}
                      className="fw-bold px-3"
                      onClick={() => setBimestreGrade(b)}
                    >
                      {b}º
                    </Button>
                  ))}
                </span>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <Table hover responsive className="m-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Matéria</th>
                    {filhos.map((f) => (
                      <th key={f.id} className="text-center">
                        {f.nome}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhasGrade.length === 0 ? (
                    <tr>
                      <td colSpan={filhos.length + 1} className="text-center py-4 text-muted">
                        Grade escolar ainda não configurada.
                      </td>
                    </tr>
                  ) : (
                    linhasGrade.map((materia) => (
                      <tr key={materia || "__geral"}>
                        <td className="fw-semibold">{materia || "Nota geral"}</td>
                        {filhos.map((f) => {
                          const nota = f.notas.find(
                            (n) => n.bimestre === bimestreGrade && n.materia === materia
                          );
                          return (
                            <td key={f.id} className="text-center">
                              <Badge
                                bg={
                                  !nota
                                    ? "secondary"
                                    : nota.nota >= 6
                                    ? "success"
                                    : "danger"
                                }
                                className="fs-6"
                              >
                                {nota ? String(nota.nota).replace(".", ",") : "—"}
                              </Badge>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        )}

        {loading ? (
          <div className="text-center py-4">
            <div className="spinner-border text-primary" role="status"></div>
            <p className="mt-2 text-muted">Carregando seus filhos...</p>
          </div>
        ) : filhos.length === 0 ? (
          <Card className="shadow-sm border-0 text-center p-4">
            <Card.Body>
              <div className="display-5 mb-3">👨‍👩‍👧</div>
              <h5 className="fw-bold">Nenhum filho vinculado à sua conta</h5>
              <p className="text-muted">
                Faça o pré-cadastro do seu filho para acompanhar notas e
                acompanhamentos por aqui.
              </p>
              <Button className="btn-primary-custom" onClick={() => navigate("/cadastro")}>
                Cadastrar meu filho →
              </Button>
            </Card.Body>
          </Card>
        ) : (
          filhos.map((filho) => (
            <Card key={filho.id} className="shadow-sm border-0 mb-4">
              <Card.Header className="bg-white py-3 d-flex align-items-center gap-3">
                {filho.foto_base64 ? (
                  <img
                    src={filho.foto_base64}
                    alt=""
                    width={48}
                    height={48}
                    style={{ borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <Badge bg="secondary" className="fs-5">
                    🎓
                  </Badge>
                )}
                <div>
                  <div className="fw-bold fs-6 mb-0">{filho.nome}</div>
                  <small className="text-muted">Matrícula: {filho.matricula}</small>
                </div>
              </Card.Header>
              <Card.Body>
                <Row className="g-4">
                  {/* NOTAS BIMESTRAIS */}
                  <Col md={4}>
                    <h6 className="fw-bold text-dark mb-3">📚 Notas do Ano (média)</h6>
                    <div className="d-flex flex-column gap-2">
                      {[1, 2, 3, 4].map((b) => {
                        const nota = notaDoBimestre(filho, b);
                        return (
                          <div
                            key={b}
                            className="d-flex justify-content-between align-items-center border rounded px-3 py-2"
                          >
                            <span className="fw-semibold">{b}º Bimestre</span>
                            <Badge
                              bg={
                                nota === null
                                  ? "secondary"
                                  : nota >= 6
                                  ? "success"
                                  : "danger"
                              }
                              className="fs-6"
                            >
                              {nota === null ? "—" : String(nota).replace(".", ",")}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </Col>

                  {/* ACOMPANHAMENTOS */}
                  <Col md={8}>
                    <h6 className="fw-bold text-dark mb-3">📋 Acompanhamento</h6>
                    {filho.acompanhamentos.length === 0 ? (
                      <p className="text-muted small mb-0">
                        Nenhum acompanhamento ainda.
                      </p>
                    ) : (
                      <div
                        className="d-flex flex-column gap-2"
                        style={{ maxHeight: "260px", overflowY: "auto" }}
                      >
                        {filho.acompanhamentos.map((ac) => (
                          <div
                            key={ac.id}
                            className="border-start border-3 border-primary ps-3 py-1"
                          >
                            <div className="d-flex justify-content-between align-items-center flex-wrap gap-1">
                              <div>
                                <Badge
                                  bg={
                                    ac.papel === "PROFESSOR"
                                      ? "primary"
                                      : ac.papel === "RESPONSAVEL"
                                      ? "warning"
                                      : "secondary"
                                  }
                                  text={ac.papel === "RESPONSAVEL" ? "dark" : undefined}
                                  className="me-2"
                                >
                                  {ac.papel}
                                </Badge>
                                <span className="fw-semibold small">{ac.autor_nome}</span>
                              </div>
                              <small className="text-muted">
                                {ac.criado_em.slice(0, 16)}
                              </small>
                            </div>
                            <div className="small mt-1">{ac.texto}</div>
                            {ac.atestado_base64 && (
                              <div className="mt-1">
                                <AtestadoBotao
                                  atestado={ac.atestado_base64}
                                  nome={ac.atestado_nome}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Col>
                </Row>

                <hr className="my-3 text-secondary opacity-25" />

                {/* ADICIONAR ACOMPANHAMENTO */}
                <Form
                  onSubmit={(e) => {
                    e.preventDefault();
                    salvarAcompanhamento(filho.id);
                  }}
                >
                  <Form.Group className="mb-2">
                    <Form.Control
                      as="textarea"
                      rows={2}
                      maxLength={500}
                      placeholder="Ex.: está doente, fará consulta médica e faltará hoje."
                      value={textos[filho.id] || ""}
                      onChange={(e) =>
                        setTextos((prev) => ({ ...prev, [filho.id]: e.target.value }))
                      }
                    />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label className="small fw-semibold mb-1 d-block">
                      📎 Atestado (opcional — PDF, JPEG, PNG ou WebP, máx. 2MB)
                    </Form.Label>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <Form.Control
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        size="sm"
                        style={{ maxWidth: "270px" }}
                        key={anexos[filho.id] ? "com-anexo" : "sem-anexo"}
                        onChange={(e) =>
                          selecionarAtestado(
                            filho.id,
                            (e.target as HTMLInputElement).files?.[0]
                          )
                        }
                      />
                      {anexos[filho.id] && (
                        <Badge
                          bg="info"
                          text="dark"
                          className="d-inline-flex align-items-center gap-1"
                        >
                          📄 {anexos[filho.id].nome}
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 text-dark"
                            onClick={() => removerAtestado(filho.id)}
                          >
                            ✕
                          </Button>
                        </Badge>
                      )}
                    </div>
                  </Form.Group>
                  <Button
                    type="submit"
                    size="sm"
                    className="btn-primary-custom"
                    disabled={salvandoId === filho.id}
                  >
                    {salvandoId === filho.id
                      ? "Registrando..."
                      : "Adicionar acompanhamento"}
                  </Button>
                </Form>
              </Card.Body>
            </Card>
          ))
        )}
        {/* CHAT: CONVERSA INDIVIDUAL COM OS PROFESSORES DOS SEUS FILHOS */}
        <Card className="shadow-sm border-0 mt-4">
          <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom">
            💬 Mensagens — Professores dos seus filhos
          </Card.Header>
          <Card.Body>
            <ChatPainel />
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
};
