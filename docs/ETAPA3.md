# ANota - Etapa 3

Resumo do que foi feito nesta etapa do Projeto Integrador.

## O que foi implementado

### Banco de dados
- Coluna `numero_nfse` na tabela `nota_fiscal`, para guardar o número da nota emitida.
- CNPJ do usuário único (`UNIQUE`), para não ter duas contas com o mesmo MEI.
- Script `alteracoes_etapa3.sql` para atualizar o banco da etapa 2 sem apagar os dados. Ele também numera as notas que já estavam emitidas.
- Seed com 1 usuário de teste, 4 clientes, 4 serviços e 10 notas de junho a novembro de 2026.

### Back-end
- Login com token JWT. O `usuario_id` agora vem do token, e não do front, então um usuário não vê os dados de outro.
- Rota de cadastro de usuário, com validação de CNPJ e e-mail.
- IA (API do Claude) para entender o texto falado. Se não tiver chave ou der erro, usa a interpretação simulada (busca de palavras).
- Emissão da nota com número sequencial por usuário e trava para não emitir a mesma nota duas vezes.
- Geração do PDF da nota (pdfkit).
- Envio da nota por e-mail com o PDF anexado (nodemailer). Sem SMTP configurado, usa uma caixa de teste do Ethereal.
- Perguntas sobre o faturamento em texto (com IA; sem IA responde o total do ano e do mês).

### Front-end
- Telas de login e de criar conta.
- Gravação de áudio com o reconhecimento de voz do navegador (Web Speech API).
- Nova nota com prévia: mostra o que foi entendido e o que está faltando.
- Tela Notas com o total do ano, o % do limite do MEI, o gráfico por mês, a caixa de perguntas e os botões de PDF, e-mail e WhatsApp.
- Novo layout em todas as telas, que também funciona no celular.

## Requisitos funcionais

| RF | Requisito | Situação | Explicação |
|----|-----------|----------|------------|
| RF01 | Login | Concluído | Login e cadastro com senha criptografada (bcrypt) e token JWT que vence em 8 horas. |
| RF02 | Clientes | Concluído | Cadastrar, listar, buscar, editar e excluir, com validação de CPF/CNPJ e e-mail. |
| RF03 | Serviços | Concluído | Cadastrar, listar, buscar, editar e excluir, com valor padrão. |
| RF04 | Gravar áudio | Concluído | O navegador transforma a fala em texto (funciona no Chrome e no Edge). Nos outros navegadores dá para digitar. |
| RF05 | IA entende o pedido | Concluído | Usa a API do Claude quando a chave está configurada. Sem a chave, cai na interpretação simulada. |
| RF06 | Emitir NFS-e | Simulado | Gera o número e o PDF, mas não envia para o Sistema Nacional da NFS-e. Para isso falta o certificado digital A1 do MEI. |
| RF07 | Enviar ao cliente | Concluído | E-mail com o PDF anexado e mensagem pronta no WhatsApp (link `wa.me`). Sem SMTP, o e-mail vai para uma caixa de teste. |
| RF08 | Faturamento | Concluído | Total do ano, % do limite do MEI (R$ 81.000,00), gráfico por mês e perguntas em texto. |

## O que falta para a entrega final

- Emitir a NFS-e de verdade na API nacional (precisa do certificado digital A1 e do credenciamento no ambiente de Produção Restrita).
- Mensagem do e-mail e do WhatsApp escrita pela IA.
- Testes finais de todas as rotas e telas.

## Rotas novas da API

Rotas criadas nesta etapa:

| Método | Rota | O que faz |
|--------|------|-----------|
| POST | /cadastro | Cria a conta do MEI e já devolve o token. |
| GET | /notas/:id/pdf | Baixa o PDF de uma nota emitida. |
| POST | /notas/:id/enviar-email | Manda a nota em PDF para o e-mail do cliente e muda a situação para `enviada`. |
| POST | /faturamento/perguntar | Responde uma pergunta em texto sobre o faturamento. |

Rotas que já existiam e mudaram:

| Método | Rota | O que mudou |
|--------|------|-------------|
| POST | /login | Agora devolve o token JWT. |
| Todas | (menos /login e /cadastro) | Agora exigem o header `Authorization: Bearer <token>`. |
| POST | /notas/interpretar | Usa a IA, com a simulação como reserva. |
| POST | /notas/:id/emitir | Salva o número da nota e não deixa emitir duas vezes. |

## Material deste documento

- Prints das telas: [docs/prints](prints)
- Respostas da API (login, interpretar e faturamento): [docs/prints/respostas_api.json](prints/respostas_api.json)
- Trechos de código: [docs/trechos](trechos)
