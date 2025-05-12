// index.js

// Cargar variables de entorno desde .env para desarrollo local
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const path = require('path');
const { Pool } = require('pg'); // Driver de PostgreSQL
// const bcrypt = require('bcryptjs'); // Descomenta si implementas hashing de contraseñas
// const jwt = require('jsonwebtoken'); // Descomenta si implementas JWT

const app = express();
const port = process.env.PORT || 3001;

// Configuración de la conexión a la base de datos Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Necesario para conectar a Neon en muchos entornos
  }
});

// Middleware
app.use(express.json()); // Para parsear cuerpos de solicitud JSON
app.use(express.urlencoded({ extended: true })); // Para parsear cuerpos de solicitud URL-encoded
app.use(express.static(path.join(__dirname, 'public'))); // Servir archivos estáticos desde 'public'

// ----- RUTAS HTML (Frontend) -----
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));
app.get('/asignacion', (req, res) => res.sendFile(path.join(__dirname, 'views', 'asignacion.html')));
app.get('/status', (req, res) => res.sendFile(path.join(__dirname, 'views', 'status.html')));
app.get('/vehiculos', (req, res) => res.sendFile(path.join(__dirname, 'views', 'vehiculos.html')));

// ----- RUTAS API (Backend) -----

// --- Autenticación ---
app.post('/api/auth/login', async (req, res) => {
    console.log('Ruta /api/auth/login alcanzada.');
    const { nombreUsuario: nombreUsuarioInput, password } = req.body; // El frontend envía 'nombreUsuario'
    console.log('Datos recibidos para login:', { nombreUsuarioInput, password });

    if (!nombreUsuarioInput || !password) {
        console.log('Faltan nombreUsuario o password en la solicitud de login.');
        return res.status(400).json({ error: 'Nombre de usuario y contraseña son requeridos.' });
    }

    try {
        console.log(`Buscando usuario: ${nombreUsuarioInput}`);
        // Asumiendo que la tabla es 'usuarios' y la columna 'nombreusuario' (todo minúsculas)
        const userQuery = await pool.query(
            'SELECT id, nombreusuario, password, correo FROM usuarios WHERE nombreusuario = $1',
            [nombreUsuarioInput]
        );
        console.log('Resultado de la consulta de usuario (login):', userQuery.rows);

        if (userQuery.rows.length === 0) {
            console.log(`Usuario '${nombreUsuarioInput}' no encontrado en la BD.`);
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        }

        const usuario = userQuery.rows[0];
        console.log(`Usuario encontrado: ${usuario.nombreusuario}`);

        // Comparación directa de contraseña (NO SEGURO para producción)
        if (password === usuario.password) {
            console.log(`Contraseña coincide para ${usuario.nombreusuario}. Login exitoso.`);
            // Aquí podrías implementar lógica de sesión si fuera necesario más allá de la simulación del frontend
            res.json({
                message: 'Login exitoso.',
                usuario: {
                    id: usuario.id,
                    nombreUsuario: usuario.nombreusuario, // Devolvemos 'nombreUsuario' (camelCase) al frontend
                    correo: usuario.correo
                }
            });
        } else {
            console.log(`Contraseña no coincide para ${usuario.nombreusuario}.`);
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        }

    } catch (err) {
        console.error('Error en el bloque try/catch de /api/auth/login:', err);
        res.status(500).json({ error: 'Error interno del servidor durante el login.' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    console.log('Ruta /api/auth/register alcanzada.');
    const { nombreUsuario: nombreUsuarioInput, password, correo } = req.body;
    console.log('Datos recibidos para registro:', { nombreUsuarioInput, password, correo });

    if (!nombreUsuarioInput || !password || !correo) {
        return res.status(400).json({ error: 'Nombre de usuario, contraseña y correo son requeridos.' });
    }
    try {
        // Asumiendo que la tabla es 'usuarios' y la columna 'nombreusuario' (todo minúsculas)
        const userExists = await pool.query(
            'SELECT 1 FROM usuarios WHERE nombreusuario = $1 OR correo = $2',
            [nombreUsuarioInput, correo]
        );
        if (userExists.rows.length > 0) {
            return res.status(409).json({ error: 'El nombre de usuario o correo ya está en uso.' });
        }

        // Guardar contraseña en texto plano (NO SEGURO para producción)
        const nuevoUsuario = await pool.query(
            'INSERT INTO usuarios (nombreusuario, password, correo) VALUES ($1, $2, $3) RETURNING id, nombreusuario, correo',
            [nombreUsuarioInput, password, correo]
        );
        console.log('Nuevo usuario registrado:', nuevoUsuario.rows[0]);
        res.status(201).json({
            message: 'Usuario registrado exitosamente.',
            usuario: { // Devolvemos 'nombreUsuario' (camelCase) al frontend
                id: nuevoUsuario.rows[0].id,
                nombreUsuario: nuevoUsuario.rows[0].nombreusuario,
                correo: nuevoUsuario.rows[0].correo
            }
        });
    } catch (err) {
        console.error('Error al registrar usuario:', err);
        res.status(500).json({ error: 'Error interno al registrar el usuario.' });
    }
});


// --- Empleados ---
app.get('/api/empleados', async (req, res) => {
  try {
    // Asegúrate que el nombre de tabla 'Empleado' (o 'empleado') sea correcto
    const result = await pool.query('SELECT id_empleado, nombre, apellido, departamento, correo FROM Empleado ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener empleados:', err);
    res.status(500).json({ error: 'Error interno al obtener empleados.' });
  }
});

// --- Vehículos ---
app.get('/api/vehiculos/disponibles', async (req, res) => {
  try {
    // Asegúrate que los nombres de tabla 'Vehiculo' y 'Asignacion' sean correctos
    const query = `
      SELECT v.id_vehiculo, v.marca, v.modelo, v.matricula
      FROM Vehiculo v 
      WHERE v.estado = 'disponible' 
      OR NOT EXISTS (
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
    // Asegúrate que el nombre de tabla 'Vehiculo' sea correcto
    const vehiculoResult = await client.query("SELECT estado FROM Vehiculo WHERE id_vehiculo = $1 FOR UPDATE", [id_vehiculo]);
    if (vehiculoResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Vehículo no encontrado.' });
    }
    const estadoActualVehiculo = vehiculoResult.rows[0].estado;
    if (estadoActualVehiculo !== 'disponible') {
        // Asegúrate que el nombre de tabla 'Asignacion' sea correcto
        const asignacionActiva = await client.query(
            'SELECT id_asignacion FROM Asignacion WHERE id_vehiculo = $1 AND fecha_fin IS NULL',
            [id_vehiculo]
        );
        if (asignacionActiva.rows.length > 0 || estadoActualVehiculo === 'en_uso' || estadoActualVehiculo === 'mantenimiento') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `El vehículo (ID: ${id_vehiculo}) no está disponible actualmente. Estado: ${estadoActualVehiculo}.` });
        }
    }
    const fechaFinValida = fecha_fin ? fecha_fin : null;
    // Asegúrate que el nombre de tabla 'Asignacion' sea correcto
    const nuevaAsignacionQuery = `
      INSERT INTO Asignacion (id_vehiculo, id_empleado, fecha_inicio, fecha_fin, motivo_uso) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `;
    const nuevaAsignacion = await client.query(nuevaAsignacionQuery, [id_vehiculo, id_empleado, fecha_inicio, fechaFinValida, motivo_uso]);
    // Asegúrate que el nombre de tabla 'Vehiculo' sea correcto
    await client.query( "UPDATE Vehiculo SET estado = 'en_uso' WHERE id_vehiculo = $1", [id_vehiculo] );
    await client.query('COMMIT');
    res.status(201).json({  message: 'Vehículo asignado correctamente.', asignacion: nuevaAsignacion.rows[0]  });
  } catch (err) {
      if (client) { // Verificar si client está definido antes de usarlo
          try { await client.query('ROLLBACK'); } catch (rbError) { console.error('Error en rollback:', rbError); }
      }
      console.error('Error al crear asignación:', err);
      res.status(500).json({ error: 'Error interno del servidor al crear la asignación.' });
  } finally {
      if (client) client.release(); // Liberar el cliente de vuelta al pool
  }
});


// --- Dashboard ---
app.get('/api/dashboard/summary', async (req, res) => {
    console.log('Ruta /api/dashboard/summary alcanzada');
    try {
        // Asegúrate que los nombres de tabla 'Vehiculo', 'Reportes', 'Asignacion', 'Empleado' sean correctos
        const totalVehiculosPromise = pool.query('SELECT COUNT(*) AS total FROM Vehiculo');
        const disponiblesPromise = pool.query("SELECT COUNT(*) AS total FROM Vehiculo WHERE estado = 'disponible'");
        const enUsoPromise = pool.query("SELECT COUNT(*) AS total FROM Vehiculo WHERE estado = 'en_uso'");
        const mantenimientoPromise = pool.query("SELECT COUNT(*) AS total FROM Vehiculo WHERE estado = 'mantenimiento'");

        const alertasVehiculosPromise = pool.query( // Corregido el nombre de la variable de la promesa
            "SELECT id_vehiculo, marca, modelo, matricula, estado FROM Vehiculo WHERE estado = 'mantenimiento' OR estado = 'requiere_atencion' LIMIT 5"
        );
        const alertasReportesPromise = pool.query( // Corregido el nombre de la variable de la promesa
            `SELECT r.id_reporte, r.descripcion, r.fecha_reporte, v.marca, v.modelo, v.matricula
             FROM Reportes r
             JOIN Vehiculo v ON r.id_vehiculo = v.id_vehiculo
             WHERE r.estado = 'reportado' OR r.estado = 'pendiente' 
             ORDER BY r.fecha_reporte DESC LIMIT 5`
        );

        const actividadAsignacionesPromise = pool.query(
            `SELECT a.id_asignacion, a.fecha_inicio, v.marca AS vehiculo_marca, v.modelo AS vehiculo_modelo, e.nombre AS empleado_nombre, e.apellido AS empleado_apellido
             FROM Asignacion a
             JOIN Vehiculo v ON a.id_vehiculo = v.id_vehiculo
             JOIN Empleado e ON a.id_empleado = e.id_empleado
             ORDER BY a.fecha_inicio DESC LIMIT 3`
        );
        const actividadReportesPromise = pool.query(
            `SELECT r.id_reporte, r.fecha_reporte, r.descripcion, v.marca AS vehiculo_marca, v.modelo AS vehiculo_modelo
             FROM Reportes r
             JOIN Vehiculo v ON r.id_vehiculo = v.id_vehiculo
             ORDER BY r.fecha_reporte DESC LIMIT 3`
        );

        const [
            totalVehiculosRes,
            disponiblesRes,
            enUsoRes,
            mantenimientoRes,
            alertasVehiculosRes, // Usar el nombre de la variable de respuesta
            alertasReportesRes,   // Usar el nombre de la variable de respuesta
            actividadAsignacionesRes,
            actividadReportesRes
        ] = await Promise.all([
            totalVehiculosPromise,
            disponiblesPromise,
            enUsoPromise,
            mantenimientoPromise,
            alertasVehiculosPromise, // Usar el nombre de la promesa corregido
            alertasReportesPromise,  // Usar el nombre de la promesa corregido
            actividadAsignacionesPromise,
            actividadReportesPromise
        ]);
        
        const alertas = [];
        alertasVehiculosRes.rows.forEach(v => {
            alertas.push({
                tipo: 'MANTENIMIENTO',
                tipo_display: `Vehículo ${v.estado}`,
                mensaje: `${v.marca} ${v.modelo} (Matrícula: ${v.matricula}) requiere atención.`,
                fecha: new Date() 
            });
        });
        alertasReportesRes.rows.forEach(r => {
            alertas.push({
                tipo: 'REPORTE',
                tipo_display: 'Reporte Abierto',
                mensaje: `Reporte para ${r.marca} ${r.modelo} (Matrícula: ${r.matricula}): "${r.descripcion.substring(0,50)}..."`,
                fecha: r.fecha_reporte
            });
        });

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
                mantenimiento: parseInt(mantenimientoRes.rows[0]?.total || 0, 10)
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
    // Test de conexión a la BD al iniciar (opcional)
    pool.query('SELECT NOW()', (err, res) => {
      if (err) {
        console.error('Error al conectar con la BD al iniciar:', err);
      } else {
        console.log('Conexión a la BD exitosa. Hora del servidor de BD:', res.rows[0].now);
      }
    });
  });
}
