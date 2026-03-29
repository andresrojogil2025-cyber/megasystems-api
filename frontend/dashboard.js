// Lógica del Dashboard y Protección de Rutas
const API_URL = '/api';
const formatVez = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

document.addEventListener('DOMContentLoaded', async () => {

    // 1. Verificación de Autenticación
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !user) {
        window.location.href = 'index.html'; // Redirigir al login si no hay token
        return;
    }

    // Mostrar Nombre
    document.getElementById('userNameDisplay').innerText = user.nombre;
    document.getElementById('welcomeMessage').innerText = `¡Hola, ${user.nombre}!`;

    // 2. Obtener Configuración Visual (Banner/Logo)
    try {
        const configRes = await fetch(`${API_URL}/config/visual`);
        const config = await configRes.json();
        
        if (config.logo_url) document.getElementById('dashLogo').src = config.logo_url;
        if (config.banner_url) {
            document.getElementById('dashBanner').style.backgroundImage = `url('${config.banner_url}')`;
        }
    } catch (error) {
        console.error("Error al cargar config visual", error);
    }

    // 3. Obtener Tasa BCV Oficial (Scraping del Banco Central)
    const bcvBox = document.getElementById('bcvRateBox');
    try {
        const rateRes = await fetch(`${API_URL}/bcv/rate`);
        const rateData = await rateRes.json();
        
        if (rateData.success) {
            // Forzar redondeo a 2 decimales de la tasa
            const rateVal = Math.round(parseFloat(rateData.rate) * 100) / 100;
            bcvBox.innerHTML = `<i class="ph ph-currency-dollar"></i> Tasa BCV: Bs. ${formatVez(rateVal)}`;
            localStorage.setItem('rate', rateVal); // Guardar para cálculos de la factura
        } else {
            bcvBox.innerHTML = `<i class="ph ph-warning-circle"></i> Error de conexión BCV`;
            bcvBox.style.color = '#fff';
            bcvBox.style.backgroundColor = '#ef4444';
        }
    } catch (error) {
        bcvBox.innerHTML = `<i class="ph ph-warning-circle"></i> Sin sincronización`;
        console.error("Fallo obteniendo tasa BCV", error);
    }

    // 4. Lógica de Cerrar Sesión
    document.getElementById('btnLogout').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = 'index.html';
    });
});
