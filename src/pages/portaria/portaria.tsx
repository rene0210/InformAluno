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
  status: "sucesso" | "erro" | "aguardando";
  responsaveis: string[];
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

export const Portaria: React.FC = () => {
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
    status: "aguardando",
    responsaveis: [],
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
      const resposta = await fetch("http://127.0.0.1:8787/api/van/registrar", {
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
        setDados((prev) => ({ ...prev, movimento: resultado.movimento ?? null }));
        setMensagem(
          `🚐 Aluno registrado na van — ${rotulo}! Responsáveis, secretaria e coordenação avisados.`
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
        "http://127.0.0.1:8787/api/portaria/registrar-entrada",
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
        setDados((prev) => ({ ...prev, movimento: resultado.movimento ?? null }));
        setMensagem(
          resultado.movimento === "CHECKOUT"
            ? "Acesso autorizado! 🔽 Saída registrada (check-out)."
            : "Acesso autorizado! 🔼 Entrada registrada (check-in)."
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

        // 2. Busca as fotos dos pré-cadastros
        const resposta = await fetch("http://127.0.0.1:8787/api/verificar/candidatos");
        if (!resposta.ok) {
          setDados((prev) => ({ ...prev, status: "erro" }));
          setMensagem("Erro ao consultar o banco de dados.");
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
            status: "sucesso",
            responsaveis: [
              melhorCandidato.pai_nome,
              melhorCandidato.mae_nome,
              melhorCandidato.terceiro_nome,
            ].filter((nome): nome is string => Boolean(nome)),
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
