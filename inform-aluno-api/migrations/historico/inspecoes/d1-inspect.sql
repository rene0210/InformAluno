-- 1. Elenco de apresentacao: tamanho/valor da senha e email
SELECT id, email, role, senha, length(senha) AS senha_len, length(email) AS email_len
FROM usuarios
WHERE id BETWEEN 60 AND 75
ORDER BY id;

-- 2. Residuo do smoke (dados descartaveis)
SELECT id, nome, matricula FROM alunos WHERE matricula IN ('990207', '990208');
SELECT id, email, role FROM usuarios WHERE email LIKE 'smoke.%';
SELECT id, aluno_id, convidado_nome FROM autorizacoes_temporarias WHERE aluno_id IN (SELECT id FROM alunos WHERE matricula = '990207');

-- 3. Log de acessos: total e orfaos
SELECT COUNT(*) AS total_log FROM log_acessos;
SELECT COUNT(*) AS log_orfaos FROM log_acessos l
WHERE l.usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = l.usuario_id);

-- 4. Auditoria geral de orfaos
SELECT COUNT(*) AS resp_orfaos FROM responsaveis r
WHERE NOT EXISTS (SELECT 1 FROM alunos a WHERE a.responsavel_id = r.id OR a.responsavel2_id = r.id OR a.responsavel3_id = r.id);

SELECT COUNT(*) AS resp_usuario_orfaos FROM responsavel_usuario ru
WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = ru.usuario_id)
   OR NOT EXISTS (SELECT 1 FROM responsaveis r WHERE r.id = ru.responsavel_id);

SELECT COUNT(*) AS sessoes_orfaas FROM sessoes s
WHERE s.usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = s.usuario_id);

SELECT COUNT(*) AS notas_orfas FROM notas n
WHERE NOT EXISTS (SELECT 1 FROM alunos a WHERE a.id = n.aluno_id);

-- 5. Estados por tabela
SELECT (SELECT COUNT(*) FROM usuarios) AS usuarios,
       (SELECT COUNT(*) FROM alunos) AS alunos,
       (SELECT COUNT(*) FROM responsaveis) AS responsaveis,
       (SELECT COUNT(*) FROM sessoes) AS sessoes,
       (SELECT COUNT(*) FROM log_acessos) AS log_acessos,
       (SELECT COUNT(*) FROM autorizacoes_temporarias) AS convites,
       (SELECT COUNT(*) FROM notas) AS notas;
