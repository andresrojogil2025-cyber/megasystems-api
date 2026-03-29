const API_URL = '/api';

document.addEventListener('DOMContentLoaded', () => {
    
    // Auth Check
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    const userForm = document.getElementById('userForm');
    const usersBody = document.getElementById('usersBody');
    const formTitle = document.getElementById('formTitle');
    const btnSaveUser = document.getElementById('btnSaveUser');
    const btnCancelEdit = document.getElementById('btnCancelEdit');
    const editUserId = document.getElementById('editUserId');

    // Función para limpiar el formulario y volver a modo "Crear"
    window.resetForm = () => {
        userForm.reset();
        editUserId.value = '';
        formTitle.innerText = 'Nuevo Usuario';
        btnSaveUser.innerText = 'Crear Credencial';
        btnCancelEdit.style.display = 'none';
        document.getElementById('password').required = true;
        document.getElementById('password').placeholder = 'Mínimo 6 caracteres';
    };

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
                            <button class="btn-edit" onclick='loadEditUser(${JSON.stringify(user)})' title="Editar Datos"><i class="ph ph-pencil"></i></button>
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

    // Cargar datos en el formulario para editar
    window.loadEditUser = (user) => {
        editUserId.value = user.id;
        document.getElementById('nombre').value = user.nombre;
        document.getElementById('username').value = user.username;
        document.getElementById('rol').value = user.rol;
        document.getElementById('password').value = ''; // Vacío por seguridad
        document.getElementById('password').required = false;
        document.getElementById('password').placeholder = '(Dejar en blanco para no cambiar)';
        
        formTitle.innerText = 'Editar Usuario';
        btnSaveUser.innerText = 'Guardar Cambios';
        btnCancelEdit.style.display = 'block';
        
        // Hacer scroll suave hacia arriba para que el usuario vea el formulario
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = editUserId.value;
        const payload = {
            nombre: document.getElementById('nombre').value,
            username: document.getElementById('username').value,
            password: document.getElementById('password').value,
            rol: document.getElementById('rol').value
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_URL}/usuarios/${id}` : `${API_URL}/usuarios`;

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                alert(data.message || 'Operación exitosa');
                resetForm();
                loadUsers();
            } else {
                alert(data.error || 'Error al guardar');
            }
        } catch (error) {
            alert('Error de red al intentar guardar.');
        }
    });

    // Eliminar
    window.deleteUser = async (id) => {
        if(!confirm('¿Estás seguro de que quieres bloquearle permanentemente el acceso a esta persona?')) return;
        
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
