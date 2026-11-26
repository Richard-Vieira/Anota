-- ANota - script de criacao do banco
-- rodar primeiro esse e depois o seed.sql

DROP TABLE IF EXISTS nota_fiscal;
DROP TABLE IF EXISTS servico;
DROP TABLE IF EXISTS cliente;
DROP TABLE IF EXISTS usuario;

-- usuario = o MEI que usa o sistema
CREATE TABLE usuario (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cnpj VARCHAR(14) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL
);

-- clientes do MEI (documento pode ser cpf ou cnpj, so numeros)
CREATE TABLE cliente (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL REFERENCES usuario(id),
    nome VARCHAR(100) NOT NULL,
    documento VARCHAR(14) NOT NULL,
    email VARCHAR(100),
    telefone VARCHAR(20)
);

-- servicos que o MEI faz
CREATE TABLE servico (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL REFERENCES usuario(id),
    descricao VARCHAR(150) NOT NULL,
    valor DECIMAL(10,2) NOT NULL
);

-- notas fiscais
-- status: pendente, emitida, enviada (mandou pro cliente) ou cancelada
-- numero_nfse: numero que volta quando emite (etapa 3)
CREATE TABLE nota_fiscal (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL REFERENCES usuario(id),
    cliente_id INT NOT NULL REFERENCES cliente(id),
    servico_id INT NOT NULL REFERENCES servico(id),
    descricao TEXT,
    valor DECIMAL(10,2) NOT NULL,
    data_emissao DATE,
    status VARCHAR(20) DEFAULT 'pendente',
    numero_nfse VARCHAR(20)
);
