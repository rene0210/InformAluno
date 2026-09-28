import React, { useEffect, useState } from "react";
import { Container, Card, Form, Button, Navbar, Alert } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import { RegrasSenha } from "../../components/regrassenha";
import { regrasPendentes, regrasEmUmaLinha } from "../../components/senhas";
import "../cadastro/Cadastro.css";
import { API } from "../../components/api";

// Lista fixa de perguntas de segurança (id = identificador estável gravado no banco)
const PERGUNTAS_SEGURANCA: { id: number; texto: string }[] = [
  { id: 1, texto: "Qual o nome do seu primeiro animal de estimação?" },
  { id: 2, texto: "Em que cidade você nasceu?" },
  { id: 3, texto: "Qual o nome da sua mãe?" },
  { id: 4, texto: "Qual o nome do seu pai?" },
  { id: 5, texto: "Qual o nome da sua melhor amiga ou amigo de infância?" },
  { id: 6, texto: "Qual foi o nome da sua primeira escola?" },
  { id: 7, texto: "Qual a sua comida favorita?" },
  { id: 8, texto: "Qual o nome do seu bairro de infância?" },
];

interface Resposta {
  id: number;
  resposta: string;
}

export const RedefinirSenha: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [perguntasSel, setPerguntasSel] = useState<(number | null)[]>([null, null, null]);
  const [respostas, setRespostas] = useState<Resposta[]>([
    { id: 0, resposta: "" },
    { id: 0, resposta: "" },
    { id: 0, resposta: "" },
  ]);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");

  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [validandoToken, setValidandoToken] = useState(true);
  const [temSeguranca, setTemSeguranca] = useState(false);

  // Valida o token ao carregar a tela e descobre se já existe cadastro de segurança
  useEffect(() => {
    const validar = async () => {
      try {
        const resposta = await fetch(
          `${API}/api/recuperar-senha/${token}`
        );
        const dados = await resposta.json();

        if (!resposta.ok) {
          setErro(dados.error || "Link inválido ou expirado.");
          return;
        }

        if (dados.temSeguranca && Array.isArray(dados.perguntas)) {
          // Já cadastrado: mostra exatamente as3 perguntas salvas no banco
          setTemSeguranca(true);
          setPerguntasSel(dados.perguntas);
          setRespostas(
            dados.perguntas.map((id: number) => ({ id, resposta: "" }))
          );
        }
      } catch {
        setErro("Não foi possível conectar ao servidor.");
      } finally {
        setValidandoToken(false);
      }
    };
    validar();
  }, [token]);

  const trocarPergunta = (indice: number, valor: string) => {
    const id = valor ? Number(valor) : null;
    setPerguntasSel((atual) => {
      const novo = [...atual];
      novo[indice] = id;
      return novo;
    });
    setRespostas((atual) => {
      const novo = [...atual];
      novo[indice] = { id: id ?? 0, resposta: "" };
      return novo;
    });
  };

  const trocarResposta = (indice: number, valor: string) => {
    setRespostas((atual) => {
      const novo = [...atual];
      novo[indice] = { ...novo[indice], resposta: valor };
      return novo;
    });
  };

  const handleRedefinir = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (novaSenha !== confirmaSenha) {
      setErro("As senhas não coincidem.");
      return;
    }

    // Padrão de senha: a mesma checagem da API, mas avisando aqui para a
    // pessoa não perder as perguntas já respondidas.
    const pendentes = regrasPendentes(novaSenha);
    if (pendentes.length > 0) {
      setErro(
        `Senha fora do padrão de segurança. ${regrasEmUmaLinha(pendentes)}`
      );
      return;
    }

    const selecionadas = perguntasSel.filter((id): id is number => id !== null);
    if (selecionadas.length !== 3 || new Set(selecionadas).size !== 3) {
      setErro("Escolha3 perguntas de segurança distintas.");
      return;
    }

    setCarregando(true);

    try {
      const resposta = await fetch(
        `${API}/api/recuperar-senha/${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome,
            cpf,
            perguntas: respostas.map((r, i) => ({
              id: perguntasSel[i],
              resposta: r.resposta,
            })),
            novaSenha,
          }),
        }
      );

      const dados = await resposta.json();

      if (resposta.ok) {
        setSucesso(dados.message);
        setTimeout(() => navigate("/"), 2500);
      } else if (Array.isArray(dados.erros) && dados.erros.length > 0) {
        // A API recusou a senha: repete as normas não cumpridas no alerta
        setErro(`${dados.error} ${regrasEmUmaLinha(dados.erros)}`);
      } else {
        setErro(dados.error || "Erro ao redefinir a senha.");
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
            | Alterar Senha
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

      <Container className="my-auto py-5" style={{ maxWidth: "560px" }}>
        <Card className="cadastro-card shadow-lg">
          <Card.Header className="cadastro-header text-center py-3">
            <h4 className="m-0 fw-bold fs-5">Alteração de Senha</h4>
            <small className="opacity-75">
              Valide seus dados antes de criar a nova senha
            </small>
          </Card.Header>

          <Card.Body className="p-4">
            {validandoToken ? (
              <div className="text-center text-muted py-3">
                ⏳ Validando o link...
              </div>
            ) : (
              <>
                {erro && <Alert variant="danger">{erro}</Alert>}
                {sucesso && <Alert variant="success">{sucesso}</Alert>}

                {!sucesso && (
                  <Form onSubmit={handleRedefinir}>
                    <Form.Group className="mb-3">
                      <Form.Label className="form-label-custom">
                        Nome completo
                      </Form.Label>
                      <Form.Control
                        type="text"
                        className="form-control-custom"
                        placeholder="Como está cadastrado na conta"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        required
                      />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label className="form-label-custom">CPF</Form.Label>
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

                    <hr className="my-3 text-secondary opacity-25" />

                    <div className="fw-semibold mb-3">
                      {temSeguranca
                        ? "Responda as3 perguntas do seu cadastro de segurança"
                        : "Cadastre3 perguntas de segurança"}
                    </div>

                    {perguntasSel.map((idSel, i) => (
                      <div key={i} className="mb-3 border rounded p-3 bg-light">
                        <Form.Label className="form-label-custom">
                          Pergunta {i + 1}
                        </Form.Label>
                        {temSeguranca ? (
                          <div className="fw-semibold mb-2">
                            {PERGUNTAS_SEGURANCA.find((p) => p.id === idSel)?.texto}
                          </div>
                        ) : (
                          <Form.Select
                            className="form-control-custom mb-2"
                            value={idSel ?? ""}
                            onChange={(e) => trocarPergunta(i, e.target.value)}
                            required
                          >
                            <option value="">Selecione uma pergunta...</option>
                            {PERGUNTAS_SEGURANCA.map((p) => (
                              <option
                                key={p.id}
                                value={p.id}
                                disabled={
                                  p.id === perguntasSel[0] ||
                                  p.id === perguntasSel[1] ||
                                  p.id === perguntasSel[2]
                                }
                              >
                                {p.texto}
                              </option>
                            ))}
                          </Form.Select>
                        )}
                        <Form.Control
                          type="text"
                          className="form-control-custom"
                          placeholder="Sua resposta"
                          value={respostas[i]?.resposta ?? ""}
                          onChange={(e) => trocarResposta(i, e.target.value)}
                          required
                        />
                      </div>
                    ))}

                    <hr className="my-3 text-secondary opacity-25" />

                    <Form.Group className="mb-3">
                      <Form.Label className="form-label-custom">Nova senha</Form.Label>
                      <Form.Control
                        type="password"
                        className="form-control-custom"
                        placeholder="••••••••"
                        value={novaSenha}
                        onChange={(e) => setNovaSenha(e.target.value)}
                        required
                      />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label className="form-label-custom">
                        Confirmar nova senha
                      </Form.Label>
                      <Form.Control
                        type="password"
                        className="form-control-custom"
                        placeholder="••••••••"
                        value={confirmaSenha}
                        onChange={(e) => setConfirmaSenha(e.target.value)}
                        required
                      />
                    </Form.Group>

                    {/* Orientação permanente: ✓/○ acompanham o que está sendo digitado */}
                    <RegrasSenha senha={novaSenha} />

                    <Button
                      type="submit"
                      className="btn-primary-custom w-100 mb-3 fs-6"
                      disabled={carregando}
                    >
                      {carregando ? "Salvando..." : "🔓 Alterar senha"}
                    </Button>
                  </Form>
                )}
              </>
            )}

            <hr className="my-3 text-secondary opacity-25" />

            <div className="text-center">
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
