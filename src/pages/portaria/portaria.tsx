import React, { useRef, useState, useEffect } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Badge,
  Alert,
} from "react-bootstrap";
import Webcam from "react-webcam";
// face-api vem do script clássico /face-api.js (index.html) — ver declaração em src/types/faceapi.d.ts
import "./portaria.css";
import { API } from "../../components/api";

interface DadosCheckIn {
  /** Quem o rosto reconheceu: o responsável presente, o próprio aluno ou um professor */
  identificadoPapel: "RESPONSÁVEL" | "ALUNO" | "PROFESSOR" | null;
  /** Nome completo de quem foi reconhecido na câmera */
  identificadoNome: string;
  /** Vínculo com o aluno (Pai, Mãe, 3º responsável) — só quando for responsável */
  identificadoVinculo: string;
  alunoNome: string;
  matricula: string;
  /** Matéria do professor reconhecido (substitui o rótulo da matrícula) */
  disciplina: string;
  /** Check-in (entrada) ou check-out (saída) devolvido pelo registro */
  movimento: "CHECKIN" | "CHECKOUT" | null;
  /** Data/hora exata (Brasília) que parou no banco — `YYYY-MM-DD HH:MM:SS` */
  dataHora: string | null;
  status: "sucesso" | "erro" | "aguardando";
  responsaveis: string[];
  /** Foto do cadastro (aluno ou professor), exibida só após a validação */
  foto: string | null;
}

/** De qual foto do pré-cadastro veio o descritor vencedor */
type PapelFoto = "ALUNO" | "PAI" | "MAE" | "TERCEIRO" | "PROFESSOR";

interface Candidato {
  id: number;
  nome: string;
  matricula: string;
  status: string;
  foto_aluno: string | null;
  pai_nome: string | null;
  foto_pai: string | null;
  mae_nome: string | null;
  foto_mae: string | null;
  terceiro_nome: string | null;
  foto_terceiro: string | null;
  /** Presentes só nos candidatos-professores (tabela `professores` com foto) */
  foto_professor?: string | null;
  materia?: string | null;
  eh_professor?: boolean;
}

// Limiar de similaridade: quanto MENOR, mais rigoroso (0.55 equilibra segurança e aceitação)
const LIMIAR_RECONHECIMENTO = 0.55;

// Perfil de quem opera o totem — mesmo objeto gravado pelo login
// (localStorage "usuarioLogado"); o cargo decide o comportamento da tela.
const perfilLogado = (): { role?: string } => {
  try {
    return JSON.parse(localStorage.getItem("usuarioLogado") || "{}");
  } catch {
    return {};
  }
};

const opcoesDetecao = () =>
  new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 });

const carregarImagem = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

// `2026-09-28 10:48:33` -> `28/09/2026 às 10:48`
// O valor já vem em horário de Brasília (é o que foi gravado no banco), então
// aqui só formata — nenhum ajuste de fuso, senão a tela mentiria de novo.
const formatarDataHora = (dataHora: string): string => {
  const [data, hora] = dataHora.split(" ");
  if (!data || !hora) return dataHora;
  return `${data.split("-").reverse().join("/")} às ${hora.slice(0, 5)}`;
};

const voltar = () =>
  window.history.length > 1 ? window.history.back() : (window.location.href = "/");

// Perfis que a API DEIXA reconhecer o rosto e gravar o movimento. Os demais
// travam em /api/verificar/candidatos ou em /api/portaria/registrar-entrada
// (403), então em vez de exibir um totem que falha no meio do caminho a tela
// avisa quem é o perfil e devolve o acesso.
const PERFIS_DA_TELA = ["PORTARIA", "MOTORISTA", "ADMIN", "RESPONSAVEL"];

const PortariaSemPermissao: React.FC<{ papel: string }> = ({ papel }) => (
  <>
    <div className="portaria-bg status-erro" />
    <Container
      fluid
      className="py-4 py-md-5 portaria-container d-flex align-items-center"
    >
      <Container>
        <div className="d-flex justify-content-start mb-3">
          <Button variant="outline-light" size="sm" onClick={voltar}>
            ← Voltar
          </Button>
        </div>
        <Row className="mb-4 mb-md-5 text-center header-totem">
          <Col>
            <h1 className="app-title mb-2 text-white">InformAluno</h1>
            <p className="instrucao-camera mb-0 erro">
              ⛔ Acesso restrito à tela da portaria
            </p>
          </Col>
        </Row>
        <Row className="justify-content-center g-4">
          <Col lg={7} md={9} xs={12}>
            <Card className="camera-card text-center">
              <div className="section-label">
                ● PERFIL LOGADO: {papel || "NÃO IDENTIFICADO"}
              </div>
              <p className="text-white-50 fs-5 mb-4">
                O reconhecimento facial é operado por <strong className="text-white">Portaria</strong>,{" "}
                <strong className="text-white">Motorista</strong> e{" "}
                <strong className="text-white">Admin</strong> — ou pelo próprio{" "}
                <strong className="text-white">responsável</strong>, validando o filho.
                Peça a um operador da portaria ou volte ao seu painel.
              </p>
              <Button variant="primary" onClick={voltar}>
                ← Voltar
              </Button>
            </Card>
          </Col>
        </Row>
      </Container>
    </Container>
  </>
);

const PortariaTela: React.FC = () => {
  const webcamRef = useRef<Webcam>(null);
  const [mensagem, setMensagem] = useState<string>(
    "Posicione-se em frente à câmera",
  );
  const [carregando, setCarregando] = useState<boolean>(false);

  const [dados, setDados] = useState<DadosCheckIn>({
    identificadoPapel: null,
    identificadoNome: "Aguardando identificação...",
    identificadoVinculo: "",
    alunoNome: "Aguardando aluno...",
    matricula: "---",
    disciplina: "",
    movimento: null,
    dataHora: null,
    status: "aguardando",
    responsaveis: [],
    foto: null,
  });

  // Motorista da van opera a MESMA tela do porteiro; a diferença é que o
  // reconhecimento dele registra o embarque e dispara o aviso (dia/hora)
  // para pai/mãe, secretaria e coordenação.
  const ehMotorista = perfilLogado().role === "MOTORISTA";

  const [modelosProntos, setModelosProntos] = useState(false);

  // Cache dos descritores das fotos do banco (evita recalcular a cada captura)
  const cacheDescritores = useRef<Map<string, Float32Array>>(new Map());

  // Carrega os modelos faciais uma única vez (ficam no cache do navegador)
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
          faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
        ]);
        if (!cancelado) setModelosProntos(true);
      } catch (erro) {
        console.error("Erro ao carregar modelos faciais:", erro);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const obterDescritorFoto = async (foto: string): Promise<Float32Array | null> => {
    const emCache = cacheDescritores.current.get(foto);
    if (emCache) return emCache;

    const img = await carregarImagem(foto);
    if (!img) return null;

    try {
      const resultado = await faceapi
        .detectSingleFace(img, opcoesDetecao())
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (resultado) {
        cacheDescritores.current.set(foto, resultado.descriptor);
        return resultado.descriptor;
      }
    } catch (erro) {
      console.error("Erro ao extrair descritor da foto:", erro);
    }
    return null;
  };

  const rotuloBotao = () => {
    if (!modelosProntos) return "⏳ CARREGANDO MODELO...";
    if (carregando) return "🔍 ANALISANDO...";
    return ehMotorista ? "CONFIRMAR EMBARQUE" : "AUTENTICAR ACESSO";
  };

  // Motorista: grava o embarque na van e dispara o aviso (dia e hora) para
  // os responsáveis, secretaria e coordenação. Falha de rede nunca quebra a tela.
  const registrarNaVan = async (aluno: Candidato) => {
    try {
      const token = localStorage.getItem("token") || "";
      const resposta = await fetch(`${API}/api/van/registrar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ alunoId: aluno.id }),
      });
      if (resposta.ok) {
        const resultado = await resposta.json();
        const rotulo =
          resultado.movimento === "CHECKOUT" ? "saída (check-out)" : "entrada (check-in)";
        const dataHora: string | null = resultado.dataHora ?? null;
        setDados((prev) => ({ ...prev, movimento: resultado.movimento ?? null, dataHora }));
        // Mesma data/hora do e-mail enviado aos responsáveis — se o totem
        // mostrasse outra, o aviso pareceria desatualizado.
        setMensagem(
          `🚐 Aluno registrado na van — ${rotulo}${
            dataHora ? ` em ${formatarDataHora(dataHora)}` : ""
          }! Responsáveis, secretaria e coordenação avisados.`
        );
      } else {
        setMensagem("Aluno reconhecido, mas o registro na van falhou.");
      }
    } catch {
      setMensagem("Aluno reconhecido, mas o registro na van falhou.");
    }
  };

  // Portaria do porteiro: grava o reconhecimento e recebe de volta se foi
  // check-in (entrada) ou check-out (saída) — exibido na tela em seguida.
  const registrarMovimento = async (registro: {
    pessoaId: number;
    nome: string;
    tipo: string;
    detalhe: string;
  }) => {
    try {
      const token = localStorage.getItem("token") || "";
      const resposta = await fetch(
        `${API}/api/portaria/registrar-entrada`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ...registro, metodoValidacao: "BIOMETRIA_FACIAL" }),
        }
      );
      if (resposta.ok) {
        const resultado = await resposta.json();
        const dataHora: string | null = resultado.dataHora ?? null;
        setDados((prev) => ({ ...prev, movimento: resultado.movimento ?? null, dataHora }));
        // A mensagem publica a MESMA data/hora que foi gravada no banco: é o
        // que o operador lê no totem e o que precisa bater com o feed da
        // diretoria (antes o totem não dizia a hora e o registro saía em UTC).
        const rotulo =
          resultado.movimento === "CHECKOUT"
            ? "🔽 Saída registrada (check-out)"
            : "🔼 Entrada registrada (check-in)";
        setMensagem(
          dataHora
            ? `Acesso autorizado! ${rotulo} — ${formatarDataHora(dataHora)}.`
            : `Acesso autorizado! ${rotulo}.`
        );
      } else if (resposta.status === 401 || resposta.status === 403) {
        // Perfil sem permissão (ex.: responsável tentando gravar movimento de
        // um aluno que não é filho dele) — a tela fica vermelha e não fica
        // exibindo a foto de quem não passou.
        const erro = await resposta.json().catch(() => ({ error: "" }));
        setDados((prev) => ({ ...prev, status: "erro" }));
        setMensagem(
          erro.error ||
            "Sem permissão para gravar o movimento neste perfil."
        );
      } else {
        setMensagem("Acesso autorizado, mas o registro do movimento falhou.");
      }
    } catch {
      setMensagem("Acesso autorizado (sem conexão para registrar o movimento).");
    }
  };

  const capturarEVerificar = async () => {
    if (webcamRef.current) {
      const fotoCapturadaBase64 = webcamRef.current.getScreenshot();
      if (!fotoCapturadaBase64) return;

      if (!modelosProntos) {
        setMensagem("Modelo de reconhecimento ainda carregando… aguarde um instante.");
        return;
      }

      setCarregando(true);
      setMensagem("Analisando no Banco de Dados...");

      try {
        // 1. Extrai o "código facial" (128 medidas) do rosto capturado
        const canvas = webcamRef.current.getCanvas();
        if (!canvas) return;

        const minhaFace = await faceapi
          .detectSingleFace(canvas, opcoesDetecao())
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!minhaFace) {
          setDados((prev) => ({ ...prev, status: "erro" }));
          setMensagem("Nenhum rosto detectado na imagem. Ajuste a iluminação e a posição.");
          return;
        }

        // 2. Busca as fotos dos pré-cadastros. A rota exige sessão: a lista
        //    devolve foto de menor, então nada de consulta anônima.
        const token = localStorage.getItem("token") || "";
        const resposta = await fetch(`${API}/api/verificar/candidatos`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resposta.ok) {
          setDados((prev) => ({ ...prev, status: "erro" }));
          setMensagem(
            resposta.status === 401 || resposta.status === 403
              ? "Sessão expirada ou sem permissão. Faça login novamente."
              : "Erro ao consultar o banco de dados."
          );
          return;
        }
        const candidatos: Candidato[] = await resposta.json();

        if (candidatos.length === 0) {
          setDados((prev) => ({ ...prev, status: "erro" }));
          setMensagem("Nenhum pré-cadastro encontrado.");
          return;
        }

        // 3. Compara com todas as fotos (aluno, pai, mãe e 3º) e pega a mais
        //    próxima — guardando TAMBÉM de quem é a foto vencedora, para
        //    exibir o responsável reconhecido (não apenas o aluno).
        let melhorDistancia = Number.POSITIVE_INFINITY;
        let melhorCandidato: Candidato | null = null;
        let melhorPapel: PapelFoto | null = null;

        for (const candidato of candidatos) {
          const fotos: Array<{ foto: string | null; papel: PapelFoto }> =
            candidato.eh_professor
              ? [{ foto: candidato.foto_professor ?? null, papel: "PROFESSOR" }]
              : [
                  { foto: candidato.foto_aluno, papel: "ALUNO" },
                  { foto: candidato.foto_pai, papel: "PAI" },
                  { foto: candidato.foto_mae, papel: "MAE" },
                  { foto: candidato.foto_terceiro, papel: "TERCEIRO" },
                ];
          for (const { foto, papel } of fotos) {
            if (!foto) continue;
            const descritor = await obterDescritorFoto(foto);
            if (!descritor) continue;
            const distancia = faceapi.euclideanDistance(minhaFace.descriptor, descritor);
            if (distancia < melhorDistancia) {
              melhorDistancia = distancia;
              melhorCandidato = candidato;
              melhorPapel = papel;
            }
          }
        }

        if (melhorCandidato && melhorDistancia <= LIMIAR_RECONHECIMENTO) {
          // Decide quem foi reconhecido: o responsável (pai, mãe ou 3º),
          // o próprio aluno do pré-cadastro ou um professor com foto.
          const papel: PapelFoto = melhorPapel ?? "ALUNO";
          let ehResponsavel = false;
          let ehProfessor = false;
          let nomeIdentificado = melhorCandidato.nome;
          let vinculo = "";
          let disciplina = "";
          if (papel === "PROFESSOR") {
            ehProfessor = true;
            disciplina = melhorCandidato.materia || "";
          } else if (papel === "PAI" && melhorCandidato.pai_nome) {
            ehResponsavel = true;
            nomeIdentificado = melhorCandidato.pai_nome;
            vinculo = "Responsável";
          } else if (papel === "MAE" && melhorCandidato.mae_nome) {
            ehResponsavel = true;
            nomeIdentificado = melhorCandidato.mae_nome;
            vinculo = "2º responsável";
          } else if (papel === "TERCEIRO" && melhorCandidato.terceiro_nome) {
            ehResponsavel = true;
            nomeIdentificado = melhorCandidato.terceiro_nome;
            vinculo = "3º responsável";
          }

          // Foto que ilustra a validação: a do ALUNO (a coluna da direita é
          // que descreve o aluno); professor usa a própria. Sem foto cadastrada
          // o bloco simplesmente não aparece — nunca exibe rosto trocado.
          const fotoValidada = ehProfessor
            ? melhorCandidato.foto_professor ?? null
            : melhorCandidato.foto_aluno ?? null;

          setDados({
            identificadoPapel: ehProfessor
              ? "PROFESSOR"
              : ehResponsavel
                ? "RESPONSÁVEL"
                : "ALUNO",
            identificadoNome: nomeIdentificado,
            identificadoVinculo: vinculo,
            alunoNome: melhorCandidato.nome,
            matricula: ehProfessor ? "" : melhorCandidato.matricula,
            disciplina,
            movimento: null,
            dataHora: null,
            status: "sucesso",
            responsaveis: [
              melhorCandidato.pai_nome,
              melhorCandidato.mae_nome,
              melhorCandidato.terceiro_nome,
            ].filter((nome): nome is string => Boolean(nome)),
            foto: fotoValidada,
          });
          if (ehMotorista) {
            if (ehProfessor) {
              setMensagem("👨‍🏫 Professor identificado — professores não embarcam na van.");
            } else {
              setMensagem("🚐 Embarcando — registrando o reconhecimento na van…");
              registrarNaVan(melhorCandidato);
            }
          } else {
            setMensagem("Acesso autorizado! Registrando o movimento…");
            registrarMovimento({
              pessoaId: melhorCandidato.id,
              nome: nomeIdentificado,
              tipo: ehProfessor ? "PROFESSOR" : ehResponsavel ? "RESPONSAVEL" : "ALUNO",
              detalhe: ehProfessor
                ? disciplina || "Professor"
                : ehResponsavel
                  ? vinculo
                  : melhorCandidato.matricula,
            });
          }
        } else {
          setDados((prev) => ({ ...prev, status: "erro" }));
          setMensagem("Cadastro não identificado");
        }
      } catch (error) {
        console.error("Erro na verificação:", error);
        setMensagem("Erro ao processar o reconhecimento.");
      } finally {
        setCarregando(false);
      }
    }
  };

  return (
    <>
      <div className={`portaria-bg status-${dados.status}`} />
      <Container
        fluid
        className="py-4 py-md-5 portaria-container d-flex align-items-center"
      >
        <Container>
          <div className="d-flex justify-content-start mb-3">
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
          <Row className="mb-4 mb-md-5 text-center header-totem">
            <Col>
              <h1 className="app-title mb-2 text-white">InformAluno</h1>
              <p className={`instrucao-camera mb-0 text-white ${dados.status}`}>
                {mensagem}
              </p>
            </Col>
          </Row>

          <Row className="g-4 align-items-stretch">
            {/* Coluna da Câmera */}
            <Col lg={6} xs={12}>
              <Card className={`camera-card h-100 ${dados.status}`}>
                <div className="section-label text-white-50">
                  {ehMotorista
                    ? "🚐 VAN ESCOLAR — RECONHECIMENTO FACIAL"
                    : "● RECONHECIMENTO FACIAL"}
                </div>
                <div className="camera-wrapper w-100 mt-3">
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    width="100%"
                  />
                </div>
                <Button
                  variant={dados.status === "sucesso" ? "success" : "primary"}
                  size="lg"
                  className="w-100 mt-4 btn-checkin"
                  onClick={capturarEVerificar}
                  disabled={carregando || !modelosProntos}
                >
                  {rotuloBotao()}
                </Button>
              </Card>
            </Col>

            {/* Coluna de Dados */}
            <Col lg={6} xs={12} className="d-flex flex-column gap-3">
              <Alert
                variant={dados.status === "sucesso" ? "success" : "secondary"}
                className="text-center"
              >
                {dados.status === "sucesso"
                  ? ehMotorista
                    ? "🚐 ALUNO NA VAN — AVISOS ENVIADOS"
                    : "ACESSO AUTORIZADO"
                  : "AGUARDANDO LEITURA"}
              </Alert>

              <Card className="totem-card bg-transparent border-0">
                <div className="section-label text-white-50">IDENTIFICAÇÃO</div>
                <Row className="g-3 align-items-stretch">
                  {/* Quem passou pela câmera: responsável (nome completo) ou o aluno */}
                  <Col md={7}>
                    <Badge
                      bg={dados.status === "sucesso" ? "success" : "secondary"}
                      className="mb-2"
                    >
                      {dados.identificadoPapel || "..."}
                    </Badge>
                    <h2 className="student-name text-white mb-2">
                      {dados.identificadoNome}
                    </h2>
                    {dados.identificadoPapel === "RESPONSÁVEL" && (
                      <div className="text-white-50">
                        Pelo aluno do cadastro autorizado:{" "}
                        <strong className="text-white">{dados.alunoNome}</strong>
                        {dados.identificadoVinculo && (
                          <span className="d-block small">
                            Vínculo: {dados.identificadoVinculo}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-3">
                      <Badge bg={dados.status === "sucesso" ? "success" : "secondary"}>
                        {dados.status === "sucesso" ? "SUCESSO" : "..."}
                      </Badge>
                      {dados.status === "sucesso" && dados.movimento && (
                        <Badge
                          bg={dados.movimento === "CHECKOUT" ? "warning" : "primary"}
                          text={dados.movimento === "CHECKOUT" ? "dark" : undefined}
                          className="ms-2"
                        >
                          {dados.movimento === "CHECKOUT"
                            ? "🔽 CHECK-OUT (SAÍDA)"
                            : "🔼 CHECK-IN (ENTRADA)"}
                        </Badge>
                      )}
                    </div>
                    {/* Horário exato da gravação — é a prova visível de que a
                        data/hora do check-in/check-out está correta. */}
                    {dados.status === "sucesso" && dados.dataHora && (
                      <div className="text-white-50 small mt-2">
                        🕒 Registrado em {formatarDataHora(dados.dataHora)}
                      </div>
                    )}
                  </Col>

                  {/* Lateral: informações do aluno e matrícula (ou matéria do professor) */}
                  <Col md={5}>
                    <div className="border-start border-secondary ps-3 h-100">
                      <div className="section-label text-white-50">
                        {dados.disciplina ? "PROFESSOR" : "ALUNO"}
                      </div>
                      <div className="text-white fw-bold">{dados.alunoNome}</div>
                      {dados.disciplina ? (
                        <div className="text-white-50 mt-2">
                          Matéria:{" "}
                          <span className="text-white tech-code">{dados.disciplina}</span>
                        </div>
                      ) : (
                        <div className="text-white-50 mt-2">
                          Matrícula:{" "}
                          <span className="text-white tech-code">{dados.matricula}</span>
                        </div>
                      )}

                      {/* Foto do cadastro, pequena e só quando a validação deu
                          certo — confirma que quem passou corresponde ao aluno. */}
                      {dados.status === "sucesso" && dados.foto && (
                        <div className="foto-validacao mt-3">
                          <img
                            className="foto-validacao-img"
                            src={dados.foto}
                            alt={`Foto do cadastro de ${dados.alunoNome}`}
                          />
                          <span className="foto-validacao-legenda">
                            ✓ Foto do cadastro
                          </span>
                        </div>
                      )}
                    </div>
                  </Col>
                </Row>
              </Card>

              <Card className="totem-card bg-transparent border-0">
                <div className="section-label text-white-50">RESPONSÁVEIS AUTORIZADOS</div>
                <div className="d-flex flex-column gap-2 mt-2">
                  {dados.responsaveis.map((r, i) => (
                    <div
                      key={i}
                      className="text-white fw-bold py-1 d-flex align-items-center gap-2 flex-wrap"
                    >
                      🛡️ {r}
                      {dados.status === "sucesso" && r === dados.identificadoNome && (
                        <Badge bg="success">RECONHECIDO</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </Col>
          </Row>
        </Container>
      </Container>
    </>
  );
};

// Entrada da tela: só os perfis que a API deixa reconhecer E gravar. Os demais
// (diretoria, secretaria, professor, aluno…) nunca completariam o fluxo — daria
// 403 na lista de rostos ou na gravação — então veem este aviso, com "← Voltar",
// em vez de um totem quebrado.
export const Portaria: React.FC = () => {
  const papel = perfilLogado().role ?? "";
  if (!PERFIS_DA_TELA.includes(papel)) return <PortariaSemPermissao papel={papel} />;
  return <PortariaTela />;
};
