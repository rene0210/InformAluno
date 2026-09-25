-- Correspondencia do responsavel com a escola (one-time, local)
ALTER TABLE chat_mensagens ADD COLUMN destino TEXT NOT NULL DEFAULT '';

-- Recria leituras com `destino` na chave (estava vazia)
DROP TABLE IF EXISTS chat_leituras;
CREATE TABLE chat_leituras (
  usuario_id INTEGER NOT NULL,
  conversa TEXT NOT NULL,
  professor_id INTEGER NOT NULL,
  aluno_id INTEGER NOT NULL DEFAULT 0,
  destino TEXT NOT NULL DEFAULT '',
  ultimo_lido_id INTEGER NOT NULL DEFAULT 0,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, conversa, professor_id, aluno_id, destino),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

PRAGMA table_info(chat_mensagens);
SELECT COUNT(*) AS mensagens_existentes FROM chat_mensagens;
SELECT COUNT(*) AS leituras FROM chat_leituras;
