const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {promisify} = require('node:util');
const {
  randomBytes,
  scrypt: scryptCallback,
  timingSafeEqual
} = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');

const scrypt = promisify(scryptCallback);
const projectRoot = path.resolve(__dirname, '..');
const database = new DatabaseSync(path.join(projectRoot, 'database', 'CF.sqlite'));
const demoPasswordSalt = '4d22cccf39de031943f6ac7eeab2337c';
const demoPasswordHash = '33b2237e84d3bb3197c85e474e437ef1a11199fc03fbb685377b5b9825400734f6bc1771232c71824f69712f035aef0980f214b73050ecae72b32f82e3f8b737';

function tableExists(tableName) {
  return Boolean(database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(tableName));
}

function ensureColumn(tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some(column => column.name === columnName)) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function initializeDatabase() {
  database.exec('PRAGMA foreign_keys = OFF');
  database.exec(
    `CREATE TABLE IF NOT EXISTS stores (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL,
       slug TEXT NOT NULL UNIQUE,
       created_at TEXT NOT NULL
     );
     INSERT OR IGNORE INTO stores (id, name, slug, created_at)
     VALUES (1, 'CF Eletrônicos', 'cf-eletronicos', CURRENT_TIMESTAMP);`
  );

  if (tableExists('users')) {
    database.exec('DROP INDEX IF EXISTS users_single_admin');
    ensureColumn('users', 'username', 'TEXT');
    ensureColumn('users', 'avatar_data', 'TEXT');
    ensureColumn('users', 'store_id', 'INTEGER REFERENCES stores(id)');
    const usernames = new Set();
    const updateUsername = database.prepare('UPDATE users SET username = ? WHERE id = ?');
    for (const user of database.prepare('SELECT id, email, username FROM users ORDER BY id').all()) {
      const emailName = user.email.split('@')[0];
      let username = String(user.username || emailName).toLowerCase()
        .replace(/[^a-z0-9._-]/g, '').slice(0, 24);
      if (username.length < 3) username = `loja${user.id}`;
      const base = username;
      let suffix = 1;
      while (usernames.has(username)) {
        username = `${base.slice(0, 20)}${user.id}${suffix > 1 ? suffix : ''}`;
        suffix += 1;
      }
      usernames.add(username);
      if (user.username !== username) updateUsername.run(username, user.id);
    }
    database.exec('UPDATE users SET store_id = 1 WHERE store_id IS NULL');
  }

  if (tableExists('products')) {
    ensureColumn('products', 'store_id', 'INTEGER REFERENCES stores(id)');
    ensureColumn('products', 'cost_cents', 'INTEGER CHECK (cost_cents IS NULL OR cost_cents >= 0)');
    database.exec('UPDATE products SET store_id = 1 WHERE store_id IS NULL');
  }

  if (tableExists('orders')) {
    ensureColumn('orders', 'store_id', 'INTEGER REFERENCES stores(id)');
    ensureColumn('orders', 'customer_email', 'TEXT');
    ensureColumn('orders', 'customer_phone', 'TEXT');
    database.exec('UPDATE orders SET store_id = 1 WHERE store_id IS NULL');
  }

  if (tableExists('order_items')) {
    ensureColumn('order_items', 'unit_cost_cents', 'INTEGER CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0)');
    ensureColumn('order_items', 'line_cost_cents', 'INTEGER CHECK (line_cost_cents IS NULL OR line_cost_cents >= 0)');
  }

  database.exec(fs.readFileSync(path.join(projectRoot, 'database', 'schema.sql'), 'utf8'));
  database.exec('PRAGMA foreign_keys = ON');
}

function seedDemoData() {
  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare(
      `INSERT OR IGNORE INTO stores (name, slug, created_at)
       VALUES (?, ?, ?)`
    ).run('Loja Tech do Pedro', 'loja-do-pedro', new Date().toISOString());
    const store = database.prepare('SELECT id FROM stores WHERE slug = ?').get('loja-do-pedro');
    if (!store) throw new Error('Não foi possível inicializar a loja de demonstração.');

    const usernameOwner = database.prepare('SELECT id, email FROM users WHERE username = ?').get('teste');
    if (usernameOwner && usernameOwner.email !== 'pedro@gmail.com') {
      throw new Error('O usuário de demonstração "teste" já está associado a outra conta.');
    }
    const existingDemoUser = database.prepare('SELECT id FROM users WHERE email = ?').get('pedro@gmail.com');
    if (existingDemoUser) {
      database.prepare(
        `UPDATE users
         SET name = ?, username = ?, password_salt = ?, password_hash = ?, store_id = ?, role = 'admin'
         WHERE id = ?`
      ).run('Pedro', 'teste', demoPasswordSalt, demoPasswordHash, store.id, existingDemoUser.id);
    } else {
      database.prepare(
        `INSERT INTO users (name, username, email, password_salt, password_hash, avatar_data, store_id, role, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, 'admin', ?)`
      ).run('Pedro', 'teste', 'pedro@gmail.com', demoPasswordSalt, demoPasswordHash, store.id, new Date().toISOString());
    }

    const productCount = database.prepare('SELECT COUNT(*) AS count FROM products WHERE store_id = ?').get(store.id).count;
    if (productCount === 0) {
      const products = [
        ['Smartphone CF One', 'Smartphone demonstrativo com câmera dupla.', 'Celulares', 189990, 132000, 20],
        ['Notebook CF Air 14', 'Notebook leve para estudos e trabalho.', 'Computadores', 329900, 238000, 12],
        ['Fone Bluetooth CF Sound', 'Fone sem fio com microfone integrado.', 'Áudio', 29990, 17000, 30],
        ['Smart TV CF Vision 55', 'Televisor 4K de 55 polegadas.', 'TV e vídeo', 279990, 195000, 8],
        ['Smartwatch CF Active', 'Relógio inteligente para atividades.', 'Acessórios', 59990, 36000, 16],
        ['Console CF Play', 'Console para jogos e entretenimento.', 'Games', 389990, 310000, 6],
        ['Mouse sem fio CF Click', 'Mouse compacto com conexão sem fio.', 'Acessórios', 8990, 4500, 45],
        ['SSD portátil CF 1 TB', 'Armazenamento portátil de 1 TB.', 'Computadores', 45990, 28500, 12]
      ];
      const insertProduct = database.prepare(
        `INSERT INTO products
           (store_id, name, description, category, price_cents, cost_cents, stock, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const productIds = products.map(product => Number(insertProduct.run(
        store.id, ...product, new Date().toISOString(), new Date().toISOString()
      ).lastInsertRowid));
      const demoOrders = [
        {daysAgo: 1, number: 'CF-DEMO-001', customer: 'Ana Martins', status: 'paid', items: [[0, 1], [2, 2]]},
        {daysAgo: 3, number: 'CF-DEMO-002', customer: 'Bruno Lima', status: 'shipped', items: [[1, 1], [6, 3]]},
        {daysAgo: 7, number: 'CF-DEMO-003', customer: 'Carla Souza', status: 'paid', items: [[3, 1]]},
        {daysAgo: 15, number: 'CF-DEMO-004', customer: 'Diego Alves', status: 'paid', items: [[2, 3], [4, 1]]},
        {daysAgo: 22, number: 'CF-DEMO-005', customer: 'Eva Costa', status: 'paid', items: [[5, 1], [7, 2]]},
        {daysAgo: 0, number: 'CF-DEMO-006', customer: 'Felipe Rocha', status: 'pending', items: [[6, 1]]}
      ];
      const getProduct = database.prepare(
        'SELECT id, name, price_cents, cost_cents FROM products WHERE id = ? AND store_id = ?'
      );
      const insertOrder = database.prepare(
        `INSERT INTO orders (store_id, order_number, customer_name, status, total_cents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      const insertItem = database.prepare(
        `INSERT INTO order_items
           (order_id, product_id, product_name, unit_price_cents, unit_cost_cents, quantity, line_total_cents, line_cost_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const reduceStock = database.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      for (const order of demoOrders) {
        const orderDate = new Date(Date.now() - order.daysAgo * 24 * 60 * 60 * 1000).toISOString();
        const lines = order.items.map(([index, quantity]) => {
          const product = getProduct.get(productIds[index], store.id);
          return {...product, quantity};
        });
        const totalCents = lines.reduce((sum, line) => sum + line.price_cents * line.quantity, 0);
        const orderId = Number(insertOrder.run(
          store.id, order.number, order.customer, order.status, totalCents, orderDate, orderDate
        ).lastInsertRowid);
        for (const line of lines) {
          insertItem.run(
            orderId, line.id, line.name, line.price_cents, line.cost_cents, line.quantity,
            line.price_cents * line.quantity, line.cost_cents * line.quantity
          );
          reduceStock.run(line.quantity, line.id);
        }
      }
      const expenses = [
        ['Aluguel do ponto', 'Aluguel', 45000, 20],
        ['Anúncios da loja', 'Marketing', 12000, 12],
        ['Materiais de embalagem', 'Operação', 3500, 7],
        ['Conta de energia', 'Contas', 8000, 4],
        ['Internet da loja', 'Contas', 5000, 1]
      ];
      const insertExpense = database.prepare(
        `INSERT INTO expenses (store_id, description, category, amount_cents, expense_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const [description, category, amountCents, daysAgo] of expenses) {
        const expenseDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        insertExpense.run(store.id, description, category, amountCents, expenseDate, new Date().toISOString());
      }
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

initializeDatabase();
seedDemoData();

const sessions = new Map();
const customerSessions = new Map();
const cookieName = 'cf_admin_session';
const customerCookieName = 'cf_customer_session';
const sessionDurationMs = 12 * 60 * 60 * 1000;
const bodyLimitBytes = 32 * 1024;
const moneyFormatter = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJSON(response, status, payload, headers) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
}

async function readJSON(request, maxBytes = bodyLimitBytes) {
  const contentType = request.headers['content-type'] || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Envie os dados no formato JSON.');
  }
  const contentLength = Number(request.headers['content-length'] || 0);
  if (contentLength > maxBytes) throw new HttpError(413, 'O conteúdo enviado é muito grande.');
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) throw new HttpError(413, 'O conteúdo enviado é muito grande.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('JSON must be an object');
    return body;
  } catch {
    throw new HttpError(400, 'O conteúdo enviado não é um JSON válido.');
  }
}

function getCookie(request, name) {
  for (const pair of (request.headers.cookie || '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    return pair.slice(separator + 1).trim();
  }
  return '';
}

function getSession(request) {
  const token = getCookie(request, cookieName);
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return {...session, token};
}

function requireAdmin(request) {
  const session = getSession(request);
  if (!session) throw new HttpError(401, 'Entre com a conta administrativa para continuar.');
  const user = database.prepare(
    `SELECT u.id, u.name, u.username, u.email, u.avatar_data, u.store_id, u.role,
            s.name AS store_name, s.slug AS store_slug
     FROM users u JOIN stores s ON s.id = u.store_id
     WHERE u.id = ?`
  ).get(session.userId);
  if (!user || user.role !== 'admin') throw new HttpError(403, 'Acesso permitido somente à administração.');
  return user;
}

function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, {userId, expiresAt: Date.now() + sessionDurationMs});
  return `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionDurationMs / 1000}`;
}

function getCustomerSession(request) {
  const token = getCookie(request, customerCookieName);
  const session = customerSessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    customerSessions.delete(token);
    return null;
  }
  return {...session, token};
}

function createCustomerSession(customerId) {
  const token = randomBytes(32).toString('hex');
  customerSessions.set(token, {customerId, expiresAt: Date.now() + sessionDurationMs});
  return `${customerCookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionDurationMs / 1000}`;
}

function publicCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    storeId: customer.store_id
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    avatarData: user.avatar_data,
    role: user.role,
    store: {id: user.store_id, name: user.store_name, slug: user.store_slug}
  };
}

function getUserById(userId) {
  return database.prepare(
    `SELECT u.id, u.name, u.username, u.email, u.avatar_data, u.store_id, u.role,
            s.name AS store_name, s.slug AS store_slug
     FROM users u JOIN stores s ON s.id = u.store_id
     WHERE u.id = ?`
  ).get(userId);
}

function productResponse(row, includeCost = false) {
  const product = {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    price: row.price_cents / 100,
    stock: row.stock,
    imageUrl: row.image_url,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (includeCost) product.cost = row.cost_cents === null ? null : row.cost_cents / 100;
  return product;
}

function productRows(storeId, includeInactive) {
  const condition = includeInactive ? '' : 'AND active = 1';
  return database.prepare(
    `SELECT id, name, description, category, price_cents, cost_cents, stock, image_url, active, created_at, updated_at
     FROM products WHERE store_id = ? ${condition}
     ORDER BY active DESC, category, name`
  ).all(storeId).map(row => productResponse(row, includeInactive));
}

function validateProduct(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const price = Number(body.price);
  const cost = Number(body.cost);
  const stock = Number(body.stock);
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';

  if (name.length < 2 || name.length > 120) throw new HttpError(400, 'O nome deve ter de 2 a 120 caracteres.');
  if (description.length > 1500) throw new HttpError(400, 'A descrição deve ter no máximo 1500 caracteres.');
  if (category.length < 2 || category.length > 50) throw new HttpError(400, 'Informe uma categoria válida.');
  if (!Number.isFinite(price) || price <= 0 || price > 100_000_000) {
    throw new HttpError(400, 'Informe um preço maior que zero e menor que R$ 100.000.000.');
  }
  if (!Number.isFinite(cost) || cost < 0 || cost > 100_000_000) {
    throw new HttpError(400, 'Informe um custo válido entre R$ 0,00 e R$ 100.000.000.');
  }
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1_000_000) {
    throw new HttpError(400, 'O estoque deve ser um número inteiro entre 0 e 1.000.000.');
  }
  if (imageUrl) {
    let url;
    try {
      url = new URL(imageUrl);
    } catch {
      throw new HttpError(400, 'O endereço da imagem não é válido.');
    }
    if (url.protocol !== 'https:' || imageUrl.length > 1000) {
      throw new HttpError(400, 'A imagem deve usar um endereço HTTPS de até 1000 caracteres.');
    }
  }
  return {
    name,
    description,
    category,
    priceCents: Math.round(price * 100),
    costCents: Math.round(cost * 100),
    stock,
    imageUrl
  };
}

function orderResponse(row) {
  return {
    id: row.id,
    number: row.order_number,
    customerName: row.customer_name,
    customerEmail: row.customer_email || '',
    customerPhone: row.customer_phone || '',
    status: row.status,
    total: row.total_cents / 100,
    itemCount: row.item_count,
    createdAt: row.created_at
  };
}

function calculateSummary(storeId) {
  const productTotals = database.prepare(
    `SELECT COUNT(*) AS product_count,
            COALESCE(SUM(stock), 0) AS stock_units,
            COALESCE(SUM(price_cents * stock), 0) AS inventory_value_cents,
            COALESCE(SUM(CASE WHEN stock <= 3 THEN 1 ELSE 0 END), 0) AS low_stock_count
     FROM products WHERE store_id = ? AND active = 1`
  ).get(storeId);
  const orderTotals = database.prepare(
    `SELECT COUNT(*) AS order_count,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_count,
            COALESCE(SUM(CASE WHEN status IN ('paid', 'shipped') THEN total_cents ELSE 0 END), 0) AS revenue_cents
     FROM orders WHERE store_id = ?`
  ).get(storeId);
  return {
    productCount: productTotals.product_count,
    stockUnits: productTotals.stock_units,
    inventoryValue: productTotals.inventory_value_cents / 100,
    lowStockCount: productTotals.low_stock_count,
    orderCount: orderTotals.order_count,
    pendingOrderCount: orderTotals.pending_count,
    confirmedRevenue: orderTotals.revenue_cents / 100
  };
}

function calculateFinance(storeId, periodDays) {
  const startDate = new Date(Date.now() - (periodDays - 1) * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const startAt = `${startDate}T00:00:00.000Z`;
  const endDate = new Date().toISOString().slice(0, 10);

  const sales = database.prepare(
    `SELECT COUNT(*) AS order_count, COALESCE(SUM(total_cents), 0) AS revenue_cents
     FROM orders
     WHERE store_id = ? AND status IN ('paid', 'shipped') AND created_at >= ?`
  ).get(storeId, startAt);
  const costs = database.prepare(
    `SELECT COALESCE(SUM(oi.line_cost_cents), 0) AS cost_cents,
            COALESCE(SUM(CASE WHEN oi.line_cost_cents IS NULL THEN 1 ELSE 0 END), 0) AS missing_cost_items
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.store_id = ? AND o.status IN ('paid', 'shipped') AND o.created_at >= ?`
  ).get(storeId, startAt);
  const expenseTotals = database.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS expense_cents
     FROM expenses WHERE store_id = ? AND expense_date >= ? AND expense_date <= ?`
  ).get(storeId, startDate, endDate);
  const dailySales = database.prepare(
    `SELECT date(created_at) AS day, SUM(total_cents) AS revenue_cents
     FROM orders
     WHERE store_id = ? AND status IN ('paid', 'shipped') AND created_at >= ?
     GROUP BY date(created_at)`
  ).all(storeId, startAt);
  const dailyCosts = database.prepare(
    `SELECT date(o.created_at) AS day, COALESCE(SUM(oi.line_cost_cents), 0) AS cost_cents
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.store_id = ? AND o.status IN ('paid', 'shipped') AND o.created_at >= ?
     GROUP BY date(o.created_at)`
  ).all(storeId, startAt);
  const dailyExpenses = database.prepare(
    `SELECT expense_date AS day, SUM(amount_cents) AS expense_cents
     FROM expenses WHERE store_id = ? AND expense_date >= ? AND expense_date <= ?
     GROUP BY expense_date`
  ).all(storeId, startDate, endDate);
  const profitAvailable = costs.missing_cost_items === 0;
  const days = new Map();
  for (const row of dailySales) days.set(row.day, {...(days.get(row.day) || {}), revenue: row.revenue_cents});
  for (const row of dailyCosts) days.set(row.day, {...(days.get(row.day) || {}), costs: row.cost_cents});
  for (const row of dailyExpenses) days.set(row.day, {...(days.get(row.day) || {}), expenses: row.expense_cents});
  const series = [];
  for (let offset = 0; offset < periodDays; offset += 1) {
    const day = new Date(Date.parse(`${startDate}T00:00:00.000Z`) + offset * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const values = days.get(day) || {};
    const revenueCents = values.revenue || 0;
    const costCents = values.costs || 0;
    const expenseCents = values.expenses || 0;
    series.push({
      day,
      revenue: revenueCents / 100,
      profit: profitAvailable ? (revenueCents - costCents - expenseCents) / 100 : null
    });
  }
  const revenueCents = sales.revenue_cents;
  const costCents = costs.cost_cents;
  const expenseCents = expenseTotals.expense_cents;
  return {
    summary: {
      periodDays,
      revenue: revenueCents / 100,
      productCosts: costCents / 100,
      expenses: expenseCents / 100,
      grossProfit: profitAvailable ? (revenueCents - costCents) / 100 : null,
      netProfit: profitAvailable ? (revenueCents - costCents - expenseCents) / 100 : null,
      paidOrderCount: sales.order_count,
      averageOrderValue: sales.order_count ? revenueCents / sales.order_count / 100 : 0,
      missingCostItems: costs.missing_cost_items
    },
    series,
    expenses: database.prepare(
      `SELECT id, description, category, amount_cents, expense_date
       FROM expenses WHERE store_id = ? AND expense_date >= ? AND expense_date <= ?
       ORDER BY expense_date DESC, id DESC LIMIT 50`
    ).all(storeId, startDate, endDate).map(row => ({
      id: row.id,
      description: row.description,
      category: row.category,
      amount: row.amount_cents / 100,
      date: row.expense_date
    }))
  };
}

function listOrders(storeId) {
  return database.prepare(
    `SELECT o.id, o.order_number, o.customer_name, o.customer_email, o.customer_phone,
            o.status, o.total_cents, o.created_at,
            COALESCE(SUM(oi.quantity), 0) AS item_count
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.store_id = ?
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT 100`
  ).all(storeId).map(orderResponse);
}

function validateCheckout(body) {
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
  const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim().toLowerCase() : '';
  const customerPhone = typeof body.customerPhone === 'string' ? body.customerPhone.trim() : '';
  const storeSlug = typeof body.storeSlug === 'string' && body.storeSlug
    ? body.storeSlug.trim().toLowerCase()
    : 'loja-do-pedro';
  if (customerName.length < 2 || customerName.length > 80) {
    throw new HttpError(400, 'Informe seu nome com 2 a 80 caracteres.');
  }
  if (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    throw new HttpError(400, 'Informe um endereço de e-mail válido.');
  }
  if (customerPhone.length < 10 || customerPhone.length > 20) {
    throw new HttpError(400, 'Informe um telefone válido com 10 a 20 caracteres.');
  }
  if (!/^[a-z0-9-]{3,80}$/.test(storeSlug)) throw new HttpError(400, 'A loja informada não é válida.');
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) {
    throw new HttpError(400, 'O carrinho deve conter de 1 a 30 produtos.');
  }
  const expectedTotalCents = Number(body.expectedTotalCents);
  if (!Number.isSafeInteger(expectedTotalCents) || expectedTotalCents < 0) {
    throw new HttpError(400, 'O total exibido no carrinho é inválido. Atualize os produtos e tente novamente.');
  }
  const quantities = new Map();
  for (const item of body.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HttpError(400, 'Um dos produtos do carrinho é inválido.');
    }
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(productId) || productId <= 0 ||
        !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 99) {
      throw new HttpError(400, 'Um dos produtos ou quantidades do carrinho é inválido.');
    }
    const combinedQuantity = (quantities.get(productId) || 0) + quantity;
    if (combinedQuantity > 99) throw new HttpError(400, 'A quantidade máxima por produto é 99.');
    quantities.set(productId, combinedQuantity);
  }
  return {customerName, customerEmail, customerPhone, quantities, expectedTotalCents, storeSlug};
}

function createOrder(body) {
  const {customerName, customerEmail, customerPhone, quantities, expectedTotalCents, storeSlug} = validateCheckout(body);
  const store = database.prepare('SELECT id FROM stores WHERE slug = ?').get(storeSlug);
  if (!store) throw new HttpError(404, 'A loja não foi encontrada.');
  database.exec('BEGIN IMMEDIATE');
  try {
    const lines = [];
    let totalCents = 0;
    const getProduct = database.prepare(
      `SELECT id, name, price_cents, cost_cents, stock
       FROM products WHERE id = ? AND store_id = ? AND active = 1`
    );
    for (const [productId, quantity] of quantities) {
      const product = getProduct.get(productId, store.id);
      if (!product) throw new HttpError(404, 'Um dos produtos não está mais disponível.');
      if (product.stock < quantity) throw new HttpError(409, `Estoque insuficiente para ${product.name}.`);
      const lineTotalCents = product.price_cents * quantity;
      totalCents += lineTotalCents;
      lines.push({...product, quantity, lineTotalCents});
    }
    if (totalCents !== expectedTotalCents) {
      throw new HttpError(409, 'O preço do carrinho mudou. Atualize os produtos e confira o total antes de continuar.');
    }
    const now = new Date().toISOString();
    const orderNumber = `CF-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
    const inserted = database.prepare(
      `INSERT INTO orders
         (store_id, order_number, customer_name, customer_email, customer_phone, status, total_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    ).run(store.id, orderNumber, customerName, customerEmail, customerPhone, totalCents, now, now);
    const orderId = Number(inserted.lastInsertRowid);
    const insertLine = database.prepare(
      `INSERT INTO order_items
         (order_id, product_id, product_name, unit_price_cents, unit_cost_cents, quantity, line_total_cents, line_cost_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const updateStock = database.prepare(
      'UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND store_id = ?'
    );
    for (const line of lines) {
      const lineCostCents = line.cost_cents === null ? null : line.cost_cents * line.quantity;
      insertLine.run(
        orderId, line.id, line.name, line.price_cents, line.cost_cents, line.quantity,
        line.lineTotalCents, lineCostCents
      );
      updateStock.run(line.quantity, now, line.id, store.id);
    }
    database.exec('COMMIT');
    return {id: orderId, number: orderNumber, total: totalCents / 100, store: storeSlug};
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function updateOrderStatus(orderId, nextStatus, storeId) {
  const validStatuses = new Set(['pending', 'paid', 'shipped', 'cancelled']);
  if (!validStatuses.has(nextStatus)) throw new HttpError(400, 'Status de pedido inválido.');
  database.exec('BEGIN IMMEDIATE');
  try {
    const order = database.prepare('SELECT id, status FROM orders WHERE id = ? AND store_id = ?')
      .get(orderId, storeId);
    if (!order) throw new HttpError(404, 'Pedido não encontrado.');
    if (order.status === nextStatus) {
      database.exec('COMMIT');
      return;
    }
    const allowedTransitions = {
      pending: ['paid', 'cancelled'],
      paid: ['shipped', 'cancelled'],
      shipped: [],
      cancelled: []
    };
    if (!allowedTransitions[order.status].includes(nextStatus)) {
      throw new HttpError(409, 'Essa alteração de status não é permitida.');
    }
    if (nextStatus === 'cancelled') {
      const items = database.prepare(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ? AND product_id IS NOT NULL'
      ).all(orderId);
      const restoreStock = database.prepare(
        'UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?'
      );
      const now = new Date().toISOString();
      for (const item of items) restoreStock.run(item.quantity, now, item.product_id);
    }
    database.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND store_id = ?')
      .run(nextStatus, new Date().toISOString(), orderId, storeId);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

async function handleAPI(request, response, url) {
  const route = url.pathname;
  if (route === '/api/auth/setup' && request.method === 'GET') {
    sendJSON(response, 200, {available: true});
    return;
  }

  if (route === '/api/customer/register' && request.method === 'POST') {
    const body = await readJSON(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const storeSlug = typeof body.storeSlug === 'string' && body.storeSlug
      ? body.storeSlug.trim().toLowerCase()
      : 'loja-do-pedro';
    if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Informe seu nome com 2 a 80 caracteres.');
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, 'Informe um endereço de e-mail válido.');
    }
    if (phone.length < 10 || phone.length > 20) {
      throw new HttpError(400, 'Informe um telefone válido com 10 a 20 caracteres.');
    }
    if (password.length < 8 || password.length > 128) {
      throw new HttpError(400, 'A senha deve ter entre 8 e 128 caracteres.');
    }
    if (!/^[a-z0-9-]{3,80}$/.test(storeSlug)) throw new HttpError(400, 'A loja informada não é válida.');
    const store = database.prepare('SELECT id FROM stores WHERE slug = ?').get(storeSlug);
    if (!store) throw new HttpError(404, 'A loja não foi encontrada.');
    if (database.prepare('SELECT 1 FROM customers WHERE store_id = ? AND email = ?').get(store.id, email)) {
      throw new HttpError(409, 'Este e-mail já está cadastrado nesta loja.');
    }
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    let customerId;
    try {
      const result = database.prepare(
        `INSERT INTO customers
           (store_id, name, email, phone, password_salt, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(store.id, name, email, phone, salt, passwordHash, new Date().toISOString());
      customerId = Number(result.lastInsertRowid);
    } catch (error) {
      if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') {
        throw new HttpError(409, 'Este e-mail já está cadastrado nesta loja.');
      }
      throw error;
    }
    const customer = database.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    sendJSON(response, 201, {customer: publicCustomer(customer)}, {'Set-Cookie': createCustomerSession(customer.id)});
    return;
  }

  if (route === '/api/customer/login' && request.method === 'POST') {
    const body = await readJSON(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const storeSlug = typeof body.storeSlug === 'string' && body.storeSlug
      ? body.storeSlug.trim().toLowerCase()
      : 'loja-do-pedro';
    const store = database.prepare('SELECT id FROM stores WHERE slug = ?').get(storeSlug);
    const customer = store
      ? database.prepare('SELECT * FROM customers WHERE store_id = ? AND email = ?').get(store.id, email)
      : null;
    const salt = customer ? customer.password_salt : '00000000000000000000000000000000';
    const actualHash = await scrypt(password, salt, 64);
    const expectedHash = customer ? Buffer.from(customer.password_hash, 'hex') : Buffer.alloc(64);
    const validPassword = expectedHash.length === actualHash.length && timingSafeEqual(actualHash, expectedHash);
    if (!customer || !validPassword) throw new HttpError(401, 'E-mail ou senha incorretos.');
    sendJSON(response, 200, {customer: publicCustomer(customer)}, {'Set-Cookie': createCustomerSession(customer.id)});
    return;
  }

  if (route === '/api/customer/me' && request.method === 'GET') {
    const session = getCustomerSession(request);
    const customer = session
      ? database.prepare('SELECT * FROM customers WHERE id = ?').get(session.customerId)
      : null;
    sendJSON(response, 200, {customer: customer ? publicCustomer(customer) : null});
    return;
  }

  if (route === '/api/customer/logout' && request.method === 'POST') {
    const session = getCustomerSession(request);
    if (session) customerSessions.delete(session.token);
    sendJSON(response, 200, {success: true}, {'Set-Cookie': `${customerCookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`});
    return;
  }

  if (route === '/api/auth/register' && request.method === 'POST') {
    const body = await readJSON(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const storeName = typeof body.storeName === 'string' ? body.storeName.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Informe um nome com 2 a 80 caracteres.');
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      throw new HttpError(400, 'O usuário deve ter de 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado.');
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, 'Informe um endereço de e-mail válido.');
    }
    if (storeName.length < 2 || storeName.length > 120) {
      throw new HttpError(400, 'O nome da loja deve ter de 2 a 120 caracteres.');
    }
    if (password.length < 8 || password.length > 128) {
      throw new HttpError(400, 'A senha deve ter entre 8 e 128 caracteres.');
    }
    if (database.prepare('SELECT 1 FROM users WHERE email = ? OR username = ?').get(email, username)) {
      throw new HttpError(409, 'Este e-mail ou usuário já está cadastrado.');
    }
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const slugBase = storeName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'loja';
    const slug = `${slugBase}-${randomBytes(3).toString('hex')}`;
    let userId;
    database.exec('BEGIN IMMEDIATE');
    try {
      const storeResult = database.prepare(
        'INSERT INTO stores (name, slug, created_at) VALUES (?, ?, ?)'
      ).run(storeName, slug, new Date().toISOString());
      const userResult = database.prepare(
        `INSERT INTO users
           (name, username, email, password_salt, password_hash, store_id, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'admin', ?)`
      ).run(name, username, email, salt, passwordHash, Number(storeResult.lastInsertRowid), new Date().toISOString());
      userId = Number(userResult.lastInsertRowid);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') throw new HttpError(409, 'Este e-mail ou usuário já está cadastrado.');
      throw error;
    }
    const user = getUserById(userId);
    sendJSON(response, 201, {user: publicUser(user)}, {'Set-Cookie': createSession(user.id)});
    return;
  }

  if (route === '/api/auth/login' && request.method === 'POST') {
    const body = await readJSON(request);
    const identifier = typeof body.identifier === 'string'
      ? body.identifier.trim().toLowerCase()
      : typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const user = database.prepare('SELECT * FROM users WHERE lower(email) = ? OR lower(username) = ?')
      .get(identifier, identifier);
    const salt = user ? user.password_salt : '00000000000000000000000000000000';
    const actualHash = await scrypt(password, salt, 64);
    const expectedHash = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
    const validPassword = expectedHash.length === actualHash.length && timingSafeEqual(actualHash, expectedHash);
    if (!user || !validPassword || user.role !== 'admin') throw new HttpError(401, 'Usuário/e-mail ou senha incorretos.');
    sendJSON(response, 200, {user: publicUser(getUserById(user.id))}, {'Set-Cookie': createSession(user.id)});
    return;
  }

  if (route === '/api/auth/me' && request.method === 'GET') {
    const session = getSession(request);
    const user = session ? getUserById(session.userId) : null;
    sendJSON(response, 200, {user: user ? publicUser(user) : null});
    return;
  }

  if (route === '/api/auth/profile' && request.method === 'PATCH') {
    const user = requireAdmin(request);
    const body = await readJSON(request, 1_500_000);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 80) throw new HttpError(400, 'O nome deve ter de 2 a 80 caracteres.');
    let avatarData = null;
    if (body.avatarData !== null && body.avatarData !== '') {
      if (typeof body.avatarData !== 'string' || body.avatarData.length > 1_400_000) {
        throw new HttpError(413, 'A foto deve ter no máximo 1 MB.');
      }
      const match = body.avatarData.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) throw new HttpError(400, 'Use uma imagem PNG, JPG ou WebP válida.');
      const image = Buffer.from(match[2], 'base64');
      if (image.length > 1_048_576 || image.toString('base64') !== match[2]) {
        throw new HttpError(413, 'A foto deve ter no máximo 1 MB.');
      }
      avatarData = body.avatarData;
    }
    database.prepare('UPDATE users SET name = ?, avatar_data = ? WHERE id = ?')
      .run(name, avatarData, user.id);
    sendJSON(response, 200, {user: publicUser(getUserById(user.id))});
    return;
  }

  if (route === '/api/auth/logout' && request.method === 'POST') {
    const token = getCookie(request, cookieName);
    if (token) sessions.delete(token);
    sendJSON(response, 200, {ok: true}, {
      'Set-Cookie': `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
    });
    return;
  }

  if (route === '/api/products' && request.method === 'GET') {
    const slug = url.searchParams.get('loja') || 'loja-do-pedro';
    const store = database.prepare('SELECT id, name, slug FROM stores WHERE slug = ?').get(slug);
    if (!store) throw new HttpError(404, 'A loja não foi encontrada.');
    sendJSON(response, 200, {store: {name: store.name, slug: store.slug}, products: productRows(store.id, false)});
    return;
  }

  if (route === '/api/orders' && request.method === 'POST') {
    const order = createOrder(await readJSON(request));
    sendJSON(response, 201, {order});
    return;
  }

  const admin = route.startsWith('/api/admin/') ? requireAdmin(request) : null;

  if (route === '/api/admin/summary' && request.method === 'GET') {
    sendJSON(response, 200, {summary: calculateSummary(admin.store_id)});
    return;
  }

  if (route === '/api/admin/finance' && request.method === 'GET') {
    const requestedPeriod = Number(url.searchParams.get('period'));
    const periodDays = [7, 30, 90].includes(requestedPeriod) ? requestedPeriod : 30;
    sendJSON(response, 200, {finance: calculateFinance(admin.store_id, periodDays)});
    return;
  }

  if (route === '/api/admin/expenses' && request.method === 'POST') {
    const body = await readJSON(request);
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const amount = Number(body.amount);
    const expenseDate = typeof body.date === 'string' ? body.date : '';
    const parsedDate = Date.parse(`${expenseDate}T00:00:00.000Z`);
    const today = new Date().toISOString().slice(0, 10);
    if (description.length < 2 || description.length > 120) {
      throw new HttpError(400, 'A descrição da despesa deve ter de 2 a 120 caracteres.');
    }
    if (category.length < 2 || category.length > 40) throw new HttpError(400, 'Informe uma categoria válida.');
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
      throw new HttpError(400, 'Informe um valor de despesa maior que zero.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) ||
        !Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== expenseDate ||
        expenseDate > today) {
      throw new HttpError(400, 'Informe uma data válida que não seja futura.');
    }
    const result = database.prepare(
      `INSERT INTO expenses (store_id, description, category, amount_cents, expense_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(admin.store_id, description, category, Math.round(amount * 100), expenseDate, new Date().toISOString());
    sendJSON(response, 201, {id: Number(result.lastInsertRowid)});
    return;
  }

  if (route === '/api/admin/products' && request.method === 'GET') {
    sendJSON(response, 200, {products: productRows(admin.store_id, true)});
    return;
  }

  if (route === '/api/admin/products' && request.method === 'POST') {
    const product = validateProduct(await readJSON(request));
    const now = new Date().toISOString();
    const result = database.prepare(
      `INSERT INTO products
         (store_id, name, description, category, price_cents, cost_cents, stock, image_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(admin.store_id, product.name, product.description, product.category, product.priceCents,
      product.costCents, product.stock, product.imageUrl, now, now);
    sendJSON(response, 201, {product: productResponse(database.prepare(
      `SELECT id, name, description, category, price_cents, cost_cents, stock, image_url, active, created_at, updated_at
       FROM products WHERE id = ? AND store_id = ?`
    ).get(Number(result.lastInsertRowid), admin.store_id), true)});
    return;
  }

  const productMatch = route.match(/^\/api\/admin\/products\/(\d+)$/);
  if (productMatch && request.method === 'PUT') {
    const product = validateProduct(await readJSON(request));
    const result = database.prepare(
      `UPDATE products
       SET name = ?, description = ?, category = ?, price_cents = ?, cost_cents = ?, stock = ?, image_url = ?, updated_at = ?
       WHERE id = ? AND store_id = ?`
    ).run(product.name, product.description, product.category, product.priceCents, product.costCents,
      product.stock, product.imageUrl, new Date().toISOString(), Number(productMatch[1]), admin.store_id);
    if (result.changes === 0) throw new HttpError(404, 'Produto não encontrado.');
    sendJSON(response, 200, {ok: true});
    return;
  }

  if (productMatch && request.method === 'PATCH') {
    const body = await readJSON(request);
    if (typeof body.active !== 'boolean') throw new HttpError(400, 'Informe se o produto deve ficar ativo.');
    const result = database.prepare(
      'UPDATE products SET active = ?, updated_at = ? WHERE id = ? AND store_id = ?'
    ).run(body.active ? 1 : 0, new Date().toISOString(), Number(productMatch[1]), admin.store_id);
    if (result.changes === 0) throw new HttpError(404, 'Produto não encontrado.');
    sendJSON(response, 200, {ok: true});
    return;
  }

  if (productMatch && request.method === 'DELETE') {
    const result = database.prepare(
      'UPDATE products SET active = 0, updated_at = ? WHERE id = ? AND store_id = ? AND active = 1'
    ).run(new Date().toISOString(), Number(productMatch[1]), admin.store_id);
    if (result.changes === 0) throw new HttpError(404, 'Produto ativo não encontrado.');
    sendJSON(response, 200, {ok: true});
    return;
  }

  if (route === '/api/admin/orders' && request.method === 'GET') {
    sendJSON(response, 200, {orders: listOrders(admin.store_id)});
    return;
  }

  const orderMatch = route.match(/^\/api\/admin\/orders\/(\d+)$/);
  if (orderMatch && request.method === 'PATCH') {
    const body = await readJSON(request);
    updateOrderStatus(Number(orderMatch[1]), body.status, admin.store_id);
    sendJSON(response, 200, {ok: true});
    return;
  }

  sendJSON(response, 404, {error: 'Endpoint não encontrado.'});
}

const staticFiles = new Map([
  ['/', ['pages/index.html', 'text/html; charset=utf-8']],
  ['/login', ['pages/login.html', 'text/html; charset=utf-8']],
  ['/cadastro', ['pages/cadastro.html', 'text/html; charset=utf-8']],
  ['/cliente/cadastro', ['pages/cliente-cadastro.html', 'text/html; charset=utf-8']],
  ['/cliente/login', ['pages/cliente-login.html', 'text/html; charset=utf-8']],
  ['/admin', ['pages/admin.html', 'text/html; charset=utf-8']],
  ['/css/style.css', ['css/style.css', 'text/css; charset=utf-8']],
  ['/js/store.js', ['js/store.js', 'text/javascript; charset=utf-8']],
  ['/js/admin.js', ['js/admin.js', 'text/javascript; charset=utf-8']],
  ['/js/auth.js', ['js/auth.js', 'text/javascript; charset=utf-8']],
  ['/js/customer-auth.js', ['js/customer-auth.js', 'text/javascript; charset=utf-8']]
]);

function serveStatic(response, pathname) {
  const file = staticFiles.get(pathname);
  if (!file) {
    sendJSON(response, 404, {error: 'Página não encontrada.'});
    return;
  }
  const [relativePath, contentType] = file;
  fs.readFile(path.join(projectRoot, relativePath), (error, content) => {
    if (error) {
      console.error(`Falha ao ler ${relativePath}:`, error.message);
      sendJSON(response, 500, {error: 'Não foi possível carregar a página solicitada.'});
      return;
    }
    response.writeHead(200, {'Content-Type': contentType, 'Cache-Control': 'no-cache'});
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  setSecurityHeaders(response);
  const url = new URL(request.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleAPI(request, response, url);
      return;
    }
    if (request.method !== 'GET') {
      sendJSON(response, 405, {error: 'Método não permitido.'}, {Allow: 'GET'});
      return;
    }
    if (url.pathname === '/admin' && !getSession(request)) {
      response.writeHead(302, {Location: '/login', 'Cache-Control': 'no-store'});
      response.end();
      return;
    }
    serveStatic(response, url.pathname);
  } catch (error) {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : 'O servidor não conseguiu concluir a solicitação.';
    if (!(error instanceof HttpError)) console.error('Erro ao processar solicitação:', error);
    sendJSON(response, status, {error: message});
  }
});

const port = Number(process.env.PORT || 3001);
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`A porta ${port} já está em uso.`);
    console.error(`Acesse http://localhost:${port} ou encerre o processo existente e execute npm.cmd start novamente.`);
    process.exitCode = 1;
    return;
  }
  console.error('Não foi possível iniciar o servidor:', error);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`CF Eletrônicos disponível em http://localhost:${port}`);
});

function closeServer() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
