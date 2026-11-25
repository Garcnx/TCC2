const authMessage = document.getElementById('authMessage');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function showAuthMessage(message) {
  authMessage.textContent = message;
  authMessage.classList.remove('success');
}

async function submitAuth(url, body, button, destination) {
  button.disabled = true;
  showAuthMessage('');
  try {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        credentials: 'same-origin',
        body: JSON.stringify(body)
      });
    } catch {
      throw new Error('Não foi possível conectar ao servidor local.');
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('O servidor retornou uma resposta inválida.');
    }
    if (!response.ok) throw new Error(payload.error || `A solicitação falhou (HTTP ${response.status}).`);
    window.location.replace(destination);
  } catch (error) {
    showAuthMessage(error.message);
  } finally {
    button.disabled = false;
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', event => {
    event.preventDefault();
    submitAuth('/api/auth/login', {
      identifier: document.getElementById('loginIdentifier').value.trim(),
      password: document.getElementById('loginPassword').value
    }, loginForm.querySelector('button[type="submit"]'), '/admin');
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', event => {
    event.preventDefault();
    submitAuth('/api/auth/register', {
      storeName: document.getElementById('registerStoreName').value.trim(),
      name: document.getElementById('registerName').value.trim(),
      username: document.getElementById('registerUsername').value.trim(),
      email: document.getElementById('registerEmail').value.trim(),
      password: document.getElementById('registerPassword').value
    }, registerForm.querySelector('button[type="submit"]'), '/admin');
  });
}

fetch('/api/auth/me', {credentials: 'same-origin'})
  .then(response => response.json())
  .then(result => {
    if (result.user) window.location.replace('/admin');
  })
  .catch(() => showAuthMessage('Não foi possível verificar a sessão. Atualize a página ou reinicie o servidor.'));
