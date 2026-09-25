-- Dados para o smoke do chat (quem tem filho, quem é professor)
SELECT id, email, role FROM usuarios WHERE role IN ('PROFESSOR','RESPONSAVEL','DIRETOR','COORDENADOR','ADMIN','ALUNO') ORDER BY role, id;

SELECT ru.usuario_id, u.email, a.id AS aluno_id, a.nome AS aluno_nome
FROM responsavel_usuario ru
JOIN usuarios u ON u.id = ru.usuario_id
LEFT JOIN alunos a ON a.responsavel_id = ru.responsavel_id OR a.responsavel2_id = ru.responsavel_id
ORDER BY ru.usuario_id, a.id;

SELECT id, nome, matricula FROM alunos ORDER BY id;

SELECT usuario_id, cpf FROM seguranca_usuario;
