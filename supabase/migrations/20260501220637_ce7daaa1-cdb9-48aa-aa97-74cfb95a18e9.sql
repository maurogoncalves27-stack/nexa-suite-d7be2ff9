-- Remover cadastro de teste "LILIAN LIMA TESTE" que estava em employees como FREELANCER
-- (a super-usuária já tem acesso garantido via is_super_user)
DELETE FROM public.employees WHERE id = 'f276e399-2409-434c-989a-293fe203bdfb';