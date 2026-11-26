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

-- =============== SERVICOS COM CODIGO DE TRIBUTACAO ===============
-- codigo_tributacao = codigo de tributacao nacional da NFS-e (6 numeros, mostra como 00.00.00)
--   a tabela oficial fica no portal da NFS-e (https://www.gov.br/nfse), o sistema so confere o formato
-- codigo_nbs = Nomenclatura Brasileira de Servicos (9 numeros, opcional)
-- palavras_chave = palavras separadas por virgula pra reconhecer o servico no que o usuario fala
ALTER TABLE servico ADD codigo_tributacao VARCHAR(6);
ALTER TABLE servico ADD descricao_codigo VARCHAR(300);
ALTER TABLE servico ADD codigo_nbs VARCHAR(9);
ALTER TABLE servico ADD palavras_chave TEXT;

-- codigos dos servicos de exemplo do usuario de teste
-- construcao civil e reformas = subitens 7.02 e 7.05 da LC 116
UPDATE servico SET codigo_tributacao = '070201',
    descricao_codigo = 'Execução, por administração, empreitada ou subempreitada, de obras de construção civil, hidráulica ou elétrica e de outras obras semelhantes',
    palavras_chave = 'reboco, rebocar, rebocou, acabamento, massa, fachada, muro'
WHERE descricao = 'Reboco e acabamento' AND usuario_id = (SELECT id FROM usuario WHERE email = 'marcos@anota.com');

UPDATE servico SET codigo_tributacao = '070201',
    descricao_codigo = 'Execução, por administração, empreitada ou subempreitada, de obras de construção civil, hidráulica ou elétrica e de outras obras semelhantes',
    palavras_chave = 'piso, assentei, assentar, assentamento, porcelanato, cerâmica, azulejo'
WHERE descricao = 'Assentamento de piso' AND usuario_id = (SELECT id FROM usuario WHERE email = 'marcos@anota.com');

UPDATE servico SET codigo_tributacao = '070501',
    descricao_codigo = 'Reparação, conservação e reforma de edifícios, estradas, pontes, portos e congêneres',
    palavras_chave = 'pintura, pintei, pintar, pintou, tinta, parede'
WHERE descricao = 'Pintura' AND usuario_id = (SELECT id FROM usuario WHERE email = 'marcos@anota.com');

UPDATE servico SET codigo_tributacao = '070501',
    descricao_codigo = 'Reparação, conservação e reforma de edifícios, estradas, pontes, portos e congêneres',
    palavras_chave = 'reparo, conserto, consertei, arrumei, torneira, porta, telhado, troca'
WHERE descricao = 'Pequenos reparos' AND usuario_id = (SELECT id FROM usuario WHERE email = 'marcos@anota.com');
