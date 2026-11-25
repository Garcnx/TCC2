PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO stores (id, name, slug, created_at)
VALUES (1, 'CF Eletrônicos', 'cf-eletronicos', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_data TEXT,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username
  ON users (username);

CREATE INDEX IF NOT EXISTS users_store
  ON users (store_id);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  cost_cents INTEGER CHECK (cost_cents IS NULL OR cost_cents >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS products_store_active_category
  ON products (store_id, active, category, name);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  order_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS orders_store_created_at
  ON orders (store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  unit_cost_cents INTEGER CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  line_cost_cents INTEGER CHECK (line_cost_cents IS NULL OR line_cost_cents >= 0)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  expense_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS expenses_store_date
  ON expenses (store_id, expense_date DESC);

INSERT OR IGNORE INTO products
  (id, store_id, name, description, category, price_cents, cost_cents, stock, created_at, updated_at)
VALUES
  (1, 1, 'Smartphone CF One', 'Smartphone demonstrativo com tela ampla, câmera dupla e bateria para o dia todo.', 'Celulares', 189990, 132000, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (2, 1, 'Notebook CF Air 14', 'Notebook demonstrativo leve para estudos, trabalho e tarefas do dia a dia.', 'Computadores', 329900, 238000, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (3, 1, 'Fone Bluetooth CF Sound', 'Fone sem fio demonstrativo com microfone integrado e estojo carregador.', 'Áudio', 29990, 17000, 24, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (4, 1, 'Smart TV CF Vision 55', 'Televisor demonstrativo de 55 polegadas com resolução 4K.', 'TV e vídeo', 279990, 195000, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (5, 1, 'Smartwatch CF Active', 'Relógio inteligente demonstrativo com monitoramento de atividades.', 'Acessórios', 59990, 36000, 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (6, 1, 'Console CF Play', 'Console demonstrativo para a área de jogos e entretenimento.', 'Games', 389990, 310000, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (7, 1, 'Mouse sem fio CF Click', 'Mouse demonstrativo compacto com conexão sem fio.', 'Acessórios', 8990, 4500, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (8, 1, 'SSD portátil CF 1 TB', 'Armazenamento demonstrativo portátil para arquivos e backups.', 'Computadores', 45990, 28500, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
