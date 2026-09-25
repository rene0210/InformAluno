SELECT tipo, metodo_validacao, COUNT(*) AS n, MIN(data_hora) AS primeira, MAX(data_hora) AS ultima
FROM registros_entrada GROUP BY tipo, metodo_validacao;

SELECT id, nome, tipo, detalhe, metodo_validacao, data_hora
FROM registros_entrada ORDER BY id DESC LIMIT 15;

SELECT COUNT(*) AS linhas_hoje FROM registros_entrada WHERE DATE(data_hora) = DATE('now');

SELECT id, nome, materia FROM professores ORDER BY id;
