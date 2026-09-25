-- Auditoria final do ciclo do CHAT (executar com o dev parado)

-- 1. Residuo dos smokes (checkinout regressado + chat)
DELETE FROM registros_entrada WHERE nome = 'Aluno Smoke Checkin';
DELETE FROM professores
WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = 'professor.rafael@informaluno.com');
DELETE FROM chat_mensagens WHERE texto LIKE 'Smoke chat:%';
-- So remove leituras que sobraram sem nenhuma mensagem no fio (o que
-- preserva as bolinhas de conversas reais, se o usuario usou o chat)
DELETE FROM chat_leituras
WHERE NOT EXISTS (
  SELECT 1 FROM chat_mensagens m
  WHERE m.conversa = chat_leituras.conversa
    AND m.professor_id = chat_leituras.professor_id
    AND m.aluno_id = chat_leituras.aluno_id
    AND m.destino = chat_leituras.destino
);

-- 2. Reordena o movimento do que restou (recomputa a alternancia limpa:
--    1o do dia = CHECKIN, 2o = CHECKOUT, ... para a sequencia ficar coerente)
UPDATE registros_entrada SET movimento = NULL;
UPDATE registros_entrada
SET movimento = (
  SELECT CASE WHEN sub.rn % 2 = 1 THEN 'CHECKIN' ELSE 'CHECKOUT' END
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY CASE WHEN tipo = 'PROFESSOR' THEN 'P' ELSE 'A' END || COALESCE(pessoa_id, 0)
             ORDER BY id
           ) AS rn
    FROM registros_entrada
  ) sub
  WHERE sub.id = registros_entrada.id
)
WHERE movimento IS NULL;

-- 3. Auditoria de integridade
SELECT COUNT(*) AS registros_total FROM registros_entrada;
SELECT tipo, movimento, COUNT(*) AS n FROM registros_entrada GROUP BY tipo, movimento;
SELECT COUNT(*) AS chat_mensagens FROM chat_mensagens;
SELECT COUNT(*) AS chat_leituras FROM chat_leituras;
SELECT COUNT(*) AS professores_com_foto FROM professores WHERE foto IS NOT NULL;
SELECT COUNT(*) AS usuarios_total FROM usuarios;
SELECT COUNT(*) AS alunos_total FROM alunos;
SELECT COUNT(*) AS convites_residuo FROM autorizacoes_temporarias;
SELECT COUNT(*) AS registros_orfaos
FROM registros_entrada r
WHERE r.pessoa_id IS NOT NULL
  AND (
    (r.tipo = 'PROFESSOR' AND NOT EXISTS (SELECT 1 FROM professores p WHERE p.id = r.pessoa_id))
    OR
    (r.tipo <> 'PROFESSOR' AND NOT EXISTS (SELECT 1 FROM alunos a WHERE a.id = r.pessoa_id))
  );
