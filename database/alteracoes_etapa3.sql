-- ANota - alteracoes da etapa 3
-- rodar so se o banco ja foi criado com o schema.sql antigo
-- (quem for criar do zero pode usar direto o schema.sql novo, que ja tem isso)

-- numero da NFS-e que volta da emissao
ALTER TABLE nota_fiscal ADD numero_nfse VARCHAR(20);

-- nao pode ter dois usuarios com o mesmo cnpj
ALTER TABLE usuario ADD CONSTRAINT usuario_cnpj_unico UNIQUE (cnpj);

-- coloca numero nas notas que ja tinham sido emitidas antes dessa alteracao
-- (numera em ordem de data, por usuario)
UPDATE nota_fiscal n SET numero_nfse = LPAD(x.seq::text, 6, '0')
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY usuario_id ORDER BY data_emissao, id) AS seq
    FROM nota_fiscal
    WHERE status <> 'pendente'
) x
WHERE n.id = x.id AND n.numero_nfse IS NULL;
