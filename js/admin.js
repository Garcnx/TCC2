const adminMessage = document.getElementById('adminMessage');
const ordersMessage = document.getElementById('ordersMessage');
const financeMessage = document.getElementById('financeMessage');
const accountMessage = document.getElementById('accountMessage');
const productEditor = document.getElementById('productEditor');
const productForm = document.getElementById('productForm');
const productsTable = document.getElementById('productsTable');
const ordersTable = document.getElementById('ordersTable');
const expensesTable = document.getElementById('expensesTable');
const profileForm = document.getElementById('profileForm');
const statusLabels = {
  pending: 'Pendente',
  paid: 'Pago',
  shipped: 'Enviado',
  cancelled: 'Cancelado'
};
const allowedTransitions = {
  pending: ['pending', 'paid', 'cancelled'],
  paid: ['paid', 'shipped', 'cancelled'],
  shipped: ['shipped'],
  cancelled: ['cancelled']
};
let products = [];
let dashboardRefreshInProgress = false;
let profileAvatarData = null;

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
    throw new Error('Não foi possível conectar ao servidor.');
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new Error('O servidor retornou uma resposta inválida.');
  }
  if (!response.ok) {
    if (response.status === 401) window.location.replace('/login');
    throw new Error(payload.error || `A solicitação falhou (HTTP ${response.status}).`);
  }
  return payload;
}

function formatPrice(value) {
  return new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(value);
}

function formatDate(value) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: /^\d{4}-\d{2}-\d{2}$/.test(value) ? undefined : 'short'}).format(date);
}

function renderSummary(summary) {
  const metrics = [
    {label: 'Produtos ativos', value: summary.productCount, note: `${summary.stockUnits} unidades disponíveis`},
    {label: 'Valor em estoque', value: formatPrice(summary.inventoryValue), note: 'Baseado nos preços cadastrados'},
    {label: 'Pedidos recebidos', value: summary.orderCount, note: `${summary.pendingOrderCount} aguardando ação`},
    {label: 'Vendas registradas', value: formatPrice(summary.confirmedRevenue), note: 'Pedidos marcados como pagos; sem pagamento real'}
  ];
  const cards = metrics.map(metric => {
    const card = makeElement('article', 'metric-card');
    card.append(makeElement('span', 'metric-label', metric.label));
    card.append(makeElement('div', 'metric-value', String(metric.value)));
    card.append(makeElement('span', 'metric-subtitle', metric.note));
    return card;
  });
  document.getElementById('summaryCards').replaceChildren(...cards);
  document.getElementById('productCount').textContent = `${summary.productCount} ativos · ${summary.lowStockCount} com estoque baixo`;
}

function renderFinance(finance) {
  const {summary} = finance;
  const metrics = [
    {label: 'Vendas confirmadas', value: formatPrice(summary.revenue), note: `${summary.paidOrderCount} pedidos pagos ou enviados`},
    {label: 'Lucro bruto estimado', value: summary.grossProfit === null ? '—' : formatPrice(summary.grossProfit),
      note: summary.missingCostItems ? 'Informe custos para calcular' : 'Vendas menos custo dos produtos'},
    {label: 'Custo dos produtos', value: formatPrice(summary.productCosts), note: summary.missingCostItems
      ? `${summary.missingCostItems} item(ns) sem custo cadastrado` : 'Custos registrados no pedido'},
    {label: 'Despesas da loja', value: formatPrice(summary.expenses), note: 'Despesas registradas no período'},
    {label: 'Lucro operacional estimado',
      value: summary.netProfit === null ? '—' : formatPrice(summary.netProfit), note: summary.missingCostItems
        ? 'Há vendas sem custo informado' : 'Vendas menos custos e despesas', className: 'finance-metric-net'}
  ];
  const cards = metrics.map(metric => {
    const card = makeElement('article', `metric-card${metric.className ? ` ${metric.className}` : ''}`);
    card.append(makeElement('span', 'metric-label', metric.label));
    card.append(makeElement('div', 'metric-value', metric.value));
    card.append(makeElement('span', 'metric-subtitle', metric.note));
    return card;
  });
  document.getElementById('financeSummary').replaceChildren(...cards);
  document.getElementById('financeNote').textContent = summary.missingCostItems
    ? `Lucro não calculado: ${summary.missingCostItems} item(ns) vendido(s) não tinham custo cadastrado. Impostos e taxas também não estão incluídos.`
    : 'Estimativa operacional: vendas confirmadas menos custo dos produtos e despesas informadas. Impostos e taxas financeiras não estão incluídos.';

  const chart = document.getElementById('financeChart');
  chart.replaceChildren();
  const maxValue = Math.max(1, ...finance.series.map(day => Math.max(day.revenue, day.profit, 0)));
  for (const day of finance.series) {
    const group = makeElement('div', 'finance-bar-group');
    const date = new Date(`${day.day}T12:00:00`);
    group.title = `${formatDate(day.day)} · Vendas ${formatPrice(day.revenue)} · ${
      day.profit === null ? 'Lucro indisponível: falta cadastrar custo' : `Lucro ${formatPrice(day.profit)}`
    }`;
    const bars = makeElement('div', 'finance-bars');
    const revenueBar = makeElement('span', 'finance-bar finance-bar-revenue');
    const profitBar = makeElement('span', `finance-bar finance-bar-profit${day.profit < 0 ? ' negative' : ''}`);
    revenueBar.style.height = `${Math.max(day.revenue ? 4 : 0, day.revenue / maxValue * 100)}%`;
    profitBar.style.height = day.profit === null
      ? '0%'
      : `${Math.max(day.profit ? 4 : 0, Math.max(day.profit, 0) / maxValue * 100)}%`;
    bars.append(revenueBar, profitBar);
    const label = makeElement('span', 'finance-day-label',
      new Intl.DateTimeFormat('pt-BR', {day: '2-digit', month: '2-digit'}).format(date));
    group.append(bars, label);
    chart.append(group);
  }
}

function renderExpenses(expenses) {
  expensesTable.replaceChildren();
  document.getElementById('emptyExpenses').hidden = expenses.length > 0;
  document.getElementById('expenseCount').textContent = `${expenses.length} lançamentos`;
  for (const expense of expenses) {
    const row = document.createElement('tr');
    row.append(makeElement('td', '', formatDate(expense.date)));
    row.append(makeElement('td', '', expense.description));
    row.append(makeElement('td', '', expense.category));
    row.append(makeElement('td', 'expense-amount', formatPrice(expense.amount)));
    expensesTable.append(row);
  }
}

function renderAvatar(data, imageId, fallbackId) {
  const image = document.getElementById(imageId);
  const fallback = document.getElementById(fallbackId);
  image.hidden = !data;
  fallback.hidden = Boolean(data);
  if (data) image.src = data;
  else image.removeAttribute('src');
}

function renderAccount(user) {
  profileAvatarData = user.avatarData || null;
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0].toLocaleUpperCase('pt-BR')).join('');
  document.getElementById('adminGreeting').textContent = `Olá, ${user.name}`;
  document.getElementById('headerAvatarFallback').textContent = initials || 'CF';
  document.getElementById('accountAvatarFallback').textContent = initials || 'CF';
  renderAvatar(profileAvatarData, 'headerAvatar', 'headerAvatarFallback');
  renderAvatar(profileAvatarData, 'accountAvatar', 'accountAvatarFallback');
  document.getElementById('profileName').value = user.name;
  document.getElementById('profileUsername').value = user.username;
  document.getElementById('profileEmail').value = user.email;
  document.getElementById('accountStoreName').textContent = user.store.name;
  document.getElementById('adminStoreName').textContent = user.store.name;
  const storeUrl = `/?loja=${encodeURIComponent(user.store.slug)}`;
  document.getElementById('storefrontLink').href = storeUrl;
  document.getElementById('accountStoreLink').href = storeUrl;
  document.getElementById('accountStoreLink').textContent = `Abrir ${user.store.name}`;
}

function renderProducts() {
  productsTable.replaceChildren();
  document.getElementById('emptyAdminProducts').hidden = products.length > 0;
  for (const product of products) {
    const row = document.createElement('tr');
    const nameCell = makeElement('td');
    nameCell.append(makeElement('div', 'table-product-name', product.name));
    if (product.description) nameCell.append(makeElement('small', 'table-subtitle', product.description));
    row.append(nameCell);
    row.append(makeElement('td', '', product.category));
    row.append(makeElement('td', '', formatPrice(product.price)));
    row.append(makeElement('td', '', product.cost === null ? 'Não informado' : formatPrice(product.cost)));
    row.append(makeElement('td', '', product.cost === null
      ? 'Informe o custo'
      : formatPrice(product.price - product.cost)));
    const stockCell = makeElement('td');
    stockCell.append(makeElement('span', `stock-pill${product.stock <= 3 ? ' low' : ''}`, `${product.stock} un.`));
    row.append(stockCell);
    row.append(makeElement('td', '', product.active ? 'Ativo' : 'Inativo'));
    const actions = makeElement('td');
    const actionGroup = makeElement('div', 'row-actions');
    const edit = makeElement('button', 'table-action', 'Editar');
    edit.type = 'button';
    edit.addEventListener('click', () => openEditor(product));
    const toggle = makeElement('button', `table-action${product.active ? ' danger' : ''}`,
      product.active ? 'Desativar' : 'Ativar');
    toggle.type = 'button';
    toggle.addEventListener('click', () => toggleProduct(product));
    actionGroup.append(edit, toggle);
    actions.append(actionGroup);
    row.append(actions);
    productsTable.append(row);
  }
}

function orderStatusSelect(order) {
  const form = makeElement('form', 'order-status-form');
  const select = document.createElement('select');
  select.setAttribute('aria-label', `Status do pedido ${order.number}`);
  for (const status of allowedTransitions[order.status] || [order.status]) {
    select.add(new Option(statusLabels[status], status, status === order.status, status === order.status));
  }
  const button = makeElement('button', 'table-action', 'Atualizar');
  button.type = 'submit';
  button.disabled = allowedTransitions[order.status]?.length === 1;
  form.append(select, button);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (select.value === order.status) return;
    button.disabled = true;
    setMessage(ordersMessage, '', false);
    try {
      await requestJSON(`/api/admin/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({status: select.value})
      });
      setMessage(ordersMessage, `Pedido ${order.number} atualizado.`, true);
      await loadDashboard();
    } catch (error) {
      button.disabled = false;
      setMessage(ordersMessage, error.message);
    }
  });
  return form;
}

function renderOrders(orders) {
  ordersTable.replaceChildren();
  document.getElementById('emptyAdminOrders').hidden = orders.length > 0;
  for (const order of orders) {
    const row = document.createElement('tr');
    row.append(makeElement('td', 'table-order-number', order.number));
    row.append(makeElement('td', '', order.customerName));
    row.append(makeElement('td', '', `${order.itemCount} un.`));
    row.append(makeElement('td', '', formatPrice(order.total)));
    row.append(makeElement('td', '', formatDate(order.createdAt)));
    const status = makeElement('td');
    status.append(makeElement('span', `status-pill ${order.status}`, statusLabels[order.status]));
    row.append(status);
    const actions = makeElement('td');
    actions.append(orderStatusSelect(order));
    row.append(actions);
    ordersTable.append(row);
  }
}

async function loadDashboard() {
  if (dashboardRefreshInProgress) return;
  dashboardRefreshInProgress = true;
  const refreshButton = document.getElementById('refreshDashboardButton');
  refreshButton.disabled = true;
  try {
    const period = document.getElementById('financePeriod').value;
    const [summaryResult, productResult, orderResult, financeResult] = await Promise.all([
      requestJSON('/api/admin/summary'),
      requestJSON('/api/admin/products'),
      requestJSON('/api/admin/orders'),
      requestJSON(`/api/admin/finance?period=${encodeURIComponent(period)}`)
    ]);
    products = productResult.products;
    renderSummary(summaryResult.summary);
    renderProducts();
    renderOrders(orderResult.orders);
    renderFinance(financeResult.finance);
    renderExpenses(financeResult.finance.expenses);
    document.getElementById('lastUpdated').textContent =
      `Atualizado às ${new Intl.DateTimeFormat('pt-BR', {timeStyle: 'medium'}).format(new Date())}`;
  } catch (error) {
    setMessage(adminMessage, error.message);
  } finally {
    dashboardRefreshInProgress = false;
    refreshButton.disabled = false;
  }
}

function openEditor(product) {
  productForm.reset();
  document.getElementById('productId').value = product ? String(product.id) : '';
  document.getElementById('productFormTitle').textContent = product ? 'Editar produto' : 'Adicionar produto';
  document.getElementById('saveProductButton').textContent = product ? 'Salvar alterações' : 'Salvar produto';
  if (product) {
    document.getElementById('productName').value = product.name;
    document.getElementById('productCategory').value = product.category;
    document.getElementById('productPrice').value = product.price.toFixed(2);
    document.getElementById('productCost').value = product.cost === null ? '' : product.cost.toFixed(2);
    document.getElementById('productStock').value = product.stock;
    document.getElementById('productDescription').value = product.description;
    document.getElementById('productImage').value = product.imageUrl;
  }
  productEditor.hidden = false;
  document.getElementById('productName').focus();
}

function closeEditor() {
  productForm.reset();
  productEditor.hidden = true;
}

async function toggleProduct(product) {
  const active = !product.active;
  if (!active && !window.confirm(`Desativar "${product.name}"? O produto deixará de aparecer na loja.`)) return;
  try {
    await requestJSON(`/api/admin/products/${product.id}`, {
      method: 'PATCH',
      body: JSON.stringify({active})
    });
    setMessage(adminMessage, active ? 'Produto ativado na loja.' : 'Produto desativado.', true);
    await loadDashboard();
  } catch (error) {
    setMessage(adminMessage, error.message);
  }
}

document.getElementById('newProductButton').addEventListener('click', () => openEditor(null));
document.getElementById('closeEditorButton').addEventListener('click', closeEditor);
document.getElementById('cancelEditorButton').addEventListener('click', closeEditor);
document.getElementById('refreshDashboardButton').addEventListener('click', loadDashboard);
document.getElementById('financePeriod').addEventListener('change', loadDashboard);

productForm.addEventListener('submit', async event => {
  event.preventDefault();
  const productId = document.getElementById('productId').value;
  const body = {
    name: document.getElementById('productName').value.trim(),
    category: document.getElementById('productCategory').value.trim(),
    price: Number(document.getElementById('productPrice').value),
    cost: Number(document.getElementById('productCost').value),
    stock: Number(document.getElementById('productStock').value),
    description: document.getElementById('productDescription').value.trim(),
    imageUrl: document.getElementById('productImage').value.trim()
  };
  const saveButton = document.getElementById('saveProductButton');
  saveButton.disabled = true;
  setMessage(adminMessage, '', false);
  try {
    await requestJSON(productId ? `/api/admin/products/${productId}` : '/api/admin/products', {
      method: productId ? 'PUT' : 'POST',
      body: JSON.stringify(body)
    });
    closeEditor();
    setMessage(adminMessage, productId ? 'Produto atualizado.' : 'Produto cadastrado.', true);
    await loadDashboard();
  } catch (error) {
    setMessage(adminMessage, error.message);
  } finally {
    saveButton.disabled = false;
  }
});

const expenseDate = document.getElementById('expenseDate');
const today = new Date();
expenseDate.value = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
document.getElementById('expenseForm').addEventListener('submit', async event => {
  event.preventDefault();
  const saveButton = document.getElementById('saveExpenseButton');
  saveButton.disabled = true;
  setMessage(financeMessage, '', false);
  try {
    await requestJSON('/api/admin/expenses', {
      method: 'POST',
      body: JSON.stringify({
        description: document.getElementById('expenseDescription').value.trim(),
        category: document.getElementById('expenseCategory').value.trim(),
        amount: Number(document.getElementById('expenseAmount').value),
        date: expenseDate.value
      })
    });
    document.getElementById('expenseForm').reset();
    expenseDate.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    setMessage(financeMessage, 'Despesa registrada no financeiro.', true);
    await loadDashboard();
  } catch (error) {
    setMessage(financeMessage, error.message);
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById('profilePhoto').addEventListener('change', event => {
  const [file] = event.target.files;
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_048_576) {
    event.target.value = '';
    setMessage(accountMessage, 'Escolha uma imagem PNG, JPG ou WebP de até 1 MB.');
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    if (typeof reader.result !== 'string') {
      setMessage(accountMessage, 'Não foi possível carregar a foto selecionada.');
      return;
    }
    profileAvatarData = reader.result;
    renderAvatar(profileAvatarData, 'headerAvatar', 'headerAvatarFallback');
    renderAvatar(profileAvatarData, 'accountAvatar', 'accountAvatarFallback');
    setMessage(accountMessage, 'Pré-visualização atualizada. Salve o perfil para confirmar.', true);
  });
  reader.addEventListener('error', () => setMessage(accountMessage, 'Não foi possível ler a foto selecionada.'));
  reader.readAsDataURL(file);
});

profileForm.addEventListener('submit', async event => {
  event.preventDefault();
  const saveButton = document.getElementById('saveProfileButton');
  saveButton.disabled = true;
  setMessage(accountMessage, '', false);
  try {
    const result = await requestJSON('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        name: document.getElementById('profileName').value.trim(),
        avatarData: profileAvatarData
      })
    });
    renderAccount(result.user);
    setMessage(accountMessage, 'Perfil atualizado.', true);
  } catch (error) {
    setMessage(accountMessage, error.message);
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  try {
    await requestJSON('/api/auth/logout', {method: 'POST', body: '{}'});
    window.location.replace('/login');
  } catch (error) {
    setMessage(accountMessage, error.message);
  }
});

async function initialize() {
  try {
    const result = await requestJSON('/api/auth/me');
    if (!result.user || result.user.role !== 'admin') {
      window.location.replace('/login');
      return;
    }
    renderAccount(result.user);
    await loadDashboard();
  } catch (error) {
    setMessage(adminMessage, error.message);
  }
}

initialize();

function refreshDashboardWhenIdle() {
  const activeElement = document.activeElement;
  if (document.hidden || !productEditor.hidden || activeElement.closest('.data-table')) return;
  loadDashboard();
}

window.setInterval(refreshDashboardWhenIdle, 30_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshDashboardWhenIdle();
});
