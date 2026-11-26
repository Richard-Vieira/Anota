-- ANota - alteracoes da etapa 4
-- rodar so se o banco ja foi criado com o schema.sql da etapa 3
-- (quem for criar do zero pode usar direto o schema.sql novo, que ja tem tudo isso)

-- =============== DADOS DO PRESTADOR (tela Configuracoes > Meus dados) ===============
-- sao os dados que aparecem no bloco "Prestador" do DANFSe
ALTER TABLE usuario ADD inscricao_municipal VARCHAR(20);
ALTER TABLE usuario ADD telefone VARCHAR(20);
ALTER TABLE usuario ADD cep VARCHAR(8);
ALTER TABLE usuario ADD endereco VARCHAR(150);
ALTER TABLE usuario ADD numero VARCHAR(10);
ALTER TABLE usuario ADD bairro VARCHAR(80);
ALTER TABLE usuario ADD municipio VARCHAR(80);
ALTER TABLE usuario ADD uf CHAR(2);
ALTER TABLE usuario ADD codigo_ibge VARCHAR(7);

-- =============== CONFIGURACAO DE E-MAIL (tela Configuracoes > E-mail) ===============
-- um registro por usuario. A senha fica criptografada (AES, chave CRIPTO_CHAVE do .env)
CREATE TABLE config_email (
    usuario_id INT PRIMARY KEY REFERENCES usuario(id),
    smtp_host VARCHAR(100) NOT NULL,
    smtp_porta INT NOT NULL DEFAULT 587,
    smtp_usuario VARCHAR(100) NOT NULL,
    smtp_senha TEXT,
    nome_remetente VARCHAR(100)
);

-- dados de exemplo do usuario de teste (marcos@anota.com)
UPDATE usuario SET inscricao_municipal = '123456', telefone = '(49) 99800-1122', cep = '89801000',
    endereco = 'Avenida Getúlio Dorneles Vargas', numero = '1500', bairro = 'Centro',
    municipio = 'Chapecó', uf = 'SC', codigo_ibge = '4204202'
WHERE email = 'marcos@anota.com';
