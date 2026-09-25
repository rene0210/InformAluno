-- Auditoria final do ciclo check-in/check-out (executar com o dev parado)

-- 1. Residuo da smoke: registros de teste e foto de professor de teste
DELETE FROM registros_entrada WHERE nome = 'Aluno Smoke Checkin';
DELETE FROM professores
WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = 'professor.rafael@informaluno.com');

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
SELECT id, nome, tipo, movimento, data_hora FROM registros_entrada ORDER BY id;
SELECT COUNT(*) AS chat_total FROM chat_mensagens;
SELECT COUNT(*) AS professores_com_foto FROM professores WHERE foto IS NOT NULL;
SELECT COUNT(*) AS usuarios_total FROM usuarios;
SELECT COUNT(*) AS convites_residuo FROM autorizacoes_temporarias;
SELECT COUNT(*) AS registros_orfaos
FROM registros_entrada r
WHERE r.pessoa_id IS NOT NULL
  AND (
    (r.tipo = 'PROFESSOR' AND NOT EXISTS (SELECT 1 FROM professores p WHERE p.id = r.pessoa_id))
    OR
    (r.tipo <> 'PROFESSOR' AND NOT EXISTS (SELECT 1 FROM alunos a WHERE a.id = r.pessoa_id))
  );
