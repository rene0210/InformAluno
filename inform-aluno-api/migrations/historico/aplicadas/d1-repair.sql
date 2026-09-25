UPDATE usuarios SET senha = 'informaluno123' WHERE id IN (60,64,66,67,68,73,74,75,80);
SELECT id, email, role, senha FROM usuarios ORDER BY id;
SELECT id, nome, cpf, matricula FROM alunos ORDER BY id;
SELECT * FROM sessoes WHERE usuario_id IN (85,86);
SELECT id, usuario_id, tipo, criado_em FROM log_acessos WHERE usuario_id IN (85,86);
SELECT * FROM autorizacoes_temporarias;
