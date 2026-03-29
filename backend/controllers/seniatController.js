const db = require('../db');

const seniatController = {
    // Generación lógica del Libro de Ventas
    generateSalesBook: async (req, res) => {
        const formatVez = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
        try {
            const { mes, año } = req.query;
            
            if (!mes || !año) {
                return res.status(400).json({ error: 'Proporcione mes y año (ej. ?mes=11&año=2023)' });
            }

            // Consultar Facturas del Mes y Año especificado (Usa substr en fecha por SQLite TEXT datetime 'YYYY-MM-DD HH:MM:SS')
            const mesFormat = mes.toString().padStart(2, '0');
            const queryDatePattern = `${año}-${mesFormat}-%`;

            const query = `
                SELECT 
                    f.id,
                    f.fecha,
                    f.nro_factura,
                    f.nro_control,
                    f.subtotal_ves,
                    f.iva_ves,
                    f.total_ves,
                    e.rif,
                    e.nombre_razon
                FROM facturas f
                JOIN entidades e ON f.cliente_id = e.id
                WHERE CAST(f.fecha AS TEXT) LIKE ? AND f.estado = 'emitida'
                ORDER BY f.fecha ASC
            `;

            const facturas = await db.queryAsync(query, [queryDatePattern]);

            // Consultar Retenciones del mismo periodo
            const queryRet = `
                SELECT r.*, e.rif, e.nombre_razon, f.nro_factura as factura_afectada
                FROM retenciones r
                JOIN entidades e ON r.cliente_id = e.id
                JOIN facturas f ON r.factura_id = f.id
                WHERE CAST(r.fecha_retencion AS TEXT) LIKE ?
            `;
            const retenciones = await db.queryAsync(queryRet, [queryDatePattern]);

            const reporteFacturas = facturas.map((f, index) => ({
                fecha: f.fecha.split(' ')[0],
                factura_inicial: f.nro_factura,
                factura_final: f.nro_factura,
                reporte_nro: '',
                control: f.nro_control,
                comprobante_retencion: '',
                nombre_cliente: f.nombre_razon,
                rif: f.rif,
                total_con_iva: formatVez(f.total_ves),
                exentas: '0,00',
                gravado: formatVez(f.subtotal_ves),
                impuesto_iva: formatVez(f.iva_ves),
                impuesto_retenido: '',
                factura_afectada: ''
            }));

            const reporteRetenciones = retenciones.map(r => ({
                fecha: r.fecha_retencion.split(' ')[0],
                factura_inicial: '',
                factura_final: '',
                reporte_nro: '',
                control: '',
                comprobante_retencion: r.nro_comprobante,
                nombre_cliente: r.nombre_razon,
                rif: r.rif,
                total_con_iva: '',
                exentas: '',
                gravado: '',
                impuesto_iva: '',
                impuesto_retenido: formatVez(r.monto_retenido_ves),
                factura_afectada: r.factura_afectada
            }));

            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Libro de Ventas');

            // Definir columnas exigidas (SENIAT Format)
            sheet.columns = [
                { header: 'FECHA', key: 'fecha', width: 12 },
                { header: 'FACTURA INICIAL', key: 'factura_inicial', width: 15 },
                { header: 'FACTURA FINAL', key: 'factura_final', width: 15 },
                { header: 'REPORTE N°', key: 'reporte_nro', width: 12 },
                { header: 'CONTROL', key: 'control', width: 15 },
                { header: 'COMPROBANTE RETENCION', key: 'comprobante_retencion', width: 25 },
                { header: 'Nombre del Cliente', key: 'nombre_cliente', width: 35 },
                { header: 'RIF', key: 'rif', width: 18 },
                { header: 'Total Venta + IVA', key: 'total_con_iva', width: 20 },
                { header: 'Exentas', key: 'exentas', width: 12 },
                { header: 'Gravado', key: 'gravado', width: 18 },
                { header: 'Impuesto (16%)', key: 'impuesto_iva', width: 18 },
                { header: 'Impuesto Retenido', key: 'impuesto_retenido', width: 20 },
                { header: 'Factura Afectada', key: 'factura_afectada', width: 18 }
            ];

            // Estilos a la cabecera
            sheet.getRow(1).font = { bold: true };
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

            // Agregar Facturas
            if(reporteFacturas.length > 0) {
                sheet.addRows(reporteFacturas);
            }

            // Espacio y luego Retenciones
            sheet.addRow([]);
            sheet.addRow({ nombre_cliente: '--- RETENCIONES DEL PERIODO ---' });
            
            if(reporteRetenciones.length > 0) {
                sheet.addRows(reporteRetenciones);
            }

            // Configurar Headers HTTP para descarga
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Libro_Ventas_${mesFormat}_${año}.xlsx`);

            // Escribir el buffer al Response
            await workbook.xlsx.write(res);
            res.end();
            
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error construyendo el Libro de Ventas en Excel' });
        }
    }
};

module.exports = seniatController;
