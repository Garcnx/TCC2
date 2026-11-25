const authMessage = document.getElementById('customerAuthMessage');
const registerForm = document.getElementById('customerRegisterForm');
const loginForm = document.getElementById('customerLoginForm');
const storeSlug = new URLSearchParams(window.location.search).get('loja') || 'loja-do-pedro';

function showMessage(message, success = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle('success', success);
}

async function submitCustomer(url, body, button) {
  button.disabled = true;
  showMessage('Processando…', true);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'same-origin',
      body: JSON.stringify({...body, storeSlug})
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a solicitação.');
    window.location.replace(`/?loja=${encodeURIComponent(storeSlug)}`);
  } catch (error) {
    showMessage(error.message);
  } finally {
    button.disabled = false;
  }
}

if (registerForm) {
  registerForm.addEventListener('submit', event => {
    event.preventDefault();
    submitCustomer('/api/customer/register', {
      name: document.getElementById('customerRegisterName').value.trim(),
      email: document.getElementById('customerRegisterEmail').value.trim(),
      phone: document.getElementById('customerRegisterPhone').value.trim(),
      password: document.getElementById('customerRegisterPassword').value
    }, registerForm.querySelector('button[type="submit"]'));
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', event => {
    event.preventDefault();
    submitCustomer('/api/customer/login', {
      email: document.getElementById('customerLoginEmail').value.trim(),
      password: document.getElementById('customerLoginPassword').value
    }, loginForm.querySelector('button[type="submit"]'));
  });
}

fetch('/api/customer/me', {credentials: 'same-origin'})
  .then(response => response.json())
  .then(result => {
    if (result.customer) window.location.replace(`/?loja=${encodeURIComponent(storeSlug)}`);
  })
  .catch(() => showMessage('Não foi possível verificar a sessão.'));
