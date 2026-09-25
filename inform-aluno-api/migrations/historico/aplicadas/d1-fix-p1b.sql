-- pedaco 1b: leituras orfas
DELETE FROM chat_leituras
WHERE NOT EXISTS (
  SELECT 1 FROM chat_mensagens m
  WHERE m.conversa = chat_leituras.conversa
    AND m.professor_id = chat_leituras.professor_id
    AND m.aluno_id = chat_leituras.aluno_id
    AND m.destino = chat_leituras.destino
);
