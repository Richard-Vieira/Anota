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

-- =============== CLIENTES COM ENDERECO ===============
-- tipo: PF = pessoa fisica (CPF) ou PJ = pessoa juridica (CNPJ)
ALTER TABLE cliente ADD tipo CHAR(2) NOT NULL DEFAULT 'PF';
ALTER TABLE cliente ADD cep VARCHAR(8);
ALTER TABLE cliente ADD endereco VARCHAR(150);
ALTER TABLE cliente ADD numero VARCHAR(10);
ALTER TABLE cliente ADD bairro VARCHAR(80);
ALTER TABLE cliente ADD municipio VARCHAR(80);
ALTER TABLE cliente ADD uf CHAR(2);
ALTER TABLE cliente ADD codigo_ibge VARCHAR(7);
ALTER TABLE cliente ADD CONSTRAINT cliente_tipo_valido CHECK (tipo IN ('PF', 'PJ'));

-- o email do cliente deixou de ser obrigatorio (da pra cadastrar so com nome e CPF/CNPJ no chat)
-- (no banco ele ja aceitava vazio, so a api que exigia)

-- quem ja tinha CNPJ (14 numeros) vira pessoa juridica
UPDATE cliente SET tipo = 'PJ' WHERE LENGTH(documento) = 14;

-- enderecos dos clientes de exemplo do usuario de teste
UPDATE cliente SET cep = '89801140', endereco = 'Rua Sete de Setembro - D', numero = '320', bairro = 'Centro', municipio = 'Chapecó', uf = 'SC', codigo_ibge = '4204202'
WHERE documento = '52998224725' AND usuario_id = (SELECT id FROM usuario WHERE email = 'marcos@anota.com');
UPDATE cliente SET cep = '89812650', endereco = 'Rua Marechal Cândido Rondon - D', numero = '1045', bairro = 'Esplanada', municipio = 'Chapecó', uf = 'SC', codigo_ibge = '4204202'
WHERE documento = '38190456784' AND usuario_id = (SELECT id FROM usuario WHERE email = 'marcos@anota.com');
UPDATE cliente SET cep = '89820000', endereco = 'Rua Victor Konder', numero = '88', bairro = 'Centro', municipio = 'Xanxerê', uf = 'SC', codigo_ibge = '4219507'
WHERE documento = '12398765000100' AND usuario_id = (SELECT id FROM usuario WHERE email = 'marcos@anota.com');
UPDATE cliente SET cep = '89803052', endereco = 'Rua Sete de Setembro - E', numero = '77', bairro = 'São Cristóvão', municipio = 'Chapecó', uf = 'SC', codigo_ibge = '4204202'
WHERE documento = '71423098650' AND usuario_id = (SELECT id FROM usuario WHERE email = 'marcos@anota.com');

-- =============== DADOS DA NFS-e NO PADRAO DO DANFSe ===============
-- competencia = mes/ano em que o servico foi feito (salva como o dia 1 do mes)
-- chave_acesso = 50 numeros (SIMULADA, gerada na emissao):
--   municipio IBGE (7) + ambiente gerador (1) + tipo de inscricao (1) + CNPJ (14) + numero da NFS-e (13)
--   + ano/mes AAMM (4) + codigo numerico (9) + digito verificador (1)
-- numero_dps / serie_dps = a DPS e a "declaracao" que o prestador manda e vira a NFS-e
ALTER TABLE nota_fiscal ADD competencia DATE;
ALTER TABLE nota_fiscal ADD data_hora_emissao TIMESTAMP;
ALTER TABLE nota_fiscal ADD chave_acesso VARCHAR(50);
ALTER TABLE nota_fiscal ADD numero_dps INT;
ALTER TABLE nota_fiscal ADD serie_dps VARCHAR(5);

-- notas antigas: competencia = mes da data, e as emitidas ganham os dados da emissao
UPDATE nota_fiscal SET competencia = DATE_TRUNC('month', COALESCE(data_emissao, CURRENT_DATE))::date WHERE competencia IS NULL;
UPDATE nota_fiscal SET data_hora_emissao = data_emissao + TIME '09:00', numero_dps = numero_nfse::int, serie_dps = '00001'
WHERE numero_nfse IS NOT NULL AND data_hora_emissao IS NULL;

-- chave de acesso simulada das notas que ja estavam emitidas
-- o digito verificador e o modulo 11 (pesos 2 a 9 da direita pra esquerda), igual o backend faz
UPDATE nota_fiscal n SET chave_acesso = x.base || x.dv
FROM (
    SELECT b.id, b.base,
           (CASE WHEN 11 - (SUM(SUBSTR(b.base, i, 1)::int * (2 + ((49 - i) % 8))) % 11) >= 10 THEN 0
                 ELSE 11 - (SUM(SUBSTR(b.base, i, 1)::int * (2 + ((49 - i) % 8))) % 11) END)::text AS dv
    FROM (
        SELECT n2.id,
               LPAD(COALESCE(u.codigo_ibge, '0'), 7, '0') || '2' || '2' || LPAD(u.cnpj, 14, '0') ||
               LPAD(n2.numero_nfse, 13, '0') || TO_CHAR(n2.data_emissao, 'YYMM') || LPAD(((n2.id * 7919) % 1000000000)::text, 9, '0') AS base
        FROM nota_fiscal n2 JOIN usuario u ON u.id = n2.usuario_id
        WHERE n2.numero_nfse IS NOT NULL AND n2.chave_acesso IS NULL
    ) b
    CROSS JOIN generate_series(1, 49) i
    GROUP BY b.id, b.base
) x
WHERE n.id = x.id;

ALTER TABLE nota_fiscal ALTER COLUMN competencia SET DEFAULT DATE_TRUNC('month', CURRENT_DATE);
