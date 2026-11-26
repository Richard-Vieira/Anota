import { useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../config.js'

function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  // quando o token vence o sistema manda pra ca com ?expirou=1
  const expirou = window.location.search.includes('expirou')

  async function entrar(e) {
    e.preventDefault()
    setErro('')

    if (email == '' || senha == '') {
      setErro('Preencha o email e a senha')
      return
    }

    setCarregando(true)
    // ajustado com IA para melhorar o codigo
    // se a api cair nao fica travado no "Entrando..."
    try {
      const resposta = await fetch(API + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
      })
      const dados = await resposta.json()
      console.log('login', dados.usuario)
      if (!resposta.ok) {
        setErro(dados.erro)
      } else {
        // guarda o token (JWT) e o usuario no navegador
        localStorage.setItem('token', dados.token)
        localStorage.setItem('usuario', JSON.stringify(dados.usuario))
        // recarrega pra o App ver que logou
        window.location.href = '/nova-nota'
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
        <h1>Entrar</h1>
        <p className="texto-menor" style={{ margin: 0 }}>Use o e-mail e a senha da sua conta.</p>

        {expirou && <p className="aviso">Sua sessão expirou, entre de novo.</p>}

        <form onSubmit={entrar}>
          <label>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" />

          <label>Senha</label>
          <input type="password" value={senha} onChange={e => setSenha(e.target.value)} />

          {erro && <p className="erro">{erro}</p>}

          <button type="submit" className="largo" disabled={carregando}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="texto-menor" style={{ marginTop: 20 }}>
          Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
        </p>
      </div>
    </div>
  )
}

// lado esquerdo do login (o cadastro usa o mesmo)
export function LadoApresentacao() {
  return (
    <div className="login-lado">
      <span className="marca">ANota</span>
      <h1>Fala o serviço. A nota sai pronta.</h1>
      <p>
        Você conta em voz alta o que fez, para quem e quanto cobrou. O ANota entende,
        monta a nota fiscal do seu MEI e manda para o cliente.
      </p>
      <div className="exemplo-frase">
        <small>Exemplo do que você pode falar</small>
        "Fiz a <span className="chip">pintura</span> da casa da <span className="chip">Joana Silva</span>,
        ficou <span className="chip">R$ 1.500</span>"
      </div>
    </div>
  )
}

export default Login
