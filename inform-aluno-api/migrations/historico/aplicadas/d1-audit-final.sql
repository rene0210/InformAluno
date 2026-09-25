-- 1. Remove logs de usuarios ja excluidos (smoke e E2E)
DELETE FROM log_acessos WHERE usuario_id IS NULL OR usuario_id NOT IN (SELECT id FROM usuarios);

-- 2. Auditoria final
SELECT (SELECT COUNT(*) FROM usuarios) AS usuarios,
       (SELECT COUNT(*) FROM alunos) AS alunos,
       (SELECT COUNT(*) FROM responsaveis) AS responsaveis,
       (SELECT COUNT(*) FROM sessoes) AS sessoes,
       (SELECT COUNT(*) FROM log_acessos) AS log_acessos,
       (SELECT COUNT(*) FROM autorizacoes_temporarias) AS convites,
       (SELECT COUNT(*) FROM notas) AS notas;

SELECT COUNT(*) AS resp_orfaos FROM responsaveis r
WHERE NOT EXISTS (SELECT 1 FROM alunos a WHERE a.responsavel_id = r.id OR a.responsavel2_id = r.id OR a.responsavel3_id = r.id);

SELECT COUNT(*) AS sessoes_orfaas FROM sessoes s
WHERE s.usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = s.usuario_id);

SELECT COUNT(*) AS log_orfaos FROM log_acessos l
WHERE l.usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = l.usuario_id);

-- 3. Quem aparece no log agora (telas de apresentacao)
SELECT usuario_email, papel, COUNT(*) AS logins FROM log_acessos GROUP BY usuario_email, papel ORDER BY usuario_email;

-- 4. Alunos e elenco finais
SELECT id, nome, matricula FROM alunos ORDER BY id;
SELECT id, email, role FROM usuarios ORDER BY id;
