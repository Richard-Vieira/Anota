# ANota

Projeto Integrador - Análise e Desenvolvimento de Sistemas

O ANota é um sistema web pra ajudar o MEI a emitir nota fiscal de serviço (NFS-e) falando. A ideia é o MEI gravar um áudio tipo "fiz a pintura da casa da Joana, ficou 1.500 reais" e o sistema, com ajuda de IA, entender quem é o cliente, qual foi o serviço e o valor, e já montar a nota pra ele só conferir e emitir.

> **Como está na etapa 3:**
> - **Áudio:** a tela Nova nota tem um botão de microfone que usa o reconhecimento de voz do próprio navegador (Web Speech API, funciona no Chrome e no Edge). Se o navegador não suportar, dá pra digitar.
> - **IA:** se tiver a chave `IA_API_KEY` no `.env`, o sistema usa a API do Claude (Anthropic) pra entender o pedido e responder perguntas sobre o faturamento. **Sem a chave tudo continua funcionando** no modo simulado (busca de palavras).
> - **NFS-e:** a emissão continua **SIMULADA**. Não manda nada pro governo, só gera o próximo número da nota, salva no banco e muda o status pra `emitida`. A emissão de verdade precisa do certificado digital A1 do MEI e do credenciamento no ambiente de Produção Restrita do Sistema Nacional da NFS-e.
> - **E-mail:** se tiver SMTP no `.env` manda de verdade. **Sem SMTP usa uma conta de teste do Ethereal** (o e-mail não chega no cliente, mas a API devolve um link pra ver como ficou).

## Tecnologias

- Banco: PostgreSQL
- Backend: Node.js + Express
  - `pg` pra conectar no banco
  - `bcryptjs` pra senha
  - `jsonwebtoken` pro login com token (JWT)
  - `pdfkit` pra gerar o PDF da nota
  - `nodemailer` pra mandar o e-mail
- IA: API do Claude (Anthropic), chamada com `fetch` direto (sem SDK)
- Frontend: React + Vite + react-router (gráfico feito só com div e CSS, sem biblioteca)

## Estrutura

```
anota/
  database/
    schema.sql              -> criação das tabelas
    seed.sql                -> dados de exemplo
    alteracoes_etapa3.sql   -> ALTER TABLE pra quem já tinha o banco da etapa 2
  backend/
    server.js     -> rotas da API
    db.js         -> conexão com o banco
    validacoes.js -> validações (CPF, CNPJ, email, valor)
    auth.js       -> token JWT e o middleware que confere o token
    ia.js         -> IA (Claude) e a interpretação simulada
    pdf.js        -> gera o PDF da nota
    email.js      -> envio de e-mail
  frontend/
    src/api.js    -> função que chama a API mandando o token
    src/pages/    -> telas (Login, Cadastro, NovaNota, Notas, Clientes, Servicos)
  docs/
    wireframes/   -> prints das telas
    anota.postman_collection.json
```

## Como criar o banco

1. Ter o PostgreSQL instalado e rodando
2. Criar o banco:
   ```
   createdb -U postgres anota
   ```
   (ou pelo pgAdmin: botão direito em Databases > Create > Database, nome `anota`)
3. Rodar os scripts, nessa ordem:
   ```
   psql -U postgres -d anota -f database/schema.sql
   psql -U postgres -d anota -f database/seed.sql
   ```
   No pgAdmin dá pra abrir o Query Tool, colar o conteúdo de cada arquivo e executar.

O seed cria o usuário de teste:

- **Email:** marcos@anota.com
- **Senha:** 123456

E também 4 clientes, 4 serviços e 10 notas de junho a novembro de 2026.

Obs: o `schema.sql` apaga as tabelas antes de criar, então se rodar de novo perde os dados.

### Já tinha o banco da etapa 2?

Não precisa apagar. Roda só o script de alteração:

```
psql -U postgres -d anota -f database/alteracoes_etapa3.sql
```

Ele cria a coluna `numero_nfse` na `nota_fiscal`, coloca `UNIQUE` no CNPJ do usuário e numera as notas que já estavam emitidas.

## Dados de conexão

Ficam no arquivo `backend/.env`. Tem um exemplo em `backend/.env.example`, é só copiar:

```
cd backend
cp .env.example .env
```

| Variável    | O que é                  | Padrão     |
|-------------|--------------------------|------------|
| DB_HOST     | endereço do postgres     | localhost  |
| DB_PORT     | porta do postgres        | 5432       |
| DB_USER     | usuário do banco         | postgres   |
| DB_PASSWORD | senha do banco           | postgres   |
| DB_NAME     | nome do banco            | anota      |
| PORT        | porta que a API vai rodar | 3001      |
| JWT_SECRET  | segredo pra assinar o token do login (**obrigatório**) | - |
| JWT_EXPIRA  | quanto tempo o login vale | 8h |
| IA_API_KEY  | chave da API do Claude (opcional) | vazio = simulado |
| IA_MODELO   | modelo do Claude | claude-opus-5-5 |
| SMTP_HOST   | servidor de e-mail (opcional) | vazio = Ethereal |
| SMTP_PORT   | porta do SMTP | 587 |
| SMTP_USER   | usuário do SMTP | - |
| SMTP_PASS   | senha do SMTP | - |
| SMTP_FROM   | remetente (se vazio usa o SMTP_USER) | - |

Troca o `DB_PASSWORD` pela senha que você colocou quando instalou o postgres e coloca qualquer texto grande no `JWT_SECRET`.

### Configurar a IA (opcional)

1. Criar uma conta em https://platform.claude.com e gerar uma API key
2. Colocar no `.env`:
   ```
   IA_API_KEY=sua-chave-aqui
   IA_MODELO=claude-opus-5-5
   ```
3. Reiniciar o backend. Quando sobe aparece `IA: usando a API do Claude`.

O `ia.js` manda pro Claude o texto falado + a lista de clientes e serviços do usuário e pede a resposta **só em JSON** (`cliente_id`, `servico_id`, `valor`, `descricao`, `faltando`). Antes de usar, o backend confere se os ids existem e são do usuário e se o valor é maior que zero. Se a chave estiver errada, a internet cair ou a resposta vier estranha, ele usa a interpretação simulada sozinho. A resposta sempre diz de onde veio no campo `origem` (`ia` ou `simulacao`).

**Sem a chave tudo funciona no modo simulado.**

### Configurar o e-mail (opcional)

Coloca os dados do SMTP no `.env` (exemplo com Gmail, precisa criar uma "senha de app" na conta Google):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seuemail@gmail.com
SMTP_PASS=senha-de-app
```

**Sem SMTP** o sistema cria sozinho uma conta de teste no [Ethereal](https://ethereal.email). O e-mail não chega no cliente, mas a resposta da API (e a tela Notas) mostra um link pra ver o e-mail com o PDF anexado. Precisa de internet.

## Como rodar o backend

```
cd backend
npm install
npm start
```

Se aparecer `servidor rodando na porta 3001` e `conectou no banco` deu certo. Também aparece se a IA está ligada ou no modo simulado. Abrindo http://localhost:3001 aparece "API do ANota funcionando".

## Como rodar o frontend

Em outro terminal:

```
cd frontend
npm install
npm run dev
```

Abre http://localhost:5173 e entra com o usuário de teste (ou clica em **Criar conta**).

O microfone só funciona em `localhost` ou `https` (regra do navegador) e no Chrome/Edge. Na primeira vez o navegador pede permissão pra usar o microfone.

Se mudar a porta da API tem que mudar também em `frontend/src/config.js`.

## Rotas da API

Agora o login devolve um **token (JWT)**. O front guarda o token no `localStorage` e manda em todas as requisições no header:

```
Authorization: Bearer <token>
```

O backend pega o `usuario_id` de dentro do token, então **não precisa mais mandar `usuario_id`** na query nem no body (e um usuário não consegue ver nem mexer nos dados de outro). Sem token ou com token vencido a API devolve **401** e o front volta pro login.

| Método | Rota | O que faz |
|--------|------|-----------|
| POST | /cadastro | cria conta `{ nome, cnpj, email, senha }` (valida CNPJ e email, não deixa repetir) e já devolve o token |
| POST | /login | confere email e senha e devolve `{ token, usuario }` |
| GET | /clientes | lista os clientes |
| POST | /clientes | cadastra cliente (valida nome, CPF/CNPJ e email) |
| PUT | /clientes/:id | altera cliente |
| DELETE | /clientes/:id | exclui cliente (não deixa se tiver nota) |
| GET | /servicos | lista os serviços |
| POST | /servicos | cadastra serviço (valor tem que ser maior que zero) |
| PUT | /servicos/:id | altera serviço |
| DELETE | /servicos/:id | exclui serviço (não deixa se tiver nota) |
| GET | /notas | lista as notas com cliente, serviço e número da NFS-e |
| POST | /notas | cria uma nota com status `pendente` |
| POST | /notas/interpretar | recebe `{ texto }` e acha cliente, serviço e valor (**IA ou simulação**) |
| POST | /notas/:id/emitir | emite a nota (**simulado**), salva o `numero_nfse` e não deixa emitir duas vezes |
| GET | /notas/:id/pdf | baixa o PDF da nota (só nota emitida) |
| POST | /notas/:id/enviar-email | manda o PDF pro email do cliente e muda o status pra `enviada` |
| GET | /faturamento?ano=2026 | total do ano e por mês (notas `emitida` e `enviada`) |
| POST | /faturamento/perguntar | recebe `{ pergunta }` e responde sobre o faturamento (**IA**; sem IA devolve o total do ano e do mês) |

Situações da nota: `pendente` (criada, ainda não emitida), `emitida`, `enviada` (emitida e mandada por e-mail) e `cancelada`.

Quando tem algum dado errado a API devolve erro **400** com a mensagem em português, por exemplo:

```json
{ "erro": "CPF ou CNPJ inválido" }
```

Pra testar dá pra importar no Postman o arquivo `docs/anota.postman_collection.json`. **Roda primeiro o "Login"**: ele salva o token sozinho na variável `{{token}}` e as outras requisições já usam.

### Exemplo do /notas/interpretar

Envio (com o header `Authorization: Bearer <token>`):
```json
{ "texto": "Fiz a pintura da casa da Joana Silva, ficou 1.500 reais" }
```

Resposta (resumida):
```json
{
  "cliente": { "id": 1, "nome": "Joana Silva" },
  "servico": { "id": 3, "descricao": "Pintura" },
  "valor": 1500,
  "descricao": "Pintura - Joana Silva",
  "faltando": [],
  "pergunta": "",
  "origem": "simulacao"
}
```

Se não falar o valor, ele usa o valor cadastrado do serviço. O que não achar vem no `faltando` e a `pergunta` traz o que perguntar pro usuário.

### Exemplo do /faturamento/perguntar

```json
{ "pergunta": "Quanto faturei em outubro?" }
```

Resposta com IA:
```json
{ "resposta": "Em outubro você faturou R$ 2.800,00 em 1 nota, da Construtora Oeste Ltda.", "origem": "ia" }
```

## Telas

- **Login** e **Criar conta**
- **Nova nota**: botão de microfone, campo "O que você disse" (dá pra corrigir o texto), prévia com o que a IA entendeu e o que está faltando (cliente, serviço, valor e descrição editáveis) e botão "Emitir nota"
- **Notas**: total do ano, barra com o % do limite do MEI (R$ 81.000,00), gráfico de barras por mês, caixa "Pergunte sobre seu faturamento", filtro por mês e a lista com os botões **Emitir**, **Baixar PDF**, **Enviar por e-mail** e **WhatsApp** (abre o `wa.me` com uma mensagem pronta com o número e o valor da nota)
- **Clientes**: lista + cadastro, edição e exclusão (com confirmação)
- **Serviços**: lista + cadastro, edição e exclusão (com confirmação)

Todas as telas mostram mensagem de sucesso e de erro e funcionam no celular.

## Wireframes

Os prints das telas estão na pasta [docs/wireframes](docs/wireframes).

## Próximas etapas

- [x] Gravar o áudio de verdade e transcrever (reconhecimento de voz do navegador)
- [x] Usar IA pra entender o texto (Claude, com o modo simulado de reserva)
- [x] Login com JWT e cadastro de usuário
- [x] Salvar o número da nota no banco
- [x] PDF da nota
- [x] Enviar a nota por e-mail e WhatsApp
- [x] Gráfico de faturamento por mês e perguntas sobre o faturamento com IA
- [ ] Integrar com a API da NFS-e nacional de verdade (precisa do certificado digital A1 e do credenciamento na Produção Restrita)
- [ ] Mensagem do e-mail/WhatsApp escrita pela IA
- [ ] Testes finais de todas as rotas e telas
