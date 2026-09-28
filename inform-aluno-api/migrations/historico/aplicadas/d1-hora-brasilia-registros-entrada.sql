-- ============================================================================
-- d1-hora-brasilia-registros-entrada.sql   (aplicada em 2026-09-28)
-- ============================================================================
-- Problema: `registros_entrada.data_hora` usava o DEFAULT CURRENT_TIMESTAMP do
-- SQLite, que devolve UTC. Consequências observadas:
--   * o feed da diretoria mostrava 13:36 quando eram 10:36 (3h adiantado);
--   * o "dia de hoje" (DATE('now')) virava às 21h da noite, então quem entrava
--     às 20h50 e saía às 21h10 ganhava um 2º CHECKIN em vez de CHECKOUT;
--   * o e-mail da van, que já falava em America/Sao_Paulo, mostrava horário
--     diferente do banco — mensagem e registro pareciam de pessoas distintas.
--
-- Correção de código (já aplicada): gravação e consultas de "hoje" passaram a
-- usar America/Sao_Paulo (UTC-3 fixo — Brasil extinguiu o horário de verão em
-- 2019), centralizados em `formatarBrasilia()`/`hojeBrasilia()` em index.ts.
--
-- Esta migração apenas corrige o HISTÓRICO já gravado em UTC.
--
-- ATENÇÃO — NÃO REEXECUTAR: as linhas com id <= 48 nasceram em UTC; as de id
-- 49 em diante já nasceram em horário de Brasília e seriam deslocadas 3h para
-- trás de novo. O corte é fixo e deliberado (última linha do código antigo).
-- ============================================================================

UPDATE registros_entrada
   SET data_hora = strftime('%Y-%m-%d %H:%M:%S', data_hora, '-3 hours')
 WHERE id <= 48;
