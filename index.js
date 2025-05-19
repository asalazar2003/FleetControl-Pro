// index.js

// Cargar variables de entorno desde .env para desarrollo local
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use(express.static(path.join(__dirname, 'public')));

// ----- RUTAS HTML -----
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));
app.get('/asignacion', (req, res) => res.sendFile(path.join(__dirname, 'views', 'asignacion.html')));
app.get('/status', (req, res) => res.sendFile(path.join(__dirname, 'views', 'status.html')));
app.get('/vehiculos', (req, res) => res.sendFile(path.join(__dirname, 'views', 'vehiculos.html')));

// ----- RUTAS API -----

// --- Autenticación ---
app.post('/api/auth/login', async (req, res) => {
    console.log('Ruta /api/auth/login alcanzada.');
    const { nombreUsuario: nombreUsuarioInput, password } = req.body;
    console.log('Login - Datos recibidos:', { nombreUsuarioInput, password: password ? 'presente' : 'ausente' });

    if (!nombreUsuarioInput || !password) {
        return res.status(400).json({ error: 'Nombre de usuario y contraseña son requeridos.' });
    }
    try {
        const userQuery = await pool.query(
            'SELECT id, nombreusuario, password, correo, id_empleado_asociado, rol FROM usuarios WHERE nombreusuario = $1 AND activo = TRUE',
            [nombreUsuarioInput]
        );
        if (userQuery.rows.length === 0) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos o cuenta inactiva.' });
        }
        const usuario = userQuery.rows[0];
        if (password === usuario.password) { // Comparación directa (NO SEGURO)
            console.log(`Login exitoso para: ${usuario.nombreusuario}, Rol: ${usuario.rol}`);
            res.json({
                message: 'Login exitoso.',
                usuario: {
                    id: usuario.id, // ID de la tabla usuarios
                    nombreUsuario: usuario.nombreusuario,
                    correo: usuario.correo,
                    rol: usuario.rol,
                    id_empleado_asociado: usuario.id_empleado_asociado // ID de la tabla Empleado si está enlazado
                }
            });
        } else {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        }
    } catch (err) {
        console.error('Error en /api/auth/login:', err);
        res.status(500).json({ error: 'Error interno del servidor durante el login.' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { nombreUsuario: nombreUsuarioInput, password, correo, id_empleado_asociado, rol } = req.body;
    if (!nombreUsuarioInput || !password || !correo) {
        return res.status(400).json({ error: 'Nombre de usuario, contraseña y correo son requeridos.' });
    }
    try {
        const userExists = await pool.query(
            'SELECT 1 FROM usuarios WHERE nombreusuario = $1 OR correo = $2',
            [nombreUsuarioInput, correo]
        );
        if (userExists.rows.length > 0) {
            return res.status(409).json({ error: 'El nombre de usuario o correo ya está en uso.' });
        }
        const nuevoUsuario = await pool.query(
            'INSERT INTO usuarios (nombreusuario, password, correo, id_empleado_asociado, rol, activo) VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id, nombreusuario, correo, id_empleado_asociado, rol',
            [nombreUsuarioInput, password, correo, id_empleado_asociado || null, rol || 'empleado']
        );
        res.status(201).json({
            message: 'Usuario registrado exitosamente.',
            usuario: nuevoUsuario.rows[0]
        });
    } catch (err) {
        console.error('Error al registrar usuario:', err);
        res.status(500).json({ error: 'Error interno al registrar el usuario.' });
    }
});

// --- Empleados ---
app.get('/api/empleados', async (req, res) => {
  try {
    const result = await pool.query('SELECT id_empleado, nombre, apellido, departamento, correo FROM Empleado ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener empleados:', err);
    res.status(500).json({ error: 'Error interno al obtener empleados.' });
  }
});

// --- Vehículos ---
app.get('/api/vehiculos', async (req, res) => {
    console.log('GET /api/vehiculos alcanzado para estado de flota');
    try {
        const query = `
            SELECT 
                v.id_vehiculo, v.marca, v.modelo, v.matricula, v.ano_adquisicion, v.estado, v.kilometraje,
                e.nombre AS nombre_empleado_asignado, 
                e.apellido AS apellido_empleado_asignado,
                (SELECT r.descripcion 
                 FROM Reportes r 
                 WHERE r.id_vehiculo = v.id_vehiculo AND (r.estado = 'reportado' OR r.estado = 'pendiente' OR r.estado = 'en_proceso')
                 ORDER BY r.fecha_reporte DESC 
                 LIMIT 1) AS ultimo_reporte_descripcion
            FROM Vehiculo v
            LEFT JOIN Asignacion a ON v.id_vehiculo = a.id_vehiculo AND a.fecha_fin IS NULL
            LEFT JOIN Empleado e ON a.id_empleado = e.id_empleado
            ORDER BY v.id_vehiculo ASC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener todos los vehículos (/api/vehiculos):', err);
        res.status(500).json({ error: 'Error interno al obtener todos los vehículos.' });
    }
});

app.get('/api/vehiculos/disponibles', async (req, res) => {
  try {
    const query = `
      SELECT v.id_vehiculo, v.marca, v.modelo, v.matricula
      FROM Vehiculo v 
      WHERE v.estado = 'disponible' 
      AND NOT EXISTS (
          SELECT 1 FROM Asignacion a 
          WHERE a.id_vehiculo = v.id_vehiculo AND a.fecha_fin IS NULL
      )
      ORDER BY v.marca, v.modelo;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener vehículos disponibles:', err);
    res.status(500).json({ error: 'Error interno al obtener vehículos disponibles.' });
  }
});

app.get('/api/vehiculos/todos', async (req, res) => {
    console.log('GET /api/vehiculos/todos alcanzado');
    try {
        const result = await pool.query('SELECT id_vehiculo, marca, modelo, matricula FROM Vehiculo ORDER BY marca, modelo');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener lista completa de vehículos:', err);
        res.status(500).json({ error: 'Error interno al obtener lista completa de vehículos.' });
    }
});


// --- Asignaciones ---
app.post('/api/asignaciones', async (req, res) => {
  const { id_vehiculo, id_empleado, fecha_inicio, fecha_fin, motivo_uso } = req.body;
  if (!id_vehiculo || !id_empleado || !fecha_inicio) {
    return res.status(400).json({ error: 'ID de vehículo, ID de empleado y fecha de inicio son requeridos.' });
  }
  if (fecha_fin && new Date(fecha_fin) < new Date(fecha_inicio)) {
    return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la fecha de inicio.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const vehiculoResult = await client.query("SELECT estado FROM Vehiculo WHERE id_vehiculo = $1 FOR UPDATE", [id_vehiculo]);
    if (vehiculoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Vehículo no encontrado.' });
    }
    const estadoActualVehiculo = vehiculoResult.rows[0].estado;
    if (estadoActualVehiculo !== 'disponible') {
        const asignacionActiva = await client.query(
            'SELECT id_asignacion FROM Asignacion WHERE id_vehiculo = $1 AND fecha_fin IS NULL',
            [id_vehiculo]
        );
        if (asignacionActiva.rows.length > 0 || estadoActualVehiculo === 'en_uso' || estadoActualVehiculo === 'mantenimiento' || estadoActualVehiculo === 'requiere_atencion') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `El vehículo (ID: ${id_vehiculo}) no está disponible actualmente. Estado: ${estadoActualVehiculo}.` });
        }
    }
    const fechaFinValida = fecha_fin ? fecha_fin : null;
    const nuevaAsignacionQuery = `
      INSERT INTO Asignacion (id_vehiculo, id_empleado, fecha_inicio, fecha_fin, motivo_uso) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `;
    const nuevaAsignacion = await client.query(nuevaAsignacionQuery, [id_vehiculo, id_empleado, fecha_inicio, fechaFinValida, motivo_uso]);
    await client.query( "UPDATE Vehiculo SET estado = 'en_uso' WHERE id_vehiculo = $1", [id_vehiculo] );
    await client.query('COMMIT');
    res.status(201).json({  message: 'Vehículo asignado correctamente.', asignacion: nuevaAsignacion.rows[0]  });
  } catch (err) {
      if (client) { try { await client.query('ROLLBACK'); } catch (rbError) { console.error('Error en rollback:', rbError); }}
      console.error('Error al crear asignación:', err);
      res.status(500).json({ error: 'Error interno del servidor al crear la asignación.' });
  } finally {
      if (client) client.release();
  }
});

// --- Reportes ---
app.post('/api/reportes', async (req, res) => {
    console.log('POST /api/reportes alcanzado, body:', req.body);
    const { id_vehiculo, id_empleado, descripcion } = req.body;
    const estadoInicialReporte = 'reportado';

    if (!id_vehiculo || !id_empleado || !descripcion) {
        return res.status(400).json({ error: 'ID de vehículo, ID de empleado que reporta y descripción son requeridos.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const nuevoReporte = await client.query(
            'INSERT INTO Reportes (id_vehiculo, id_empleado, fecha_reporte, descripcion, estado) VALUES ($1, $2, CURRENT_DATE, $3, $4) RETURNING *',
            [id_vehiculo, id_empleado, descripcion, estadoInicialReporte]
        );
        // Cambiar estado del vehículo a 'requiere_atencion' si no está ya en 'mantenimiento'
        await client.query(
            "UPDATE Vehiculo SET estado = 'requiere_atencion' WHERE id_vehiculo = $1 AND estado <> 'mantenimiento'", 
            [id_vehiculo]
        );
        await client.query('COMMIT');
        res.status(201).json({
            message: 'Reporte creado exitosamente.',
            reporte: nuevoReporte.rows[0]
        });
    } catch (err) {
        if (client) { try { await client.query('ROLLBACK'); } catch (rbError) { console.error('Error en rollback:', rbError); }}
        console.error('Error al crear reporte:', err);
        res.status(500).json({ error: 'Error interno al crear reporte.' });
    } finally {
        if (client) client.release();
    }
});

app.get('/api/reportes', async (req, res) => {
    console.log('GET /api/reportes alcanzado');
    try {
        const query = `
            SELECT 
                r.id_reporte, r.fecha_reporte, r.descripcion, r.estado AS estado_reporte,
                v.id_vehiculo, v.marca AS vehiculo_marca, v.modelo AS vehiculo_modelo, v.matricula AS vehiculo_matricula,
                emp.nombre AS empleado_nombre, emp.apellido AS empleado_apellido,
                m.id_mantenimiento AS id_mantenimiento_asociado, 
                m.tipo_mantenimiento, 
                m.fecha_mantenimiento,
                mec.nombre AS mecanico_asignado_nombre, mec.apellido AS mecanico_asignado_apellido
            FROM Reportes r
            JOIN Vehiculo v ON r.id_vehiculo = v.id_vehiculo
            JOIN Empleado emp ON r.id_empleado = emp.id_empleado
            LEFT JOIN Mantenimiento m ON r.id_reporte = m.id_reporte_origen 
            LEFT JOIN Mecanico mec ON m.id_mecanico = mec.id_mecanico
            ORDER BY r.fecha_reporte DESC, r.id_reporte DESC;
        `;
        // NOTA: Este JOIN asume que tu tabla Mantenimiento tiene una columna 'id_reporte_origen'
        // que es una FK a Reportes.id_reporte. Si no es así, debes ajustar el JOIN.
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener reportes:', err);
        res.status(500).json({ error: 'Error interno al obtener reportes.' });
    }
});

// --- Mecanicos ---
app.get('/api/mecanicos', async (req, res) => {
    console.log('GET /api/mecanicos alcanzado');
    try {
        const result = await pool.query('SELECT id_mecanico, nombre, apellido FROM Mecanico ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener mecánicos:', err);
        res.status(500).json({ error: 'Error interno al obtener mecánicos.' });
    }
});

// --- Mantenimientos ---
app.post('/api/mantenimientos', async (req, res) => {
    console.log('POST /api/mantenimientos alcanzado, body:', req.body);
    const { id_vehiculo, id_mecanico, tipo_mantenimiento, fecha_mantenimiento, observaciones, id_reporte_asociado } = req.body;

    if (!id_vehiculo || !id_mecanico || !tipo_mantenimiento || !fecha_mantenimiento) {
        return res.status(400).json({ error: 'Vehículo, mecánico, tipo y fecha de mantenimiento son requeridos.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Asumiendo que Mantenimiento tiene 'id_reporte_origen' y 'estado_mantenimiento'
        const queryMantenimiento = `
            INSERT INTO Mantenimiento (id_vehiculo, id_mecanico, tipo_mantenimiento, fecha_mantenimiento, observaciones, id_reporte_origen, estado_mantenimiento) 
            VALUES ($1, $2, $3, $4, $5, $6, 'en_proceso') RETURNING *
        `;
        const nuevoMantenimiento = await client.query(queryMantenimiento,
            [id_vehiculo, id_mecanico, tipo_mantenimiento, fecha_mantenimiento, observaciones, id_reporte_asociado || null]
        );
        await client.query("UPDATE Vehiculo SET estado = 'mantenimiento' WHERE id_vehiculo = $1", [id_vehiculo]);
        if (id_reporte_asociado) {
            await client.query(
                "UPDATE Reportes SET estado = 'en_proceso' WHERE id_reporte = $1 AND (estado = 'reportado' OR estado = 'pendiente')",
                [id_reporte_asociado]
            );
        }
        await client.query('COMMIT');
        res.status(201).json({
            message: 'Mantenimiento registrado y mecánico asignado exitosamente.',
            mantenimiento: nuevoMantenimiento.rows[0]
        });
    } catch (err) {
        if (client) { try { await client.query('ROLLBACK'); } catch (rbError) { console.error('Error en rollback:', rbError); }}
        console.error('Error al registrar mantenimiento:', err);
        res.status(500).json({ error: 'Error interno al registrar mantenimiento.' });
    } finally {
        if (client) client.release();
    }
});

app.put('/api/mantenimientos/:id_mantenimiento/finalizar', async (req, res) => {
    const { id_mantenimiento } = req.params;
    const { observaciones_finales, nuevo_estado_vehiculo } = req.body;
    console.log(`PUT /api/mantenimientos/${id_mantenimiento}/finalizar, body:`, req.body);

    if (!nuevo_estado_vehiculo) {
        return res.status(400).json({ error: 'El nuevo estado del vehículo es requerido.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Asumiendo que Mantenimiento tiene 'fecha_fin_mantenimiento', 'estado_mantenimiento' e 'id_reporte_origen'
        const updateMantenimientoQuery = `
            UPDATE Mantenimiento 
            SET fecha_fin_mantenimiento = CURRENT_DATE, 
                observaciones = CASE WHEN $1 IS NOT NULL AND $1 <> '' THEN COALESCE(observaciones, '') || E'\\nFinalizado: ' || $1 ELSE observaciones END,
                estado_mantenimiento = 'finalizado'
            WHERE id_mantenimiento = $2 
            RETURNING id_vehiculo, id_reporte_origen`; 
        
        const mantenimientoActualizado = await client.query(updateMantenimientoQuery, [observaciones_finales, id_mantenimiento]);

        if (mantenimientoActualizado.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Mantenimiento no encontrado o ya finalizado.' });
        }
        const { id_vehiculo, id_reporte_origen } = mantenimientoActualizado.rows[0];

        await client.query( "UPDATE Vehiculo SET estado = $1 WHERE id_vehiculo = $2", [nuevo_estado_vehiculo, id_vehiculo]);

        if (id_reporte_origen) {
            await client.query(
                "UPDATE Reportes SET estado = 'resuelto' WHERE id_reporte = $1 AND estado = 'en_proceso'",
                [id_reporte_origen]
            );
        }
        await client.query('COMMIT');
        res.json({ message: 'Mantenimiento finalizado y vehículo actualizado correctamente.' });
    } catch (err) {
        if (client) { try { await client.query('ROLLBACK'); } catch (rbError) { console.error('Error en rollback:', rbError); }}
        console.error('Error al finalizar mantenimiento:', err);
        res.status(500).json({ error: 'Error interno al finalizar mantenimiento.' });
    } finally {
        if (client) client.release();
    }
});

// --- Dashboard Summary ---
app.get('/api/dashboard/summary', async (req, res) => {
    console.log('Ruta /api/dashboard/summary alcanzada');
    try {
        const totalVehiculosPromise = pool.query('SELECT COUNT(*) AS total FROM Vehiculo');
        const disponiblesPromise = pool.query("SELECT COUNT(*) AS total FROM Vehiculo WHERE estado = 'disponible'");
        const enUsoPromise = pool.query("SELECT COUNT(*) AS total FROM Vehiculo WHERE estado = 'en_uso'");
        const mantenimientoPromise = pool.query("SELECT COUNT(*) AS total FROM Vehiculo WHERE estado = 'mantenimiento'");
        const requiereAtencionPromise = pool.query("SELECT COUNT(*) AS total FROM Vehiculo WHERE estado = 'requiere_atencion'");

        const alertasVehiculosPromise = pool.query(
            "SELECT id_vehiculo, marca, modelo, matricula, estado FROM Vehiculo WHERE estado = 'mantenimiento' OR estado = 'requiere_atencion' ORDER BY id_vehiculo DESC LIMIT 3"
        );
        const alertasReportesPromise = pool.query(
            `SELECT r.id_reporte, r.descripcion, r.fecha_reporte, v.marca, v.modelo, v.matricula
             FROM Reportes r
             JOIN Vehiculo v ON r.id_vehiculo = v.id_vehiculo
             WHERE r.estado = 'reportado' OR r.estado = 'pendiente' 
             ORDER BY r.fecha_reporte DESC LIMIT 3`
        );

        const actividadAsignacionesPromise = pool.query(
            `SELECT a.fecha_inicio, v.marca AS vehiculo_marca, v.modelo AS vehiculo_modelo, e.nombre AS empleado_nombre, e.apellido AS empleado_apellido
             FROM Asignacion a
             JOIN Vehiculo v ON a.id_vehiculo = v.id_vehiculo
             JOIN Empleado e ON a.id_empleado = e.id_empleado
             ORDER BY a.fecha_inicio DESC LIMIT 3`
        );
        const actividadReportesPromise = pool.query(
            `SELECT r.fecha_reporte, r.descripcion, v.marca AS vehiculo_marca, v.modelo AS vehiculo_modelo
             FROM Reportes r
             JOIN Vehiculo v ON r.id_vehiculo = v.id_vehiculo
             ORDER BY r.fecha_reporte DESC LIMIT 2`
        );

        const [
            totalVehiculosRes,
            disponiblesRes,
            enUsoRes,
            mantenimientoRes,
            requiereAtencionRes,
            alertasVehiculosRes,
            alertasReportesRes,
            actividadAsignacionesRes,
            actividadReportesRes
        ] = await Promise.all([
            totalVehiculosPromise,
            disponiblesPromise,
            enUsoPromise,
            mantenimientoPromise,
            requiereAtencionPromise,
            alertasVehiculosPromise,
            alertasReportesPromise,
            actividadAsignacionesPromise,
            actividadReportesPromise
        ]);
        
        const alertas = [];
        alertasVehiculosRes.rows.forEach(v => {
            alertas.push({
                tipo: v.estado.toUpperCase(),
                tipo_display: `Vehículo ${v.estado}`,
                mensaje: `${v.marca} ${v.modelo} (${v.matricula}) requiere atención.`,
                fecha: new Date() 
            });
        });
        alertasReportesRes.rows.forEach(r => {
            alertas.push({
                tipo: 'REPORTE',
                tipo_display: 'Reporte Abierto',
                mensaje: `Reporte para ${r.marca} ${r.modelo} (${r.matricula}): "${r.descripcion.substring(0,50)}..."`,
                fecha: r.fecha_reporte
            });
        });
         alertas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        const actividadReciente = [];
        actividadAsignacionesRes.rows.forEach(a => {
            actividadReciente.push({
                fecha: a.fecha_inicio,
                descripcion: `Vehículo ${a.vehiculo_marca} ${a.vehiculo_modelo} asignado a ${a.empleado_nombre} ${a.empleado_apellido}.`
            });
        });
        actividadReportesRes.rows.forEach(r => {
            actividadReciente.push({
                fecha: r.fecha_reporte,
                descripcion: `Nuevo reporte para ${r.vehiculo_marca} ${r.vehiculo_modelo}: "${r.descripcion.substring(0, 50)}..."`
            });
        });
        actividadReciente.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        res.json({
            stats: {
                totalVehiculos: parseInt(totalVehiculosRes.rows[0]?.total || 0, 10),
                disponibles: parseInt(disponiblesRes.rows[0]?.total || 0, 10),
                enUso: parseInt(enUsoRes.rows[0]?.total || 0, 10),
                mantenimiento: parseInt(mantenimientoRes.rows[0]?.total || 0, 10) + parseInt(requiereAtencionRes.rows[0]?.total || 0, 10)
            },
            alertas: alertas.slice(0, 5),
            actividadReciente: actividadReciente.slice(0, 5)
        });

    } catch (err) {
        console.error('Error al obtener resumen del dashboard:', err);
        res.status(500).json({ error: 'Error interno al obtener datos del dashboard.' });
    }
});

// Es importante exportar `app` para Vercel
module.exports = app;

// Solo para desarrollo local
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Configurada.' : 'NO CONFIGURADA. Verifica tu archivo .env');
    pool.query('SELECT NOW()', (err, res) => {
      if (err) {
        console.error('Error al conectar con la BD al iniciar:', err);
      } else {
        if (res && res.rows && res.rows.length > 0) {
            console.log('Conexión a la BD exitosa. Hora del servidor de BD:', res.rows[0].now);
        } else {
            console.log('Conexión a la BD parece exitosa, pero no se pudo obtener la hora.');
        }
      }
    });
  });
}