let produtos = [];
let carrinho = [];
let total = 0;
let produtoSelecionado = null;
let alertaValidadeFechado = false;

const API = window.location.protocol === "file:" ? "http://127.0.0.1:3000" : "";

function numeroSeguro(valor) {
  if (typeof valor === "number") return Number.isNaN(valor) ? 0 : valor;
  if (typeof valor === "string") {
    const convertido = Number(valor.replace(",", ".").trim());
    return Number.isNaN(convertido) ? 0 : convertido;
  }
  const convertido = Number(valor);
  return Number.isNaN(convertido) ? 0 : convertido;
}

function hojeISO() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarDataBR(dataISO) {
  if (!dataISO) return "-";
  const partes = dataISO.split("-");
  if (partes.length !== 3) return dataISO;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function entrar() {
  const operador = document.getElementById("operador").value.trim();
  if (!operador) {
    alert("Digite o nome do operador");
    return;
  }

  document.getElementById("login").style.display = "none";
  document.getElementById("sistema").style.display = "flex";
  document.getElementById("nomeOperador").innerText = operador;

  document.getElementById("filtroDataDashboard").value = hojeISO();
  document.getElementById("dataFechamentoCaixa").value = hojeISO();
  document.getElementById("dataInicioHistorico").value = hojeISO();
  document.getElementById("dataFimHistorico").value = hojeISO();

  carregarProdutos();
  carregarMovimentacoesEstoque();
  carregarDashboard();
  carregarHistorico();
  carregarControleValidade();
  verificarAlertasValidade();
  carregarFechamentoCaixa();
  carregarRelatorioProduto();
  carregarStatusBackup();
  abrirPagina("dashboard");
}

function voltarLogin() {
  carrinho = [];
  total = 0;
  produtoSelecionado = null;

  document.getElementById("operador").value = "";
  document.getElementById("login").style.display = "flex";
  document.getElementById("sistema").style.display = "none";
}

function abrirPagina(id) {
  document.querySelectorAll(".pagina").forEach((p) => {
    p.style.display = "none";
  });
  document.getElementById(id).style.display = "block";

  if (id === "dashboard") carregarDashboard();
  if (id === "historico") carregarHistorico();
  if (id === "produtos") {
    carregarProdutos();
    carregarMovimentacoesEstoque();
  }
  if (id === "controle-validade") carregarControleValidade();
  if (id === "fechamento-caixa") carregarFechamentoCaixa();
  if (id === "relatorios") carregarRelatorioProduto();
}

function carregarStatusBackup() {
  fetch(`${API}/backup/status`)
    .then((res) => res.json())
    .then((data) => {
      const el = document.getElementById("statusBackupTopo");
      if (!el) return;
      el.innerText = data.ultimo ? `Backup: ${data.ultimo}` : "Backup: ainda não criado";
    })
    .catch(() => {
      const el = document.getElementById("statusBackupTopo");
      if (el) el.innerText = "Backup: erro";
    });
}

function cadastrarProduto() {
  const nome = document.getElementById("nomeProduto").value.trim();
  const preco = document.getElementById("precoProduto").value.trim();
  const estoque = parseInt(document.getElementById("estoqueProduto").value);

  if (!nome || numeroSeguro(preco) <= 0 || Number.isNaN(estoque) || estoque < 0) {
    alert("Preencha nome, preço e estoque corretamente.");
    return;
  }

  fetch(`${API}/produto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, preco, estoque })
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.erro) {
        alert(data.erro);
        return;
      }

      alert("Produto cadastrado com sucesso.");
      document.getElementById("nomeProduto").value = "";
      document.getElementById("precoProduto").value = "";
      document.getElementById("estoqueProduto").value = "";

      carregarProdutos();
      carregarMovimentacoesEstoque();
      carregarControleValidade();
      carregarDashboard();
    })
    .catch((erro) => alert("Erro ao cadastrar produto: " + erro.message));
}

function atualizarPrecoProduto(id) {
  const preco = numeroSeguro(document.getElementById(`novo_preco_${id}`).value);
  if (preco <= 0) {
    alert("Digite um preço válido.");
    return;
  }

  fetch(`${API}/produto/${id}/preco`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preco })
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.erro) {
        alert(data.erro);
        return;
      }
      alert("Preço atualizado com sucesso.");
      carregarProdutos();
    })
    .catch((erro) => alert("Erro ao atualizar preço: " + erro.message));
}

function adicionarEstoqueProduto(id) {
  const quantidade = parseInt(document.getElementById(`mov_estoque_${id}`).value);
  if (Number.isNaN(quantidade) || quantidade <= 0) {
    alert("Digite uma quantidade válida para adicionar.");
    return;
  }

  fetch(`${API}/produto/${id}/estoque/adicionar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantidade })
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.erro) {
        alert(data.erro);
        return;
      }
      alert("Estoque adicionado com sucesso.");
      carregarProdutos();
      carregarMovimentacoesEstoque();
      carregarControleValidade();
      carregarDashboard();
    })
    .catch((erro) => alert("Erro ao adicionar estoque: " + erro.message));
}

function removerEstoqueProduto(id) {
  const quantidade = parseInt(document.getElementById(`mov_estoque_${id}`).value);
  if (Number.isNaN(quantidade) || quantidade <= 0) {
    alert("Digite uma quantidade válida para retirar.");
    return;
  }

  fetch(`${API}/produto/${id}/estoque/remover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantidade })
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.erro) {
        alert(data.erro);
        return;
      }
      alert("Estoque retirado com sucesso.");
      carregarProdutos();
      carregarMovimentacoesEstoque();
      carregarControleValidade();
      carregarDashboard();
    })
    .catch((erro) => alert("Erro ao retirar estoque: " + erro.message));
}

function ajustarEstoqueProduto(id) {
  const estoque = parseInt(document.getElementById(`ajuste_estoque_${id}`).value);
  if (Number.isNaN(estoque) || estoque < 0) {
    alert("Digite um valor válido para ajuste.");
    return;
  }

  fetch(`${API}/produto/${id}/estoque/ajustar`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estoque })
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.erro) {
        alert(data.erro);
        return;
      }
      alert("Estoque ajustado com sucesso.");
      carregarProdutos();
      carregarMovimentacoesEstoque();
      carregarControleValidade();
      carregarDashboard();
    })
    .catch((erro) => alert("Erro ao ajustar estoque: " + erro.message));
}

function excluirProduto(id, nome) {
  if (!confirm(`Deseja realmente excluir o produto "${nome}"?`)) return;

  fetch(`${API}/produto/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((data) => {
      if (data.erro) {
        alert(data.erro);
        return;
      }
      alert("Produto excluído com sucesso.");
      carregarProdutos();
      carregarMovimentacoesEstoque();
      carregarControleValidade();
      carregarDashboard();
    })
    .catch((erro) => alert("Erro ao excluir produto: " + erro.message));
}

function carregarProdutos() {
  fetch(`${API}/produtos`)
    .then((res) => res.json())
    .then((data) => {
      produtos = Array.isArray(data) ? data : [];

      const tabela = document.getElementById("tabelaProdutos");
      if (!tabela) return;

      tabela.innerHTML = `
        <tr>
          <th>Nome</th>
          <th>Preço Atual</th>
          <th>Novo Preço</th>
          <th>Estoque Atual</th>
          <th>Movimentar</th>
          <th>Ajustar p/</th>
          <th>Ações</th>
        </tr>
      `;

      produtos.forEach((p) => {
        const nomeEscapado = String(p.nome).replace(/'/g, "\\'");
        tabela.innerHTML += `
          <tr>
            <td>${p.nome}</td>
            <td>R$ ${numeroSeguro(p.preco).toFixed(2)}</td>
            <td><input class="input-tabela" id="novo_preco_${p.id}" placeholder="Preço" /></td>
            <td>${parseInt(p.estoque) || 0}</td>
            <td><input class="input-tabela" id="mov_estoque_${p.id}" placeholder="Qtd" /></td>
            <td><input class="input-tabela" id="ajuste_estoque_${p.id}" placeholder="Estoque final" /></td>
            <td class="acoes-tabela">
              <button class="btn-editar" onclick="atualizarPrecoProduto(${p.id})">Preço</button>
              <button class="btn-editar" onclick="adicionarEstoqueProduto(${p.id})">+ Estoque</button>
              <button class="btn-editar" onclick="removerEstoqueProduto(${p.id})">- Estoque</button>
              <button class="btn-editar" onclick="ajustarEstoqueProduto(${p.id})">Ajustar</button>
              <button class="btn-excluir" onclick="excluirProduto(${p.id}, '${nomeEscapado}')">Excluir</button>
            </td>
          </tr>
        `;
      });
    })
    .catch((erro) => console.error("Erro ao carregar produtos:", erro));
}

function carregarMovimentacoesEstoque() {
  const produto = document.getElementById("filtroMovimentoProduto")?.value || "";

  fetch(`${API}/estoque/movimentacoes?produto=${encodeURIComponent(produto)}`)
    .then((res) => res.json())
    .then((data) => {
      const tabela = document.getElementById("tabelaMovimentacoesEstoque");
      if (!tabela) return;

      tabela.innerHTML = `
        <tr>
          <th>Produto</th>
          <th>Tipo</th>
          <th>Qtd</th>
          <th>Antes</th>
          <th>Depois</th>
          <th>Observação</th>
          <th>Data</th>
        </tr>
      `;

      if (!Array.isArray(data) || data.length === 0) {
        tabela.innerHTML += `<tr><td colspan="7">Nenhuma movimentação encontrada.</td></tr>`;
        return;
      }

      data.forEach((m) => {
        tabela.innerHTML += `
          <tr>
            <td>${m.nome}</td>
            <td>${m.tipo}</td>
            <td>${m.quantidade}</td>
            <td>${m.estoque_anterior}</td>
            <td>${m.estoque_novo}</td>
            <td>${m.observacao || "-"}</td>
            <td>${m.data}</td>
          </tr>
        `;
      });
    });
}

function statusValidade(validadeFim) {
  if (!validadeFim) return { texto: "Sem validade", classe: "status-neutro" };

  const hoje = new Date(hojeISO() + "T00:00:00");
  const fim = new Date(validadeFim + "T00:00:00");
  const dias = Math.ceil((fim - hoje) / (1000 * 60 * 60 * 24));

  if (dias < 0) return { texto: "Vencido", classe: "status-vencido" };
  if (dias <= 10) return { texto: `Vence em ${dias} dia(s)`, classe: "status-alerta" };
  return { texto: "Dentro da validade", classe: "status-ok" };
}

function carregarControleValidade() {
  fetch(`${API}/produtos`)
    .then((res) => res.json())
    .then((data) => {
      const tabela = document.getElementById("tabelaValidade");
      if (!tabela) return;

      tabela.innerHTML = `
        <tr>
          <th>Produto</th>
          <th>Estoque</th>
          <th>Início</th>
          <th>Fim</th>
          <th>Status</th>
          <th>Ação</th>
        </tr>
      `;

      data.forEach((p) => {
        const status = statusValidade(p.validade_fim);
        tabela.innerHTML += `
          <tr>
            <td>${p.nome}</td>
            <td>${parseInt(p.estoque) || 0}</td>
            <td><input type="date" id="validade_inicio_${p.id}" value="${p.validade_inicio || ""}"></td>
            <td><input type="date" id="validade_fim_${p.id}" value="${p.validade_fim || ""}"></td>
            <td><span class="status-validade ${status.classe}">${status.texto}</span></td>
            <td><button onclick="salvarValidade(${p.id})">Salvar</button></td>
          </tr>
        `;
      });
    });
}

function salvarValidade(id) {
  const validade_inicio = document.getElementById(`validade_inicio_${id}`).value;
  const validade_fim = document.getElementById(`validade_fim_${id}`).value;

  fetch(`${API}/produto/${id}/validade`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ validade_inicio, validade_fim })
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.erro) {
        alert(data.erro);
        return;
      }
      alertaValidadeFechado = false;
      alert("Validade salva com sucesso.");
      carregarControleValidade();
      verificarAlertasValidade();
    })
    .catch((erro) => alert("Erro ao salvar validade: " + erro.message));
}

function verificarAlertasValidade() {
  fetch(`${API}/validade/alertas`)
    .then((res) => res.json())
    .then((data) => {
      const box = document.getElementById("alertaValidade");
      const conteudo = document.getElementById("alertaValidadeConteudo");
      if (!box || !conteudo) return;

      if (!Array.isArray(data) || data.length === 0) {
        box.style.display = "none";
        conteudo.innerHTML = "";
        alertaValidadeFechado = false;
        return;
      }

      let html = "";
      data.forEach((item) => {
        const dias = parseInt(item.dias_restantes);
        const textoDias = dias < 0
          ? `vencido há ${Math.abs(dias)} dia(s)`
          : `vence em ${dias} dia(s)`;
        html += `• ${item.nome} - ${textoDias} (fim: ${formatarDataBR(item.validade_fim)})<br>`;
      });

      conteudo.innerHTML = html;
      box.style.display = alertaValidadeFechado ? "none" : "block";
    });
}

function fecharAlertaValidade() {
  alertaValidadeFechado = true;
  const box = document.getElementById("alertaValidade");
  if (box) box.style.display = "none";
}

document.addEventListener("input", function (e) {
  if (e.target.id === "buscarProduto") {
    const busca = e.target.value.toLowerCase().trim();
    const lista = document.getElementById("listaProdutos");
    lista.innerHTML = "";

    if (!busca) return;

    produtos
      .filter((p) => p.nome.toLowerCase().includes(busca))
      .forEach((p) => {
        lista.innerHTML += `
          <div onclick="selecionarProduto(${p.id})">
            ${p.nome} - R$ ${numeroSeguro(p.preco).toFixed(2)} | Estoque: ${parseInt(p.estoque) || 0}
          </div>
        `;
      });
  }
});

function selecionarProduto(id) {
  produtoSelecionado = produtos.find((p) => p.id === id);
  if (!produtoSelecionado) return;

  document.getElementById("buscarProduto").value = produtoSelecionado.nome;
  document.getElementById("listaProdutos").innerHTML = "";
  document.getElementById("estoqueDisponivel").innerText = parseInt(produtoSelecionado.estoque) || 0;
}

function adicionarProduto() {
  if (!produtoSelecionado) {
    alert("Selecione um produto.");
    return;
  }

  const qtd = parseInt(document.getElementById("produtoQtd").value);
  const estoqueAtual = parseInt(produtoSelecionado.estoque) || 0;

  if (Number.isNaN(qtd) || qtd <= 0) {
    alert("Digite uma quantidade válida.");
    return;
  }

  if (qtd > estoqueAtual) {
    alert("Quantidade maior que o estoque disponível.");
    return;
  }

  const preco = numeroSeguro(produtoSelecionado.preco);
  const subtotal = preco * qtd;

  carrinho.push({
    id: parseInt(produtoSelecionado.id),
    nome: produtoSelecionado.nome,
    qtd,
    preco,
    subtotal
  });

  atualizarCarrinho();

  document.getElementById("produtoQtd").value = "";
  document.getElementById("buscarProduto").value = "";
  document.getElementById("listaProdutos").innerHTML = "";
  document.getElementById("estoqueDisponivel").innerText = "0";
  produtoSelecionado = null;
}

function atualizarCarrinho() {
  const tabela = document.getElementById("tabelaCarrinho");

  tabela.innerHTML = `
    <tr>
      <th>Produto</th>
      <th>Qtd</th>
      <th>Valor</th>
      <th>Total</th>
      <th></th>
    </tr>
  `;

  carrinho.forEach((item, index) => {
    tabela.innerHTML += `
      <tr>
        <td>${item.nome}</td>
        <td>${item.qtd}</td>
        <td>R$ ${numeroSeguro(item.preco).toFixed(2)}</td>
        <td>R$ ${numeroSeguro(item.subtotal).toFixed(2)}</td>
        <td><button class="btn-remover" onclick="removerItem(${index})">Remover</button></td>
      </tr>
    `;
  });

  calcularTotal();
}

function removerItem(index) {
  carrinho.splice(index, 1);
  atualizarCarrinho();
}

function calcularTotal() {
  total = 0;
  carrinho.forEach((item) => total += numeroSeguro(item.subtotal));
  document.getElementById("total").innerText = total.toFixed(2);
}

function calcularTroco() {
  const forma = document.getElementById("formaPagamento").value;
  const pago = numeroSeguro(document.getElementById("valorPago").value);

  if (total <= 0) {
    alert("Adicione itens no carrinho.");
    return;
  }

  if (forma !== "dinheiro") {
    document.getElementById("troco").innerText = "0.00";
    return;
  }

  if (pago <= 0) {
    alert("Digite o valor recebido.");
    return;
  }

  const troco = pago - total;

  if (troco < 0) {
    alert("Valor recebido menor que o total.");
    return;
  }

  document.getElementById("troco").innerText = troco.toFixed(2);
}

function finalizarVenda() {
  if (carrinho.length === 0) {
    alert("Adicione itens no carrinho.");
    return;
  }

  if (total <= 0) {
    alert("Total inválido.");
    return;
  }

  const formaPagamento = document.getElementById("formaPagamento").value;

  fetch(`${API}/venda`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itens: carrinho,
      total,
      formaPagamento
    })
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.erro) {
        alert(data.erro);
        return;
      }

      alert("Venda registrada com sucesso.");

      carrinho = [];
      total = 0;
      produtoSelecionado = null;

      atualizarCarrinho();
      document.getElementById("total").innerText = "0.00";
      document.getElementById("troco").innerText = "0.00";
      document.getElementById("valorPago").value = "";
      document.getElementById("produtoQtd").value = "";
      document.getElementById("buscarProduto").value = "";
      document.getElementById("listaProdutos").innerHTML = "";
      document.getElementById("estoqueDisponivel").innerText = "0";

      carregarProdutos();
      carregarMovimentacoesEstoque();
      carregarDashboard();
      carregarHistorico();
      carregarFechamentoCaixa();
      carregarRelatorioProduto();
      abrirPagina("historico");
    })
    .catch((erro) => alert("Erro ao finalizar venda: " + erro.message));
}

function abrirCaixa() {
  fetch(`${API}/caixa/abrir`, { method: "POST" })
    .then((res) => res.json())
    .then((data) => {
      if (data.erro) {
        alert(data.erro);
        return;
      }
      alert(data.mensagem || "Caixa aberto com sucesso.");
      carregarDashboard();
      carregarFechamentoCaixa();
    })
    .catch((erro) => alert("Erro ao abrir caixa: " + erro.message));
}

function aplicarFiltroDashboard() {
  carregarDashboard();
}

function hojeDashboard() {
  document.getElementById("filtroDataDashboard").value = hojeISO();
  carregarDashboard();
}

function carregarDashboard() {
  const data = document.getElementById("filtroDataDashboard")?.value || hojeISO();

  fetch(`${API}/dashboard?data=${encodeURIComponent(data)}`)
    .then((res) => res.json())
    .then((dataRetorno) => {
      document.getElementById("fat").innerText = numeroSeguro(dataRetorno.faturamento).toFixed(2);
      document.getElementById("totalProdutos").innerText = dataRetorno.produtos || 0;
      document.getElementById("totalVendas").innerText = dataRetorno.vendas || 0;

      const statusDashboard = document.getElementById("statusCaixaDashboard");
      if (statusDashboard) {
        if (dataRetorno.caixa_aberto === true) statusDashboard.innerText = "Aberto";
        else if (dataRetorno.caixa_aberto === false) statusDashboard.innerText = "Fechado";
        else statusDashboard.innerText = "Histórico";
      }

      desenharGrafico(dataRetorno.grafico || []);
    });
}

function carregarRelatorioProduto() {
  const nome = document.getElementById("filtroProdutoVendido")?.value || "";

  fetch(`${API}/relatorio-produto?nome=${encodeURIComponent(nome)}`)
    .then((res) => res.json())
    .then((data) => {
      const tabela = document.getElementById("tabelaRelatorioProduto");
      if (!tabela) return;

      tabela.innerHTML = `
        <tr>
          <th>Produto</th>
          <th>Qtd Vendida</th>
          <th>Faturamento</th>
        </tr>
      `;

      if (!Array.isArray(data) || data.length === 0) {
        tabela.innerHTML += `<tr><td colspan="3">Nenhum produto encontrado.</td></tr>`;
        return;
      }

      data.forEach((item) => {
        tabela.innerHTML += `
          <tr>
            <td>${item.nome_produto}</td>
            <td>${item.quantidade_total}</td>
            <td>R$ ${numeroSeguro(item.faturamento_total).toFixed(2)}</td>
          </tr>
        `;
      });
    });
}

function carregarFechamentoCaixa() {
  const data = document.getElementById("dataFechamentoCaixa")?.value || hojeISO();

  fetch(`${API}/caixa/resumo?data=${encodeURIComponent(data)}`)
    .then((res) => res.json())
    .then((ret) => {
      document.getElementById("fatCaixa").innerText = numeroSeguro(ret.faturamento).toFixed(2);
      document.getElementById("vendasCaixa").innerText = ret.vendas || 0;
      document.getElementById("statusCaixa").innerText = ret.aberto ? "Aberto" : "Fechado";

      const info = document.getElementById("infoFechamentoCaixa");
      if (!info) return;

      if (!ret.existe_sessao) {
        info.innerHTML = `Nenhum caixa encontrado para <strong>${formatarDataBR(ret.data)}</strong>.`;
        return;
      }

      info.innerHTML = `
        Data: <strong>${formatarDataBR(ret.data)}</strong><br>
        Abertura: <strong>${ret.abertura_em || "-"}</strong><br>
        Fechamento: <strong>${ret.fechado_em || "-"}</strong><br>
        Faturamento: <strong>R$ ${numeroSeguro(ret.faturamento).toFixed(2)}</strong><br>
        Vendas: <strong>${ret.vendas}</strong>
      `;
    });
}

function fecharCaixa() {
  if (!confirm("Deseja realmente fechar o caixa de hoje?")) return;

  fetch(`${API}/caixa/fechar`, { method: "POST" })
    .then((res) => res.json())
    .then((data) => {
      if (data.erro) {
        alert(data.erro);
        return;
      }

      alert(`Caixa fechado com sucesso.\nFaturamento: R$ ${numeroSeguro(data.faturamento).toFixed(2)}\nVendas: ${data.vendas}`);

      carregarDashboard();
      carregarFechamentoCaixa();
      voltarLogin();
    })
    .catch((erro) => alert("Erro ao fechar caixa: " + erro.message));
}

function desenharGrafico(dados) {
  const canvas = document.getElementById("graficoVendas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, w, h);

  const padding = 40;
  const chartW = w - padding * 2;
  const chartH = h - padding * 2;

  ctx.strokeStyle = "#d8dee9";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, h - padding);
  ctx.lineTo(w - padding, h - padding);
  ctx.stroke();

  if (dados.length === 0) {
    ctx.fillStyle = "#666";
    ctx.font = "16px Arial";
    ctx.fillText("Sem vendas para exibir no gráfico.", padding + 20, h / 2);
    return;
  }

  const maxValor = Math.max(...dados.map((item) => numeroSeguro(item.total)), 1);
  const espaco = 20;
  const barWidth = Math.max(30, chartW / dados.length - espaco);

  dados.forEach((item, i) => {
    const valor = numeroSeguro(item.total);
    const barHeight = (valor / maxValor) * (chartH - 20);
    const x = padding + i * (barWidth + espaco) + 10;
    const y = h - padding - barHeight;

    ctx.fillStyle = "#d4a373";
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#3b2417";
    ctx.font = "12px Arial";
    ctx.fillText(item.dia, x, h - padding + 18);
    ctx.fillText(`R$ ${valor.toFixed(2)}`, x, y - 8);
  });
}

function carregarHistorico() {
  const busca = document.getElementById("buscaHistorico")?.value || "";
  const dataInicio = document.getElementById("dataInicioHistorico")?.value || "";
  const dataFim = document.getElementById("dataFimHistorico")?.value || "";
  const status = document.getElementById("statusHistorico")?.value || "TODAS";

  const params = new URLSearchParams({
    busca,
    dataInicio,
    dataFim,
    status
  });

  fetch(`${API}/vendas?${params.toString()}`)
    .then((res) => res.json())
    .then((data) => {
      const tabela = document.getElementById("tabelaVendas");
      if (!tabela) return;

      tabela.innerHTML = `
        <tr>
          <th>ID</th>
          <th>Total</th>
          <th>Forma</th>
          <th>Status</th>
          <th>Data</th>
          <th>Ações</th>
        </tr>
      `;

      if (!Array.isArray(data) || data.length === 0) {
        tabela.innerHTML += `<tr><td colspan="6">Nenhuma venda encontrada.</td></tr>`;
        return;
      }

      data.forEach((v) => {
        tabela.innerHTML += `
          <tr class="linha-venda ${v.status === "CANCELADA" ? "venda-cancelada" : ""}" onclick="verItensVenda(${v.id})">
            <td>${v.id}</td>
            <td>R$ ${numeroSeguro(v.total).toFixed(2)}</td>
            <td>${v.forma_pagamento || "-"}</td>
            <td>${v.status}</td>
            <td>${v.data}</td>
            <td class="acoes-tabela">
              ${
                v.status === "ATIVA"
                  ? `<button class="btn-editar" onclick="event.stopPropagation(); cancelarVenda(${v.id})">Cancelar</button>`
                  : `<span class="status-validade status-vencido">Cancelada</span>`
              }
              <button class="btn-excluir" onclick="event.stopPropagation(); excluirVenda(${v.id})">Excluir</button>
            </td>
          </tr>
        `;
      });
    });
}

function cancelarVenda(vendaId) {
  if (!confirm(`Deseja cancelar a venda #${vendaId}? O estoque será devolvido.`)) return;

  fetch(`${API}/venda/${vendaId}/cancelar`, {
    method: "POST"
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.erro) {
        alert(data.erro);
        return;
      }

      alert("Venda cancelada com sucesso.");

      carregarProdutos();
      carregarMovimentacoesEstoque();
      carregarDashboard();
      carregarHistorico();
      carregarFechamentoCaixa();
      carregarRelatorioProduto();
      carregarControleValidade();
    })
    .catch((erro) => alert("Erro ao cancelar venda: " + erro.message));
}

function excluirVenda(vendaId) {
  if (!confirm(`Deseja excluir a venda #${vendaId}? Essa ação remove a venda do histórico.`)) return;

  fetch(`${API}/venda/${vendaId}/excluir`, {
    method: "DELETE"
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.erro) {
        alert(data.erro);
        return;
      }

      alert("Venda excluída com sucesso.");

      carregarProdutos();
      carregarMovimentacoesEstoque();
      carregarDashboard();
      carregarHistorico();
      carregarFechamentoCaixa();
      carregarRelatorioProduto();
      carregarControleValidade();
    })
    .catch((erro) => alert("Erro ao excluir venda: " + erro.message));
}

function verItensVenda(vendaId) {
  fetch(`${API}/vendas/${vendaId}/itens`)
    .then((res) => res.json())
    .then((data) => {
      const itens = Array.isArray(data) ? data : [];
      const tabela = document.getElementById("tabelaItensVenda");
      const titulo = document.getElementById("modalVendaId");
      const modal = document.getElementById("modalVenda");

      if (!tabela || !titulo || !modal) return;

      titulo.innerText = `#${vendaId}`;

      tabela.innerHTML = `
        <tr>
          <th>Produto</th>
          <th>Qtd</th>
          <th>Valor Unit.</th>
          <th>Subtotal</th>
        </tr>
      `;

      if (itens.length === 0) {
        tabela.innerHTML += `<tr><td colspan="4">Nenhum item encontrado para esta venda.</td></tr>`;
      } else {
        itens.forEach((item) => {
          tabela.innerHTML += `
            <tr>
              <td>${item.nome_produto}</td>
              <td>${item.quantidade}</td>
              <td>R$ ${numeroSeguro(item.preco_unitario).toFixed(2)}</td>
              <td>R$ ${numeroSeguro(item.subtotal).toFixed(2)}</td>
            </tr>
          `;
        });
      }

      modal.style.display = "flex";
    })
    .catch((erro) => alert("Erro ao carregar itens da venda: " + erro.message));
}

function fecharModalVenda() {
  const modal = document.getElementById("modalVenda");
  if (modal) modal.style.display = "none";
}

window.addEventListener("click", function (e) {
  const modal = document.getElementById("modalVenda");
  if (modal && e.target === modal) {
    fecharModalVenda();
  }
});