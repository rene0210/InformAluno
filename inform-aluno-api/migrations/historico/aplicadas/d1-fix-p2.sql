-- pedaco 2: recomputa movimento alternado
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
