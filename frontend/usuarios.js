const API_URL = '/api';

document.addEventListener('DOMContentLoaded', () => {
    
    // Auth Check
    if (!localStorage.getItem('token')) {
        window.location.href = 'index.html';
        return;
    }

    const userForm = document.getElementById('userForm');
    const usersBody = document.getElementById('usersBody');

    async function loadUsers() {
        try {
            const res = await fetch(`${API_URL}/usuarios`);
            const json = await res.json();
            
            usersBody.innerHTML = '';
            
            if (json.data && json.data.length > 0) {
                json.data.forEach(user => {
                    const rolLabel = user.rol === 'admin' ? 'Administrador' : 'Vendedor';
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${user.nombre}</strong></td>
                        <td style="font-family: monospace;">${user.username}</td>
                        <td><span class="badge ${user.rol}">${rolLabel}</span></td>
                        <td>
                            <button class="btn-danger" onclick="deleteUser(${user.id})" title="Eliminar Acceso"><i class="ph ph-trash"></i></button>
                        </td>
                    `;
                    usersBody.appendChild(tr);
                });
            } else {
                usersBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay usuarios.</td></tr>';
            }
        } catch (error) {
            usersBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Error conectando al servidor.</td></tr>';
        }
    }

    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            nombre: document.getElementById('nombre').value,
            username: document.getElementById('username').value,
            password: document.getElementById('password').value,
            rol: document.getElementById('rol').value
        };

        try {
            const res = await fetch(`${API_URL}/usuarios`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                userForm.reset();
                loadUsers();
                alert('Nuevo usuario habilitado para iniciar sesión.');
            } else {
                alert(data.error || 'Error al guardar');
            }
        } catch (error) {
            alert('Error de red');
        }
    });

    // Eliminar
    window.deleteUser = async (id) => {
        if(!confirm('¿Estás seguro de que quieres bloquearle permanentemente el acceso a esta persona eliminando su usuario?')) return;
        
        try {
            const res = await fetch(`${API_URL}/usuarios/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if(data.success) {
                loadUsers();
            } else {
                alert(data.error);
            }
        } catch (error) {
            alert('Fallo de red al intentar borrar.');
        }
    };

    // Iniciar
    loadUsers();
});
