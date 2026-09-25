-- Auditoria final do ciclo CARDS + NOTAS (executar com o dev parado) — MUTACOES

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

-- 3. Notas do aluno DEMO: os smokes agora gravam por materia ('Matematica');
--    as notas antigas SEM materia duplicariam a grade. Primeiro remove as
--    antigas quando ja existe a linha da materia (mesmo bimestre), depois
--    relabela o que restar. O aluno REAL (44) nao e tocado — as notas
--    antigas dele aparecem como "Nota geral" no painel.DELETE FROM notas
WHERE aluno_id = 56 AND materia = ''
  AND id IN (
    SELECT n1.id FROM notas n1
    JOIN notas n2 ON n2.aluno_id = n1.aluno_id
                 AND n2.bimestre = n1.bimestre
                 AND n2.materia = 'Matemática'
    WHERE n1.materia = ''
  );
UPDATE notas SET materia = 'Matemática' WHERE aluno_id = 56 AND materia = '';
