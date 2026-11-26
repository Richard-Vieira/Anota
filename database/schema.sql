-- ANota - script de criacao do banco
-- rodar primeiro esse e depois o seed.sql

DROP TABLE IF EXISTS config_email;
DROP TABLE IF EXISTS nota_fiscal;
DROP TABLE IF EXISTS servico;
DROP TABLE IF EXISTS cliente;
DROP TABLE IF EXISTS usuario;

-- usuario = o MEI que usa o sistema (e o prestador que aparece na nota)
CREATE TABLE usuario (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cnpj VARCHAR(14) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    inscricao_municipal VARCHAR(20),
    telefone VARCHAR(20),
    cep VARCHAR(8),
    endereco VARCHAR(150),
    numero VARCHAR(10),
    bairro VARCHAR(80),
    municipio VARCHAR(80),
    uf CHAR(2),
    codigo_ibge VARCHAR(7)
);

-- configuracao do e-mail de cada usuario (a senha fica criptografada com a CRIPTO_CHAVE do .env)
CREATE TABLE config_email (
    usuario_id INT PRIMARY KEY REFERENCES usuario(id),
    smtp_host VARCHAR(100) NOT NULL,
    smtp_porta INT NOT NULL DEFAULT 587,
    smtp_usuario VARCHAR(100) NOT NULL,
    smtp_senha TEXT,
    nome_remetente VARCHAR(100)
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
-- codigo_tributacao = codigo de tributacao nacional da NFS-e (6 numeros, ex: 070201 = 07.02.01)
-- codigo_nbs = Nomenclatura Brasileira de Servicos (9 numeros, opcional)
-- palavras_chave = separadas por virgula, usadas pra achar o servico no que o usuario fala
CREATE TABLE servico (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL REFERENCES usuario(id),
    descricao VARCHAR(150) NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    codigo_tributacao VARCHAR(6) NOT NULL,
    descricao_codigo VARCHAR(300),
    codigo_nbs VARCHAR(9),
    palavras_chave TEXT
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
