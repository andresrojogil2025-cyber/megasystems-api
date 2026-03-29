const API_URL = '/api';

document.addEventListener('DOMContentLoaded', () => {
    
    // Validar Auth
    if (!localStorage.getItem('token')) {
        window.location.href = 'index.html';
        return;
    }

    const entityForm = document.getElementById('entityForm');
    const entitiesBody = document.getElementById('entitiesBody');
    const searchInput = document.getElementById('searchInput');
    const submitBtn = entityForm.querySelector('button[type="submit"]');
    
    let localEntities = [];
    let editingId = null;

    // 1. Cargar Entidades
    async function loadEntities(query = '') {
        try {
            const res = await fetch(`${API_URL}/entidades?q=${query}`);
            const json = await res.json();
            
            entitiesBody.innerHTML = '';
            
            if (json.data && json.data.length > 0) {
                localEntities = json.data;
                json.data.forEach(ent => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><span class="badge ${ent.tipo}">${ent.tipo.toUpperCase()}</span></td>
                        <td><strong>${ent.nombre_razon}</strong></td>
                        <td>${ent.rif}</td>
                        <td>
                            ${ent.telefono || '-'}<br>
                            <small style="color:gray">${ent.email || ''}</small>
                        </td>
                        <td>
                            <button class="btn-edit" onclick="editEntity(${ent.id})" title="Modificar" style="color:#0ea5e9; background:none; border:none; cursor:pointer; font-size:1.2rem; margin-right:8px;"><i class="ph ph-pencil"></i></button>
                            <button class="btn-danger" onclick="deleteEntity(${ent.id})" title="Eliminar"><i class="ph ph-trash"></i></button>
                        </td>
                    `;
                    entitiesBody.appendChild(tr);
                });
            } else {
                localEntities = [];
                entitiesBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No se encontraron registros.</td></tr>';
            }
        } catch (error) {
            entitiesBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error de conexión con el servidor.</td></tr>';
        }
    }

    // Preparar edición
    window.editEntity = (id) => {
        const ent = localEntities.find(e => e.id === id);
        if(!ent) return;
        
        editingId = id;
        document.getElementById('tipo').value = ent.tipo;
        document.getElementById('nombre_razon').value = ent.nombre_razon;
        document.getElementById('rif').value = ent.rif;
        document.getElementById('telefono').value = ent.telefono || '';
        document.getElementById('email').value = ent.email || '';
        document.getElementById('direccion').value = ent.direccion || '';
        
        submitBtn.innerHTML = '<i class="ph ph-pencil"></i> Actualizar Entidad';
        submitBtn.style.background = '#0ea5e9';
    };

    // 2. Crear / Actualizar Entidad
    entityForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            tipo: document.getElementById('tipo').value,
            nombre_razon: document.getElementById('nombre_razon').value,
            rif: document.getElementById('rif').value,
            telefono: document.getElementById('telefono').value,
            email: document.getElementById('email').value,
            direccion: document.getElementById('direccion').value
        };

        const url = editingId ? `${API_URL}/entidades/${editingId}` : `${API_URL}/entidades`;
        const method = editingId ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                entityForm.reset();
                editingId = null;
                submitBtn.innerHTML = 'Guardar Registro';
                submitBtn.style.background = '';
                loadEntities();
                alert(editingId ? 'Registro actualizado correctamente' : 'Registro guardado correctamente');
            } else {
                alert(data.error || 'Error guardando');
            }
        } catch (error) {
            alert('Error de conexión');
        }
    });

    // 3. Eliminar Entidad
    window.deleteEntity = async (id) => {
        if(!confirm('¿Seguro que deseas eliminar este registro?')) return;
        
        try {
            const res = await fetch(`${API_URL}/entidades/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if(data.success) {
                if(editingId === id) {
                    entityForm.reset();
                    editingId = null;
                    submitBtn.innerHTML = 'Guardar Registro';
                    submitBtn.style.background = '';
                }
                loadEntities();
            } else {
                alert(data.error);
            }
        } catch (error) {
            alert('Error al intentar eliminar.');
        }
    };

    // Buscador interactivo
    searchInput.addEventListener('input', (e) => {
        loadEntities(e.target.value);
    });

    // Boot
    loadEntities();
});
