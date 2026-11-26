# ANota

Projeto Integrador - Análise e Desenvolvimento de Sistemas

O ANota ajuda o MEI a emitir nota fiscal de serviço falando. O MEI grava algo como *"fiz a pintura da casa da Joana, ficou 1.500 reais"* e o sistema entende o cliente, o serviço e o valor e monta a nota pra ele só conferir e emitir.

> **Importante:** a emissão da NFS-e é **simulada**. O sistema não manda nada pro governo, só numera a nota e salva no banco. Pra emitir de verdade precisa do certificado digital A1 do MEI.

## Tecnologias

- **Banco:** PostgreSQL
- **Backend:** Node.js + Express (JWT, pdfkit, nodemailer)
- **Frontend:** React + Vite
- **IA:** API do Claude (opcional, sem ela funciona no modo simulado)
- **Voz:** reconhecimento de voz do navegador (Chrome e Edge)

## Pastas

```
database/   -> scripts do banco (schema, seed e alterações)
backend/    -> API (server.js e os arquivos de IA, PDF, e-mail e login)
frontend/   -> telas em React
docs/       -> wireframes e coleção do Postman
```

## Como rodar

### 1. Banco

Com o PostgreSQL rodando:

```
createdb -U postgres anota
psql -U postgres -d anota -f database/schema.sql
psql -U postgres -d anota -f database/seed.sql
```

Se já tinha o banco da etapa 2, roda só o `database/alteracoes_etapa3.sql`.

### 2. Backend

```
cd backend
cp .env.example .env
npm install
npm start
```

No `.env` troca o `DB_PASSWORD` pela senha do seu postgres e coloca um texto qualquer no `JWT_SECRET`. A API roda em http://localhost:3001.

Opcionais no `.env`:
- `IA_API_KEY`: chave da API do Claude. Sem ela o sistema usa a busca de palavras.
- `SMTP_*`: dados do e-mail. Sem eles o e-mail vai pra uma caixa de teste do [Ethereal](https://ethereal.email) e a tela mostra um link pra ver.

### 3. Frontend

Em outro terminal:

```
cd frontend
npm install
npm run dev
```

Abre http://localhost:5173.

### Usuário de teste

- **E-mail:** marcos@anota.com
- **Senha:** 123456

O seed também cria 4 clientes, 4 serviços e 10 notas.

## Telas

- **Login e Criar conta**
- **Nova nota:** grava o áudio, mostra o que você disse com o cliente, o serviço e o valor destacados, e a prévia da nota pra emitir
- **Notas:** total faturado no ano, % do limite do MEI, gráfico por mês, pergunta sobre o faturamento e a lista das notas (PDF, e-mail e WhatsApp)
- **Clientes e Serviços:** lista com busca e o formulário de cadastro

Os prints estão em [docs/wireframes](docs/wireframes).

## API

Depois do login todas as rotas precisam do header `Authorization: Bearer <token>`.

| Método | Rota | O que faz |
|--------|------|-----------|
| POST | /cadastro | cria a conta |
| POST | /login | entra e devolve o token |
| GET, POST | /clientes | lista e cadastra clientes |
| PUT, DELETE | /clientes/:id | altera e exclui cliente |
| GET, POST | /servicos | lista e cadastra serviços |
| PUT, DELETE | /servicos/:id | altera e exclui serviço |
| GET, POST | /notas | lista e cria notas |
| POST | /notas/interpretar | entende o texto falado |
| POST | /notas/:id/emitir | emite a nota (simulado) |
| GET | /notas/:id/pdf | baixa o PDF |
| POST | /notas/:id/enviar-email | manda a nota por e-mail |
| GET | /faturamento | total do ano e por mês |
| POST | /faturamento/perguntar | responde perguntas sobre o faturamento |

Pra testar no Postman importa `docs/anota.postman_collection.json` e roda primeiro o **Login** (ele já salva o token).

## Próximos passos

- [ ] Emitir a NFS-e de verdade na API nacional
- [ ] Mensagem do e-mail e do WhatsApp escrita pela IA
- [ ] Testes finais de todas as telas e rotas
