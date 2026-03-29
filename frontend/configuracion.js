const API_URL = '/api';

document.addEventListener('DOMContentLoaded', async () => {
    
    // Auth Check
    if (!localStorage.getItem('token')) {
        window.location.href = 'index.html';
        return;
    }

    const configForm = document.getElementById('configForm');
    const logoUrlInput = document.getElementById('logo_url');
    const bannerUrlInput = document.getElementById('banner_url');
    const fondoUrlInput = document.getElementById('fondo_login_url');
    
    const logoPrev = document.getElementById('logo_preview');
    const bannerPrev = document.getElementById('banner_preview');

    // Elementos de Archivo
    const fileLogo = document.getElementById('file_logo');
    const fileBanner = document.getElementById('file_banner');
    const fileFondo = document.getElementById('file_fondo');

    async function handleFileUpload(file, targetInput, previewElement = null) {
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target.result;
            const fileName = `${Date.now()}_${file.name}`;
            
            try {
                const res = await fetch(`${API_URL}/config/upload`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileName, base64 })
                });
                const data = await res.json();
                
                if (data.success) {
                    targetInput.value = data.url;
                    if (previewElement) previewElement.src = data.url;
                    alert("Imagen cargada con éxito. No olvides Guardar Cambios al final.");
                } else {
                    alert("Error subiendo imagen: " + data.error);
                }
            } catch (error) {
                alert("Error de conexión al subir imagen.");
            }
        };
        reader.readAsDataURL(file);
    }

    fileLogo.addEventListener('change', (e) => handleFileUpload(e.target.files[0], logoUrlInput, logoPrev));
    fileBanner.addEventListener('change', (e) => handleFileUpload(e.target.files[0], bannerUrlInput, bannerPrev));
    fileFondo.addEventListener('change', (e) => handleFileUpload(e.target.files[0], fondoUrlInput));

    // 1. Cargar datos actuales
    try {
        const res = await fetch(`${API_URL}/config/visual`);
        const config = await res.json();
        
        if(config) {
            logoUrlInput.value = config.logo_url || '';
            bannerUrlInput.value = config.banner_url || '';
            fondoUrlInput.value = config.fondo_login_url || '';
            
            logoPrev.src = config.logo_url || '';
            bannerPrev.src = config.banner_url || '';
        }
    } catch (error) {
        console.error("Error obteniendo configuraciones actuales");
    }

    // 2. Previsualizaciones en tiempo real
    logoUrlInput.addEventListener('input', (e) => { logoPrev.src = e.target.value; });
    bannerUrlInput.addEventListener('input', (e) => { bannerPrev.src = e.target.value; });

    // 3. Guardar cambios
    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = configForm.querySelector('button');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Guardando...';
        btn.disabled = true;

        const payload = {
            logo_url: logoUrlInput.value,
            banner_url: bannerUrlInput.value,
            fondo_login_url: fondoUrlInput.value
        };

        try {
            const res = await fetch(`${API_URL}/config/visual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if(res.ok && data.success) {
                alert('¡Configuración guardada exitosamente! Los cambios ya son visibles en todo el sistema.');
            } else {
                alert('Error al guardar: ' + (data.error || 'Desconocido'));
            }
        } catch (error) {
            alert('Fallo de red al intentar guardar la configuración.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
});
