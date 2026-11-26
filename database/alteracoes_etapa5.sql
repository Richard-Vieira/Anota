-- etapa 5: valor do servico passa a ser opcional
-- (quem cobra diferente a cada servico deixa vazio e fala o valor na hora da nota)
ALTER TABLE servico ALTER COLUMN valor DROP NOT NULL;
