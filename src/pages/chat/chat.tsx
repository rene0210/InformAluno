import React, { useEffect, useRef, useState } from "react";
import { Button, Form, Badge } from "react-bootstrap";
import "../cadastro/Cadastro.css";

interface ChatMsg {
  id: number;
  autor_id: number;
  texto: string;
  criado_em: string;
  autor_nome: string;
  autor_role: string;
}

// Um contato da lista lateral (a "barra" do aluno ou do professor) — é
// nela que aparece a bolinha de notificação quando chega mensagem nova.
interface ConversaItem {
  conversa: "DIRETORIA" | "FAMILIA" | "CORRESPONDENCIA";
  professor_id: number;
  aluno_id: number;
  destino: string;
  contatoTipo: "ALUNO" | "PROFESSOR" | "DIRETORIA" | "EQUIPE" | "RESPONSAVEL";
  contatoNome: string;
  contatoSubtitulo: string;
  naoLidas: number;
  ultimaTexto: string | null;
  ultimaEm: string | null;
  ultimaMinha: boolean;
}

const chaveDe = (cv: ConversaItem): string =>
  `${cv.conversa}:${cv.professor_id}:${cv.aluno_id}:${cv.destino}`;

// Card de conversas individuais (layout de bate-papo/e-mail): à esquerda a
// lista de contatos — no /professor são a Diretoria e cada ALUNO (conversa
// com a família), no /diretoria cada PROFESSOR, no /painel do responsável os
// professores dos seus filhos — e à direita a conversa com o selecionado.
// O backend devolve os contatos conforme o perfil de quem logou.
export const ChatPainel: React.FC = () => {
  const [conversas, setConversas] = useState<ConversaItem[]>([]);
  const [selecionada, setSelecionada] = useState<ConversaItem | null>(null);
  const [mensagens, setMensagens] = useState<ChatMsg[]>([]);
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [eu, setEu] = useState<number | null>(null);
  const ultimoId = useRef(0);
  const historicoRef = useRef<HTMLDivElement>(null);
  const selecionadaRef = useRef<ConversaItem | null>(null);

  const authHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  });

  // O banco grava UTC; aqui mostra dia/hora de Brasília
  const formatarHora = (criado: string): string => {
    try {
      const d = new Date(criado.replace(" ", "T") + "Z");
      return d.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return criado.slice(0, 16);
    }
  };

  // Hora curta (só o relógio de Brasília) para a prévia da lista
  const formatarHoraCurta = (criado: string): string => {
    try {
      const d = new Date(criado.replace(" ", "T") + "Z");
      return d.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return criado.slice(11, 16);
    }
  };

  const carregarConversas = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8787/api/chat/conversas", {
        headers: authHeaders(),
      });
      // Sessão expirada: a própria tela já trata o 401/403 dela
      if (res.status === 401 || res.status === 403 || !res.ok) return;
      const data = await res.json();
      const lista: ConversaItem[] = Array.isArray(data.conversas) ? data.conversas : [];
      if (typeof data.eu === "number") setEu(data.eu);
      setConversas(lista);
      // Mantém o contato aberto; se ele saiu da lista, abre o primeiro
      setSelecionada((prev) => {
        if (lista.length === 0) return null;
        if (prev) {
          const k = chaveDe(prev);
          if (lista.some((cv) => chaveDe(cv) === k)) return prev;
        }
        return lista[0];
      });
    } catch {
      // Servidor fora do ar: mantém o que já está na tela
    }
  };

  const carregarMensagens = async (
    fio: ConversaItem,
    desde: number,
    atualizarLista: boolean
  ) => {
    try {
      const url =
        `http://127.0.0.1:8787/api/chat/mensagens?conversa=${fio.conversa}` +
        `&professor_id=${fio.professor_id}&aluno_id=${fio.aluno_id}` +
        `&destino=${encodeURIComponent(fio.destino)}` +
        (desde > 0 ? `&desde=${desde}` : "");
      const res = await fetch(url, { headers: authHeaders() });
      if (res.status === 401 || res.status === 403 || !res.ok) return;
      const data = await res.json();
      if (typeof data.eu === "number") setEu(data.eu);
      const novas: ChatMsg[] = Array.isArray(data.mensagens) ? data.mensagens : [];

      if (desde <= 0) {
        // Carga inicial do fio: substitui o histórico
        setMensagens(novas);
        ultimoId.current = novas.length ? novas[novas.length - 1].id : 0;
      } else if (novas.length) {
        // Polling: anexa só o que ainda não está na tela
        setMensagens((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const extras = novas.filter((m) => !ids.has(m.id));
          return extras.length ? [...prev, ...extras] : prev;
        });
        ultimoId.current = novas[novas.length - 1].id;
      }

      // Ler o fio marca tudo como lido no servidor: se a atualização veio
      // ao abrir o contato, já refaz a lista para zerar a bolinha na hora
      if (atualizarLista) void carregarConversas();
    } catch {
      // Servidor fora do ar: mantém o que já está na tela
    }
  };

  /* oxlint-disable react-hooks/exhaustive-deps */
  // Abre a conversa quando o contato selecionado muda
  useEffect(() => {
    ultimoId.current = 0;
    setMensagens([]);
    setErro(null);
    if (selecionada) void carregarMensagens(selecionada, 0, true);
  }, [selecionada ? chaveDe(selecionada) : ""]);

  // Inicializa + polling: contatos a cada 4s (bolinhas e prévias) e
  // mensagens do fio aberto a cada 4s
  useEffect(() => {
    void carregarConversas();
    const t1 = setInterval(() => void carregarConversas(), 4000);
    const t2 = setInterval(() => {
      const fio = selecionadaRef.current;
      if (fio) void carregarMensagens(fio, ultimoId.current, false);
    }, 4000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */

  // Mantém a referência do fio aberto sempre atual para o polling
  useEffect(() => {
    selecionadaRef.current = selecionada;
  }, [selecionada]);

  // Sempre na mensagem mais recente
  useEffect(() => {
    const el = historicoRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensagens]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const fio = selecionada;
    const t = texto.trim();
    if (!fio || !t || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("http://127.0.0.1:8787/api/chat/mensagens", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          conversa: fio.conversa,
          professor_id: fio.professor_id,
          aluno_id: fio.aluno_id,
          destino: fio.destino,
          texto: t,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        setErro(data.error || "Sessão expirada. Entre novamente para conversar.");
        return;
      }
      if (res.ok && data.mensagem) {
        setTexto("");
        const nova: ChatMsg = data.mensagem;
        setMensagens((prev) =>
          prev.some((m) => m.id === nova.id) ? prev : [...prev, nova]
        );
        ultimoId.current = Math.max(ultimoId.current, nova.id);
        void carregarConversas(); // atualiza a prévia do contato
      } else {
        setErro(data.error || "Não foi possível enviar a mensagem.");
      }
    } catch {
      setErro("Não foi possível conectar ao servidor.");
    } finally {
      setEnviando(false);
    }
  };

  const corCargo = (role: string): string => {
    if (role === "PROFESSOR") return "primary";
    if (role === "DIRETOR") return "danger";
    if (role === "COORDENADOR") return "warning";
    if (role === "GESTOR") return "info";
    if (role === "ADMIN") return "dark";
    return "secondary";
  };

  // Cor do badge por tipo de contato da lista
  const corTipo = (
    tipo: ConversaItem["contatoTipo"]
  ): "success" | "primary" | "danger" | "info" | "warning" => {
    if (tipo === "ALUNO") return "success";
    if (tipo === "PROFESSOR") return "primary";
    if (tipo === "DIRETORIA") return "danger";
    if (tipo === "EQUIPE") return "info";
    return "warning";
  };

  const totalNaoLidas = conversas.reduce((s, cv) => s + (cv.naoLidas || 0), 0);
  const iniciais = (nome: string): string => (nome.trim().slice(0, 1) || "?").toUpperCase();

  // Normaliza para comparar sem acento/maiúscula (ex.: "João" acha "joao")
  const normalizar = (v: string): string =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  // Contatos filtrados pela barra de pesquisa (nome, subtítulo e última msg)
  const termo = normalizar(busca.trim());
  const conversasVisiveis = termo
    ? conversas.filter((cv) =>
        [cv.contatoNome, cv.contatoSubtitulo, cv.ultimaTexto || ""].some((campo) =>
          normalizar(campo).includes(termo)
        )
      )
    : conversas;

  return (
    <div className="chat-painel">
      <div className="chat-topo">
        {totalNaoLidas > 0 && (
          <span
            className="chat-bola chat-bola-total"
            title={`${totalNaoLidas} mensagem(ns) não lida(s)`}
          >
            {totalNaoLidas} {totalNaoLidas === 1 ? "nova" : "novas"}
          </span>
        )}
        <small className="text-muted ms-auto">Atualizado a cada 4s</small>
      </div>

      <div className="chat-layout">
        {/* Contatos — a barra do aluno/professor com a bolinha de notificação */}
        <div className="chat-lista">
          {/* Filtro de pesquisa: nome do contato, subtítulo ou última mensagem */}
          <div className="chat-busca">
            <Form.Control
              type="search"
              size="sm"
              placeholder="🔎 Pesquisar contato..."
              aria-label="Pesquisar contato"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          {conversasVisiveis.length === 0 ? (
            <p className="text-muted small p-2 mb-0">
              {busca
                ? `Nenhum contato encontrado para "${busca.trim()}".`
                : "Nenhum contato disponível para conversar."}
            </p>
          ) : (
            conversasVisiveis.map((cv) => {
              const ativa = selecionada ? chaveDe(selecionada) === chaveDe(cv) : false;
              return (
                <button
                  key={chaveDe(cv)}
                  type="button"
                  className={`chat-contato${ativa ? " ativo" : ""}`}
                  onClick={() => setSelecionada(cv)}
                >
                  <span className={`chat-avatar chat-avatar-${cv.contatoTipo.toLowerCase()}`}>
                    {iniciais(cv.contatoNome)}
                  </span>
                  <span className="chat-contato-info">
                    <span className="chat-contato-nome">{cv.contatoNome}</span>
                    {cv.contatoSubtitulo && (
                      <span className="chat-contato-sub">{cv.contatoSubtitulo}</span>
                    )}
                    {cv.ultimaTexto && (
                      <span className="chat-contato-preview">
                        {cv.ultimaEm ? `${formatarHoraCurta(cv.ultimaEm)} · ` : ""}
                        {(cv.ultimaMinha ? "Você: " : "") + cv.ultimaTexto}
                      </span>
                    )}
                  </span>
                  {cv.naoLidas > 0 && (
                    <span
                      className="chat-bola"
                      title={`${cv.naoLidas} mensagem(ns) não lida(s)`}
                    >
                      {cv.naoLidas}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Conversa com o contato selecionado */}
        <div className="chat-thread">
          {selecionada ? (
            <>
              <div className="chat-thread-topo">
                <span className={`chat-avatar chat-avatar-${selecionada.contatoTipo.toLowerCase()}`}>
                  {iniciais(selecionada.contatoNome)}
                </span>
                <span className="fw-semibold">{selecionada.contatoNome}</span>
                <Badge
                  bg={corTipo(selecionada.contatoTipo)}
                  text={selecionada.contatoTipo === "RESPONSAVEL" ? "dark" : undefined}
                >
                  {selecionada.contatoTipo}
                </Badge>
                {selecionada.contatoSubtitulo && (
                  <small className="text-muted">{selecionada.contatoSubtitulo}</small>
                )}
              </div>

              <div className="chat-historico" ref={historicoRef}>
                {mensagens.length === 0 ? (
                  <p className="text-muted mb-0 p-2">
                    Nenhuma mensagem ainda. Escreva a primeira! 💬
                  </p>
                ) : (
                  mensagens.map((m) => (
                    <div
                      key={m.id}
                      className={`chat-msg${m.autor_id === eu ? " chat-msg-eu" : ""}`}
                    >
                      <div className="chat-msg-topo">
                        {m.autor_id === eu ? (
                          <span className="chat-msg-autor fw-semibold">Você</span>
                        ) : (
                          <>
                            <Badge
                              bg={corCargo(m.autor_role) as "primary"}
                              text={m.autor_role === "COORDENADOR" ? "dark" : undefined}
                            >
                              {m.autor_role}
                            </Badge>
                            <span className="chat-msg-autor fw-semibold">{m.autor_nome}</span>
                          </>
                        )}
                        <small className="chat-hora">{formatarHora(m.criado_em)}</small>
                      </div>
                      <div className="chat-msg-texto">{m.texto}</div>
                    </div>
                  ))
                )}
              </div>

              <Form onSubmit={enviar} className="chat-enviar">
                <Form.Control
                  type="text"
                  maxLength={1000}
                  placeholder={`Mensagem para ${selecionada.contatoNome}...`}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  aria-label="Mensagem do chat"
                />
                <Button
                  type="submit"
                  className="btn-primary-custom"
                  disabled={enviando || !texto.trim()}
                >
                  {enviando ? "Enviando..." : "Enviar"}
                </Button>
              </Form>
              {erro && <small className="text-danger d-block mt-1">{erro}</small>}
            </>
          ) : (
            <p className="text-muted p-3 mb-0">
              Selecione um contato para começar a conversar.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
