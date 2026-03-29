// Lógica base del Frontend - Autenticación

const API_URL = '/api';

document.addEventListener('DOMContentLoaded', () => {
    
    // Obteniendo elementos del DOM
    const loginForm = document.getElementById('loginForm');
    const loginBackground = document.getElementById('loginBackground');
    const loginLogo = document.getElementById('loginLogo');
    const errorMsg = document.createElement('p');
    errorMsg.style.color = '#ef4444'; // Red-500
    errorMsg.style.fontSize = '0.9rem';
    errorMsg.style.marginTop = '10px';
    loginForm.appendChild(errorMsg);

    // 1. Cargar configuración visual dinámicamente desde el backend
    async function loadDynamicConfig() {
        try {
            const response = await fetch(`${API_URL}/config/visual`);
            const config = await response.json();

            // Aplicar fondo
            if (config.fondo_login_url) {
                loginBackground.style.background = `linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(59, 130, 246, 0.4) 100%), url('${config.fondo_login_url}')`;
                loginBackground.style.backgroundSize = 'cover';
                loginBackground.style.backgroundPosition = 'center';
            }

            // Aplicar Logo
            if (config.logo_url) {
                loginLogo.src = config.logo_url;
            }

        } catch (error) {
            console.error('Error cargando configuración visual, usando predeterminado:', error);
        }
    }

    // 2. Manejar Evento de Submit (Login)
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = loginForm.querySelector('button');
        const originalText = btn.innerHTML;
        
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Autenticando...';
        btn.disabled = true;
        errorMsg.innerText = '';

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                // Guardar token y datos
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                
                // Redirigir al dashboard
                window.location.href = 'dashboard.html';
            } else {
                errorMsg.innerText = data.error || 'Credenciales inválidas.';
            }
        } catch (error) {
            errorMsg.innerText = 'Error de conexión con el servidor.';
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    // 3. Cargar Lista de Usuarios (Dropdown)
    async function loadUsers() {
        try {
            const res = await fetch(`${API_URL}/usuarios`);
            const data = await res.json();
            const selectEl = document.getElementById('username');
            
            if (res.ok && data.success && data.data.length > 0) {
                data.data.forEach(u => {
                    const option = document.createElement('option');
                    option.value = u.username;
                    option.textContent = `${u.nombre} (${u.rol.toUpperCase()})`;
                    selectEl.appendChild(option);
                });
            } else {
                const option = document.createElement('option');
                option.value = "";
                option.textContent = "Sin usuarios registrados";
                selectEl.appendChild(option);
            }
        } catch(e) {
            console.error("No se pudo cargar la lista de usuarios.", e);
        }
    }

    // Iniciar
    loadDynamicConfig();
    loadUsers();
});
