const productGrid = document.getElementById('productGrid');
const storeMessage = document.getElementById('storeMessage');
const productSearch = document.getElementById('productSearch');
const categoryFilter = document.getElementById('categoryFilter');
const sortProducts = document.getElementById('sortProducts');
const cartDrawer = document.getElementById('cartDrawer');
const cartBackdrop = document.getElementById('cartBackdrop');
const cartItems = document.getElementById('cartItems');
const checkoutMessage = document.getElementById('checkoutMessage');
const cart = new Map();
const storeSlug = new URLSearchParams(window.location.search).get('loja') || 'loja-do-pedro';
let products = [];
const customerRegistrationKey = 'cf-store-customer-registration';

function loadCustomerRegistration() {
  try {
    const saved = JSON.parse(localStorage.getItem(customerRegistrationKey));
    if (!saved) return;
    document.getElementById('customerName').value = saved.name || '';
    document.getElementById('customerEmail').value = saved.email || '';
    document.getElementById('customerPhone').value = saved.phone || '';
  } catch {
    // Dados locais corrompidos ou armazenamento bloqueado nao impedem o checkout.
  }
}

function saveCustomerRegistration() {
  try {
    localStorage.setItem(customerRegistrationKey, JSON.stringify({
      name: document.getElementById('customerName').value.trim(),
      email: document.getElementById('customerEmail').value.trim(),
      phone: document.getElementById('customerPhone').value.trim()
    }));
  } catch {
    // A navegacao pode continuar quando o navegador bloqueia o armazenamento local.
  }

  async function loadCustomerSession() {
    try {
      const response = await fetch('/api/customer/me', {credentials: 'same-origin'});
      const payload = await response.json();
      if (!payload.customer) return;
      document.getElementById('customerName').value = payload.customer.name || '';
      document.getElementById('customerEmail').value = payload.customer.email || '';
      document.getElementById('customerPhone').value = payload.customer.phone || '';
      const accountLink = document.getElementById('customerAccountLink');
      accountLink.textContent = `Olá, ${payload.customer.name.split(' ')[0]}`;
      accountLink.href = `/?loja=${encodeURIComponent(storeSlug)}#catalog`;
    } catch {
      // A loja continua acessivel mesmo sem verificar a sessao do cliente.
    }
  }
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setMessage(element, message, success) {
  element.textContent = message;
  element.classList.toggle('success', Boolean(success));
}

async function requestJSON(url, options) {
  let response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: options && options.body ? {'Content-Type': 'application/json'} : undefined
    });
  } catch {
    throw new Error('Não foi possível conectar à loja.');
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new Error('A resposta do servidor não é válida.');
  }
  if (!response.ok) throw new Error(payload.error || `A solicitação falhou (HTTP ${response.status}).`);
  return payload;
}

function formatPrice(value) {
  return new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(value);
}

function productIcon(category) {
  const icons = {
    'Celulares': '📱',
    'Computadores': '💻',
    'Áudio': '🎧',
    'TV e vídeo': '📺',
    'Acessórios': '⌚',
    'Games': '🎮'
  };
  return icons[category] || '⚡';
}

function createProductCard(product) {
  const card = makeElement('article', 'product-card');
  const art = makeElement('div', 'product-art');
  if (product.imageUrl) {
    const image = makeElement('img');
    image.src = product.imageUrl;
    image.alt = product.name;
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      image.replaceWith(makeElement('span', 'product-emoji', productIcon(product.category)));
    }, {once: true});
    art.append(image);
  } else {
    art.append(makeElement('span', 'product-emoji', productIcon(product.category)));
  }
  card.append(art);

  const content = makeElement('div', 'product-card-content');
  content.append(makeElement('span', 'product-category', product.category));
  content.append(makeElement('h3', 'product-name', product.name));
  content.append(makeElement('p', 'product-description', product.description || 'Produto eletrônico da coleção CF.'));
  content.append(makeElement('strong', 'product-price', formatPrice(product.price)));
  const stock = makeElement('span', `product-stock${product.stock <= 3 ? ' low' : ''}`,
    product.stock > 0 ? `${product.stock} em estoque` : 'Indisponível');
  content.append(stock);

  const quantityInCart = cart.get(product.id)?.quantity || 0;
  const addButton = makeElement('button', 'primary-button',
    product.stock === 0 ? 'Sem estoque' : quantityInCart ? 'Adicionar mais' : 'Adicionar ao carrinho');
  addButton.type = 'button';
  addButton.disabled = product.stock === 0 || quantityInCart >= product.stock;
  addButton.addEventListener('click', () => addToCart(product));
  content.append(addButton);
  card.append(content);
  return card;
}

function updateCategoryOptions() {
  const selected = categoryFilter.value;
  const categories = [...new Set(products.map(product => product.category))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  categoryFilter.replaceChildren(new Option('Todas as categorias', ''));
  for (const category of categories) categoryFilter.add(new Option(category, category));
  if (categories.includes(selected)) categoryFilter.value = selected;
}

function renderProducts() {
  const term = productSearch.value.trim().toLocaleLowerCase('pt-BR');
  const category = categoryFilter.value;
  let filtered = products.filter(product => {
    const matchesText = !term || `${product.name} ${product.description} ${product.category}`
      .toLocaleLowerCase('pt-BR').includes(term);
    return matchesText && (!category || product.category === category);
  });
  if (sortProducts.value === 'price-asc') filtered.sort((a, b) => a.price - b.price);
  else if (sortProducts.value === 'price-desc') filtered.sort((a, b) => b.price - a.price);
  else if (sortProducts.value === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  productGrid.replaceChildren(...filtered.map(createProductCard));
  document.getElementById('emptyProducts').hidden = filtered.length > 0;
  document.getElementById('emptyProducts').textContent = products.length === 0
    ? 'Esta loja ainda não cadastrou produtos. Volte mais tarde.'
    : 'Nenhum produto encontrado com esses filtros.';
}

async function loadProducts(silent = false) {
  if (!silent) setMessage(storeMessage, 'Carregando produtos…', true);
  try {
    const result = await requestJSON(`/api/products?loja=${encodeURIComponent(storeSlug)}`);
    const refreshedProducts = new Map(result.products.map(product => [product.id, product]));
    let updatedCart = false;
    for (const [productId, line] of cart) {
      const currentProduct = refreshedProducts.get(productId);
      if (!currentProduct || currentProduct.stock === 0) {
        cart.delete(productId);
        updatedCart = true;
        continue;
      }
      if (currentProduct.price !== line.product.price) updatedCart = true;
      const quantity = Math.min(line.quantity, currentProduct.stock);
      if (quantity !== line.quantity) updatedCart = true;
      cart.set(productId, {product: currentProduct, quantity});
    }

    products = result.products;
    if (result.store) {
      document.getElementById('storeBrandName').textContent = result.store.name;
      document.getElementById('storeFooterName').textContent = result.store.name;
      document.title = `${result.store.name} | Loja`;
    }
    updateCategoryOptions();
    renderProducts();
    renderCart();
    if (!silent) {
      setMessage(storeMessage, products.length
        ? `${products.length} produtos disponíveis nesta loja.`
        : 'Esta loja ainda não cadastrou produtos.', true);
    } else if (updatedCart) {
      setMessage(checkoutMessage, 'O catálogo foi atualizado. Confira preço e quantidade no carrinho antes de continuar.');
    }
  } catch (error) {
    setMessage(storeMessage, error.message);
  }
}

function addToCart(product) {
  const current = cart.get(product.id);
  const quantity = (current?.quantity || 0) + 1;
  if (quantity > product.stock) {
    setMessage(storeMessage, 'A quantidade selecionada ultrapassa o estoque disponível.');
    return;
  }
  cart.set(product.id, {product, quantity});
  renderCart();
  renderProducts();
  setMessage(storeMessage, `${product.name} adicionado ao carrinho.`, true);
}

function changeQuantity(productId, delta) {
  const line = cart.get(productId);
  if (!line) return;
  const quantity = line.quantity + delta;
  if (quantity <= 0) cart.delete(productId);
  else if (quantity <= line.product.stock) cart.set(productId, {...line, quantity});
  renderCart();
  renderProducts();
}

function renderCart() {
  const lines = [...cart.values()];
  const count = lines.reduce((total, line) => total + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  document.getElementById('cartCount').textContent = String(count);
  document.getElementById('cartTotal').textContent = formatPrice(total);
  document.getElementById('checkoutButton').disabled = lines.length === 0;
  cartItems.replaceChildren();

  if (lines.length === 0) {
    cartItems.append(makeElement('p', 'cart-empty', 'Seu carrinho está vazio.'));
    return;
  }
  for (const line of lines) {
    const row = makeElement('div', 'cart-line');
    const details = makeElement('div');
    details.append(makeElement('div', 'cart-line-name', line.product.name));
    details.append(makeElement('div', 'cart-line-price',
      `${formatPrice(line.product.price)} × ${line.quantity} = ${formatPrice(line.product.price * line.quantity)}`));
    row.append(details);

    const controls = makeElement('div', 'quantity-controls');
    const decrease = makeElement('button', '', '−');
    decrease.type = 'button';
    decrease.setAttribute('aria-label', `Remover uma unidade de ${line.product.name}`);
    decrease.addEventListener('click', () => changeQuantity(line.product.id, -1));
    const quantity = makeElement('span', '', String(line.quantity));
    const increase = makeElement('button', '', '+');
    increase.type = 'button';
    increase.disabled = line.quantity >= line.product.stock;
    increase.setAttribute('aria-label', `Adicionar uma unidade de ${line.product.name}`);
    increase.addEventListener('click', () => changeQuantity(line.product.id, 1));
    controls.append(decrease, quantity, increase);
    row.append(controls);
    cartItems.append(row);
  }
}

function openCart() {
  cartDrawer.hidden = false;
  cartBackdrop.hidden = false;
  document.getElementById('closeCartButton').focus();
}

function closeCart() {
  cartDrawer.hidden = true;
  cartBackdrop.hidden = true;
  document.getElementById('openCartButton').focus();
}

document.getElementById('openCartButton').addEventListener('click', openCart);
document.getElementById('closeCartButton').addEventListener('click', closeCart);
cartBackdrop.addEventListener('click', closeCart);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !cartDrawer.hidden) closeCart();
});
productSearch.addEventListener('input', renderProducts);
categoryFilter.addEventListener('change', renderProducts);
sortProducts.addEventListener('change', renderProducts);

document.getElementById('checkoutForm').addEventListener('submit', async event => {
  event.preventDefault();
  const lines = [...cart.values()];
  if (lines.length === 0) return;
  const checkoutButton = document.getElementById('checkoutButton');
  checkoutButton.disabled = true;
  setMessage(checkoutMessage, 'Criando seu pedido…', true);
  try {
    const result = await requestJSON('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: document.getElementById('customerName').value.trim(),
        customerEmail: document.getElementById('customerEmail').value.trim(),
        customerPhone: document.getElementById('customerPhone').value.trim(),
        storeSlug,
        expectedTotalCents: lines.reduce((sum, line) => sum + Math.round(line.product.price * 100) * line.quantity, 0),
        items: lines.map(line => ({productId: line.product.id, quantity: line.quantity}))
      })
    });
    saveCustomerRegistration();
    cart.clear();
    renderCart();
    await loadProducts(true);
    setMessage(checkoutMessage,
      `Pedido ${result.order.number} criado. Total ${formatPrice(result.order.total)}. Acompanhe no painel.`,
      true);
  } catch (error) {
    setMessage(checkoutMessage, error.message);
    await loadProducts(true);
  } finally {
    checkoutButton.disabled = cart.size === 0;
  }
});

loadCustomerRegistration();
loadCustomerSession();
renderCart();
loadProducts();

function refreshCatalogWhenIdle() {
  const activeElement = document.activeElement;
  if (document.hidden || !cartDrawer.hidden ||
      activeElement.closest('.catalog-section') || activeElement.closest('.cart-drawer')) return;
  loadProducts(true);
}

window.setInterval(refreshCatalogWhenIdle, 30_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshCatalogWhenIdle();
});
