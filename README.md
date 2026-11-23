# ANota

Projeto Integrador - Análise e Desenvolvimento de Sistemas

O ANota é um sistema web pra ajudar o MEI a emitir nota fiscal de serviço (NFS-e) falando. A ideia é o MEI gravar um áudio tipo "fiz a pintura da casa da Joana, ficou 1.500 reais" e o sistema, com ajuda de IA, entender quem é o cliente, qual foi o serviço e o valor, e já montar a nota pra ele só conferir e emitir.

> **Atenção:** nesta etapa a IA e a integração com a NFS-e estão **SIMULADAS**.
> - No lugar do áudio tem um campo de texto ("O que você disse"). A "interpretação" é uma busca simples de palavras no texto, procurando os clientes e serviços cadastrados.
> - A emissão não manda nada pro governo, só gera um número aleatório e muda o status da nota pra `emitida`.

## Tecnologias

- Banco: PostgreSQL
- Backend: Node.js + Express (biblioteca `pg` pra conectar no banco e `bcryptjs` pra senha)
- Frontend: React + Vite + react-router

## Estrutura

```
anota/
  database/
    schema.sql    -> criação das tabelas
    seed.sql      -> dados de exemplo
  backend/        -> API (server.js, db.js, validacoes.js)
  frontend/       -> telas em React
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

Troca o `DB_PASSWORD` pela senha que você colocou quando instalou o postgres.

## Como rodar o backend

```
cd backend
npm install
npm start
```

Se aparecer `servidor rodando na porta 3001` e `conectou no banco` deu certo. Abrindo http://localhost:3001 aparece "API do ANota funcionando".

## Como rodar o frontend

Em outro terminal:

```
cd frontend
npm install
npm run dev
```

Abre http://localhost:5173 e entra com o usuário de teste.

Se mudar a porta da API tem que mudar também em `frontend/src/config.js`.

## Rotas da API

Como ainda não tem JWT, o front guarda o usuário no localStorage depois do login e manda o `usuario_id` nas requisições (na query nos GET/DELETE e no body nos POST/PUT).

| Método | Rota | O que faz |
|--------|------|-----------|
| POST | /login | confere email e senha e devolve os dados do usuário |
| GET | /clientes?usuario_id=1 | lista os clientes |
| POST | /clientes | cadastra cliente (valida nome, CPF/CNPJ e email) |
| PUT | /clientes/:id | altera cliente |
| DELETE | /clientes/:id?usuario_id=1 | exclui cliente (não deixa se tiver nota) |
| GET | /servicos?usuario_id=1 | lista os serviços |
| POST | /servicos | cadastra serviço (valor tem que ser maior que zero) |
| PUT | /servicos/:id | altera serviço |
| DELETE | /servicos/:id?usuario_id=1 | exclui serviço (não deixa se tiver nota) |
| GET | /notas?usuario_id=1 | lista as notas com nome do cliente e serviço |
| POST | /notas | cria uma nota com status `pendente` |
| POST | /notas/interpretar | recebe `{ usuario_id, texto }` e tenta achar cliente, serviço e valor (**simula a IA**) |
| POST | /notas/:id/emitir | emite a nota (**simulado**, gera um número aleatório) |
| GET | /faturamento?usuario_id=1&ano=2026 | total do ano e total por mês (só notas emitidas) |

Quando tem algum dado errado a API devolve erro **400** com a mensagem em português, por exemplo:

```json
{ "erro": "CPF ou CNPJ inválido" }
```

Pra testar dá pra importar no Postman o arquivo `docs/anota.postman_collection.json`.

### Exemplo do /notas/interpretar

Envio:
```json
{ "usuario_id": 1, "texto": "Fiz a pintura da casa da Joana Silva, ficou 1.500 reais" }
```

Resposta (resumida):
```json
{
  "cliente": { "id": 1, "nome": "Joana Silva" },
  "servico": { "id": 3, "descricao": "Pintura" },
  "valor": 1500,
  "descricao": "Pintura - Joana Silva",
  "faltando": []
}
```

Se não falar o valor, ele usa o valor cadastrado do serviço. O que não achar vem no `faltando`.

## Telas

- **Login**
- **Nova nota**: campo "O que você disse", botão pra gerar a prévia e botão "Emitir nota"
- **Notas**: lista das notas e total faturado no ano
- **Clientes**: lista + cadastro
- **Serviços**: lista + cadastro

## Wireframes

Os prints das telas estão na pasta [docs/wireframes](docs/wireframes).

## Próximas etapas

- [ ] Gravar o áudio de verdade e transcrever
- [ ] Usar IA pra entender o texto
- [ ] Integrar com a API da NFS-e nacional
- [ ] Login com JWT
- [ ] Salvar o número da nota no banco
