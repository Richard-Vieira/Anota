import { useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../config.js'
import { LadoApresentacao } from './Login.jsx'

// tela de criar conta (copiei o login e coloquei os campos a mais)
function Cadastro() {
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function cadastrar(e) {
    e.preventDefault()
    setErro('')

    if (nome == '' || cnpj == '' || email == '' || senha == '') {
      setErro('Preencha todos os campos')
      return
    }
    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres')
      return
    }
    if (senha != senha2) {
      setErro('As senhas não são iguais')
      return
    }

    setCarregando(true)
    try {
      const resposta = await fetch(API + '/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, cnpj, email, senha })
      })
      const dados = await resposta.json()
      if (!resposta.ok) {
        setErro(dados.erro)
      } else {
        // a api ja devolve o token, entao entra direto
        localStorage.setItem('token', dados.token)
        localStorage.setItem('usuario', JSON.stringify(dados.usuario))
        window.location.href = '/clientes' // primeiro cadastra os clientes
      }
    } catch (err) {
      setErro('Não foi possível conectar no servidor')
    }
    setCarregando(false)
  }

  return (
    <div className="login-tela">
      <LadoApresentacao />

      <div className="login-form">
        <h1>Criar conta</h1>
        <p className="texto-menor" style={{ margin: 0 }}>Cadastre os dados do seu MEI.</p>

        <form onSubmit={cadastrar}>
          <label>Seu nome</label>
          <input value={nome} onChange={e => setNome(e.target.value)} />

          <label>CNPJ do MEI</label>
          <input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />

          <label>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" />

          <label>Senha</label>
          <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="mínimo 6 caracteres" />

          <label>Repita a senha</label>
          <input type="password" value={senha2} onChange={e => setSenha2(e.target.value)} />

          {erro && <p className="erro">{erro}</p>}

          <button type="submit" className="largo" disabled={carregando}>
            {carregando ? 'Criando...' : 'Criar conta'}
          </button>
        </form>

        <p className="texto-menor" style={{ marginTop: 20 }}>
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  )
}

export default Cadastro
