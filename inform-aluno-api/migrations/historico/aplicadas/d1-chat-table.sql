CREATE TABLE IF NOT EXISTS chat_mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  autor_id INTEGER NOT NULL,
  texto TEXT NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
SELECT name FROM sqlite_master WHERE type='table' AND name='chat_mensagens';
