-- Resumir avisos existentes para caber em 100 caracteres
UPDATE public.hr_announcements SET message = 'Promo Parmê em dobro não vale em feriados/fds. Yolo só dom no jantar. Confiram cardápio iFood.' WHERE id = '4444f29d-9bae-49d6-ad10-6ad358eb8eea';
UPDATE public.hr_announcements SET message = 'Hoje celebramos quem faz tudo acontecer. Obrigado pela dedicação de cada um! ❤️' WHERE id = '640b4c21-e076-4136-91aa-9a7c13f58f73';
UPDATE public.hr_announcements SET message = 'Cadastre a facial, bata o ponto certo, leia/assine documentos e veja notificações no app.' WHERE id = '619b3dd8-b476-4b1b-9d6d-268e939aaa0a';
UPDATE public.hr_announcements SET message = 'Avise problemas da loja e reclamações de cliente: ajuda a equipe a achar solução. 🙏❤️' WHERE id = '6e54eb11-f22d-4c81-a169-79a1fc3f1ec1';
UPDATE public.hr_announcements SET message = 'Quebrou ou precisa de conserto? Abra no sistema de manutenção e volte para ver a instrução. 🛠️' WHERE id = '2b5d4980-1cc9-4a62-92b7-a3189703724a';
UPDATE public.hr_announcements SET message = 'Use sempre o grupo certo para dúvidas e avisos. Nada individual: todos aprendem juntos. ❤️🙏' WHERE id = 'cbc74a84-55f0-4d3b-8acf-fc9496a3c2aa';
UPDATE public.hr_announcements SET message = 'Antes de abrir o iFood: confira insumos, preparos, validade e equipamentos. Evite atrasos. 🚀' WHERE id = '138ab977-95f7-4587-9ee1-96e938433261';
UPDATE public.hr_announcements SET message = 'Preencha o check-list com atenção e na hora certa: garante padrão e evita problemas. ✔️🍽️' WHERE id = '300cd775-ffac-48fa-a062-65dd91cc7d32';
UPDATE public.hr_announcements SET message = 'Não jogue restos de comida no ralo. Recolha e descarte no lixo: evita entupimento. 🧹' WHERE id = 'ea6b520b-f6a8-4566-9f12-9d3cc37568c3';
UPDATE public.hr_announcements SET message = 'A bonificação reconhece esforço alinhado às metas e valores da empresa. Vamos juntos! 💪🚀' WHERE id = 'a669f733-c4b4-4dbb-99b6-91b3c6832c58';
UPDATE public.hr_announcements SET message = 'Problema na loja? Avise no grupo. Todos cientes, alguém pode ajudar a resolver. ❤️🙌' WHERE id = '7249cc9f-9a9c-4d9a-9715-9de0ecfe04ff';
UPDATE public.hr_announcements SET message = 'Respeito, cordialidade, horário e diálogo. Pequenas atitudes mantêm o ambiente bom. 🚀❤️' WHERE id = 'd54a7f23-c46d-413c-813a-a5c39000b446';
UPDATE public.hr_announcements SET message = 'Sem celular pessoal no trabalho. 📵 Mantenha o foco e priorize suas atividades. 🙏' WHERE id = '333a5817-9627-4e43-86e6-aa0b2bd57c52';
UPDATE public.hr_announcements SET message = 'Proibido música na cozinha. No salão, música baixa e tranquila para conforto do cliente. 🙌' WHERE id = '4b7e25d8-d757-4b5e-9c02-091d90ab0a3c';
UPDATE public.hr_announcements SET message = 'Cuidado ao fechar portas. Trilhos limpos e nada no caminho. Problema? Avise no grupo. 📢' WHERE id = '07883b71-35f2-4c4e-b6a9-ae666c12ddc4';
UPDATE public.hr_announcements SET message = 'Conferência de pedidos: leia comanda (C/F/I), confira no preparo e no despacho. ✅' WHERE id = 'a120007c-71ae-42d4-b79b-bf33dbcfeb6e';
UPDATE public.hr_announcements SET message = 'Devolva utensílios à fábrica higienizados e sem etiqueta. Onde teve óleo, lave caprichado. 🍽️' WHERE id = '33b7fd13-368b-466c-b806-4aa497369bac';
UPDATE public.hr_announcements SET message = 'Devolva itens não usados, confira validade. Organização do estoque é sua responsabilidade. 🚀' WHERE id = '86ef832f-83bb-4058-a9bf-5ecbf7614eae';
UPDATE public.hr_announcements SET message = 'Aquela Parmê está em nova fase: mais ágil, moderna e organizada. Contamos com você! 🚀💡' WHERE id = '2dcb1b5a-45bd-4035-946e-b05d1c5952e4';

-- Validação por trigger (CHECK não é ideal aqui? na verdade é immutable, ok). Usar CHECK simples.
ALTER TABLE public.hr_announcements
  ADD CONSTRAINT hr_announcements_message_max_100 CHECK (char_length(message) <= 100);