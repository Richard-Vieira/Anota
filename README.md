# ANota

Projeto Integrador - Análise e Desenvolvimento de Sistemas

O ANota ajuda o MEI a emitir nota fiscal de serviço falando. O MEI fala (ou digita) num chat algo como *"fiz a pintura da casa da Joana, ficou 1.500 reais"* e o sistema entende o cliente, o serviço e o valor e monta a prévia da nota no formato do DANFSe pra ele só conferir e emitir. Se faltar alguma coisa, o ANota pergunta no próprio chat.

> **Importante:** a emissão da NFS-e é **simulada**. O sistema não manda nada pro governo, só numera a nota e salva no banco. Pra emitir de verdade precisa do certificado digital A1 do MEI.

## Tecnologias

- **Banco:** PostgreSQL
- **Backend:** Node.js + Express (JWT, pdfkit, nodemailer)
- **Frontend:** React + Vite
- **IA:** API do Claude (opcional, sem ela funciona no modo simulado)
- **Voz:** reconhecimento de voz do navegador (Chrome e Edge)
- **APIs públicas:** [ViaCEP](https://viacep.com.br) (endereço pelo CEP) e [BrasilAPI](https://brasilapi.com.br) (dados da empresa pelo CNPJ), chamadas pelo backend

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

Se já tinha o banco das etapas anteriores, roda só as alterações que faltam, em ordem: `database/alteracoes_etapa3.sql` e depois `database/alteracoes_etapa4.sql`.

### 2. Backend

```
cd backend
cp .env.example .env
npm install
npm start
```

No `.env` troca o `DB_PASSWORD` pela senha do seu postgres e coloca um texto qualquer no `JWT_SECRET`. A API roda em http://localhost:3001.

No `.env` também coloca um texto grande e aleatório no `CRIPTO_CHAVE` (é a chave que criptografa a senha do e-mail salva em Configurações). Pra gerar uma:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Opcionais no `.env`:
- `IA_API_KEY`: chave da API do Claude. Sem ela o sistema usa a interpretação simulada (busca de palavras).
- `SMTP_*`: e-mail padrão do sistema.

O e-mail das notas sai assim: primeiro o SMTP que o usuário salvou em **Configurações > E-mail**; se não tiver, o `SMTP_*` do `.env`; se não tiver nenhum, vai pra uma caixa de teste do [Ethereal](https://ethereal.email) e a tela mostra um link pra ver.

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

O seed também cria os dados do prestador, 4 clientes com endereço, 4 serviços com código de tributação (07.02.01 e 07.05.01) e palavras-chave, e 10 notas.

## Telas

- **Login e Criar conta**
- **Nova nota (chat):** a pessoa fala no microfone (o texto vai aparecendo enquanto fala) ou digita e clica em **Gerar prévia**. O ANota responde com a prévia no formato do DANFSe. Se faltar o cliente, o serviço ou o valor, ele pergunta e a resposta completa a mesma nota. Se o cliente não existir, oferece cadastrar ali mesmo com o CPF/CNPJ. Depois de emitir aparecem os botões de PDF, e-mail e WhatsApp
- **Notas:** filtro por mês, ano, situação e cliente; total faturado, quantidade e ticket médio do período; total do ano com a barra do limite do MEI; gráfico por mês (clicar no mês filtra); pergunta sobre o faturamento; e o detalhe de cada nota no formato do DANFSe
- **Clientes:** pessoa física ou jurídica, com endereço. O CEP preenche o endereço (ViaCEP) e, pra pessoa jurídica, o botão **Buscar pelo CNPJ** preenche nome e endereço (BrasilAPI)
- **Serviços:** descrição, código de tributação nacional (00.00.00), descrição do código, NBS, valor padrão e palavras-chave (usadas pra reconhecer o serviço no que a pessoa fala)
- **Configurações** (no menu do nome do usuário): **Meus dados** (dados do prestador que vão na nota, com busca por CNPJ e CEP) e **E-mail** (SMTP próprio, com e-mail de teste)

### Prévia e PDF no padrão do DANFSe

A prévia do chat, o detalhe da nota e o PDF seguem os blocos do DANFSe da NFS-e Nacional (Nota Técnica 008/2026): cabeçalho, dados da NFS-e (chave de acesso, número, competência, data/hora, DPS), prestador, tomador, serviço prestado, valor total e informações complementares. A chave de acesso de 50 números é **simulada** e só é gerada na emissão. Os impostos não são calculados (o MEI paga o ISS no DAS).

### Como o ANota entende o texto

- **Com `IA_API_KEY`:** a IA recebe o texto, os clientes e os serviços (com código e palavras-chave) e devolve um JSON que o backend confere antes de usar.
- **Sem chave (interpretação simulada):** é uma leitura do texto, não uma IA. Procura o nome dos clientes, as palavras-chave dos serviços e o valor, inclusive por extenso ("mil e oitocentos"). Também acha CPF/CNPJ falado com espaços e nome de cliente que ainda não está cadastrado ("casa do Pedro Alves").

A prévia mostra discretamente qual dos dois foi usado.

## API

Depois do login todas as rotas precisam do header `Authorization: Bearer <token>`.

| Método | Rota | O que faz |
|--------|------|-----------|
| POST | /cadastro | cria a conta |
| POST | /login | entra e devolve o token |
| GET, PUT | /configuracoes/dados | dados do prestador (Meus dados) |
| GET, PUT | /configuracoes/email | SMTP do usuário (a senha nunca volta) |
| POST | /configuracoes/email/teste | manda um e-mail de teste |
| GET | /consulta/cep/:cep | endereço pelo CEP (ViaCEP) |
| GET | /consulta/cnpj/:cnpj | dados da empresa (BrasilAPI) |
| GET, POST | /clientes | lista e cadastra clientes |
| PUT, DELETE | /clientes/:id | altera e exclui cliente |
| GET, POST | /servicos | lista e cadastra serviços |
| PUT, DELETE | /servicos/:id | altera e exclui serviço |
| GET, POST | /notas | lista (filtros `ano`, `mes`, `status`, `busca`) e cria notas |
| GET | /notas/:id | nota completa (dados do DANFSe) |
| POST | /notas/interpretar | entende o texto do chat (manda o `rascunho` pra continuar a mesma nota) |
| POST | /notas/:id/emitir | emite a nota (simulado) |
| GET | /notas/:id/pdf | baixa o PDF |
| POST | /notas/:id/enviar-email | manda a nota por e-mail |
| GET | /faturamento | total do ano, por mês e resumo do período (`mes`, `busca`) |
| POST | /faturamento/perguntar | responde perguntas sobre o faturamento |

Todas as rotas validam os dados no backend (CPF/CNPJ, CEP com 8 números, código de tributação com 6 números, UF com 2 letras) e as consultas no banco usam parâmetros e filtram pelo usuário do token.

Pra testar no Postman importa `docs/anota.postman_collection.json` e roda primeiro o **Login** (ele já salva o token).

## Uso de IA no desenvolvimento

Algumas partes do código foram ajustadas com ajuda de IA (estão marcadas com o comentário `// ajustado com IA para melhorar o codigo`), e a IA também foi usada pra refatorar o visual das telas.

## Próximos passos

- [ ] Emitir a NFS-e de verdade na API nacional (precisa do certificado digital A1)
- [ ] Mensagem do e-mail e do WhatsApp escrita pela IA
- [ ] Guardar os dados do prestador e do cliente na nota no momento da emissão (hoje o DANFSe mostra os dados atuais do cadastro)
