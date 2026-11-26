// mascaras e formatos que as telas usam (cpf, cnpj, cep, telefone...)
// no banco fica tudo so com numero, aqui e so pra mostrar bonito

export function soNumeros(txt) {
  return String(txt || '').replace(/\D/g, '')
}

// vai colocando os pontos enquanto digita
export function mascaraCPF(v) {
  const d = soNumeros(v).substring(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function mascaraCNPJ(v) {
  const d = soNumeros(v).substring(0, 14)
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

// quando nao sabe se e cpf ou cnpj, decide pelo tamanho
export function mascaraDocumento(v) {
  return soNumeros(v).length > 11 ? mascaraCNPJ(v) : mascaraCPF(v)
}

export function mascaraCEP(v) {
  const d = soNumeros(v).substring(0, 8)
  return d.replace(/(\d{5})(\d)/, '$1-$2')
}

export function mascaraTelefone(v) {
  const d = soNumeros(v).substring(0, 11)
  if (d.length <= 2) return d.length ? '(' + d : ''
  if (d.length <= 6) return '(' + d.substring(0, 2) + ') ' + d.substring(2)
  if (d.length <= 10) return '(' + d.substring(0, 2) + ') ' + d.substring(2, 6) + '-' + d.substring(6)
  return '(' + d.substring(0, 2) + ') ' + d.substring(2, 7) + '-' + d.substring(7)
}

// codigo de tributacao nacional: 6 numeros, mostra como 00.00.00
export function mascaraCodigo(v) {
  const d = soNumeros(v).substring(0, 6)
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{2})\.(\d{2})(\d)/, '$1.$2.$3')
}

// codigo NBS: 9 numeros, mostra como 0.0000.00.00
export function mascaraNBS(v) {
  const d = soNumeros(v).substring(0, 9)
  return d.replace(/^(\d)(\d)/, '$1.$2').replace(/^(\d)\.(\d{4})(\d)/, '$1.$2.$3').replace(/^(\d)\.(\d{4})\.(\d{2})(\d)/, '$1.$2.$3.$4')
}

// "Rua X, 123 - Centro" (pula o que estiver vazio)
export function montaEndereco(endereco, numero, bairro) {
  let txt = endereco || ''
  if (txt && numero) txt += ', ' + numero
  if (txt && bairro) txt += ' - ' + bairro
  return txt
}

// "Chapecó/SC"
export function municipioUF(municipio, uf) {
  if (!municipio) return ''
  return municipio + (uf ? '/' + uf : '')
}
