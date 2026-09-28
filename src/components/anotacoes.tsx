import React, { useState } from "react";
import { Badge, Form } from "react-bootstrap";
import { AtestadoBotao } from "../pages/atestado/atestado";

// Uma anotação de acompanhamento escrita por professor ou responsável — a
// mesma forma que a diretoria (AnotacaoDiretoria) e o painel do professor
// (AcompanhamentoResumo + aluno/matricula) já montam.
export interface AnotacaoItem {
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

interface AnotacoesListaProps {
  /** Anotações já filtradas pelo filtro global do painel */
  itens: AnotacaoItem[];
  /** Mensagem quando a lista inteira está vazia (padrão: nenhuma anotação) */
  mensagemVazia?: string;
  /** Quantidade máxima de cards — seletor "Exibir" da diretoria (0 = todos) */
  limite?: number;
}

// Mesma paleta de avatar do chat: professor = índigo, responsável = laranja,
// resto da equipe = azul.
const classeAvatar = (papel: string): string =>
  papel === "PROFESSOR" ? "professor" : papel === "RESPONSAVEL" ? "responsavel" : "equipe";

const iniciais = (nome: string): string => (nome.trim().slice(0, 1) || "?").toUpperCase();

// Normaliza para comparar sem acento/maiúscula (ex.: "João" acha "joao") —
// mesma regra da barra de pesquisa do chat.
const normalizar = (v: string): string =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Lista de anotações com a mesma cara da lista de contatos do chat:
// barra 🔎, avatar com iniciais, autor + badge de perfil, "sobre quem é"
// e o texto com a hora.
export const AnotacoesLista: React.FC<AnotacoesListaProps> = ({
  itens,
  mensagemVazia = "Nenhuma anotação registrada ainda.",
  limite = 0,
}) => {
  const [busca, setBusca] = useState("");

  const termo = normalizar(busca.trim());
  const filtrados = termo
    ? itens.filter((anot) =>
        [anot.aluno_nome, anot.matricula, anot.autor_nome, anot.texto].some((campo) =>
          normalizar(campo || "").includes(termo)
        )
      )
    : itens;

  const visiveis = limite > 0 ? filtrados.slice(0, limite) : filtrados;

  return (
    <div className="anotacoes-lista">
      <div className="chat-busca">
        <Form.Control
          type="search"
          size="sm"
          placeholder="🔎 Pesquisar anotação (aluno, autor ou texto)..."
          aria-label="Pesquisar anotação"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {visiveis.length === 0 ? (
        <p className="text-muted small p-2 mb-0">
          {busca ? `Nenhuma anotação para “${busca.trim()}”.` : mensagemVazia}
        </p>
      ) : (
        visiveis.map((anot) => (
          <div
            key={`${anot.id}-${anot.criado_em}`}
            className="chat-contato anotacoes-contato"
          >
            <span className={`chat-avatar chat-avatar-${classeAvatar(anot.papel)}`}>
              {iniciais(anot.autor_nome)}
            </span>
            <span className="chat-contato-info">
              <span className="chat-contato-nome anotacoes-nome">
                <span className="anotacoes-autor">{anot.autor_nome}</span>
                <Badge
                  bg={anot.papel === "PROFESSOR" ? "primary" : "warning"}
                  text={anot.papel === "PROFESSOR" ? undefined : "dark"}
                >
                  {anot.papel}
                </Badge>
              </span>
              <span className="chat-contato-sub">
                sobre {anot.aluno_nome} ({anot.matricula})
              </span>
              <span className="anotacoes-texto">
                {anot.criado_em.slice(0, 16)} · {anot.texto}
              </span>
              {anot.atestado_base64 && (
                <span className="mt-1 d-inline-block">
                  <AtestadoBotao atestado={anot.atestado_base64} nome={anot.atestado_nome} />
                </span>
              )}
            </span>
          </div>
        ))
      )}
    </div>
  );
};
