import React, { useState, useEffect } from "react";
import { Container, Row, Col, Card, Table, Badge, Button, Navbar, Nav, Collapse, Form, Modal } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AnotacoesLista } from "../../components/anotacoes";
import { ChatPainel } from "../chat/chat";
import { finalizarSessao } from "../../components/sessao";
import "../cadastro/Cadastro.css";

interface Resumo {
  totalAlunosHoje: number;
  totalProfessoresHoje: number;
  /** Já fizeram check-out (verificação de saída) hoje */
  alunosCheckoutHoje: number;
  professoresCheckoutHoje: number;
}

interface AlunoSerie {
  serie: string;
  quantidade: number;
}

interface ProfessorPresente {
  nome: string;
  materia: string;
  hora_entrada: string;
}

interface RegistroEntrada {
  id: number;
  nome: string;
  tipo: string;
  detalhe: string;
  metodo_validacao: string;
  /** CHECKIN (entrada) ou CHECKOUT (saída) — devolvido junto da validação facial */
  movimento: string | null;
  hora: string;
}

// Detalhe por trás dos cards clicáveis — quem são as pessoas de cada número
interface DetalheAluno {
  nome: string;
  serie: string;
  hora: string;
}

interface DetalheProfessor {
  nome: string;
  materia: string | null;
  hora: string;
}

interface DetalhesCards {
  alunosPresentes: DetalheAluno[];
  alunosCheckout: DetalheAluno[];
  professoresPresentes: DetalheProfessor[];
  professoresCheckout: DetalheProfessor[];
}

/** Qual card de resumo está aberto no modal (null = nenhum) */
type CardAberto = "alunos" | "professores" | "alunosSaida" | "professoresSaida" | null;

// Anotação (acompanhamento) de pai ou professor sobre um aluno
interface AnotacaoDiretoria {
  id: number;
  papel: string;
  texto: string;
  atestado_base64: string | null;
  atestado_nome: string | null;
  criado_em: string;
  autor_nome: string;
  aluno_nome: string;
  matricula: string;
}

// Linha do log de acessos (logins) — visível na diretoria por 30 dias
interface LogAcesso {
  id: number;
  tipo: string;
  usuario_nome: string;
  usuario_email: string;
  papel: string;
  criado_em: string;
}

// Linha do log de acessos temporários/terceiros criados (30 dias)
interface LogTerceiro {
  id: number;
  tipo: string;
  status: string;
  convidado_nome: string | null;
  criado_em: string;
  expira_em: string;
  solicitante: string | null;
  aluno_nome: string | null;
  matricula: string | null;
}

export const DiretoriaDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [resumo, setResumo] = useState<Resumo>({
    totalAlunosHoje: 0,
    totalProfessoresHoje: 0,
    alunosCheckoutHoje: 0,
    professoresCheckoutHoje: 0,
  });
  const [alunosPorSerie, setAlunosPorSerie] = useState<AlunoSerie[]>([]);
  const [professoresPresentes, setProfessoresPresentes] = useState<ProfessorPresente[]>([]);
  const [ultimosRegistros, setUltimosRegistros] = useState<RegistroEntrada[]>([]);
  const [anotacoes, setAnotacoes] = useState<AnotacaoDiretoria[]>([]);

  // Detalhe dos cards clicáveis (nomes; alunos agrupados por turma no modal)
  const [detalhes, setDetalhes] = useState<DetalhesCards>({
    alunosPresentes: [],
    alunosCheckout: [],
    professoresPresentes: [],
    professoresCheckout: [],
  });
  const [cardAberto, setCardAberto] = useState<CardAberto>(null);

  // Log de acessos + terceiros (janela de 30 dias)
  const [logAcessos, setLogAcessos] = useState<LogAcesso[]>([]);
  const [logTerceiros, setLogTerceiros] = useState<LogTerceiro[]>([]);

  // Seções recolhidas/expandidas (dropbutton de cada bloco de informações)
  const [expandido, setExpandido] = useState<Record<string, boolean>>({
    serie: true,
    professores: true,
    anotacoes: true,
    log: true,
    fluxo: true,
    chat: true,
  });

  // Pesquisa global do painel: filtra aluno (nome/matrícula), turma/série e
  // professor em todas as seções abaixo e nos modais de detalhe.
  const [busca, setBusca] = useState("");

  // Quantas linhas cada tabela mostra (0 = todos)
  const [limites, setLimites] = useState<Record<string, number>>({
    serie: 10,
    professores: 10,
    anotacoes: 10,
    logAcessos: 10,
    logTerceiros: 10,
    fluxo: 10,
  });

  // Headers com o token de sessão (exigido pelas rotas /api/diretoria)
  const authHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  });

  const carregarDados = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8787/api/diretoria/dashboard", {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setResumo(data.resumo);
        setAlunosPorSerie(data.alunosPorSerie);
        setProfessoresPresentes(data.professoresPresentes);
        setUltimosRegistros(data.ultimosRegistros);
        setDetalhes(
          data.detalhes || {
            alunosPresentes: [],
            alunosCheckout: [],
            professoresPresentes: [],
            professoresCheckout: [],
          }
        );
      } else if (res.status === 401 || res.status === 403) {
        // Sessão inválida/expirada: volta para a tela de login
        finalizarSessao();
        navigate("/");
        return;
      }

      // Anotações de pais e professores (mesma exigência de sessão)
      const resAnot = await fetch("http://127.0.0.1:8787/api/diretoria/acompanhamentos", {
        headers: authHeaders(),
      });
      if (resAnot.ok) {
        const dataAnot = await resAnot.json();
        setAnotacoes(dataAnot.acompanhamentos || []);
      } else if (resAnot.status === 401 || resAnot.status === 403) {
        finalizarSessao();
        navigate("/");
        return;
      }

      // Log de acessos + terceiros criados (últimos 30 dias)
      const resLog = await fetch("http://127.0.0.1:8787/api/diretoria/log", {
        headers: authHeaders(),
      });
      if (resLog.ok) {
        const dataLog = await resLog.json();
        setLogAcessos(dataLog.acessos || []);
        setLogTerceiros(dataLog.terceiros || []);
      } else if (resLog.status === 401 || resLog.status === 403) {
        finalizarSessao();
        navigate("/");
      }
    } catch (err) {
      console.error("Erro ao carregar dados do dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  // Atualização automática a cada 10 segundos
  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    carregarDados();
    const interval = setInterval(carregarDados, 10000);
    return () => clearInterval(interval);
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */

  const handleLogout = () => {
    finalizarSessao();
    navigate("/");
  };

  // Dropbutton: recolhe/expandi as informações de um bloco
  const alternar = (chave: string) =>
    setExpandido((prev) => ({ ...prev, [chave]: !prev[chave] }));

  // Aplica o limite de linhas escolhido na tabela (0 = todos)
  const cortar = <T,>(chave: string, arr: T[]): T[] => {
    const lim = limites[chave] ?? 10;
    return lim === 0 ? arr : arr.slice(0, lim);
  };

  // Seletor "Exibir: 10 | 20 | 50 | 100 | Todos" de cada tabela
  const seletorLimite = (chave: string) => (
    <span className="d-inline-flex align-items-center gap-1">
      <small className="text-muted fw-normal">Exibir:</small>
      <Form.Select
        size="sm"
        className="d-inline-block w-auto"
        value={limites[chave] ?? 10}
        onChange={(e) =>
          setLimites((prev) => ({ ...prev, [chave]: Number(e.target.value) }))
        }
        aria-label="Quantidade de linhas visíveis"
      >
        <option value={10}>10</option>
        <option value={20}>20</option>
        <option value={50}>50</option>
        <option value={100}>100</option>
        <option value={0}>Todos</option>
      </Form.Select>
    </span>
  );

  // Botão de expandir/recolher do cabeçalho de cada bloco
  const botaoAlternar = (chave: string) => (
    <Button
      size="sm"
      variant="outline-secondary"
      onClick={() => alternar(chave)}
      title={expandido[chave] ? "Recolher informações" : "Expandir informações"}
    >
      {expandido[chave] ? "▼ Recolher" : "▶ Expandir"}
    </Button>
  );

  // Compara sem acento/maiúscula ("João" acha "joao", "6º ANO" acha "6o ano")
  const normalizar = (v: string): string =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  // Texto da pesquisa já normalizado (vazio = sem filtro ativo)
  const termo = normalizar(busca.trim());
  const filtrando = termo.length > 0;
  const combina = (...campos: Array<string | null | undefined>): boolean =>
    termo !== "" && campos.some((c) => normalizar(c || "").includes(termo));

  // Mensagem de "lista vazia" distinta: sem registro x. sem resultado do filtro
  const msgVazia = (filtrado: string, vazio: string): string =>
    filtrando ? filtrado : vazio;

  // Os nomes casados com a pesquisa, agrupados por série/turma — exibidos
  // sob a turma na tabela "Alunos Presentes por Série" quando o filtro é nome.
  const nomesCasadosPorSerie = new Map<string, string[]>();
  if (filtrando) {
    for (const aluno of detalhes.alunosPresentes) {
      if (!combina(aluno.nome)) continue;
      const turma = aluno.serie.trim() || "Sem série";
      nomesCasadosPorSerie.set(turma, [
        ...(nomesCasadosPorSerie.get(turma) || []),
        aluno.nome,
      ]);
    }
  }

  // Série/turma visível: casa pela turma OU tem aluno casado pelo nome
  const serieVisivel = filtrando
    ? alunosPorSerie.filter(
        (item) =>
          combina(item.serie) ||
          nomesCasadosPorSerie.has(item.serie.trim() || "Sem série")
      )
    : alunosPorSerie;

  const professoresVisiveis = filtrando
    ? professoresPresentes.filter((p) => combina(p.nome, p.materia))
    : professoresPresentes;

  const anotacoesVisiveis = filtrando
    ? anotacoes.filter((a) => combina(a.aluno_nome, a.matricula, a.autor_nome, a.texto))
    : anotacoes;

  const logAcessosVisivel = filtrando
    ? logAcessos.filter((a) => combina(a.usuario_nome, a.usuario_email, a.papel))
    : logAcessos;

  const logTerceirosVisivel = filtrando
    ? logTerceiros.filter((t) => combina(t.aluno_nome, t.matricula, t.solicitante))
    : logTerceiros;

  const registrosVisiveis = filtrando
    ? ultimosRegistros.filter((r) => combina(r.nome, r.detalhe, r.tipo))
    : ultimosRegistros;

  // Detalhe dos cards: alunos agrupados por série/turma
  const gradeDosAlunos = (listaBruta: DetalheAluno[], vazio: string) => {
    // Aplica a pesquisa global do painel no modal (nome ou série/turma)
    const lista = filtrando
      ? listaBruta.filter((a) => combina(a.nome, a.serie))
      : listaBruta;
    if (lista.length === 0) {
      return (
        <p className="text-muted text-center py-4 mb-0">
          {msgVazia(`Nenhum resultado para "${busca.trim()}".`, vazio)}
        </p>
      );
    }
    const turmas = new Map<string, DetalheAluno[]>();
    for (const aluno of lista) {
      const turma = aluno.serie.trim() || "Sem série";
      turmas.set(turma, [...(turmas.get(turma) || []), aluno]);
    }
    return (
      <div className="d-flex flex-column gap-3">
        {[...turmas.entries()].map(([turma, integrantes]) => (
          <div key={turma}>
            <Badge bg="primary" className="px-3 py-2 fs-6 mb-2">
              {turma}
            </Badge>
            <div className="d-flex flex-wrap gap-2">
              {integrantes.map((aluno, idx) => (
                <span
                  key={`${aluno.nome}-${idx}`}
                  className="border rounded px-3 py-2 small d-inline-flex align-items-center gap-2"
                >
                  <strong>{aluno.nome}</strong>
                  <span className="text-muted">· {aluno.hora}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Detalhe dos cards: professores em tabela (disciplina + horário)
  const gradeDosProfessores = (listaBruta: DetalheProfessor[], vazio: string) => {
    // Aplica a pesquisa global do painel no modal (nome ou disciplina)
    const lista = filtrando
      ? listaBruta.filter((p) => combina(p.nome, p.materia))
      : listaBruta;
    if (lista.length === 0) {
      return (
        <p className="text-muted text-center py-4 mb-0">
          {msgVazia(`Nenhum resultado para "${busca.trim()}".`, vazio)}
        </p>
      );
    }
    return (
      <Table hover responsive className="align-middle mb-0">
        <thead className="table-light">
          <tr>
            <th>Professor</th>
            <th>Disciplina</th>
            <th className="text-center">Horário</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((prof, idx) => (
            <tr key={`${prof.nome}-${idx}`}>
              <td className="fw-bold">{prof.nome}</td>
              <td>
                {prof.materia ? (
                  <Badge bg="info" text="dark">
                    {prof.materia}
                  </Badge>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="text-center text-muted small">{prof.hora}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: "#f8fafc" }}>
      {/* NAVBAR */}
      <Navbar expand="lg" className="portaria-navbar px-4 text-white shadow-sm">
        <Navbar.Brand className="fw-bold fs-5 text-white d-flex align-items-center">
          <span className="status-indicator bg-primary"></span>
          InformAluno <span className="ms-2 fs-6 fw-normal text-light opacity-75">| Visão Executiva & Diretoria</span>
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
            🔄 Atualizar Dados
          </Button>
          <Button variant="outline-light" size="sm" onClick={handleLogout}>
            🚪 Sair
          </Button>
        </Nav>
      </Navbar>

      <Container className="my-4">
        {/* Indicador de carregamento da primeira busca */}
        {loading && (
          <div className="text-center py-4">
            <div className="spinner-border text-primary" role="status"></div>
            <p className="mt-2 text-muted">Carregando dados da diretoria...</p>
          </div>
        )}

        {/* CARDS DE RESUMO — clicáveis: abrem o detalhe de quem é cada número */}
        <Row className="g-3 mb-4">
          <Col md={6} lg={6}>
            <Card
              className="border-0 shadow-sm text-white card-resumo"
              style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)" }}
              onClick={() => setCardAberto("alunos")}
            >
              <Card.Body className="p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase opacity-75 fw-bold m-0">Alunos Presentes Hoje</h6>
                  <h1 className="display-4 fw-extrabold m-0">{resumo.totalAlunosHoje}</h1>
                  <small className="opacity-75">👆 Clique para ver quem é</small>
                </div>
                <div className="fs-1 opacity-50">🎓</div>
              </Card.Body>
            </Card>
          </Col>

          <Col md={6} lg={6}>
            <Card
              className="border-0 shadow-sm text-white card-resumo"
              style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)" }}
              onClick={() => setCardAberto("professores")}
            >
              <Card.Body className="p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase opacity-75 fw-bold m-0">Professores em Sala / Presentes</h6>
                  <h1 className="display-4 fw-extrabold m-0">{resumo.totalProfessoresHoje}</h1>
                  <small className="opacity-75">👆 Clique para ver quem é</small>
                </div>
                <div className="fs-1 opacity-50">👨‍🏫</div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* CHECK-OUTS DO DIA — quantos já fizeram a verificação de saída */}
        <Row className="g-4 mb-4">
          <Col md={6} lg={6}>
            <Card
              className="border-0 shadow-sm text-white card-resumo"
              style={{ background: "linear-gradient(135deg, #b45309, #d97706)" }}
              onClick={() => setCardAberto("alunosSaida")}
            >
              <Card.Body className="p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase opacity-75 fw-bold m-0">Alunos com Check-out Hoje</h6>
                  <h1 className="display-4 fw-extrabold m-0">{resumo.alunosCheckoutHoje}</h1>
                  <small className="opacity-75">👆 Clique para ver quem é</small>
                </div>
                <div className="fs-1 opacity-50">🚪</div>
              </Card.Body>
            </Card>
          </Col>

          <Col md={6} lg={6}>
            <Card
              className="border-0 shadow-sm text-white card-resumo"
              style={{ background: "linear-gradient(135deg, #6d28d9, #5b21b6)" }}
              onClick={() => setCardAberto("professoresSaida")}
            >
              <Card.Body className="p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase opacity-75 fw-bold m-0">Professores com Check-out Hoje</h6>
                  <h1 className="display-4 fw-extrabold m-0">{resumo.professoresCheckoutHoje}</h1>
                  <small className="opacity-75">👆 Clique para ver quem é</small>
                </div>
                <div className="fs-1 opacity-50">🚶</div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* PESQUISA GLOBAL — filtra aluno (nome/matrícula), turma/série e
            professor em todas as seções e modais deste painel */}
        <Card className="shadow-sm border-0 mb-4">
          <Card.Body className="py-3">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <Form.Control
                type="search"
                className="form-control-custom"
                style={{ maxWidth: 520 }}
                placeholder="🔎 Pesquisar aluno (nome, matrícula ou turma/série)..."
                aria-label="Pesquisar aluno, turma ou professor"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              {filtrando && (
                <>
                  <small className="text-muted">
                    Filtrando por <strong>“{busca.trim()}”</strong>
                  </small>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => setBusca("")}
                  >
                    ✕ Limpar
                  </Button>
                </>
              )}
            </div>
          </Card.Body>
        </Card>

        {/* DETALHAMENTO POR SÉRIE E PROFESSORES */}
        <Row className="g-4 mb-4">
          {/* TABELA: ALUNOS POR SÉRIE */}
          <Col lg={6}>
            <Card className="shadow-sm border-0 h-100">
              <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span>📊 Alunos Presentes por Série / Turma</span>
                <span className="d-flex align-items-center gap-2 fw-normal">
                  {seletorLimite("serie")}
                  {botaoAlternar("serie")}
                </span>
              </Card.Header>
              <Collapse in={expandido.serie}>
                <Card.Body className="p-0">
                  <Table hover responsive className="m-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>Série / Ano</th>
                        <th className="text-center">Quantidade de Alunos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serieVisivel.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="text-center py-4 text-muted">
                            {msgVazia(
                              `Nenhum resultado para “${busca.trim()}”.`,
                              "Nenhum registro de aluno hoje."
                            )}
                          </td>
                        </tr>
                      ) : (
                        cortar("serie", serieVisivel).map((item, idx) => (
                          <tr key={idx}>
                            <td className="fw-semibold">
                              {item.serie}
                              {/* Nomes casados pela pesquisa de aluno (turma igual) */}
                              {filtrando &&
                                (nomesCasadosPorSerie.get(item.serie.trim() || "Sem série") || []).map(
                                  (nome, i) => (
                                    <div key={i} className="text-muted fw-normal small">
                                      · {nome}
                                    </div>
                                  )
                                )}
                            </td>
                            <td className="text-center">
                              <Badge bg="primary" className="px-3 py-2 fs-6">
                                {item.quantidade} alunos
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </Card.Body>
              </Collapse>
            </Card>
          </Col>

          {/* TABELA: PROFESSORES PRESENTES & MATÉRIA */}
          <Col lg={6}>
            <Card className="shadow-sm border-0 h-100">
              <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span>👨‍🏫 Professores Presentes &amp; Disciplinas</span>
                <span className="d-flex align-items-center gap-2 fw-normal">
                  {seletorLimite("professores")}
                  {botaoAlternar("professores")}
                </span>
              </Card.Header>
              <Collapse in={expandido.professores}>
                <Card.Body className="p-0">
                  <Table hover responsive className="m-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>Professor</th>
                        <th>Matéria / Disciplina</th>
                        <th className="text-center">Horário de Chegada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {professoresVisiveis.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-center py-4 text-muted">
                            {msgVazia(
                              `Nenhum resultado para “${busca.trim()}”.`,
                              "Nenhum professor registrou entrada hoje."
                            )}
                          </td>
                        </tr>
                      ) : (
                        cortar("professores", professoresVisiveis).map((prof, idx) => (
                          <tr key={idx}>
                            <td className="fw-bold">{prof.nome}</td>
                            <td>
                              <Badge bg="info" text="dark">
                                {prof.materia}
                              </Badge>
                            </td>
                            <td className="text-center text-muted small">{prof.hora_entrada}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </Card.Body>
              </Collapse>
            </Card>
          </Col>
        </Row>

        {/* ANOTAÇÕES DE PAIS E PROFESSORES */}
        <Card className="shadow-sm border-0 mb-4">
          <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span>📝 Anotações de Responsáveis &amp; Professores</span>
            <span className="d-flex align-items-center gap-2 fw-normal">
              {seletorLimite("anotacoes")}
              {botaoAlternar("anotacoes")}
            </span>
          </Card.Header>
          <Collapse in={expandido.anotacoes}>
            <Card.Body>
              <AnotacoesLista
                itens={anotacoesVisiveis}
                limite={limites.anotacoes ?? 10}
                mensagemVazia={msgVazia(
                  `Nenhum resultado para “${busca.trim()}”.`,
                  "Nenhuma anotação registrada ainda."
                )}
              />
            </Card.Body>
          </Collapse>
        </Card>

        {/* LOG DE ACESSOS + TERCEIROS (VISÍVEL POR 30 DIAS) */}
        <Card className="shadow-sm border-0 mb-4">
          <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span>📋 Log de Acessos &amp; Terceiros <Badge bg="info" text="dark" className="ms-1">30 dias</Badge></span>
            <span className="d-flex align-items-center gap-2 fw-normal">
              {botaoAlternar("log")}
            </span>
          </Card.Header>
          <Collapse in={expandido.log}>
            <Card.Body>
              <Row className="g-4">
                <Col lg={6}>
                  <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                    <h6 className="fw-bold mb-0">🔑 Acessos (logins)</h6>
                    {seletorLimite("logAcessos")}
                  </div>
                  <Table responsive hover size="sm" className="align-middle border">
                    <thead className="table-light">
                      <tr>
                        <th>Data / Hora</th>
                        <th>Usuário</th>
                        <th>Cargo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logAcessosVisivel.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-center py-3 text-muted">
                            {msgVazia(
                              `Nenhum resultado para “${busca.trim()}”.`,
                              "Nenhum acesso nos últimos 30 dias."
                            )}
                          </td>
                        </tr>
                      ) : (
                        cortar("logAcessos", logAcessosVisivel).map((a) => (
                          <tr key={"ac" + a.id}>
                            <td className="small text-nowrap text-muted">
                              {a.criado_em ? a.criado_em.slice(0, 16) : "—"}
                            </td>
                            <td className="small">
                              <strong>{a.usuario_nome}</strong>
                              <div className="text-muted">{a.usuario_email}</div>
                            </td>
                            <td>
                              <Badge bg="secondary">{a.papel}</Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </Col>

                <Col lg={6}>
                  <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                    <h6 className="fw-bold mb-0">🕒 Acessos temporários / terceiros criados</h6>
                    {seletorLimite("logTerceiros")}
                  </div>
                  <Table responsive hover size="sm" className="align-middle border">
                    <thead className="table-light">
                      <tr>
                        <th>Data / Hora</th>
                        <th>Aluno</th>
                        <th>Solicitante</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logTerceirosVisivel.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-3 text-muted">
                            {msgVazia(
                              `Nenhum resultado para “${busca.trim()}”.`,
                              "Nenhum acesso temporário criado nos últimos 30 dias."
                            )}
                          </td>
                        </tr>
                      ) : (
                        cortar("logTerceiros", logTerceirosVisivel).map((t) => (
                          <tr key={"tc" + t.id}>
                            <td className="small text-nowrap text-muted">
                              {t.criado_em ? t.criado_em.slice(0, 16) : "—"}
                            </td>
                            <td className="small">
                              <strong>{t.aluno_nome || "—"}</strong>
                              {t.matricula && <div className="text-muted">{t.matricula}</div>}
                            </td>
                            <td className="small">{t.solicitante || "—"}</td>
                            <td>
                              {t.status === "APROVADO" ? (
                                <Badge bg="success">APROVADO</Badge>
                              ) : t.status === "REJEITADO" ? (
                                <Badge bg="danger">REJEITADO</Badge>
                              ) : t.status === "UTILIZADO" ? (
                                <Badge bg="primary">UTILIZADO</Badge>
                              ) : t.status === "EXPIRADO" ? (
                                <Badge bg="secondary">EXPIRADO</Badge>
                              ) : (
                                <Badge bg="warning" text="dark">{t.status || "—"}</Badge>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </Col>
              </Row>
            </Card.Body>
          </Collapse>
        </Card>

        {/* FEED DE ENTRADAS EM TEMPO REAL */}
        <Card className="shadow-sm border-0">
          <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span>⚡ Fluxo em Tempo Real na Portaria (Últimos Registros)</span>
            <span className="d-flex align-items-center gap-2 fw-normal">
              <small className="text-muted">Atualizado a cada 10s</small>
              {seletorLimite("fluxo")}
              {botaoAlternar("fluxo")}
            </span>
          </Card.Header>
          <Collapse in={expandido.fluxo}>
            <Card.Body className="p-0">
              <Table hover responsive className="m-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Horário</th>
                    <th>Nome</th>
                    <th>Perfil</th>
                    <th>Série / Matéria</th>
                    <th>Método de Validação</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosVisiveis.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-4 text-muted">
                        {msgVazia(
                          `Nenhum resultado para “${busca.trim()}”.`,
                          "Aguardando primeiro registro de validação do dia..."
                        )}
                      </td>
                    </tr>
                  ) : (
                    cortar("fluxo", registrosVisiveis).map((reg) => (
                      <tr key={reg.id}>
                        <td className="fw-bold text-secondary">{reg.hora}</td>
                        <td className="fw-semibold">{reg.nome}</td>
                        <td>
                          <Badge bg={reg.tipo === "ALUNO" ? "primary" : "success"}>
                            {reg.tipo}
                          </Badge>
                        </td>
                        <td>{reg.detalhe}</td>
                        <td>
                          <Badge bg="secondary" className="fw-normal">
                            {reg.metodo_validacao}
                          </Badge>
                          {reg.movimento && (
                            <Badge
                              bg={reg.movimento === "CHECKOUT" ? "warning" : "primary"}
                              text={reg.movimento === "CHECKOUT" ? "dark" : undefined}
                              className="ms-1"
                            >
                              {reg.movimento === "CHECKOUT" ? "CHECK-OUT" : "CHECK-IN"}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Collapse>
        </Card>

        {/* CHAT INTERNO: O PROFESSOR CONVERSA COM A DIRETORIA E ENTRE SI */}
        <Card className="shadow-sm border-0 mt-4">
          <Card.Header className="bg-white fw-bold fs-6 py-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span>💬 Mensagens — Professores</span>
            <span className="d-flex align-items-center gap-2 fw-normal">
              {botaoAlternar("chat")}
            </span>
          </Card.Header>
          <Collapse in={expandido.chat}>
            <Card.Body>
              <ChatPainel />
            </Card.Body>
          </Collapse>
        </Card>

        {/* MODAL: DETALHE POR TRÁS DE CADA CARD DE RESUMO */}
        <Modal
          show={cardAberto !== null}
          onHide={() => setCardAberto(null)}
          centered
          size="lg"
        >
          <Modal.Header closeButton className="bg-white">
            <Modal.Title className="fs-6 fw-bold mb-0">
              {cardAberto === "alunos" && "🎓 Alunos Presentes Hoje"}
              {cardAberto === "professores" && "👨‍🏫 Professores em Sala / Presentes"}
              {cardAberto === "alunosSaida" && "🚪 Alunos com Check-out Hoje"}
              {cardAberto === "professoresSaida" && "🚶 Professores com Check-out Hoje"}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {cardAberto === "alunos" &&
              gradeDosAlunos(detalhes.alunosPresentes, "Nenhum aluno registrado hoje.")}
            {cardAberto === "alunosSaida" &&
              gradeDosAlunos(detalhes.alunosCheckout, "Nenhum aluno fez check-out hoje.")}
            {cardAberto === "professores" &&
              gradeDosProfessores(
                detalhes.professoresPresentes,
                "Nenhum professor registrou presença hoje."
              )}
            {cardAberto === "professoresSaida" &&
              gradeDosProfessores(
                detalhes.professoresCheckout,
                "Nenhum professor fez check-out hoje."
              )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setCardAberto(null)}>
              Fechar
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </div>
  );
};