import { formataDinheiro } from '../api.js'
import { mascaraCodigo, mascaraDocumento, mascaraNBS, mascaraCEP, municipioUF } from '../formatos.js'

// DANFSe = Documento Auxiliar da NFS-e (blocos da Nota Tecnica 008/2026 da NFS-e Nacional)
// usa na previa do chat (previa = true) e no detalhe da nota na tela Notas
// n = nota "achatada", com os mesmos nomes de campo que o backend devolve no GET /notas/:id
// (prestador_*, cliente_*, codigo_tributacao, descricao, valor, competencia, chave_acesso...)

const SIMPLES_NACIONAL = 'Optante - Microempreendedor Individual (MEI)'

// "2026-11" -> "11/2026"
function competencia(c) {
  if (!c) return ''
  const p = c.split('-')
  return p[1] + '/' + p[0]
}

// "Rua X, 123 - Centro - CEP 89801-140"
function endereco(rua, numero, bairro, cep) {
  let t = rua || ''
  if (t && numero) t += ', ' + numero
  if (t && bairro) t += ' - ' + bairro
  if (t && cep) t += ' - CEP ' + mascaraCEP(cep)
  return t
}

// uma celula do quadro: rotulo pequeno em cima e o valor embaixo
// obrigatorio = se estiver vazio mostra o amarelo "Falta informar", senao so um traço
function Campo({ rotulo, valor, obrigatorio, largura, classe }) {
  const vazio = valor === undefined || valor === null || String(valor).trim() === ''
  return (
    <div className={'danfse-campo ' + (largura ? 'col-' + largura : 'col-1') + (classe ? ' ' + classe : '')}>
      <span className="danfse-rotulo">{rotulo}</span>
      <span className="danfse-valor">
        {vazio ? (obrigatorio ? <span className="falta">Falta informar</span> : '—') : valor}
      </span>
    </div>
  )
}

function Danfse({ n, previa }) {
  // local da prestacao: municipio do cliente (onde o servico foi feito), senao o do prestador
  const local = n.cliente_municipio
    ? municipioUF(n.cliente_municipio, n.cliente_uf)
    : municipioUF(n.prestador_municipio, n.prestador_uf)
  const naEmissao = <span className="danfse-cinza">Gerado na emissão</span>

  return (
    <div className="danfse">
      <div className="danfse-cabecalho">
        <div>
          <strong className="danfse-titulo">DANFSe</strong>
          <span className="danfse-sub">Documento Auxiliar da NFS-e</span>
        </div>
        <div className="danfse-cabecalho-dir">
          <span className="danfse-rotulo">Município do prestador</span>
          <span>{municipioUF(n.prestador_municipio, n.prestador_uf) || <span className="falta">Falta informar</span>}</span>
          <span className="danfse-rotulo" style={{ marginTop: 6 }}>Ambiente</span>
          <span className="danfse-ambiente">Produção Restrita (simulação)</span>
        </div>
      </div>

      <div className="danfse-bloco">
        <div className="danfse-bloco-titulo">Dados da NFS-e</div>
        <div className="danfse-grade">
          <Campo rotulo="Chave de acesso" largura="4" classe="danfse-chave"
            valor={previa ? naEmissao : String(n.chave_acesso || '').replace(/(\d{4})(?=\d)/g, '$1 ')} />
          <Campo rotulo="Número da NFS-e" valor={previa ? naEmissao : n.numero_nfse} />
          <Campo rotulo="Competência" valor={competencia(n.competencia)} obrigatorio />
          <Campo rotulo="Data e hora da emissão" valor={previa ? naEmissao : n.data_hora_emissao} />
          <Campo rotulo="Número / série da DPS" valor={previa ? naEmissao : (n.numero_dps ? n.numero_dps + ' / ' + n.serie_dps : '')} />
        </div>
      </div>

      <div className="danfse-bloco">
        <div className="danfse-bloco-titulo">Prestador / fornecedor</div>
        <div className="danfse-grade">
          <Campo rotulo="CNPJ" valor={mascaraDocumento(n.prestador_cnpj)} obrigatorio />
          <Campo rotulo="Inscrição municipal" valor={n.prestador_inscricao_municipal} />
          <Campo rotulo="Telefone" valor={n.prestador_telefone} largura="2" />
          <Campo rotulo="Nome / nome empresarial" valor={n.prestador_nome} obrigatorio largura="2" />
          <Campo rotulo="Município/UF" valor={municipioUF(n.prestador_municipio, n.prestador_uf)} obrigatorio />
          <Campo rotulo="E-mail" valor={n.prestador_email} />
          <Campo rotulo="Endereço" valor={endereco(n.prestador_endereco, n.prestador_numero, n.prestador_bairro, n.prestador_cep)} obrigatorio largura="4" />
          <Campo rotulo="Simples Nacional na data de competência" valor={SIMPLES_NACIONAL} largura="4" />
        </div>
      </div>

      <div className="danfse-bloco">
        <div className="danfse-bloco-titulo">Tomador / adquirente</div>
        <div className="danfse-grade">
          <Campo rotulo="CPF/CNPJ" valor={mascaraDocumento(n.cliente_documento)} obrigatorio />
          <Campo rotulo="Telefone" valor={n.cliente_telefone} />
          <Campo rotulo="Nome / nome empresarial" valor={n.cliente_nome} obrigatorio largura="2" />
          <Campo rotulo="Município/UF" valor={municipioUF(n.cliente_municipio, n.cliente_uf)} />
          <Campo rotulo="Endereço" valor={endereco(n.cliente_endereco, n.cliente_numero, n.cliente_bairro, n.cliente_cep)} largura="2" />
          <Campo rotulo="E-mail" valor={n.cliente_email} />
        </div>
      </div>

      <div className="danfse-bloco">
        <div className="danfse-bloco-titulo">Serviço prestado</div>
        <div className="danfse-grade">
          <Campo rotulo="Código de tributação nacional" valor={n.codigo_tributacao ? mascaraCodigo(n.codigo_tributacao) : ''} obrigatorio />
          <Campo rotulo="Código da NBS" valor={n.codigo_nbs ? mascaraNBS(n.codigo_nbs) : ''} />
          <Campo rotulo="Local da prestação" valor={local} obrigatorio largura="2" />
          <Campo rotulo="Descrição do código de tributação nacional" valor={n.descricao_codigo} obrigatorio largura="4" />
          <Campo rotulo="Descrição do serviço" valor={n.descricao} obrigatorio largura="4" />
        </div>
      </div>

      <div className="danfse-bloco">
        <div className="danfse-bloco-titulo">Valor total da NFS-e</div>
        <div className="danfse-grade">
          <Campo rotulo="Valor do serviço" valor={n.valor ? formataDinheiro(n.valor) : ''} obrigatorio />
          <Campo rotulo="Desconto" valor={formataDinheiro(0)} />
          <Campo rotulo="Valor líquido da NFS-e" largura="2" classe="danfse-liquido"
            valor={n.valor ? <span className="valor-destaque">{formataDinheiro(n.valor)}</span> : ''} obrigatorio />
        </div>
      </div>

      <div className="danfse-bloco">
        <div className="danfse-bloco-titulo">Informações complementares</div>
        <p className="danfse-info">
          Documento gerado em ambiente de simulação, sem validade fiscal. ISS recolhido pelo regime do MEI (DAS).
        </p>
      </div>
    </div>
  )
}

export default Danfse
