import { useState } from 'react'
import { api } from '../api.js'
import { mascaraCEP, soNumeros } from '../formatos.js'

// campos de endereco (usa na tela Configuracoes e no cadastro de cliente)
// quando o CEP fica com 8 numeros ja consulta o ViaCEP (pelo backend) e preenche o resto
// dados = objeto com cep, endereco, numero, bairro, municipio, uf, codigo_ibge
// muda = funcao que recebe o objeto novo
function CamposEndereco({ dados, muda }) {
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState('')

  function campo(nome, valor) {
    muda({ ...dados, [nome]: valor })
  }

  async function digitouCep(valor) {
    const cep = mascaraCEP(valor)
    const novo = { ...dados, cep: cep }
    muda(novo)
    setAviso('')

    if (soNumeros(cep).length == 8 && soNumeros(cep) != soNumeros(dados.cep)) {
      setBuscando(true)
      const r = await api('/consulta/cep/' + soNumeros(cep))
      setBuscando(false)
      if (!r.ok) {
        setAviso(r.dados.erro)
        return
      }
      // preenche o que veio e deixa o numero pra pessoa digitar
      muda({
        ...novo,
        endereco: r.dados.endereco || novo.endereco,
        bairro: r.dados.bairro || novo.bairro,
        municipio: r.dados.municipio,
        uf: r.dados.uf,
        codigo_ibge: r.dados.codigo_ibge
      })
    }
  }

  return (
    <div>
      <div className="grade-campos">
        <div className="campo-cep">
          <label>CEP</label>
          <input value={mascaraCEP(dados.cep)} onChange={e => digitouCep(e.target.value)} placeholder="00000-000" inputMode="numeric" />
        </div>
        <div className="campo-ajuda-cep">
          <span className="texto-menor">{buscando ? 'Buscando o endereço...' : 'Digite o CEP que o endereço vem sozinho.'}</span>
        </div>
      </div>
      {aviso && <p className="erro" style={{ margin: '6px 0 0' }}>{aviso}</p>}

      <div className="grade-campos">
        <div className="campo-largo">
          <label>Endereço</label>
          <input value={dados.endereco || ''} onChange={e => campo('endereco', e.target.value)} placeholder="Rua, avenida..." />
        </div>
        <div className="campo-curto">
          <label>Número</label>
          <input value={dados.numero || ''} onChange={e => campo('numero', e.target.value)} maxLength="10" />
        </div>
      </div>

      <label>Bairro</label>
      <input value={dados.bairro || ''} onChange={e => campo('bairro', e.target.value)} />

      <div className="grade-campos">
        <div className="campo-largo">
          <label>Município</label>
          <input value={dados.municipio || ''} onChange={e => campo('municipio', e.target.value)} />
        </div>
        <div className="campo-curto">
          <label>UF</label>
          <input value={dados.uf || ''} onChange={e => campo('uf', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2))} placeholder="SC" />
        </div>
      </div>

      <label>Código IBGE do município</label>
      <input value={dados.codigo_ibge || ''} onChange={e => campo('codigo_ibge', soNumeros(e.target.value).substring(0, 7))} placeholder="7 números (vem junto com o CEP)" inputMode="numeric" />
    </div>
  )
}

export default CamposEndereco
