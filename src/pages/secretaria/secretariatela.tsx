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
  Modal,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AtestadoBotao } from "../atestado/atestado";
import { abrirEmNovaAba } from "../atestado/abrirarquivo";
import { ChatPainel } from "../chat/chat";
import "../cadastro/Cadastro.css";
import { API } from "../../components/api";

interface AlunoFotos {
  id: number;
  nome: string;
  matricula: string;
  cpf: string | null;
  status: string;
  foto_aluno: string | null;
  pai_nome: string | null;
  foto_pai: string | null;
  mae_nome: string | null;
  foto_mae: string | null;
}

interface Mensagem {
  tipo: "success" | "danger";
  texto: string;
}

// Atestado anexado por um responsável no acompanhamento
interface AtestadoInfo {
  id: number;
  atestado_base64: string;
  atestado_nome: string | null;
  texto: string;
  papel: string;
  criado_em: string;
  autor_nome: string;
  aluno_id: number;
  aluno_nome: string;
  matricula: string;
}

type AlvoFoto = "aluno" | "pai" | "mae";

// Tela da SECRETARIA: ajusta (substitui) as fotos registradas no
// pré-cadastro — aluno, pai e mãe. Só correção de imagem, sem exclusão,
// para resolver foto errada sem intervenção da administração.
export const SecretariaTela: React.FC = () => {
  const navigate = useNavigate();

  const [alunos, setAlunos] = useState<AlunoFotos[]>([]);
  const [atestados, setAtestados] = useState<AtestadoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  // Modal de fotos (espelho do painel do admin, sem exclusão)
  const [showModalFotos, setShowModalFotos] = useState(false);
  const [alunoSelecionado, setAlunoSelecionado] = useState<AlunoFotos | null>(null);
  const [fotos, setFotos] = useState<{
    aluno: string | null;
    pai: string | null;
    mae: string | null;
  }>({ aluno: null, pai: null, mae: null });
  const [alvoEdicao, setAlvoEdicao] = useState<AlvoFoto | null>(null);
  const [modoEdicao, setModoEdicao] = useState<"file" | "camera">("file");
  const videoFotoRef = useRef<HTMLVideoElement | null>(null);

  const rotuloAlvo: Record<AlvoFoto, string> = { aluno: "Aluno", pai: "Responsável", mae: "2º Responsável" };

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
      const res = await fetch(`${API}/api/secretaria/alunos`, {
        headers: authHeaders(),
      });
      if (!tratarResposta(res)) return;
      if (res.ok) {
        const data = await res.json();
        setAlunos(Array.isArray(data) ? data : []);
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Não foi possível conectar ao servidor." });
    } finally {
      setLoading(false);
    }

    // Atestados anexados pelos responsáveis (seção complementar)
    try {
      const respAt = await fetch(`${API}/api/secretaria/atestados`, {
        headers: authHeaders(),
      });
      if (respAt.ok) {
        const dadosAt = await respAt.json();
        setAtestados(dadosAt.atestados || []);
      }
    } catch {
      /* seção de atestados não derruba a tela de fotos */
    }
  };

  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    carregar();
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */

  // === Câmera / arquivo ===
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
      const res = await fetch(
        `${API}/api/secretaria/alunos/${alunoSelecionado.id}/foto`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ alvo: chave, foto }),
        }
      );
      if (!tratarResposta(res)) return;
      const data = await res.json();
      if (res.ok) {
        // Atualiza o modal e a tabela na hora
        setFotos((prev) => ({ ...prev, [chave]: foto }));
        setAlunos((prev) =>
          prev.map((a) => {
            if (a.id !== alunoSelecionado.id) return a;
            const copia = { ...a };
            if (chave === "aluno") copia.foto_aluno = foto;
            if (chave === "pai") copia.foto_pai = foto;
            if (chave === "mae") copia.foto_mae = foto;
            return copia;
          })
        );
        setMensagem({
          tipo: "success",
          texto: `Foto do ${rotuloAlvo[chave]} atualizada com sucesso!`,
        });
        pararCameraFoto();
        setAlvoEdicao(null);
      } else {
        setMensagem({ tipo: "danger", texto: data.error || "Erro ao salvar a foto." });
      }
    } catch {
      setMensagem({ tipo: "danger", texto: "Não foi possível conectar ao servidor." });
    }
  };

  const handleArquivoFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files && e.target.files[0];
    if (!arquivo || !alvoEdicao) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) salvarFoto(alvoEdicao, reader.result as string);
    };
    reader.readAsDataURL(arquivo);
    e.target.value = "";
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

  const abrirModalFotos = (aluno: AlunoFotos) => {
    setAlunoSelecionado(aluno);
    setFotos({ aluno: aluno.foto_aluno, pai: aluno.foto_pai, mae: aluno.foto_mae });
    setAlvoEdicao(null);
    setModoEdicao("file");
    setShowModalFotos(true);
  };

  const fecharModalFotos = () => {
    pararCameraFoto();
    setShowModalFotos(false);
    setAlvoEdicao(null);
  };

  const selecionarAlvoFoto = (chave: AlvoFoto) => {
    pararCameraFoto();
    setModoEdicao("file");
    setAlvoEdicao(chave);
  };

  const alunosFiltrados = alunos.filter((a) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    return (
      a.nome.toLowerCase().includes(termo) ||
      a.matricula.toLowerCase().includes(termo)
    );
  });

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: "#f8fafc" }}>
      {/* NAVBAR */}
      <Navbar expand="lg" className="portaria-navbar px-4 text-white shadow-sm">
        <Navbar.Brand className="fw-bold fs-5 text-white d-flex align-items-center">
          <span className="status-indicator bg-primary"></span>
          InformAluno{" "}
          <span className="ms-2 fs-6 fw-normal text-light opacity-75">
            | Secretaria — Ajuste de Fotos
          </span>
        </Navbar.Brand>
        <Nav className="ms-auto d-flex align-items-center gap-3">
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

        <Card className="shadow-sm border-0 mb-4">
          <Card.Body className="d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div>
              <h5 className="fw-bold mb-1">📷 Ajuste de Fotos do Pré-Cadastro</h5>
              <small className="text-muted">
                Aqui você apenas <strong>corrige imagens</strong> — nenhum cadastro é
                excluído. Exclusões ficam com a administração.
              </small>
            </div>
            <Form.Control
              type="search"
              placeholder="🔍 Buscar por nome ou matrícula..."
              style={{ maxWidth: "320px" }}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </Card.Body>
        </Card>

        {loading ? (
          <div className="text-center py-4">
            <div className="spinner-border text-primary" role="status"></div>
            <p className="mt-2 text-muted">Carregando pré-cadastros...</p>
          </div>
        ) : (
          <Card className="shadow-sm border-0">
            <Card.Body className="p-0">
              <Table hover responsive className="m-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: "70px" }}>Foto</th>
                    <th>Aluno</th>
                    <th>Matrícula</th>
                    <th>Status</th>
                    <th className="text-center" style={{ width: "180px" }}>
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {alunosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-4 text-muted">
                        Nenhum pré-cadastro encontrado.
                      </td>
                    </tr>
                  ) : (
                    alunosFiltrados.map((aluno) => (
                      <tr key={aluno.id}>
                        <td>
                          {aluno.foto_aluno ? (
                            <img
                              src={aluno.foto_aluno}
                              alt=""
                              width={44}
                              height={44}
                              style={{ borderRadius: "50%", objectFit: "cover" }}
                            />
                          ) : (
                            <Badge bg="secondary">👤</Badge>
                          )}
                        </td>
                        <td className="fw-semibold">{aluno.nome}</td>
                        <td className="text-muted">{aluno.matricula}</td>
                        <td>
                          <Badge
                            bg={
                              aluno.status === "PENDENTE_VALIDACAO"
                                ? "warning"
                                : aluno.status === "REPROVADO"
                                ? "danger"
                                : "success"
                            }
                            text={aluno.status === "PENDENTE_VALIDACAO" ? "dark" : undefined}
                          >
                            {aluno.status.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="text-center">
                          <Button
                            size="sm"
                            className="btn-primary-custom"
                            onClick={() => abrirModalFotos(aluno)}
                          >
                            📷 Ajustar fotos
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        )}

        {/* ATESTADOS ANEXADOS PELOS RESPONSÁVEIS */}
        <Card className="shadow-sm border-0 mt-4">
          <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom d-flex justify-content-between align-items-center">
            <span>🩺 Atestados dos Alunos</span>
            <small className="text-muted fw-normal">
              Anexos enviados pelos responsáveis no acompanhamento
            </small>
          </Card.Header>
          <Card.Body className="p-0">
            {atestados.length === 0 ? (
              <p className="text-muted text-center py-4 mb-0">
                Nenhum atestado anexado até o momento.
              </p>
            ) : (
              <Table hover responsive className="m-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Aluno</th>
                    <th>Enviado por</th>
                    <th>Data</th>
                    <th>Observação</th>
                    <th>Arquivo</th>
                  </tr>
                </thead>
                <tbody>
                  {atestados.map((at) => (
                    <tr key={at.id}>
                      <td className="fw-semibold">
                        {at.aluno_nome}{" "}
                        <span className="text-muted fw-normal small">
                          ({at.matricula})
                        </span>
                      </td>
                      <td>
                        {at.autor_nome}{" "}
                        <Badge
                          bg={at.papel === "PROFESSOR" ? "primary" : "warning"}
                          text={at.papel === "PROFESSOR" ? undefined : "dark"}
                        >
                          {at.papel}
                        </Badge>
                      </td>
                      <td className="text-muted small text-nowrap">
                        {at.criado_em.slice(0, 16)}
                      </td>
                      <td className="small">{at.texto}</td>
                      <td>
                        <AtestadoBotao
                          atestado={at.atestado_base64}
                          nome={at.atestado_nome}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card.Body>
        </Card>

        {/* CHAT: CORRESPONDÊNCIA DO RESPONSÁVEL COM A SECRETARIA */}
        <Card className="shadow-sm border-0 mt-4">
          <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom">
            💬 Mensagens — Responsáveis
          </Card.Header>
          <Card.Body>
            <ChatPainel />
          </Card.Body>
        </Card>
      </Container>

      {/* MODAL DE FOTOS — apenas substituição, sem exclusão */}
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
                  <Card.Header className="fw-bold bg-white">
                    {rotuloAlvo[chave]}
                  </Card.Header>
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
                          Ver
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={alvoEdicao === chave ? "primary" : "outline-success"}
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

          {/* Área de edição da foto escolhida */}
          {alvoEdicao && (
            <div className="mt-3 border rounded p-3 bg-light">
              <div className="d-flex flex-wrap gap-2 mb-3">
                <strong className="me-2 align-self-center">
                  Alterando foto do {rotuloAlvo[alvoEdicao]}:
                </strong>
                <Button
                  size="sm"
                  variant={modoEdicao === "file" ? "primary" : "outline-primary"}
                  onClick={() => {
                    pararCameraFoto();
                    setModoEdicao("file");
                  }}
                >
                  📁 Arquivo
                </Button>
                <Button
                  size="sm"
                  variant={modoEdicao === "camera" ? "primary" : "outline-primary"}
                  onClick={() => {
                    setModoEdicao("camera");
                    iniciarCameraFoto();
                  }}
                >
                  📷 Câmera
                </Button>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => {
                    pararCameraFoto();
                    setAlvoEdicao(null);
                  }}
                >
                  ✕ Cancelar
                </Button>
              </div>

              {modoEdicao === "file" ? (
                <Form.Control
                  type="file"
                  accept="image/*"
                  onChange={handleArquivoFoto}
                />
              ) : (
                <div className="text-center">
                  <video
                    ref={videoFotoRef}
                    autoPlay
                    playsInline
                    style={{
                      width: "100%",
                      maxWidth: "360px",
                      borderRadius: "8px",
                      background: "#000",
                    }}
                  />
                  <div className="mt-2">
                    <Button size="sm" variant="primary" onClick={capturarCameraFoto}>
                      📸 Capturar
                    </Button>
                  </div>
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
    </div>
  );
};
