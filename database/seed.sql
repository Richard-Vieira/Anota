-- dados de exemplo pra testar
-- usuario: marcos@anota.com / senha: 123456 (a senha ta com hash bcrypt)

INSERT INTO usuario (nome, cnpj, email, senha) VALUES
('Marcos Pereira', '45231876000187', 'marcos@anota.com', '$2a$10$CPFEvnZ9af.O4/XthDc5XOZj8ua.NVLI8EVpogKjmOsw76Rz2qt3q');

-- clientes (cpf e cnpj validos, gerei pra teste)
INSERT INTO cliente (usuario_id, nome, documento, email, telefone) VALUES
(1, 'Joana Silva', '52998224725', 'joana.silva@email.com', '(49) 99911-2233'),
(1, 'Carlos Souza', '38190456784', 'carlos.souza@email.com', '(49) 98822-3344'),
(1, 'Construtora Oeste Ltda', '12398765000100', 'contato@construtoraoeste.com.br', '(49) 3322-4455'),
(1, 'Ana Lima', '71423098650', 'ana.lima@email.com', '(49) 99133-5566');

INSERT INTO servico (usuario_id, descricao, valor) VALUES
(1, 'Reboco e acabamento', 1200.00),
(1, 'Assentamento de piso', 1800.00),
(1, 'Pintura', 950.00),
(1, 'Pequenos reparos', 250.00);

-- notas de junho a novembro de 2026
-- as emitidas/enviadas tem numero da nfse, a pendente ainda nao (nao foi emitida)
INSERT INTO nota_fiscal (usuario_id, cliente_id, servico_id, descricao, valor, data_emissao, status, numero_nfse) VALUES
(1, 1, 3, 'Pintura da sala e cozinha', 950.00, '2026-06-05', 'enviada', '000001'),
(1, 3, 1, 'Reboco e acabamento - obra Rua das Flores', 3500.00, '2026-06-20', 'enviada', '000002'),
(1, 2, 4, 'Troca de torneira e conserto de porta', 250.00, '2026-07-08', 'enviada', '000003'),
(1, 4, 2, 'Assentamento de piso no banheiro', 1800.00, '2026-07-25', 'enviada', '000004'),
(1, 3, 2, 'Assentamento de piso - salas comerciais', 4200.00, '2026-08-14', 'enviada', '000005'),
(1, 1, 4, 'Pequenos reparos na area de servico', 300.00, '2026-09-02', 'emitida', '000006'),
(1, 2, 3, 'Pintura externa da casa', 2100.00, '2026-09-28', 'emitida', '000007'),
(1, 4, 1, 'Reboco do muro', 1200.00, '2026-10-10', 'cancelada', '000008'),
(1, 3, 1, 'Reboco e acabamento - fachada', 2800.00, '2026-10-30', 'emitida', '000009'),
(1, 2, 4, 'Pequenos reparos no telhado', 400.00, '2026-11-12', 'pendente', NULL);
