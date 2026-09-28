import React, { useState, useRef, useEffect } from "react";
import {
  Alert,
  Container,
  Card,
  Form,
  Button,
  Nav,
  Row,
  Col,
  Badge,
  Modal,
  Navbar,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import "../../../src/pages/cadastro/Cadastro.css";

// Filho já pré-cadastrado exibido em cartão na tela de cadastro
// (pai_id/mae_id + contatos alimentam o botão "Editar" do card)
type Filho = {
  id: number;
  nome: string;
  matricula: string;
  foto_base64: string | null;
  pai: string | null;
  mae: string | null;
  pai_id?: number | null;
  mae_id?: number | null;
  pai_telefone?: string | null;
  mae_telefone?: string | null;
  pai_foto?: string | null;
  mae_foto?: string | null;
};

export const Cadastro: React.FC = () => {
  const navigate = useNavigate();

  // --- DADOS DO FORMULÁRIO ---
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  // Série/turma em um campo só (ex.: "6º Ano A") — alimenta o agrupamento
  // por turma nos cards de resumo da diretoria.
  const [serie, setSerie] = useState("");
  const [cpfAluno, setCpfAluno] = useState("");

  const [responsavelNome, setResponsavelNome] = useState("");
  const [cpf, setCpf] = useState("");

  // --- DADOS DO 2º RESPONSÁVEL (opcional) ---
  const [responsavel2Nome, setResponsavel2Nome] = useState("");
  const [cpf2, setCpf2] = useState("");

  // Blocos dos responsáveis removidos pelo botão 🗑 (só 1 é obrigatório)
  const [resp1Removido, setResp1Removido] = useState(false);
  const [resp2Removido, setResp2Removido] = useState(false);

  // --- FOTOS (BASE64) ---
  const [fotoAluno, setFotoAluno] = useState<string | null>(null);
  const [fotoResponsavel, setFotoResponsavel] = useState<string | null>(null);
  const [fotoResponsavel2, setFotoResponsavel2] = useState<string | null>(null);

  // --- MODOS DE CAPTURA ---
  const [modoAluno, setModoAluno] = useState<"file" | "camera">("file");
  const [modoResponsavel, setModoResponsavel] = useState<"file" | "camera">("file");
  const [modoResponsavel2, setModoResponsavel2] = useState<"file" | "camera">("file");

  // --- 3º RESPONSÁVEL (campos do fluxo do botão "+" do hub) ---
  const [terceiroNome, setTerceiroNome] = useState("");
  const [terceiroCpf, setTerceiroCpf] = useState("");
  const [fotoTerceiro, setFotoTerceiro] = useState<string | null>(null);
  const [modoTerceiro, setModoTerceiro] = useState<"file" | "camera">("file");

  // --- HUB: filhos já pré-cadastrados em cartão + menu "+" ---
  const [carregandoFilhos, setCarregandoFilhos] = useState(true);
  const [filhos, setFilhos] = useState<Filho[]>([]);
  const [verCartoes, setVerCartoes] = useState(false);
  const [menuMais, setMenuMais] = useState(false);
  const [escolhendoAluno, setEscolhendoAluno] = useState(false);
  const [alvoTerceiro, setAlvoTerceiro] = useState<Filho | null>(null);
  const [enviandoTerceiro, setEnviandoTerceiro] = useState(false);
  const [erroTerceiro, setErroTerceiro] = useState<string | null>(null);
  const [terceiroEnviado, setTerceiroEnviado] = useState(false);

  // --- EDIÇÃO DOS PAIS PELO CARD (pai/mãe ou secretaria) ---
  const [editando, setEditando] = useState<Filho | null>(null);
  const [editNomePai, setEditNomePai] = useState("");
  const [editTelPai, setEditTelPai] = useState("");
  const [editFotoPai, setEditFotoPai] = useState<string | null>(null);
  const [editNomeMae, setEditNomeMae] = useState("");
  const [editTelMae, setEditTelMae] = useState("");
  const [editFotoMae, setEditFotoMae] = useState<string | null>(null);
  const [editAlvoFoto, setEditAlvoFoto] = useState<"pai" | "mae" | null>(null);
  const [editModoFoto, setEditModoFoto] = useState<"file" | "camera">("file");
  // Lado marcado para remoção pelo botão 🗑 (efetivado no "Salvar alterações")
  const [editRemovido, setEditRemovido] = useState<"pai" | "mae" | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const [okEdicao, setOkEdicao] = useState<string | null>(null);

  // --- PÓS PRÉ-CADASTRO: confirmação ---
  const [enviado, setEnviado] = useState(false);

  // --- REFS PARA CÂMERA ---
  const videoAlunoRef = useRef<HTMLVideoElement | null>(null);
  const videoResponsavelRef = useRef<HTMLVideoElement | null>(null);
  const videoResponsavel2Ref = useRef<HTMLVideoElement | null>(null);
  const videoTerceiroRef = useRef<HTMLVideoElement | null>(null);
  const videoEditRef = useRef<HTMLVideoElement | null>(null);

  // --- GERENCIAMENTO DE ARQUIVOS E CÂMERA ---
  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFoto: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setFoto(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const pararCamera = (videoRef: React.RefObject<HTMLVideoElement | null>) => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const iniciarCamera = async (videoRef: React.RefObject<HTMLVideoElement | null>) => {
    try {
      pararCamera(videoAlunoRef);
      pararCamera(videoResponsavelRef);
      pararCamera(videoResponsavel2Ref);
      pararCamera(videoTerceiroRef);
      pararCamera(videoEditRef);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error: any) {
      console.error("Erro ao acessar a câmera:", error);
      if (error.name === "NotReadableError") {
        alert("A câmera já está sendo usada por outro aplicativo ou aba do navegador. Feche-os e tente novamente.");
      } else {
        alert("Não foi possível acessar a câmera.");
      }
    }
  };

  const capturarFoto = (
    videoRef: React.RefObject<HTMLVideoElement | null>,
    setFoto: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        setFoto(canvas.toDataURL("image/jpeg"));
        pararCamera(videoRef);
      }
    }
  };

  const handleEnvio = async (e: React.FormEvent) => {
    e.preventDefault();

    // Só 1 responsável é obrigatório — o outro bloco pode ter sido removido
    const temResp1 = !resp1Removido;
    const temResp2 = !resp2Removido;
    if (!temResp1 && !temResp2) {
      alert("Informe ao menos um responsável antes de enviar.");
      return;
    }
    if (!fotoAluno) {
      alert("Por favor, registre a biometria/foto do aluno antes de enviar.");
      return;
    }
    if ((temResp1 && !fotoResponsavel) || (temResp2 && !fotoResponsavel2)) {
      alert("Por favor, registre a biometria/foto de cada responsável informado antes de enviar.");
      return;
    }

    // Conta logada que está fazendo o pré-cadastro — vincula o pai/mãe
    // à conta no banco, para o painel dele encontrar os filhos depois.
    let usuarioLogadoId: number | null = null;
    try {
      const bruto = localStorage.getItem("usuarioLogado");
      if (bruto) usuarioLogadoId = JSON.parse(bruto).id ?? null;
    } catch {
      usuarioLogadoId = null;
    }

    try {
      const resposta = await fetch("http://127.0.0.1:8787/api/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario_id: usuarioLogadoId,
          nome,
          matricula,
          serie,
          cpfAluno,
          responsavelNome: resp1Removido ? "" : responsavelNome,
          cpf: resp1Removido ? "" : cpf,
          fotoResponsavel: resp1Removido ? null : fotoResponsavel,
          responsavel2Nome: resp2Removido ? "" : responsavel2Nome,
          cpf2: resp2Removido ? "" : cpf2,
          fotoResponsavel2: resp2Removido ? null : fotoResponsavel2,
          fotoAluno,
          status: "PENDENTE_VALIDACAO", // Sinaliza para a Portaria validar
        }),
      });

      if (resposta.ok) {
        // Em vez do alerta antigo, abre a tela de confirmação.
        setEnviado(true);
      } else {
        const dados = await resposta.json().catch(() => ({}));
        alert(dados.error || `Erro ao enviar pré-cadastro. (HTTP ${resposta.status})`);
      }
    } catch (error) {
      console.error("Erro na conexão:", error);
      alert("Erro ao conectar com o servidor.");
    }
  };

  // Limpa os campos do fluxo do 3º responsável (botão "+" do hub).
  const removerTerceiro = () => {
    pararCamera(videoTerceiroRef);
    setTerceiroNome("");
    setTerceiroCpf("");
    setFotoTerceiro(null);
    setModoTerceiro("file");
  };

  // Botão 🗑 de cada bloco de responsável — no mínimo 1 precisa ficar.
  const removerResponsavel = (qual: 1 | 2) => {
    const outroRemovido = qual === 1 ? resp2Removido : resp1Removido;
    if (outroRemovido) {
      alert("Informe ao menos um responsável no cadastro do aluno.");
      return;
    }
    if (qual === 1) {
      pararCamera(videoResponsavelRef);
      setResponsavelNome("");
      setCpf("");
      setFotoResponsavel(null);
      setModoResponsavel("file");
      setResp1Removido(true);
    } else {
      pararCamera(videoResponsavel2Ref);
      setResponsavel2Nome("");
      setCpf2("");
      setFotoResponsavel2(null);
      setModoResponsavel2("file");
      setResp2Removido(true);
    }
  };

  const restaurarResponsavel = (qual: 1 | 2) => {
    if (qual === 1) setResp1Removido(false);
    else setResp2Removido(false);
  };

  // --- HUB: carrega os filhos já pré-cadastrados desta conta ---
  const carregarFilhos = async (): Promise<Filho[]> => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return [];
      const res = await fetch("http://127.0.0.1:8787/api/cadastro/filhos", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return []; // sem sessão/vínculo → segue com o formulário direto
      const dados = await res.json().catch(() => null);
      const lista: Filho[] = Array.isArray(dados?.filhos) ? dados.filhos : [];
      if (lista.length > 0) {
        setFilhos(lista);
        setVerCartoes(true);
      }
      return lista;
    } catch {
      // Sem servidor: continua com o formulário normal
      return [];
    } finally {
      setCarregandoFilhos(false);
    }
  };

  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    carregarFilhos();
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */

  // Só pais/vinculados, secretaria e admin podem editar pelo card
  const meuRole = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("usuarioLogado") || "{}");
      return String(u.role || "");
    } catch {
      return "";
    }
  })();
  const podeEditar = ["RESPONSAVEL", "SECRETARIA", "ADMIN"].includes(meuRole);

  // Conteúdo do cartão de identificação (foto, nome, matrícula, pai e mãe).
  // `comAcao` habilita o botão ✏️ Editar (fora da escolha de terceiro).
  const cartaoFilho = (f: Filho, comAcao = false) => (
    <Card.Body className="text-center">
      {f.foto_base64 ? (
        <img src={f.foto_base64} alt={f.nome} className="preview-avatar mb-2" />
      ) : (
        <div className="fs-1 mb-2">👦</div>
      )}
      <h6 className="fw-bold mb-1">{f.nome}</h6>
      <div className="text-muted small mb-2">Matrícula {f.matricula}</div>
      <div className="small mb-1">
        👤 Responsável: <strong>{f.pai || "—"}</strong>
      </div>
      <div className="small">
        👤 2º responsável: <strong>{f.mae || "—"}</strong>
      </div>
      {comAcao && podeEditar && (f.pai_id || f.mae_id) && (
        <div className="mt-2">
          <Button
            size="sm"
            variant="outline-primary"
            onClick={() => abrirEdicao(f)}
            title="Editar os dados dos responsáveis"
          >
            ✏️ Editar
          </Button>
        </div>
      )}
    </Card.Body>
  );

  // --- EDIÇÃO DOS PAIS: abre o modal com os dados atuais do card ---
  const abrirEdicao = (f: Filho) => {
    setEditando(f);
    setEditNomePai(f.pai || "");
    setEditTelPai(f.pai_telefone || "");
    setEditFotoPai(f.pai_foto || null);
    setEditNomeMae(f.mae || "");
    setEditTelMae(f.mae_telefone || "");
    setEditFotoMae(f.mae_foto || null);
    setEditAlvoFoto(null);
    setEditModoFoto("file");
    setEditRemovido(null);
    setErroEdicao(null);
    setOkEdicao(null);
  };

  const fecharEdicao = () => {
    pararCamera(videoEditRef);
    setEditando(null);
    setEditAlvoFoto(null);
    setEditRemovido(null);
  };

  // Envia a edição para a API — cada alteração dispara e-mail aos pais
  const salvarEdicao = async () => {
    if (!editando || salvandoEdicao) return;
    // Lado marcado com 🗑 não valida nome/telefone: ele será removido
    if (editando.pai_id && editRemovido !== "pai" && !editNomePai.trim()) {
      setErroEdicao("Informe o nome do responsável.");
      return;
    }
    if (editando.mae_id && editRemovido !== "mae" && !editNomeMae.trim()) {
      setErroEdicao("Informe o nome do 2º responsável.");
      return;
    }

    setSalvandoEdicao(true);
    setErroEdicao(null);
    setOkEdicao(null);
    try {
      const payload: Record<string, unknown> = { aluno_id: editando.id };
      if (editando.pai_id) {
        // Remoção marcada pelo 🗑 do bloco
        payload.pai =
          editRemovido === "pai"
            ? { id: editando.pai_id, remover: true }
            : {
                id: editando.pai_id,
                nome: editNomePai.trim(),
                telefone: editTelPai.trim(),
                // Foto só vai quando o usuário trocou de fato
                ...(editFotoPai && editFotoPai !== editando.pai_foto
                  ? { foto: editFotoPai }
                  : {}),
              };
      }
      if (editando.mae_id) {
        payload.mae =
          editRemovido === "mae"
            ? { id: editando.mae_id, remover: true }
            : {
                id: editando.mae_id,
                nome: editNomeMae.trim(),
                telefone: editTelMae.trim(),
                ...(editFotoMae && editFotoMae !== editando.mae_foto
                  ? { foto: editFotoMae }
                  : {}),
              };
      }

      const res = await fetch("http://127.0.0.1:8787/api/cadastro/responsaveis", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify(payload),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroEdicao(dados.error || `Erro ao salvar. (HTTP ${res.status})`);
        return;
      }

      setOkEdicao(dados.message || "Dados atualizados!");
      setEditRemovido(null);
      setEditAlvoFoto(null);

      // Ressincroniza o modal com o servidor: depois de uma remoção o 2º
      // responsável pode ter sido promovido ao slot 1 — aí os rótulos
      // ("Responsável"/"2º Responsável") e os ids do bloco mudam.
      const lista = await carregarFilhos();
      const atualizado = lista.find((f) => f.id === editando.id);
      if (atualizado) {
        setEditando(atualizado);
        setEditNomePai(atualizado.pai || "");
        setEditTelPai(atualizado.pai_telefone || "");
        setEditFotoPai(atualizado.pai_foto || null);
        setEditNomeMae(atualizado.mae || "");
        setEditTelMae(atualizado.mae_telefone || "");
        setEditFotoMae(atualizado.mae_foto || null);
      } else {
        // Filho saiu da lista: mantém o estado local sem o lado removido
        setEditando((prev) =>
          prev
            ? {
                ...prev,
                pai: editRemovido === "pai" ? "" : editNomePai.trim(),
                pai_telefone: editRemovido === "pai" ? "" : editTelPai.trim(),
                pai_foto: editRemovido === "pai" ? null : editFotoPai,
                pai_id: editRemovido === "pai" ? null : prev.pai_id,
                mae: editRemovido === "mae" ? "" : editNomeMae.trim(),
                mae_telefone: editRemovido === "mae" ? "" : editTelMae.trim(),
                mae_foto: editRemovido === "mae" ? null : editFotoMae,
                mae_id: editRemovido === "mae" ? null : prev.mae_id,
              }
            : prev
        );
      }
    } catch {
      setErroEdicao("Erro ao conectar com o servidor.");
    } finally {
      setSalvandoEdicao(false);
    }
  };

  // Bloco de edição de um dos lados (pai ou mãe) dentro do modal
  const blocoEdicao = (lado: "pai" | "mae") => {
    const nome = lado === "pai" ? editNomePai : editNomeMae;
    const setNome = lado === "pai" ? setEditNomePai : setEditNomeMae;
    const tel = lado === "pai" ? editTelPai : editTelMae;
    const setTel = lado === "pai" ? setEditTelPai : setEditTelMae;
    const foto = lado === "pai" ? editFotoPai : editFotoMae;
    const setFoto = lado === "pai" ? setEditFotoPai : setEditFotoMae;
    const rotulo = lado === "pai" ? "Responsável" : "2º Responsável";
    const ativo = editAlvoFoto === lado;
    // 🗑 remoção: marcada aqui e efetivada em "Salvar alterações"
    const removido = editRemovido === lado;
    const outroId = lado === "pai" ? editando?.mae_id : editando?.pai_id;
    const outroRemovido = editRemovido === (lado === "pai" ? "mae" : "pai");
    // Só permite tirar este se o outro existe e não está também marcado
    const podeRemover = Boolean(outroId) && !outroRemovido;

    return (
      <Card className="border h-100">
        <Card.Header className="bg-white fw-bold d-flex justify-content-between align-items-center gap-2">
          <span>👤 {rotulo}</span>
          <Button
            size="sm"
            variant={removido ? "outline-success" : "outline-danger"}
            disabled={!removido && !podeRemover}
            title={
              removido
                ? "Cancelar a remoção deste responsável"
                : podeRemover
                  ? `Remover o ${rotulo.toLowerCase()} deste aluno`
                  : "O aluno precisa manter ao menos um responsável"
            }
            onClick={() => {
              if (!removido) {
                // Tira a câmera de cena antes de marcar a remoção
                pararCamera(videoEditRef);
                if (editAlvoFoto === lado) setEditAlvoFoto(null);
              }
              setEditRemovido(removido ? null : lado);
            }}
          >
            {removido ? "↩ Restaurar" : "🗑 Remover"}
          </Button>
        </Card.Header>
        <Card.Body>
          {removido && (
            <Alert variant="warning" className="small py-2 mb-3">
              <strong>{rotulo} será removido</strong> ao clicar em "💾 Salvar
              alterações". Use "↩ Restaurar" para desfazer.
            </Alert>
          )}

          <Form.Group className="mb-3">
            <Form.Label className="form-label-custom">Nome Completo</Form.Label>
            <Form.Control
              type="text"
              className="form-control-custom"
              placeholder={`Nome do ${rotulo.toLowerCase()}`}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={120}
              disabled={removido}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="form-label-custom">Telefone</Form.Label>
            <Form.Control
              type="text"
              className="form-control-custom"
              placeholder="(00) 00000-0000"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              maxLength={30}
              disabled={removido}
            />
          </Form.Group>

          <div className="text-center mb-2">
            {foto ? (
              <img src={foto} alt={rotulo} className="preview-avatar mb-2" />
            ) : (
              <div className="fs-1 mb-2">👤</div>
            )}
          </div>

          {!removido && (
          <div className="d-flex gap-2 justify-content-center mb-2">
            <Button
              size="sm"
              variant={ativo ? "outline-secondary" : "outline-primary"}
              onClick={() => {
                pararCamera(videoEditRef);
                setEditAlvoFoto(ativo ? null : lado);
                setEditModoFoto("file");
              }}
            >
              {ativo ? "✕ Fechar" : "✏️ Trocar foto"}
            </Button>
          </div>
          )}
          {!removido && ativo && (
            <div>
              <div className="d-flex gap-2 justify-content-center mb-2">
                <Button
                  size="sm"
                  variant={editModoFoto === "file" ? "primary" : "outline-primary"}
                  onClick={() => {
                    setEditModoFoto("file");
                    pararCamera(videoEditRef);
                  }}
                >
                  📎 Arquivo
                </Button>
                <Button
                  size="sm"
                  variant={editModoFoto === "camera" ? "primary" : "outline-primary"}
                  onClick={() => setEditModoFoto("camera")}
                >
                  📷 Câmera
                </Button>
              </div>
              {editModoFoto === "file" ? (
                <Form.Control
                  type="file"
                  accept="image/*"
                  className="form-control-custom"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleImageUpload(e, setFoto)
                  }
                />
              ) : (
                <div className="text-center">
                  <div className="camera-viewport">
                    <video ref={videoEditRef} autoPlay playsInline className="camera-video" />
                    <div className="face-overlay" />
                  </div>
                  <div className="mt-2 d-flex gap-2 justify-content-center">
                    <Button
                      variant="outline-dark"
                      size="sm"
                      onClick={() => iniciarCamera(videoEditRef)}
                    >
                      Iniciar Câmera
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        capturarFoto(videoEditRef, setFoto);
                        setEditAlvoFoto(null);
                      }}
                    >
                      Capturar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card.Body>
      </Card>
    );
  };

  // "+ → Outro filho": abre o formulário de pré-cadastro em branco
  const abrirFormulario = () => {
    removerTerceiro();
    setNome("");
    setMatricula("");
    setCpfAluno("");
    setResponsavelNome("");
    setCpf("");
    setResponsavel2Nome("");
    setCpf2("");
    setFotoAluno(null);
    setFotoResponsavel(null);
    setFotoResponsavel2(null);
    setModoAluno("file");
    setModoResponsavel("file");
    setModoResponsavel2("file");
    setEnviado(false);
    setMenuMais(false);
    setVerCartoes(false);
  };

  // "+ → Terceiro responsável temporário": escolhe o aluno (ou segue
  // direto se houver apenas um) e abre o preenchimento
  const iniciarTerceiro = () => {
    setMenuMais(false);
    setTerceiroEnviado(false);
    setErroTerceiro(null);
    removerTerceiro();
    if (filhos.length === 1) {
      setAlvoTerceiro(filhos[0]);
    } else {
      setEscolhendoAluno(true);
    }
  };

  const cancelarTerceiro = () => {
    removerTerceiro();
    setAlvoTerceiro(null);
    setErroTerceiro(null);
    setTerceiroEnviado(false);
    setEscolhendoAluno(false);
  };

  // Envia a solicitação do terceiro para um aluno já cadastrado
  const enviarTerceiro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alvoTerceiro || enviandoTerceiro) return;

    if (!terceiroNome.trim() || terceiroCpf.length !== 11 || !fotoTerceiro) {
      setErroTerceiro("Preencha nome, CPF (11 dígitos) e foto antes de enviar.");
      return;
    }

    setEnviandoTerceiro(true);
    setErroTerceiro(null);
    try {
      const res = await fetch("http://127.0.0.1:8787/api/convite/terceiro", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify({
          aluno_id: alvoTerceiro.id,
          nome: terceiroNome.trim(),
          cpf: terceiroCpf,
          foto: fotoTerceiro,
        }),
      });
      const dados = await res.json().catch(() => ({}));
      if (res.ok) {
        setTerceiroEnviado(true);
      } else {
        setErroTerceiro(dados.error || `Erro ao enviar solicitação. (HTTP ${res.status})`);
      }
    } catch {
      setErroTerceiro("Erro ao conectar com o servidor.");
    } finally {
      setEnviandoTerceiro(false);
    }
  };

  // "← Voltar" da tela de sucesso: volta para os cartões quando existem
  // (recarregando para o aluno recém-enviado já aparecer)
  const voltarDoSucesso = () => {
    if (filhos.length > 0) {
      setEnviado(false);
      setVerCartoes(true);
      carregarFilhos();
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/";
    }
  };

  // Aguarda a busca dos filhos já cadastrados (define se abre em cartões)
  if (carregandoFilhos) {
    return (
      <Container className="py-5 text-center" style={{ maxWidth: "640px" }}>
        <Button
          variant="outline-secondary"
          size="sm"
          className="mb-3"
          onClick={() =>
            window.history.length > 1 ? window.history.back() : (window.location.href = "/")
          }
        >
          ← Voltar
        </Button>
        <div className="fs-1 mb-2">⏳</div>
        <p className="text-muted mb-0">Carregando seus alunos...</p>
      </Container>
    );
  }

  // --- HUB: cartões dos filhos já pré-cadastrados + menu "+" ---
  if (verCartoes) {
    return (
      <div className="pb-5">
        <Navbar expand="lg" className="portaria-navbar px-4 mb-4 text-white">
          <Navbar.Brand className="fw-bold fs-5 text-white d-flex align-items-center">
            <span className="status-indicator"></span>
            InformAluno{" "}
            <span className="ms-2 fs-6 fw-normal text-light opacity-75">
              | Pré-Cadastro de Aluno e Responsável
            </span>
          </Navbar.Brand>
          <div className="ms-auto">
            <Button
              variant="outline-light"
              size="sm"
              onClick={() =>
                window.history.length > 1 ? window.history.back() : (window.location.href = "/")
              }
            >
              ← Voltar
            </Button>
          </div>
        </Navbar>

        <Container>
          <Card className="cadastro-card">
            <Card.Header className="cadastro-header d-flex justify-content-between align-items-center">
              <div>
                <h4 className="m-0 fw-bold fs-5">Seus alunos pré-cadastrados</h4>
                <small className="opacity-75">
                  Cartões para fácil identificação — use o + para adicionar
                </small>
              </div>
              <Badge bg="warning" text="dark" className="px-3 py-2 fw-semibold">
                {filhos.length} aluno(s)
              </Badge>
            </Card.Header>

            <Card.Body className="p-4 p-md-5">
              {terceiroEnviado && alvoTerceiro ? (
                <div className="text-center">
                  <div className="fs-1 mb-2">📧</div>
                  <h5 className="fw-bold">Solicitação enviada!</h5>
                  <p className="text-muted">
                    Os responsáveis receberam um e-mail para{" "}
                    <strong>aprovar ou rejeitar</strong> o cadastro de terceiro
                    responsável de <strong>{alvoTerceiro.nome}</strong>. A
                    pendência também aparece no painel do responsável.
                  </p>
                  <Button variant="primary" onClick={cancelarTerceiro}>
                    ← Voltar aos alunos
                  </Button>
                </div>
              ) : escolhendoAluno ? (
                <div>
                  <h6 className="fw-bold mb-3">
                    Para qual aluno é o terceiro responsável?
                  </h6>
                  <Row xs={1} md={2} lg={3} className="g-3">
                    {filhos.map((f) => (
                      <Col key={f.id}>
                        <Card
                          className="h-100 shadow-sm border-0"
                          style={{ cursor: "pointer" }}
                          onClick={() => {
                            setAlvoTerceiro(f);
                            setEscolhendoAluno(false);
                          }}
                        >
                          {cartaoFilho(f)}
                        </Card>
                      </Col>
                    ))}
                  </Row>
                  <div className="text-center mt-3">
                    <Button variant="link" onClick={() => setEscolhendoAluno(false)}>
                      ← Voltar
                    </Button>
                  </div>
                </div>
              ) : alvoTerceiro ? (
                <Form onSubmit={enviarTerceiro}>
                  <div className="text-center mb-4">
                    <div className="fs-1 mb-2">👤</div>
                    <h5 className="fw-bold">Terceiro responsável temporário</h5>
                    <p className="text-muted small mb-0">
                      Aluno: <strong>{alvoTerceiro.nome}</strong> (matrícula{" "}
                      {alvoTerceiro.matricula})
                      <br />
                      Preenchimento igual ao dos responsáveis — os
                      responsáveis aprovam por e-mail. A solicitação expira em
                      12 horas.
                    </p>
                  </div>

                  <Form.Group className="mb-3">
                    <Form.Label className="form-label-custom">Nome Completo</Form.Label>
                    <Form.Control
                      type="text"
                      className="form-control-custom"
                      placeholder="Nome do terceiro responsável"
                      value={terceiroNome}
                      onChange={(e) => setTerceiroNome(e.target.value)}
                      required
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label className="form-label-custom">CPF do Terceiro</Form.Label>
                    <Form.Control
                      type="text"
                      className="form-control-custom"
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                      maxLength={11}
                      value={terceiroCpf}
                      onChange={(e) =>
                        setTerceiroCpf(e.target.value.replace(/\D/g, "").slice(0, 11))
                      }
                      required
                    />
                  </Form.Group>

                  {/* Biometria Facial Terceiro */}
                  <div className="media-panel mt-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="form-label-custom m-0">
                        Foto para Validação (Terceiro)
                      </span>
                      {fotoTerceiro && <Badge bg="success">Anexada</Badge>}
                    </div>

                    <Nav
                      variant="pills"
                      activeKey={modoTerceiro}
                      onSelect={(k) => {
                        const modo = (k as "file" | "camera") || "file";
                        setModoTerceiro(modo);
                        if (modo === "file") pararCamera(videoTerceiroRef);
                      }}
                      className="nav-pills-custom mb-3"
                    >
                      <Nav.Item>
                        <Nav.Link eventKey="file">Anexar Arquivo</Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link eventKey="camera">Câmera ao Vivo</Nav.Link>
                      </Nav.Item>
                    </Nav>

                    {modoTerceiro === "file" ? (
                      <Form.Control
                        type="file"
                        accept="image/*"
                        className="form-control-custom"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleImageUpload(e, setFotoTerceiro)
                        }
                      />
                    ) : (
                      <div className="text-center">
                        <div className="camera-viewport">
                          <video
                            ref={videoTerceiroRef}
                            autoPlay
                            playsInline
                            className="camera-video"
                          />
                          <div className="face-overlay" />
                        </div>
                        <div className="mt-2 d-flex gap-2 justify-content-center">
                          <Button
                            variant="outline-dark"
                            size="sm"
                            onClick={() => iniciarCamera(videoTerceiroRef)}
                          >
                            Iniciar Câmera
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => capturarFoto(videoTerceiroRef, setFotoTerceiro)}
                          >
                            Capturar
                          </Button>
                        </div>
                      </div>
                    )}

                    {fotoTerceiro && (
                      <div className="mt-3 text-center">
                        <img
                          src={fotoTerceiro}
                          alt="Terceiro Preview"
                          className="preview-avatar"
                        />
                      </div>
                    )}
                  </div>

                  {erroTerceiro && (
                    <Alert variant="danger" className="mt-3 mb-0">
                      {erroTerceiro}
                    </Alert>
                  )}

                  <div className="d-flex gap-2 justify-content-center mt-4">
                    <Button variant="outline-secondary" onClick={cancelarTerceiro}>
                      ← Voltar
                    </Button>
                    <Button type="submit" variant="primary" disabled={enviandoTerceiro}>
                      {enviandoTerceiro ? "Enviando..." : "📨 Enviar para aprovação"}
                    </Button>
                  </div>
                </Form>
              ) : (
                <div>
                  <Row xs={1} md={2} lg={3} className="g-3 mb-4">
                    {filhos.map((f) => (
                      <Col key={f.id}>
                        <Card className="h-100 shadow-sm border-0">{cartaoFilho(f, true)}</Card>
                      </Col>
                    ))}
                  </Row>

                  <div className="text-center">
                    {!menuMais ? (
                      <Button
                        variant="primary"
                        onClick={() => setMenuMais(true)}
                        aria-label="Adicionar"
                        title="Adicionar"
                        style={{
                          width: "64px",
                          height: "64px",
                          fontSize: "2rem",
                          borderRadius: "50%",
                        }}
                      >
                        ＋
                      </Button>
                    ) : (
                      <div className="d-flex gap-2 justify-content-center flex-wrap">
                        <Button variant="outline-primary" onClick={abrirFormulario}>
                          👦 Outro filho
                        </Button>
                        <Button variant="outline-success" onClick={iniciarTerceiro}>
                          👤 Terceiro responsável temporário
                        </Button>
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => setMenuMais(false)}
                        >
                          ✕
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>
        </Container>

        {/* MODAL: EDITAR OS DADOS DO PAI E DA MÃE PELO CARD */}
        <Modal show={editando !== null} onHide={fecharEdicao} centered size="lg">
          <Modal.Header closeButton className="bg-light">
            <Modal.Title className="fs-5 fw-bold">
              ✏️ Editar responsável{editando ? ` — ${editando.nome}` : ""}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="text-muted small mb-3">
              Altere os dados dos responsáveis. <strong>Cada alteração é enviada por e-mail aos
              responsáveis</strong> do aluno.
            </p>

            {okEdicao && <Alert variant="success">{okEdicao}</Alert>}
            {erroEdicao && <Alert variant="danger">{erroEdicao}</Alert>}

            <Row className="g-3">
              {editando && editando.pai_id && (
                <Col md={editando.mae_id ? 6 : 12}>{blocoEdicao("pai")}</Col>
              )}
              {editando && editando.mae_id && (
                <Col md={editando.pai_id ? 6 : 12}>{blocoEdicao("mae")}</Col>
              )}
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={fecharEdicao}>
              Fechar
            </Button>
            <Button variant="primary" onClick={salvarEdicao} disabled={salvandoEdicao}>
              {salvandoEdicao ? "Salvando..." : "💾 Salvar alterações"}
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    );
  }

  // Tela de confirmação pós-pré-cadastro, com atalho para a Portaria.
  if (enviado) {
    return (
      <Container className="py-5" style={{ maxWidth: "640px" }}>
        <Button
          variant="outline-secondary"
          size="sm"
          className="mb-3"
          onClick={voltarDoSucesso}
        >
          ← Voltar
        </Button>

        <Card className="shadow-sm border-0">
          <Card.Body className="p-4 p-md-5 text-center">
            <div className="fs-1 mb-2">🎉</div>
            <h4 className="fw-bold">Pré-cadastro enviado!</h4>
            <p className="text-muted mb-4">
              O cadastro aguarda validação final na Portaria.
            </p>

            <div className="d-flex gap-3 justify-content-center flex-wrap mt-4">
              <Button variant="outline-primary" onClick={() => navigate("/portaria")}>
                Ir para a Portaria
              </Button>
              <Button variant="outline-secondary" onClick={() => navigate("/")}>
                Ir para o início
              </Button>
            </div>
          </Card.Body>
        </Card>
      </Container>
    );
  }

  return (
    <div className="pb-5">
      {/* Navbar Superior */}
      <Navbar expand="lg" className="portaria-navbar px-4 mb-4 text-white">
        <Navbar.Brand className="fw-bold fs-5 text-white d-flex align-items-center">
          <span className="status-indicator"></span>
          InformAluno <span className="ms-2 fs-6 fw-normal text-light opacity-75">| Solicitacao de Pré-Cadastro</span>
        </Navbar.Brand>
        <div className="ms-auto">
          <Button
            variant="outline-light"
            size="sm"
            onClick={() => {
              if (filhos.length > 0) {
                cancelarTerceiro();
                setVerCartoes(true);
              } else if (window.history.length > 1) {
                window.history.back();
              } else {
                window.location.href = "/";
              }
            }}
          >
            ← Voltar
          </Button>
        </div>
      </Navbar>

      <Container>
        <Card className="cadastro-card">
          <Card.Header className="cadastro-header d-flex justify-content-between align-items-center">
            <div>
              <h4 className="m-0 fw-bold fs-5">Pré-Cadastro de Aluno e Responsável</h4>
              <small className="opacity-75">Etapa 1 de 2: Envio de dados e fotos para análise</small>
            </div>
            <Badge bg="warning" text="dark" className="px-3 py-2 fw-semibold">
              Aguardando Validação na Portaria
            </Badge>
          </Card.Header>

          <Card.Body className="p-4 p-md-5">
            <Form onSubmit={handleEnvio}>
              <Row>
                {/* --- SEÇÃO ALUNO --- */}
                <Col lg={6} className="pe-lg-4 border-end-lg">
                  <div className="d-flex align-items-center mb-3">
                    <span className="step-number me-2">1</span>
                    <h5 className="m-0 fw-bold fs-6 text-dark">Dados do Aluno</h5>
                  </div>

                  <Form.Group className="mb-3">
                    <Form.Label className="form-label-custom">Nome Completo</Form.Label>
                    <Form.Control
                      type="text"
                      className="form-control-custom"
                      placeholder="Nome do aluno"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      required
                    />
                  </Form.Group>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="form-label-custom">Matrícula</Form.Label>
                        <Form.Control
                          type="text"
                          className="form-control-custom"
                          placeholder="Ex: 20261001"
                          value={matricula}
                          onChange={(e) => setMatricula(e.target.value)}
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="form-label-custom">CPF do Aluno</Form.Label>
                        <Form.Control
                          type="text"
                          className="form-control-custom"
                          placeholder="000.000.000-00"
                          inputMode="numeric"
                          maxLength={11}
                          value={cpfAluno}
                          onChange={(e) =>
                            setCpfAluno(
                              e.target.value.replace(/\D/g, "").slice(0, 11)
                            )
                          }
                          required
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="form-label-custom">Série / Turma</Form.Label>
                        <Form.Control
                          type="text"
                          className="form-control-custom"
                          placeholder="Ex: 6º Ano A"
                          value={serie}
                          onChange={(e) => setSerie(e.target.value.slice(0, 40))}
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  {/* Biometria Facial Aluno */}
                  <div className="media-panel mt-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="form-label-custom m-0">Foto para Validação (Aluno)</span>
                      {fotoAluno && <Badge bg="success">Anexada</Badge>}
                    </div>

                    <Nav
                      variant="pills"
                      activeKey={modoAluno}
                      onSelect={(k) => {
                        const modo = (k as "file" | "camera") || "file";
                        setModoAluno(modo);
                        if (modo === "file") pararCamera(videoAlunoRef);
                      }}
                      className="nav-pills-custom mb-3"
                    >
                      <Nav.Item>
                        <Nav.Link eventKey="file">Anexar Arquivo</Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link eventKey="camera">Câmera ao Vivo</Nav.Link>
                      </Nav.Item>
                    </Nav>

                    {modoAluno === "file" ? (
                      <Form.Control
                        type="file"
                        accept="image/*"
                        className="form-control-custom"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleImageUpload(e, setFotoAluno)
                        }
                      />
                    ) : (
                      <div className="text-center">
                        <div className="camera-viewport">
                          <video ref={videoAlunoRef} autoPlay playsInline className="camera-video" />
                          <div className="face-overlay" />
                        </div>
                        <div className="mt-2 d-flex gap-2 justify-content-center">
                          <Button variant="outline-dark" size="sm" onClick={() => iniciarCamera(videoAlunoRef)}>
                            Iniciar Câmera
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => capturarFoto(videoAlunoRef, setFotoAluno)}>
                            Capturar
                          </Button>
                        </div>
                      </div>
                    )}

                    {fotoAluno && (
                      <div className="mt-3 text-center">
                        <img src={fotoAluno} alt="Aluno Preview" className="preview-avatar" />
                      </div>
                    )}
                  </div>
                </Col>

                {/* --- SEÇÃO 1º RESPONSÁVEL --- */}
                <Col lg={6} className="ps-lg-4 mt-4 mt-lg-0">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <div className="d-flex align-items-center">
                      <span className="step-number me-2">2</span>
                      <h5 className="m-0 fw-bold fs-6 text-dark">Dados do Responsável</h5>
                    </div>
                    {!resp1Removido ? (
                      <Button
                        size="sm"
                        variant="outline-danger"
                        title="Remover este responsável"
                        onClick={() => removerResponsavel(1)}
                      >
                        🗑 Remover
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline-success"
                        title="Adicionar este responsável de volta"
                        onClick={() => restaurarResponsavel(1)}
                      >
                        ➕ Adicionar
                      </Button>
                    )}
                  </div>

                  {resp1Removido ? (
                    <p className="text-muted small mb-0">
                      Bloco removido — apenas 1 responsável é obrigatório.
                    </p>
                  ) : (
                  <>
                  <Form.Group className="mb-3">
                    <Form.Label className="form-label-custom">Nome Completo</Form.Label>
                    <Form.Control
                      type="text"
                      className="form-control-custom"
                      placeholder="Nome do responsável"
                      value={responsavelNome}
                      onChange={(e) => setResponsavelNome(e.target.value)}
                      required
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label className="form-label-custom">CPF do Responsável</Form.Label>
                    <Form.Control
                      type="text"
                      className="form-control-custom"
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                      maxLength={11}
                      value={cpf}
                      onChange={(e) =>
                        setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))
                      }
                      required
                    />
                  </Form.Group>

                  {/* Biometria Facial do responsável */}
                  <div className="media-panel mt-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="form-label-custom m-0">Foto para Validação (Responsável)</span>
                      {fotoResponsavel && <Badge bg="success">Anexada</Badge>}
                    </div>

                    <Nav
                      variant="pills"
                      activeKey={modoResponsavel}
                      onSelect={(k) => {
                        const modo = (k as "file" | "camera") || "file";
                        setModoResponsavel(modo);
                        if (modo === "file") pararCamera(videoResponsavelRef);
                      }}
                      className="nav-pills-custom mb-3"
                    >
                      <Nav.Item>
                        <Nav.Link eventKey="file">Anexar Arquivo</Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link eventKey="camera">Câmera ao Vivo</Nav.Link>
                      </Nav.Item>
                    </Nav>

                    {modoResponsavel === "file" ? (
                      <Form.Control
                        type="file"
                        accept="image/*"
                        className="form-control-custom"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleImageUpload(e, setFotoResponsavel)
                        }
                      />
                    ) : (
                      <div className="text-center">
                        <div className="camera-viewport">
                          <video ref={videoResponsavelRef} autoPlay playsInline className="camera-video" />
                          <div className="face-overlay" />
                        </div>
                        <div className="mt-2 d-flex gap-2 justify-content-center">
                          <Button variant="outline-dark" size="sm" onClick={() => iniciarCamera(videoResponsavelRef)}>
                            Iniciar Câmera
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => capturarFoto(videoResponsavelRef, setFotoResponsavel)}>
                            Capturar
                          </Button>
                        </div>
                      </div>
                    )}

                    {fotoResponsavel && (
                      <div className="mt-3 text-center">
                        <img src={fotoResponsavel} alt="Responsável Preview" className="preview-avatar" />
                      </div>
                    )}
                  </div>
                  </>
                  )}
                </Col>

                {/* --- SEÇÃO 2º RESPONSÁVEL --- */}
                <Col lg={6} className="ps-lg-4 mt-4">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <div className="d-flex align-items-center">
                      <span className="step-number me-2">3</span>
                      <h5 className="m-0 fw-bold fs-6 text-dark">Dados do 2º Responsável</h5>
                    </div>
                    {!resp2Removido ? (
                      <Button
                        size="sm"
                        variant="outline-danger"
                        title="Remover este responsável"
                        onClick={() => removerResponsavel(2)}
                      >
                        🗑 Remover
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline-success"
                        title="Adicionar este responsável de volta"
                        onClick={() => restaurarResponsavel(2)}
                      >
                        ➕ Adicionar
                      </Button>
                    )}
                  </div>

                  {resp2Removido ? (
                    <p className="text-muted small mb-0">
                      Bloco removido — apenas 1 responsável é obrigatório.
                    </p>
                  ) : (
                  <>
                  <Form.Group className="mb-3">
                    <Form.Label className="form-label-custom">Nome Completo</Form.Label>
                    <Form.Control
                      type="text"
                      className="form-control-custom"
                      placeholder="Nome do 2º responsável"
                      value={responsavel2Nome}
                      onChange={(e) => setResponsavel2Nome(e.target.value)}
                      required
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label className="form-label-custom">CPF do 2º Responsável</Form.Label>
                    <Form.Control
                      type="text"
                      className="form-control-custom"
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                      maxLength={11}
                      value={cpf2}
                      onChange={(e) =>
                        setCpf2(e.target.value.replace(/\D/g, "").slice(0, 11))
                      }
                      required
                    />
                  </Form.Group>

                  {/* Biometria Facial do 2º responsável */}
                  <div className="media-panel mt-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="form-label-custom m-0">Foto para Validação (2º Responsável)</span>
                      {fotoResponsavel2 && <Badge bg="success">Anexada</Badge>}
                    </div>

                    <Nav
                      variant="pills"
                      activeKey={modoResponsavel2}
                      onSelect={(k) => {
                        const modo = (k as "file" | "camera") || "file";
                        setModoResponsavel2(modo);
                        if (modo === "file") pararCamera(videoResponsavel2Ref);
                      }}
                      className="nav-pills-custom mb-3"
                    >
                      <Nav.Item>
                        <Nav.Link eventKey="file">Anexar Arquivo</Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link eventKey="camera">Câmera ao Vivo</Nav.Link>
                      </Nav.Item>
                    </Nav>

                    {modoResponsavel2 === "file" ? (
                      <Form.Control
                        type="file"
                        accept="image/*"
                        className="form-control-custom"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleImageUpload(e, setFotoResponsavel2)
                        }
                      />
                    ) : (
                      <div className="text-center">
                        <div className="camera-viewport">
                          <video ref={videoResponsavel2Ref} autoPlay playsInline className="camera-video" />
                          <div className="face-overlay" />
                        </div>
                        <div className="mt-2 d-flex gap-2 justify-content-center">
                          <Button variant="outline-dark" size="sm" onClick={() => iniciarCamera(videoResponsavel2Ref)}>
                            Iniciar Câmera
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => capturarFoto(videoResponsavel2Ref, setFotoResponsavel2)}>
                            Capturar
                          </Button>
                        </div>
                      </div>
                    )}

                    {fotoResponsavel2 && (
                      <div className="mt-3 text-center">
                        <img src={fotoResponsavel2} alt="2º Responsável Preview" className="preview-avatar" />
                      </div>
                    )}
                  </div>
                  </>
                  )}
                </Col>

              </Row>

              <hr className="my-4 text-secondary opacity-25" />

              <div className="d-flex justify-content-end align-items-center">
                <Button type="submit" className="btn-primary-custom px-5">
                  🚀 Enviar Cadastro para Validação na Portaria
                </Button>
              </div>
            </Form>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
};