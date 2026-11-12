-- T15 · Endurece as views do Analista (revisão de segurança).
-- security_barrier: o planner não avalia predicado do usuário (ex.: comment::int) antes do
-- filtro por app.merchant_id; sem isso, a mensagem de erro de um cast poderia citar dado de outra loja.
-- work_mem: teto de memória por operação para SQL gerado por modelo.

alter view public.v_sales_daily set (security_barrier = true);
alter view public.v_item_performance set (security_barrier = true);
alter view public.v_reviews set (security_barrier = true);
alter view public.v_item_sales_daily set (security_barrier = true);

alter role analyst_ro set work_mem = '16MB';
