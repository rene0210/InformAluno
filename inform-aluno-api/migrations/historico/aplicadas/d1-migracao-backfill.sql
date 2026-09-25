-- Backfill idempotente do movimento nas linhas antigas:
-- alterna por pessoa/dia (1a = CHECKIN, 2a = CHECKOUT, ...). Lado do aluno
-- (ALUNO/VAN/RESPONSAVEL) segue a mesma sequência; PROFESSOR tem a dele.
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

SELECT id, pessoa_id, nome, tipo, movimento, data_hora FROM registros_entrada ORDER BY id;
