import React, { useEffect, useRef, useState } from "react";
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
import Webcam from "react-webcam";
import { useNavigate } from "react-router-dom";
import { AtestadoBotao } from "../atestado/atestado";
import { ChatPainel } from "../chat/chat";
import "../cadastro/Cadastro.css";

interface NotaResumo {
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

interface AlunoNota {
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

// Tela do PROFESSOR: lança notas bimestrais (0–10) e registra
// acompanhamentos sobre os alunos; acompanha também o que os pais escreveram.
export const ProfessorDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [alunos, setAlunos] = useState<AlunoNota[]>([]);
  const [loading, setLoading] = useState(true);
  const [bimestre, setBimestre] = useState(1);
  // Grade escolar (catálogo de matérias) e matéria selecionada no lançamento
  const [materiasGrade, setMateriasGrade] = useState<string[]>([]);
  const [materiaNota, setMateriaNota] = useState("");
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  // Auto-save: estado visível por célula (aluno:bimestre:materia)
  const [statusNota, setStatusNota] = useState<
    Record<string, { estado: "salvando" | "ok" | "erro"; texto?: string }>
  >({});
  // Debounce de cada célula em edição (o professor digita e salva sozinho)
  const timersNota = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // O que cada timer pendente vai salvar (vazio = nada a fazer)
  const pendentesNota = useRef<
    Record<string, { alunoId: number; valor: string; bim: number; mat: string }>
  >({});
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  // Formulário de acompanhamento
  const [alunoAcompId, setAlunoAcompId] = useState("");
  const [textoAcomp, setTextoAcomp] = useState("");
  const [salvandoAcomp, setSalvandoAcomp] = useState(false);

  // Cadastro facial do PRÓPRIO professor (foto + matéria) — é a foto que a
  // portaria usa para reconhecê-lo e registrar check-in/check-out.
  const webcamFotoRef = useRef<Webcam>(null);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [fotoReconhecimento, setFotoReconhecimento] = useState<string | null>(null);
  const [materiaReconhecimento, setMateriaReconhecimento] = useState("");
  const [salvandoFoto, setSalvandoFoto] = useState(false);

  const authHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  });

  const encerrarSessao = () => {
    finalizarSessao();
    navigate("/");
  };

  // Sessão inválida/expirada (401/403) → volta para o login
  const tratarResposta = (res: Response): boolean => {
    if (res.status === 401 || res.status === 403) {
      encerrarSessao();
      return false;
    }
    return true;
  };

  const carregar = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8787/api/professor/alunos", {
        headers: authHeaders(),
      });
      if (!tratarResposta(res)) return;
      if (res.ok) {
        const data = await res.json();
        setAlunos(data.alunos || []);
        setMateriasGrade(data.materias || []);
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Não foi possível conectar ao servidor." });
    } finally {
      setLoading(false);
    }
  };

  // Carrega a foto de reconhecimento já cadastrada do próprio professor
  const carregarReconhecimento = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8787/api/professor/reconhecimento", {
        headers: authHeaders(),
      });
      if (!tratarResposta(res)) return;
      if (res.ok) {
        const data = await res.json();
        if (data.foto) setFotoReconhecimento(data.foto);
        if (data.materia) setMateriaReconhecimento(data.materia);
      }
    } catch {
      // sem conexão: formulário fica vazio e o professor tenta de novo
    }
  };

  const capturarFotoCamera = () => {
    const captura = webcamFotoRef.current?.getScreenshot();
    if (captura) {
      setFotoReconhecimento(captura);
      setCameraAtiva(false);
    }
  };

  const escolherArquivoFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files && e.target.files[0];
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      if (typeof leitor.result === "string") setFotoReconhecimento(leitor.result);
    };
    leitor.readAsDataURL(arquivo);
    e.target.value = "";
  };

  const salvarReconhecimento = async (e: React.FormEvent) => {
    e.preventDefault();
    const foto = fotoReconhecimento || "";
    const materia = materiaReconhecimento.trim();
    if (!foto || !materia || salvandoFoto) return;
    setSalvandoFoto(true);
    try {
      const res = await fetch("http://127.0.0.1:8787/api/professor/reconhecimento", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ foto, materia }),
      });
      if (!tratarResposta(res)) return;
      const data = await res.json();
      setMensagem(
        res.ok
          ? {
              tipo: "success",
              texto: "Foto cadastrada! Você já será reconhecido(a) na portaria.",
            }
          : { tipo: "danger", texto: data.error || "Não foi possível salvar a foto." }
      );
    } catch {
      setMensagem({ tipo: "danger", texto: "Não foi possível conectar ao servidor." });
    } finally {
      setSalvandoFoto(false);
    }
  };

  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    carregar();
    carregarReconhecimento();
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */

  // Matéria pré-selecionada no lançamento: a própria matéria do professor
  // (cadastro facial) quando ela existe na grade; senão, a primeira da lista.
  useEffect(() => {
    if (materiasGrade.length === 0 || materiaNota) return;
    const alvo =
      materiaReconhecimento && materiasGrade.includes(materiaReconhecimento)
        ? materiaReconhecimento
        : materiasGrade[0];
    setMateriaNota(alvo);
  }, [materiasGrade, materiaReconhecimento, materiaNota]);

  const valorNota = (aluno: AlunoNota): string => {
    const chave = `${aluno.id}:${bimestre}:${materiaNota}`;
    if (edicoes[chave] !== undefined) return edicoes[chave];
    const nota = aluno.notas.find(
      (n) => n.bimestre === bimestre && n.materia === materiaNota
    );
    return nota ? String(nota.nota).replace(".", ",") : "";
  };

  // Salva a nota de uma célula (aluno + bimestre + matéria). Os argumentos
  // são explícitos para o auto-save não usar um closure velho de estado.
  const salvarNota = async (
    alunoId: number,
    valorBruto: string,
    bim: number,
    mat: string
  ) => {
    const valor = (valorBruto || "").trim();
    const chave = `${alunoId}:${bim}:${mat}`;
    if (!mat) return;

    // Célula vazia: só descarta o rascunho local (não apaga nota lançada)
    if (valor === "") {
      setStatusNota((prev) => {
        if (!(chave in prev)) return prev;
        const novo = { ...prev };
        delete novo[chave];
        return novo;
      });
      setEdicoes((prev) => {
        if (!(chave in prev)) return prev;
        const novo = { ...prev };
        delete novo[chave];
        return novo;
      });
      return;
    }

    const notaNum = Number(valor.replace(",", "."));
    if (Number.isNaN(notaNum) || notaNum < 0 || notaNum > 10) {
      setStatusNota((prev) => ({
        ...prev,
        [chave]: { estado: "erro", texto: "Deve ser de 0 a 10" },
      }));
      return;
    }

    // Valor igual ao já salvo: nada a enviar (evita spam no auto-save)
    const alunoSalvo = alunos.find((a) => a.id === alunoId);
    const jaSalva = alunoSalvo?.notas.find(
      (n) => n.bimestre === bim && n.materia === mat
    );
    if (jaSalva && Number(jaSalva.nota) === notaNum) {
      setStatusNota((prev) => ({ ...prev, [chave]: { estado: "ok" } }));
      setEdicoes((prev) => {
        if (!(chave in prev)) return prev;
        const novo = { ...prev };
        delete novo[chave];
        return novo;
      });
      return;
    }

    setStatusNota((prev) => ({ ...prev, [chave]: { estado: "salvando" } }));
    try {
      const res = await fetch("http://127.0.0.1:8787/api/professor/notas", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ aluno_id: alunoId, bimestre: bim, materia: mat, nota: valor }),
      });
      if (!tratarResposta(res)) return;
      const data = await res.json();
      if (res.ok) {
        setStatusNota((prev) => ({ ...prev, [chave]: { estado: "ok" } }));
        setEdicoes((prev) => {
          if (!(chave in prev)) return prev;
          const novo = { ...prev };
          delete novo[chave];
          return novo;
        });
        await carregar();
      } else {
        setStatusNota((prev) => ({
          ...prev,
          [chave]: { estado: "erro", texto: data.error || "Erro ao salvar" },
        }));
      }
    } catch {
      setStatusNota((prev) => ({
        ...prev,
        [chave]: { estado: "erro", texto: "Sem conexão — tente de novo" },
      }));
    }
  };

  // Debounce do auto-save: o professor digita e a nota salva sozinha ~1s
  // depois, sem botão. Cada célula tem seu próprio timer.
  const agendarAutoSave = (alunoId: number, valor: string) => {
    if (!materiaNota) return;
    const chave = `${alunoId}:${bimestre}:${materiaNota}`;
    pendentesNota.current[chave] = { alunoId, valor, bim: bimestre, mat: materiaNota };
    const anterior = timersNota.current[chave];
    if (anterior) clearTimeout(anterior);
    timersNota.current[chave] = setTimeout(() => {
      delete timersNota.current[chave];
      const pendente = pendentesNota.current[chave];
      delete pendentesNota.current[chave];
      if (pendente) {
        void salvarNota(pendente.alunoId, pendente.valor, pendente.bim, pendente.mat);
      }
    }, 900);
  };

  // Ao sair da tela, salva o que ficou pendente em vez de perder o digito
  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    return () => {
      const timers = timersNota.current;
      const pendentes = pendentesNota.current;
      timersNota.current = {};
      pendentesNota.current = {};
      for (const t of Object.values(timers)) clearTimeout(t);
      for (const p of Object.values(pendentes)) {
        void salvarNota(p.alunoId, p.valor, p.bim, p.mat);
      }
    };
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */

  const registrarAcompanhamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alunoAcompId) {
      setMensagem({ tipo: "danger", texto: "Selecione o aluno." });
      return;
    }
    setSalvandoAcomp(true);
    try {
      const res = await fetch(
        "http://127.0.0.1:8787/api/professor/acompanhamentos",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ aluno_id: Number(alunoAcompId), texto: textoAcomp }),
        }
      );
      if (!tratarResposta(res)) return;
      const data = await res.json();
      if (res.ok) {
        setMensagem({ tipo: "success", texto: "Acompanhamento registrado!" });
        setTextoAcomp("");
        await carregar();
      } else {
        setMensagem({ tipo: "danger", texto: data.error || "Erro ao registrar." });
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Não foi possível conectar ao servidor." });
    } finally {
      setSalvandoAcomp(false);
    }
  };

  // Feed global de anotações (professores e pais), mais recente primeiro
  const listaAnotacoes = alunos
    .flatMap((al) => al.acompanhamentos.map((ac) => ({ ...ac, aluno_nome: al.nome })))
    .sort((a, b) => {
      if (a.criado_em !== b.criado_em) return a.criado_em < b.criado_em ? 1 : -1;
      return b.id - a.id;
    });

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: "#f8fafc" }}>
      {/* NAVBAR */}
      <Navbar expand="lg" className="portaria-navbar px-4 text-white shadow-sm">
        <Navbar.Brand className="fw-bold fs-5 text-white d-flex align-items-center">
          <span className="status-indicator bg-primary"></span>
          InformAluno{" "}
          <span className="ms-2 fs-6 fw-normal text-light opacity-75">
            | Painel do Professor
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

        {loading ? (
          <div className="text-center py-4">
            <div className="spinner-border text-primary" role="status"></div>
            <p className="mt-2 text-muted">Carregando alunos...</p>
          </div>
        ) : (
          <>
            {/* RECONHECIMENTO FACIAL DO PRÓPRIO PROFESSOR */}
            <Card className="shadow-sm border-0 mb-4">
              <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom">
                🪪 Reconhecimento Facial — cadastre sua foto
                <span className="text-muted fw-normal">
                  {" "}
                  (a portaria vai te reconhecer e registrar sua entrada/saída)
                </span>
              </Card.Header>
              <Card.Body>
                <Form onSubmit={salvarReconhecimento}>
                  <Row className="g-3 align-items-start">
                    <Col md={4} className="text-center">
                      {fotoReconhecimento ? (
                        <img
                          src={fotoReconhecimento}
                          alt="Sua foto para reconhecimento"
                          className="rounded shadow-sm mb-2 foto-reconhecimento mx-auto d-block"
                        />
                      ) : (
                        <div className="border rounded mb-2 text-muted foto-reconhecimento mx-auto d-flex align-items-center justify-content-center">
                          Sem foto
                        </div>
                      )}
                      {cameraAtiva && (
                        <div className="reconhecimento-camera mb-2">
                          <Webcam
                            audio={false}
                            ref={webcamFotoRef}
                            screenshotFormat="image/jpeg"
                            width="100%"
                          />
                          <Button
                            size="sm"
                            variant="success"
                            className="w-100 mt-2"
                            type="button"
                            onClick={capturarFotoCamera}
                          >
                            📸 Usar esta foto
                          </Button>
                        </div>
                      )}
                    </Col>
                    <Col md={8}>
                      <Form.Label>Matéria que você ministra</Form.Label>
                      <Form.Control
                        type="text"
                        maxLength={80}
                        placeholder="Ex.: Matemática"
                        value={materiaReconhecimento}
                        onChange={(e) => setMateriaReconhecimento(e.target.value)}
                      />
                      <div className="d-flex flex-wrap gap-2 mt-3 align-items-center">
                        <Button
                          size="sm"
                          variant="outline-primary"
                          type="button"
                          onClick={() => setCameraAtiva((v) => !v)}
                        >
                          {cameraAtiva ? "✖ Fechar câmera" : "📷 Usar câmera"}
                        </Button>
                        <label className="btn btn-outline-secondary btn-sm mb-0">
                          📁 Enviar arquivo
                          <input
                            type="file"
                            accept="image/*"
                            className="d-none"
                            onChange={escolherArquivoFoto}
                          />
                        </label>
                        <Button
                          size="sm"
                          variant="primary"
                          type="submit"
                          disabled={
                            salvandoFoto || !fotoReconhecimento || !materiaReconhecimento.trim()
                          }
                        >
                          {salvandoFoto ? "Salvando..." : "💾 Salvar foto"}
                        </Button>
                      </div>
                      <small className="text-muted d-block mt-2">
                        Use uma foto de rosto nítida — é ela que o sistema compara na câmera.
                      </small>
                    </Col>
                  </Row>
                </Form>
              </Card.Body>
            </Card>

            {/* SELETOR DE BIMESTRE E MATÉRIA */}
            <Card className="shadow-sm border-0 mb-4">
              <Card.Body className="d-flex flex-wrap align-items-center gap-2">
                <span className="fw-bold me-2">Bimestre:</span>
                {[1, 2, 3, 4].map((b) => (
                  <Button
                    key={b}
                    size="sm"
                    variant={b === bimestre ? "primary" : "outline-primary"}
                    className="fw-bold px-3"
                    onClick={() => setBimestre(b)}
                  >
                    {b}º Bimestre
                  </Button>
                ))}
                <span className="fw-bold ms-md-4 me-2">Matéria:</span>
                <Form.Select
                  size="sm"
                  className="w-auto"
                  value={materiaNota}
                  onChange={(e) => setMateriaNota(e.target.value)}
                  aria-label="Matéria da nota"
                >
                  <option value="" disabled>
                    Selecione a matéria
                  </option>
                  {materiasGrade.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Form.Select>
              </Card.Body>
            </Card>

            {/* TABELA DE NOTAS */}
            <Card className="shadow-sm border-0 mb-4">
              <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom">
                📚 Lançamento de Notas — {bimestre}º Bimestre ·{" "}
                {materiaNota || "selecione a matéria"}{" "}
                <span className="text-muted fw-normal">(escala 0 a 10)</span>
              </Card.Header>
              <Card.Body className="p-0">
                <Table hover responsive className="m-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Aluno</th>
                      <th>Matrícula</th>
                      <th style={{ width: "150px" }}>Nota (0–10)</th>
                      <th className="text-center" style={{ width: "130px" }}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {alunos.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-4 text-muted">
                          Nenhum aluno pré-cadastrado no sistema.
                        </td>
                      </tr>
                    ) : (
                      alunos.map((aluno) => (
                        <tr key={aluno.id}>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              {aluno.foto_base64 ? (
                                <img
                                  src={aluno.foto_base64}
                                  alt=""
                                  width={36}
                                  height={36}
                                  style={{ borderRadius: "50%", objectFit: "cover" }}
                                />
                              ) : (
                                <Badge bg="secondary">👤</Badge>
                              )}
                              <span className="fw-semibold">{aluno.nome}</span>
                            </div>
                          </td>
                          <td className="text-muted">{aluno.matricula}</td>
                          <td>
                            <Form.Control
                              type="text"
                              inputMode="decimal"
                              placeholder="—"
                              value={valorNota(aluno)}
                              onChange={(e) => {
                                const valor = e.target.value;
                                setEdicoes((prev) => ({
                                  ...prev,
                                  [`${aluno.id}:${bimestre}:${materiaNota}`]: valor,
                                }));
                                // Auto-save: digitar já agenda o envio
                                agendarAutoSave(aluno.id, valor);
                              }}
                            />
                          </td>
                          <td className="text-center">
                            {/* Indicador do auto-save (não há botão Salvar) */}
                            {(() => {
                              const st =
                                statusNota[`${aluno.id}:${bimestre}:${materiaNota}`];
                              if (st?.estado === "salvando") {
                                return (
                                  <Badge bg="secondary" className="px-2 py-1">
                                    ⏳ Salvando...
                                  </Badge>
                                );
                              }
                              if (st?.estado === "ok") {
                                return (
                                  <Badge bg="success" className="px-2 py-1">
                                    ✓ Salvo
                                  </Badge>
                                );
                              }
                              if (st?.estado === "erro") {
                                return (
                                  <Badge bg="danger" className="px-2 py-1" title={st.texto}>
                                    ⚠ {st.texto}
                                  </Badge>
                                );
                              }
                              return (
                                <small className="text-muted">
                                  {materiaNota ? "Auto-save" : "—"}
                                </small>
                              );
                            })()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>

            {/* ACOMPANHAMENTO: REGISTRAR + HISTÓRICO */}
            <Row className="g-4">
              <Col lg={5}>
                <Card className="shadow-sm border-0 h-100">
                  <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom">
                    📝 Registrar Acompanhamento
                  </Card.Header>
                  <Card.Body>
                    <Form onSubmit={registrarAcompanhamento}>
                      <Form.Group className="mb-3">
                        <Form.Label className="form-label-custom">Aluno</Form.Label>
                        <Form.Select
                          value={alunoAcompId}
                          onChange={(e) => setAlunoAcompId(e.target.value)}
                          required
                        >
                          <option value="">Selecione o aluno...</option>
                          {alunos.map((aluno) => (
                            <option key={aluno.id} value={aluno.id}>
                              {aluno.nome}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label className="form-label-custom">Observação</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={4}
                          maxLength={500}
                          placeholder="Ex.: dificuldade no conteúdo, elogio pelo desempenho, orientação de estudo..."
                          value={textoAcomp}
                          onChange={(e) => setTextoAcomp(e.target.value)}
                          required
                        />
                      </Form.Group>
                      <Button
                        type="submit"
                        className="btn-primary-custom w-100"
                        disabled={salvandoAcomp}
                      >
                        {salvandoAcomp ? "Registrando..." : "Registrar acompanhamento"}
                      </Button>
                    </Form>
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={7}>
                <Card className="shadow-sm border-0 h-100">
                  <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom">
                    📋 Acompanhamentos (professores e responsáveis)
                  </Card.Header>
                  <Card.Body style={{ maxHeight: "420px", overflowY: "auto" }}>
                    {listaAnotacoes.length === 0 ? (
                      <p className="text-muted mb-0">
                        Nenhum acompanhamento registrado ainda.
                      </p>
                    ) : (
                      listaAnotacoes.map((ac) => (
                        <div key={ac.id} className="border-bottom py-3">
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
                              >
                                {ac.papel}
                              </Badge>
                              <span className="fw-semibold ms-2">{ac.autor_nome}</span>
                              <span className="text-muted ms-2 small">
                                sobre {ac.aluno_nome}
                              </span>
                            </div>
                            <small className="text-muted">{ac.criado_em.slice(0, 16)}</small>
                          </div>
                          <div className="mt-1">{ac.texto}</div>
                          {ac.atestado_base64 && (
                            <div className="mt-1">
                              <AtestadoBotao
                                atestado={ac.atestado_base64}
                                nome={ac.atestado_nome}
                              />
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            {/* CHAT: O PROFESSOR CONVERSA COM A DIRETORIA E COM OS OUTROS PROFESSORES */}
            <Card className="shadow-sm border-0 mt-4">
              <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom">
                💬 Mensagens — Diretoria &amp; Famílias{" "}
                <span className="text-muted fw-normal">
                  (converse em tempo real com a equipe e com as famílias)
                </span>
              </Card.Header>
              <Card.Body>
                <ChatPainel />
              </Card.Body>
            </Card>
          </>
        )}
      </Container>
    </div>
  );
};
