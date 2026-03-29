const API_URL = '/api';
const formatVez = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

document.addEventListener('DOMContentLoaded', () => {
    
    // Auth Check
    if (!localStorage.getItem('token')) {
        window.location.href = 'index.html';
        return;
    }

    const catalogForm = document.getElementById('catalogForm');
    const catalogBody = document.getElementById('catalogBody');
    const searchInput = document.getElementById('searchInput');

    // 1. Cargar Catálogo
    async function loadCatalog(query = '') {
        try {
            const res = await fetch(`${API_URL}/catalogo?q=${query}`);
            const json = await res.json();
            
            catalogBody.innerHTML = '';
            
            if (json.data && json.data.length > 0) {
                json.data.forEach(item => {
                    const isServicio = item.tipo === 'servicio';
                    const stockDisplay = isServicio ? '<span style="color:#9ca3af; font-style:italic;">N/A</span>' : `<span class="stock-tag">${item.stock}</span>`;
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><span class="badge ${item.tipo}">${item.tipo.toUpperCase()}</span></td>
                        <td>
                            <strong>${item.nombre}</strong><br>
                            <small style="color:gray">${item.descripcion || ''}</small>
                        </td>
                        <td class="price-tag">$${formatVez(parseFloat(item.precio_usd))}</td>
                        <td>${stockDisplay}</td>
                        <td>
                            <button class="btn-danger" onclick="deleteItem(${item.id})" title="Inhabilitar"><i class="ph ph-trash"></i></button>
                        </td>
                    `;
                    catalogBody.appendChild(tr);
                });
            } else {
                catalogBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay ítems en el catálogo.</td></tr>';
            }
        } catch (error) {
            catalogBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error conectando al servidor.</td></tr>';
        }
    }

    // 2. Crear Ítem
    catalogForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            tipo: document.getElementById('tipo').value,
            nombre: document.getElementById('nombre').value,
            descripcion: document.getElementById('descripcion').value,
            precio_usd: document.getElementById('precio_usd').value,
            stock: document.getElementById('stock').value
        };

        try {
            const res = await fetch(`${API_URL}/catalogo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                catalogForm.reset();
                document.getElementById('tipo').value = 'producto'; // reset to product
                if(window.toggleStockField) window.toggleStockField(); // reset visual
                
                loadCatalog();
                alert('Añadido al catálogo exitosamente.');
            } else {
                alert(data.error || 'Error al guardar');
            }
        } catch (error) {
            alert('Error de red');
        }
    });

    // 3. Eliminar Lógico (Inhabilitar)
    window.deleteItem = async (id) => {
        if(!confirm('¿Inhabilitar este ítem del catálogo activo?')) return;
        
        try {
            const res = await fetch(`${API_URL}/catalogo/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if(data.success) {
                loadCatalog();
            } else {
                alert(data.error);
            }
        } catch (error) {
            alert('Fallo de red al eliminar.');
        }
    };

    // Búsqueda
    searchInput.addEventListener('input', (e) => {
        loadCatalog(e.target.value);
    });

    // Iniciar
    loadCatalog();
});
