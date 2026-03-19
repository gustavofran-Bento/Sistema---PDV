const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const frontendPath = path.resolve(__dirname, "../frontend");
const databasePath = path.resolve(__dirname, "../database/padaria.db");
const backupsPath = path.resolve(__dirname, "../backups");

app.use(express.static(frontendPath));

if (!fs.existsSync(backupsPath)) {
  fs.mkdirSync(backupsPath, { recursive: true });
}

const db = new sqlite3.Database(databasePath);

function numeroSeguro(valor) {
  if (typeof valor === "number") {
    return Number.isNaN(valor) ? 0 : valor;
  }

  if (typeof valor === "string") {
    const convertido = Number(valor.replace(",", ".").trim());
    return Number.isNaN(convertido) ? 0 : convertido;
  }

  const convertido = Number(valor);
  return Number.isNaN(convertido) ? 0 : convertido;
}

function dataHojeISO() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function timestampArquivo() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  const hora = String(agora.getHours()).padStart(2, "0");
  const min = String(agora.getMinutes()).padStart(2, "0");
  const seg = String(agora.getSeconds()).padStart(2, "0");
  return `${ano}-${mes}-${dia}_${hora}-${min}-${seg}`;
}

function gerarBackupBanco() {
  try {
    if (!fs.existsSync(databasePath)) return;

    const nomeArquivo = `padaria_backup_${timestampArquivo()}.db`;
    const destino = path.join(backupsPath, nomeArquivo);
    fs.copyFileSync(databasePath, destino);

    const arquivos = fs.readdirSync(backupsPath)
      .filter((nome) => nome.endsWith(".db"))
      .sort()
      .reverse();

    const limite = 20;
    if (arquivos.length > limite) {
      arquivos.slice(limite).forEach((arquivo) => {
        try {
          fs.unlinkSync(path.join(backupsPath, arquivo));
        } catch {}
      });
    }

    console.log(`Backup criado: ${nomeArquivo}`);
  } catch (error) {
    console.error("Erro ao gerar backup:", error.message);
  }
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({
        lastID: this.lastID,
        changes: this.changes
      });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function buscarCaixaAbertoHoje() {
  return await dbGet(
    `
    SELECT *
    FROM caixa_sessoes
    WHERE data_ref = date('now','localtime')
      AND fechamento_em IS NULL
    ORDER BY id DESC
    LIMIT 1
    `
  );
}

async function registrarMovimentacaoEstoque({
  produtoId,
  tipo,
  quantidade,
  estoqueAnterior,
  estoqueNovo,
  observacao = ""
}) {
  await dbRun(
    `
    INSERT INTO movimentacoes_estoque (
      produto_id,
      tipo,
      quantidade,
      estoque_anterior,
      estoque_novo,
      observacao,
      data
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    `,
    [produtoId, tipo, quantidade, estoqueAnterior, estoqueNovo, observacao]
  );
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco REAL NOT NULL DEFAULT 0,
      estoque INTEGER NOT NULL DEFAULT 0,
      validade_inicio TEXT,
      validade_fim TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS caixa_sessoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_ref TEXT NOT NULL,
      abertura_em TEXT NOT NULL,
      fechamento_em TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caixa_sessao_id INTEGER,
      total REAL NOT NULL DEFAULT 0,
      forma_pagamento TEXT DEFAULT 'dinheiro',
      data TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ATIVA',
      cancelada_em TEXT,
      FOREIGN KEY (caixa_sessao_id) REFERENCES caixa_sessoes(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS venda_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      produto_id INTEGER NOT NULL,
      nome_produto TEXT NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 0,
      preco_unitario REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (venda_id) REFERENCES vendas(id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 0,
      estoque_anterior INTEGER NOT NULL DEFAULT 0,
      estoque_novo INTEGER NOT NULL DEFAULT 0,
      observacao TEXT,
      data TEXT NOT NULL,
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    )
  `);

  db.run(`
    UPDATE produtos
    SET preco = 0
    WHERE preco IS NULL OR preco = '' OR preco = 'NaN'
  `);

  db.run(`
    UPDATE produtos
    SET estoque = 0
    WHERE estoque IS NULL OR estoque = '' OR estoque = 'NaN'
  `);

  db.all("PRAGMA table_info(produtos)", (err, colunas) => {
    if (!err && Array.isArray(colunas)) {
      const temInicio = colunas.some((c) => c.name === "validade_inicio");
      const temFim = colunas.some((c) => c.name === "validade_fim");

      if (!temInicio) db.run(`ALTER TABLE produtos ADD COLUMN validade_inicio TEXT`);
      if (!temFim) db.run(`ALTER TABLE produtos ADD COLUMN validade_fim TEXT`);
    }
  });

  db.all("PRAGMA table_info(vendas)", (err, colunas) => {
    if (!err && Array.isArray(colunas)) {
      const temCaixaSessao = colunas.some((c) => c.name === "caixa_sessao_id");
      const temStatus = colunas.some((c) => c.name === "status");
      const temCancelada = colunas.some((c) => c.name === "cancelada_em");

      if (!temCaixaSessao) db.run(`ALTER TABLE vendas ADD COLUMN caixa_sessao_id INTEGER`);
      if (!temStatus) db.run(`ALTER TABLE vendas ADD COLUMN status TEXT NOT NULL DEFAULT 'ATIVA'`);
      if (!temCancelada) db.run(`ALTER TABLE vendas ADD COLUMN cancelada_em TEXT`);
    }
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.get("/teste", (req, res) => {
  res.send("SERVIDOR OK");
});

app.get("/backup/status", (req, res) => {
  try {
    const arquivos = fs.readdirSync(backupsPath)
      .filter((nome) => nome.endsWith(".db"))
      .sort()
      .reverse();

    res.json({
      pasta: backupsPath,
      total: arquivos.length,
      ultimo: arquivos[0] || null
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/produto", async (req, res) => {
  try {
    const nome = String(req.body.nome || "").trim();
    const preco = numeroSeguro(req.body.preco);
    const estoque = parseInt(req.body.estoque);

    if (!nome || preco <= 0 || Number.isNaN(estoque) || estoque < 0) {
      return res.status(400).json({ erro: "Dados do produto inválidos." });
    }

    const result = await dbRun(
      "INSERT INTO produtos (nome, preco, estoque) VALUES (?, ?, ?)",
      [nome, preco, estoque]
    );

    if (estoque > 0) {
      await registrarMovimentacaoEstoque({
        produtoId: result.lastID,
        tipo: "CADASTRO",
        quantidade: estoque,
        estoqueAnterior: 0,
        estoqueNovo: estoque,
        observacao: "Cadastro inicial do produto"
      });
    }

    res.json({ ok: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put("/produto/:id/preco", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const preco = numeroSeguro(req.body.preco);

    if (Number.isNaN(id) || preco <= 0) {
      return res.status(400).json({ erro: "Dados inválidos para atualizar preço." });
    }

    const result = await dbRun(
      "UPDATE produtos SET preco = ? WHERE id = ?",
      [preco, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ erro: "Produto não encontrado." });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/produto/:id/estoque/adicionar", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const quantidade = parseInt(req.body.quantidade);

    if (Number.isNaN(id) || Number.isNaN(quantidade) || quantidade <= 0) {
      return res.status(400).json({ erro: "Quantidade inválida." });
    }

    const produto = await dbGet("SELECT * FROM produtos WHERE id = ?", [id]);
    if (!produto) {
      return res.status(404).json({ erro: "Produto não encontrado." });
    }

    const estoqueAnterior = parseInt(produto.estoque) || 0;
    const estoqueNovo = estoqueAnterior + quantidade;

    await dbRun(
      "UPDATE produtos SET estoque = ? WHERE id = ?",
      [estoqueNovo, id]
    );

    await registrarMovimentacaoEstoque({
      produtoId: id,
      tipo: "ENTRADA",
      quantidade,
      estoqueAnterior,
      estoqueNovo,
      observacao: "Entrada manual de estoque"
    });

    res.json({ ok: true, estoque: estoqueNovo });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/produto/:id/estoque/remover", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const quantidade = parseInt(req.body.quantidade);

    if (Number.isNaN(id) || Number.isNaN(quantidade) || quantidade <= 0) {
      return res.status(400).json({ erro: "Quantidade inválida." });
    }

    const produto = await dbGet("SELECT * FROM produtos WHERE id = ?", [id]);
    if (!produto) {
      return res.status(404).json({ erro: "Produto não encontrado." });
    }

    const estoqueAnterior = parseInt(produto.estoque) || 0;
    if (quantidade > estoqueAnterior) {
      return res.status(400).json({ erro: "Quantidade maior que o estoque atual." });
    }

    const estoqueNovo = estoqueAnterior - quantidade;

    await dbRun(
      "UPDATE produtos SET estoque = ? WHERE id = ?",
      [estoqueNovo, id]
    );

    await registrarMovimentacaoEstoque({
      produtoId: id,
      tipo: "SAIDA",
      quantidade,
      estoqueAnterior,
      estoqueNovo,
      observacao: "Saída manual de estoque"
    });

    res.json({ ok: true, estoque: estoqueNovo });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put("/produto/:id/estoque/ajustar", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const estoque = parseInt(req.body.estoque);

    if (Number.isNaN(id) || Number.isNaN(estoque) || estoque < 0) {
      return res.status(400).json({ erro: "Estoque inválido." });
    }

    const produto = await dbGet("SELECT * FROM produtos WHERE id = ?", [id]);
    if (!produto) {
      return res.status(404).json({ erro: "Produto não encontrado." });
    }

    const estoqueAnterior = parseInt(produto.estoque) || 0;

    await dbRun(
      "UPDATE produtos SET estoque = ? WHERE id = ?",
      [estoque, id]
    );

    await registrarMovimentacaoEstoque({
      produtoId: id,
      tipo: "AJUSTE",
      quantidade: Math.abs(estoque - estoqueAnterior),
      estoqueAnterior,
      estoqueNovo: estoque,
      observacao: "Ajuste manual de estoque"
    });

    res.json({ ok: true, estoque });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.delete("/produto/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({ erro: "Produto inválido." });
    }

    const result = await dbRun("DELETE FROM produtos WHERE id = ?", [id]);

    if (result.changes === 0) {
      return res.status(404).json({ erro: "Produto não encontrado." });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/produtos", async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM produtos ORDER BY nome ASC");

    res.json(
      rows.map((p) => ({
        id: p.id,
        nome: p.nome,
        preco: numeroSeguro(p.preco),
        estoque: parseInt(p.estoque) || 0,
        validade_inicio: p.validade_inicio || "",
        validade_fim: p.validade_fim || ""
      }))
    );
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put("/produto/:id/validade", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const validadeInicio = String(req.body.validade_inicio || "").trim();
    const validadeFim = String(req.body.validade_fim || "").trim();

    if (Number.isNaN(id)) {
      return res.status(400).json({ erro: "Produto inválido." });
    }

    if (!validadeInicio || !validadeFim) {
      return res.status(400).json({ erro: "Informe início e fim da validade." });
    }

    if (validadeFim < validadeInicio) {
      return res.status(400).json({ erro: "A data final não pode ser menor que a inicial." });
    }

    const result = await dbRun(
      "UPDATE produtos SET validade_inicio = ?, validade_fim = ? WHERE id = ?",
      [validadeInicio, validadeFim, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ erro: "Produto não encontrado." });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/validade/alertas", async (req, res) => {
  try {
    const rows = await dbAll(
      `
      SELECT
        id,
        nome,
        estoque,
        validade_inicio,
        validade_fim,
        CAST(julianday(validade_fim) - julianday(date('now','localtime')) AS INTEGER) AS dias_restantes
      FROM produtos
      WHERE validade_fim IS NOT NULL
        AND validade_fim <> ''
        AND date(validade_fim) <= date('now','localtime', '+10 day')
      ORDER BY date(validade_fim) ASC
      `
    );

    res.json(
      rows.map((item) => ({
        id: item.id,
        nome: item.nome,
        estoque: parseInt(item.estoque) || 0,
        validade_inicio: item.validade_inicio || "",
        validade_fim: item.validade_fim || "",
        dias_restantes: parseInt(item.dias_restantes)
      }))
    );
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/estoque/movimentacoes", async (req, res) => {
  try {
    const produto = String(req.query.produto || "").trim();

    const rows = await dbAll(
      `
      SELECT
        m.*,
        p.nome
      FROM movimentacoes_estoque m
      INNER JOIN produtos p ON p.id = m.produto_id
      WHERE ? = '' OR lower(p.nome) LIKE lower('%' || ? || '%')
      ORDER BY m.id DESC
      LIMIT 100
      `,
      [produto, produto]
    );

    res.json(
      rows.map((m) => ({
        id: m.id,
        produto_id: m.produto_id,
        nome: m.nome,
        tipo: m.tipo,
        quantidade: parseInt(m.quantidade) || 0,
        estoque_anterior: parseInt(m.estoque_anterior) || 0,
        estoque_novo: parseInt(m.estoque_novo) || 0,
        observacao: m.observacao || "",
        data: m.data
      }))
    );
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/caixa/status", async (req, res) => {
  try {
    const caixa = await buscarCaixaAbertoHoje();

    res.json({
      aberto: !!caixa,
      sessao_id: caixa?.id || null,
      abertura_em: caixa?.abertura_em || null,
      data: dataHojeISO()
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/caixa/abrir", async (req, res) => {
  try {
    const caixa = await buscarCaixaAbertoHoje();

    if (caixa) {
      return res.json({
        ok: true,
        mensagem: "Caixa já está aberto.",
        sessao_id: caixa.id
      });
    }

    const result = await dbRun(
      `
      INSERT INTO caixa_sessoes (data_ref, abertura_em)
      VALUES (date('now','localtime'), datetime('now','localtime'))
      `
    );

    res.json({
      ok: true,
      mensagem: "Caixa aberto com sucesso.",
      sessao_id: result.lastID
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/dashboard", async (req, res) => {
  try {
    const data = String(req.query.data || dataHojeISO()).trim();
    const hoje = dataHojeISO();

    const produtosRow = await dbGet("SELECT COUNT(*) AS produtos FROM produtos");
    const estoqueRow = await dbGet("SELECT COUNT(*) AS estoqueBaixo FROM produtos WHERE estoque <= 5");

    let faturamento = 0;
    let vendas = 0;
    let caixa_aberto = null;

    if (data === hoje) {
      const caixa = await buscarCaixaAbertoHoje();
      caixa_aberto = !!caixa;

      if (caixa) {
        const resumo = await dbGet(
          `
          SELECT
            IFNULL(SUM(total), 0) AS faturamento,
            COUNT(*) AS vendas
          FROM vendas
          WHERE caixa_sessao_id = ?
            AND status = 'ATIVA'
          `,
          [caixa.id]
        );

        faturamento = numeroSeguro(resumo?.faturamento);
        vendas = resumo?.vendas || 0;
      }
    } else {
      const resumo = await dbGet(
        `
        SELECT
          IFNULL(SUM(total), 0) AS faturamento,
          COUNT(*) AS vendas
        FROM vendas
        WHERE date(data) = date(?)
          AND status = 'ATIVA'
        `,
        [data]
      );

      faturamento = numeroSeguro(resumo?.faturamento);
      vendas = resumo?.vendas || 0;
    }

    const graficoRows = await dbAll(
      `
      SELECT strftime('%d/%m', date(data)) AS dia, SUM(total) AS total
      FROM vendas
      WHERE date(data) >= date(?, '-6 day')
        AND date(data) <= date(?)
        AND status = 'ATIVA'
      GROUP BY date(data)
      ORDER BY date(data) ASC
      `,
      [data, data]
    );

    res.json({
      data,
      faturamento,
      vendas,
      produtos: produtosRow?.produtos || 0,
      estoqueBaixo: estoqueRow?.estoqueBaixo || 0,
      caixa_aberto,
      grafico: (graficoRows || []).map((g) => ({
        dia: g.dia,
        total: numeroSeguro(g.total)
      }))
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/relatorio-produto", async (req, res) => {
  try {
    const nome = String(req.query.nome || "").trim();

    const rows = await dbAll(
      `
      SELECT
        vi.nome_produto,
        SUM(vi.quantidade) AS quantidade_total,
        SUM(vi.subtotal) AS faturamento_total
      FROM venda_itens vi
      INNER JOIN vendas v ON v.id = vi.venda_id
      WHERE v.status = 'ATIVA'
        AND (? = '' OR lower(vi.nome_produto) LIKE lower('%' || ? || '%'))
      GROUP BY vi.nome_produto
      ORDER BY faturamento_total DESC
      `,
      [nome, nome]
    );

    res.json(
      rows.map((r) => ({
        nome_produto: r.nome_produto,
        quantidade_total: parseInt(r.quantidade_total) || 0,
        faturamento_total: numeroSeguro(r.faturamento_total)
      }))
    );
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/caixa/resumo", async (req, res) => {
  try {
    const data = String(req.query.data || dataHojeISO()).trim();

    const sessao = await dbGet(
      `
      SELECT *
      FROM caixa_sessoes
      WHERE data_ref = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [data]
    );

    if (!sessao) {
      return res.json({
        data,
        faturamento: 0,
        vendas: 0,
        aberto: false,
        fechado_em: null,
        abertura_em: null,
        existe_sessao: false
      });
    }

    const resumo = await dbGet(
      `
      SELECT
        IFNULL(SUM(total), 0) AS faturamento,
        COUNT(*) AS vendas
      FROM vendas
      WHERE caixa_sessao_id = ?
        AND status = 'ATIVA'
      `,
      [sessao.id]
    );

    res.json({
      data,
      faturamento: numeroSeguro(resumo?.faturamento),
      vendas: resumo?.vendas || 0,
      aberto: !sessao.fechamento_em,
      fechado_em: sessao.fechamento_em || null,
      abertura_em: sessao.abertura_em || null,
      existe_sessao: true
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/caixa/fechar", async (req, res) => {
  try {
    const caixa = await buscarCaixaAbertoHoje();

    if (!caixa) {
      return res.status(400).json({ erro: "Não há caixa aberto hoje." });
    }

    const resumo = await dbGet(
      `
      SELECT
        IFNULL(SUM(total), 0) AS faturamento,
        COUNT(*) AS vendas
      FROM vendas
      WHERE caixa_sessao_id = ?
        AND status = 'ATIVA'
      `,
      [caixa.id]
    );

    await dbRun(
      `
      UPDATE caixa_sessoes
      SET fechamento_em = datetime('now','localtime')
      WHERE id = ?
      `,
      [caixa.id]
    );

    res.json({
      ok: true,
      faturamento: numeroSeguro(resumo?.faturamento),
      vendas: resumo?.vendas || 0
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/vendas", async (req, res) => {
  try {
    const busca = String(req.query.busca || "").trim();
    const dataInicio = String(req.query.dataInicio || "").trim();
    const dataFim = String(req.query.dataFim || "").trim();
    const status = String(req.query.status || "").trim();

    let sql = `
      SELECT *
      FROM vendas
      WHERE 1=1
    `;
    const params = [];

    if (busca) {
      sql += ` AND (CAST(id AS TEXT) LIKE ? OR lower(forma_pagamento) LIKE lower(?))`;
      params.push(`%${busca}%`, `%${busca}%`);
    }

    if (dataInicio) {
      sql += ` AND date(data) >= date(?)`;
      params.push(dataInicio);
    }

    if (dataFim) {
      sql += ` AND date(data) <= date(?)`;
      params.push(dataFim);
    }

    if (status && status !== "TODAS") {
      sql += ` AND status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY id DESC`;

    const rows = await dbAll(sql, params);

    res.json(
      rows.map((v) => ({
        id: v.id,
        total: numeroSeguro(v.total),
        forma_pagamento: v.forma_pagamento || "-",
        data: v.data,
        status: v.status || "ATIVA",
        cancelada_em: v.cancelada_em || null
      }))
    );
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/vendas/:id/itens", async (req, res) => {
  try {
    const vendaId = parseInt(req.params.id);

    if (Number.isNaN(vendaId)) {
      return res.status(400).json({ erro: "ID inválido." });
    }

    const rows = await dbAll(
      `
      SELECT
        id,
        venda_id,
        produto_id,
        nome_produto,
        quantidade,
        preco_unitario,
        subtotal
      FROM venda_itens
      WHERE venda_id = ?
      ORDER BY id ASC
      `,
      [vendaId]
    );

    res.json(
      rows.map((item) => ({
        id: item.id,
        venda_id: item.venda_id,
        produto_id: item.produto_id,
        nome_produto: item.nome_produto,
        quantidade: parseInt(item.quantidade) || 0,
        preco_unitario: numeroSeguro(item.preco_unitario),
        subtotal: numeroSeguro(item.subtotal)
      }))
    );
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/venda/:id/cancelar", async (req, res) => {
  try {
    const vendaId = parseInt(req.params.id);

    if (Number.isNaN(vendaId)) {
      return res.status(400).json({ erro: "Venda inválida." });
    }

    const venda = await dbGet("SELECT * FROM vendas WHERE id = ?", [vendaId]);
    if (!venda) {
      return res.status(404).json({ erro: "Venda não encontrada." });
    }

    if (venda.status === "CANCELADA") {
      return res.status(400).json({ erro: "Essa venda já foi cancelada." });
    }

    const itens = await dbAll(
      "SELECT * FROM venda_itens WHERE venda_id = ? ORDER BY id ASC",
      [vendaId]
    );

    for (const item of itens) {
      const produto = await dbGet("SELECT * FROM produtos WHERE id = ?", [item.produto_id]);
      if (!produto) continue;

      const estoqueAnterior = parseInt(produto.estoque) || 0;
      const quantidade = parseInt(item.quantidade) || 0;
      const estoqueNovo = estoqueAnterior + quantidade;

      await dbRun(
        "UPDATE produtos SET estoque = ? WHERE id = ?",
        [estoqueNovo, item.produto_id]
      );

      await registrarMovimentacaoEstoque({
        produtoId: item.produto_id,
        tipo: "CANCELAMENTO_VENDA",
        quantidade,
        estoqueAnterior,
        estoqueNovo,
        observacao: `Cancelamento da venda #${vendaId}`
      });
    }

    await dbRun(
      `
      UPDATE vendas
      SET status = 'CANCELADA',
          cancelada_em = datetime('now','localtime')
      WHERE id = ?
      `,
      [vendaId]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.delete("/venda/:id/excluir", async (req, res) => {
  try {
    const vendaId = parseInt(req.params.id);

    if (Number.isNaN(vendaId)) {
      return res.status(400).json({ erro: "Venda inválida." });
    }

    const venda = await dbGet("SELECT * FROM vendas WHERE id = ?", [vendaId]);
    if (!venda) {
      return res.status(404).json({ erro: "Venda não encontrada." });
    }

    if (venda.status === "ATIVA") {
      const itens = await dbAll(
        "SELECT * FROM venda_itens WHERE venda_id = ? ORDER BY id ASC",
        [vendaId]
      );

      for (const item of itens) {
        const produto = await dbGet("SELECT * FROM produtos WHERE id = ?", [item.produto_id]);
        if (!produto) continue;

        const estoqueAnterior = parseInt(produto.estoque) || 0;
        const quantidade = parseInt(item.quantidade) || 0;
        const estoqueNovo = estoqueAnterior + quantidade;

        await dbRun(
          "UPDATE produtos SET estoque = ? WHERE id = ?",
          [estoqueNovo, item.produto_id]
        );

        await registrarMovimentacaoEstoque({
          produtoId: item.produto_id,
          tipo: "EXCLUSAO_VENDA",
          quantidade,
          estoqueAnterior,
          estoqueNovo,
          observacao: `Exclusão da venda #${vendaId}`
        });
      }
    }

    await dbRun("DELETE FROM venda_itens WHERE venda_id = ?", [vendaId]);
    await dbRun("DELETE FROM vendas WHERE id = ?", [vendaId]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/venda", async (req, res) => {
  try {
    const itens = Array.isArray(req.body.itens) ? req.body.itens : [];
    const total = numeroSeguro(req.body.total);
    const formaPagamento = String(req.body.formaPagamento || "dinheiro").trim();

    if (itens.length === 0) {
      return res.status(400).json({ erro: "Carrinho vazio." });
    }

    if (total <= 0) {
      return res.status(400).json({ erro: "Total inválido." });
    }

    const caixa = await buscarCaixaAbertoHoje();
    if (!caixa) {
      return res.status(400).json({ erro: "Abra o caixa antes de registrar vendas." });
    }

    const vendaResult = await dbRun(
      `
      INSERT INTO vendas (caixa_sessao_id, total, forma_pagamento, data, status)
      VALUES (?, ?, ?, datetime('now','localtime'), 'ATIVA')
      `,
      [caixa.id, total, formaPagamento]
    );

    const vendaId = vendaResult.lastID;

    for (const item of itens) {
      const id = parseInt(item.id);
      const qtd = parseInt(item.qtd);
      const nomeProduto = String(item.nome || "").trim();
      const precoUnitario = numeroSeguro(item.preco);
      const subtotal = numeroSeguro(item.subtotal);

      if (
        Number.isNaN(id) ||
        Number.isNaN(qtd) ||
        qtd <= 0 ||
        !nomeProduto ||
        precoUnitario <= 0 ||
        subtotal <= 0
      ) {
        return res.status(400).json({ erro: "Item inválido na venda." });
      }

      const produto = await dbGet("SELECT * FROM produtos WHERE id = ?", [id]);
      if (!produto) {
        return res.status(400).json({ erro: "Produto não encontrado." });
      }

      const estoqueAnterior = parseInt(produto.estoque) || 0;
      if (qtd > estoqueAnterior) {
        return res.status(400).json({ erro: "Estoque insuficiente." });
      }

      const estoqueNovo = estoqueAnterior - qtd;

      await dbRun(
        "UPDATE produtos SET estoque = ? WHERE id = ?",
        [estoqueNovo, id]
      );

      await dbRun(
        `
        INSERT INTO venda_itens (
          venda_id,
          produto_id,
          nome_produto,
          quantidade,
          preco_unitario,
          subtotal
        ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        [vendaId, id, nomeProduto, qtd, precoUnitario, subtotal]
      );

      await registrarMovimentacaoEstoque({
        produtoId: id,
        tipo: "VENDA",
        quantidade: qtd,
        estoqueAnterior,
        estoqueNovo,
        observacao: `Venda #${vendaId}`
      });
    }

    res.json({ ok: true, vendaId });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

gerarBackupBanco();
setInterval(gerarBackupBanco, 10 * 60 * 1000);

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Servidor rodando em http://127.0.0.1:${PORT}`);
  console.log("Mantenha este terminal aberto.");
});