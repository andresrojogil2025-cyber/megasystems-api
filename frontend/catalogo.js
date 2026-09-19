const API_URL = '/api';
const fmt = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

// ── Cálculo costo / margen / precio ──────────────────────────────────────────
// Formulario nuevo
window.calcPrecioNuevo = () => {
    const costo = parseFloat(document.getElementById('costo_usd').value) || 0;
    const margen = parseFloat(document.getElementById('margen_ganancia').value) || 0;
    if (costo > 0 && margen >= 0) {
        const precio = +(costo * (1 + margen / 100)).toFixed(2);
        document.getElementById('precio_usd').value = precio;
        mostrarResumenNuevo(costo, margen, precio);
    }
};

window.calcMargenNuevo = () => {
    const costo = parseFloat(document.getElementById('costo_usd').value) || 0;
    const precio = parseFloat(document.getElementById('precio_usd').value) || 0;
    if (costo > 0 && precio >= 0) {
        const margen = +((precio - costo) / costo * 100).toFixed(2);
        document.getElementById('margen_ganancia').value = margen;
        mostrarResumenNuevo(costo, margen, precio);
    }
};

function mostrarResumenNuevo(costo, margen, precio) {
    const r = document.getElementById('precioResumen');
    document.getElementById('rCosto').textContent = '$' + fmt(costo);
    document.getElementById('rMargen').textContent = fmt(margen);
    document.getElementById('rPrecio').textContent = '$' + fmt(precio);
    r.style.display = (costo > 0 || precio > 0) ? 'block' : 'none';
}

// Modal edición
window.calcPrecioEdit = () => {
    const costo = parseFloat(document.getElementById('editCosto').value) || 0;
    const margen = parseFloat(document.getElementById('editMargen').value) || 0;
    if (costo > 0 && margen >= 0) {
        const precio = +(costo * (1 + margen / 100)).toFixed(2);
        document.getElementById('editPrecio').value = precio;
        mostrarResumenEdit(costo, margen, precio);
    }
};

window.calcMargenEdit = () => {
    const costo = parseFloat(document.getElementById('editCosto').value) || 0;
    const precio = parseFloat(document.getElementById('editPrecio').value) || 0;
    if (costo > 0 && precio >= 0) {
        const margen = +((precio - costo) / costo * 100).toFixed(2);
        document.getElementById('editMargen').value = margen;
        mostrarResumenEdit(costo, margen, precio);
    }
};

function mostrarResumenEdit(costo, margen, precio) {
    const r = document.getElementById('editPrecioResumen');
    document.getElementById('eRCosto').textContent = '$' + fmt(costo);
    document.getElementById('eRMargen').textContent = fmt(margen);
    document.getElementById('eRPrecio').textContent = '$' + fmt(precio);
    r.style.display = (costo > 0 || precio > 0) ? 'block' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {

    if (!localStorage.getItem('token')) { window.location.href = 'index.html'; return; }

    const catalogForm = document.getElementById('catalogForm');
    const catalogBody = document.getElementById('catalogBody');
    const searchInput = document.getElementById('searchInput');
    let catalogCache = [];

    // ── 1. Cargar Catálogo ────────────────────────────────────────────────────
    async function loadCatalog(query = '') {
        try {
            const res = await fetch(`${API_URL}/catalogo?q=${query}`);
            const json = await res.json();
            catalogBody.innerHTML = '';
            if (json.data && json.data.length > 0) {
                catalogCache = json.data;
                json.data.forEach(item => {
                    const isServicio = item.tipo === 'servicio';
                    const stockDisplay = isServicio
                        ? '<span style="color:#9ca3af;font-style:italic;">N/A</span>'
                        : `<span class="stock-tag">${item.stock ?? 0}</span>`;
                    const costo = parseFloat(item.costo_usd) || 0;
                    const margen = parseFloat(item.margen_ganancia) || 0;
                    const costoHTML = costo > 0
                        ? `<div style="font-size:0.78rem;color:#64748b;">Costo: $${fmt(costo)}${margen > 0 ? ' · ' + fmt(margen) + '%' : ''}</div>`
                        : '';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><span class="badge ${item.tipo}">${item.tipo.toUpperCase()}</span></td>
                        <td>
                            <strong>${item.nombre}</strong>
                            ${item.descripcion ? `<br><small style="color:gray">${item.descripcion}</small>` : ''}
                            ${costoHTML}
                        </td>
                        <td class="price-tag">$${fmt(parseFloat(item.precio_usd))}</td>
                        <td>${stockDisplay}</td>
                        <td>
                            <button class="btn-edit" onclick="editItem(${item.id})" title="Editar"><i class="ph ph-pencil-simple"></i></button>
                            <button class="btn-danger" onclick="deleteItem(${item.id})" title="Inhabilitar"><i class="ph ph-trash"></i></button>
                        </td>`;
                    catalogBody.appendChild(tr);
                });
            } else {
                catalogBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay ítems en el catálogo.</td></tr>';
            }
        } catch (error) {
            catalogBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;">Error conectando al servidor.</td></tr>';
        }
    }

    // ── 2. Crear Ítem ─────────────────────────────────────────────────────────
    catalogForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            tipo: document.getElementById('tipo').value,
            nombre: document.getElementById('nombre').value,
            descripcion: document.getElementById('descripcion').value,
            costo_usd: document.getElementById('costo_usd').value,
            margen_ganancia: document.getElementById('margen_ganancia').value,
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
                document.getElementById('tipo').value = 'producto';
                document.getElementById('precioResumen').style.display = 'none';
                if (window.toggleStockField) window.toggleStockField();
                loadCatalog();
                alert('Añadido al catálogo exitosamente.');
            } else {
                alert(data.error || 'Error al guardar');
            }
        } catch (error) {
            alert('Error de red');
        }
    });

    // ── 3. Editar ítem ────────────────────────────────────────────────────────
    window.editItem = (id) => {
        const item = catalogCache.find(i => i.id === id);
        if (!item) return;
        document.getElementById('editId').value = item.id;
        document.getElementById('editTipo').value = item.tipo;
        document.getElementById('editNombre').value = item.nombre;
        document.getElementById('editDescripcion').value = item.descripcion || '';
        document.getElementById('editCosto').value = parseFloat(item.costo_usd) || '';
        document.getElementById('editMargen').value = parseFloat(item.margen_ganancia) || '';
        document.getElementById('editPrecio').value = parseFloat(item.precio_usd) || '';
        document.getElementById('editStock').value = item.stock || '';
        const costo = parseFloat(item.costo_usd) || 0;
        const margen = parseFloat(item.margen_ganancia) || 0;
        const precio = parseFloat(item.precio_usd) || 0;
        mostrarResumenEdit(costo, margen, precio);
        toggleEditStock();
        document.getElementById('editModal').classList.add('open');
    };

    window.closeEditModal = () => {
        document.getElementById('editModal').classList.remove('open');
        document.getElementById('editPrecioResumen').style.display = 'none';
    };

    window.toggleEditStock = () => {
        const es_servicio = document.getElementById('editTipo').value === 'servicio';
        document.getElementById('editStockGroup').style.display = es_servicio ? 'none' : 'block';
    };

    window.saveEdit = async () => {
        const id = document.getElementById('editId').value;
        const payload = {
            tipo: document.getElementById('editTipo').value,
            nombre: document.getElementById('editNombre').value,
            descripcion: document.getElementById('editDescripcion').value,
            costo_usd: document.getElementById('editCosto').value,
            margen_ganancia: document.getElementById('editMargen').value,
            precio_usd: document.getElementById('editPrecio').value,
            stock: document.getElementById('editStock').value
        };
        try {
            const res = await fetch(`${API_URL}/catalogo/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) { closeEditModal(); loadCatalog(); }
            else alert(data.error || 'Error al guardar');
        } catch (e) { alert('Error de red'); }
    };

    // ── 4. Eliminar Lógico ────────────────────────────────────────────────────
    window.deleteItem = async (id) => {
        if (!confirm('¿Inhabilitar este ítem del catálogo activo?')) return;
        try {
            const res = await fetch(`${API_URL}/catalogo/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) loadCatalog();
            else alert(data.error);
        } catch (error) { alert('Fallo de red al eliminar.'); }
    };

    searchInput.addEventListener('input', (e) => loadCatalog(e.target.value));
    loadCatalog();
});
