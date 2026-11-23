// funcoes de validacao que uso nas rotas

function vazio(valor) {
  if (valor === undefined || valor === null) return true;
  if (String(valor).trim() === '') return true;
  return false;
}

// tira tudo que nao for numero (pontos, tracos, barra)
function soNumeros(txt) {
  return String(txt || '').replace(/\D/g, '');
}

function validarEmail(email) {
  // regex que achei na internet, nao e perfeita mas serve
  var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// ajustado com IA para melhorar o codigo
// isso aqui valida o cpf (calcula os 2 digitos verificadores)
function validarCPF(cpf) {
  cpf = soNumeros(cpf);
  if (cpf.length !== 11) return false;
  // cpf com tudo igual tipo 111.111.111-11 passa no calculo mas e invalido
  if (/^(\d)\1+$/.test(cpf)) return false;

  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) {
      soma += Number(cpf[i]) * (t + 1 - i);
    }
    let digito = (soma * 10) % 11;
    if (digito === 10) digito = 0;
    if (digito !== Number(cpf[t])) return false;
  }
  return true;
}

// ajustado com IA para melhorar o codigo
// valida cnpj, mesma ideia do cpf mas com os pesos diferentes
function validarCNPJ(cnpj) {
  cnpj = soNumeros(cnpj);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  function calcDigito(base, pesos) {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) {
      soma += Number(base[i]) * pesos[i];
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  const d1 = calcDigito(cnpj, pesos1);
  const d2 = calcDigito(cnpj, pesos2);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

// cliente pode ser pessoa fisica ou juridica
function validarDocumento(doc) {
  var d = soNumeros(doc);
  if (d.length == 11) {
    return validarCPF(d);
  } else if (d.length == 14) {
    return validarCNPJ(d);
  } else {
    return false;
  }
}

function validarValor(valor) {
  // aceita "150,50" tambem
  var v = Number(String(valor).replace(',', '.'));
  if (isNaN(v)) return false;
  if (v <= 0) return false;
  return true;
}

module.exports = {
  vazio,
  soNumeros,
  validarEmail,
  validarCPF,
  validarCNPJ,
  validarDocumento,
  validarValor
};
