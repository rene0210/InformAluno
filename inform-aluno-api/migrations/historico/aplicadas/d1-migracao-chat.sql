-- Conversas individuais do chat (one-time, local)
ALTER TABLE chat_mensagens ADD COLUMN conversa TEXT NOT NULL DEFAULT 'DIRETORIA';
ALTER TABLE chat_mensagens ADD COLUMN professor_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_mensagens ADD COLUMN aluno_id INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS chat_leituras (
  usuario_id INTEGER NOT NULL,
  conversa TEXT NOT NULL,
  professor_id INTEGER NOT NULL,
  aluno_id INTEGER NOT NULL DEFAULT 0,
  ultimo_lido_id INTEGER NOT NULL DEFAULT 0,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, conversa, professor_id, aluno_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

PRAGMA table_info(chat_mensagens);
SELECT COUNT(*) AS mensagens_existentes FROM chat_mensagens;
