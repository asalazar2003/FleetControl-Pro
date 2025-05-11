// index.js

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const path = require('path');
const { Pool } = require('pg'); // Driver de PostgreSQL
const bcrypt = require('bcryptjs'); // Para hashear contraseñas (¡instálalo!)

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));
app.get('/asignacion', (req, res) => res.sendFile(path.join(__dirname, 'views', 'asignacion.html')));
app.get('/status', (req, res) => res.sendFile(path.join(__dirname, 'views', 'status.html')));
app.get('/vehiculos', (req, res) => res.sendFile(path.join(__dirname, 'views', 'vehiculos.html')));

app.post('/api/empleados', async (req, res) => {
  const { nombre, apellido, departamento, correo, telefono } = req.body;
  if (!nombre || !apellido || !correo) {
    return res.status(400).json({ error: 'Nombre, apellido y correo son requeridos.' });
  }
  try {
    const nuevoEmpleado = await pool.query(
      'INSERT INTO Empleado (nombre, apellido, departamento, correo, telefono) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [nombre, apellido, departamento, correo, telefono]
    );
    res.status(201).json(nuevoEmpleado.rows[0]);
  } catch (err) {
    console.error('Error al registrar empleado:', err);
    res.status(500).json({ error: 'Error interno al registrar empleado.' });
  }
});

app.get('/api/empleados', async (req, res) => {
  try {
    const result = await pool.query('SELECT id_empleado, nombre, apellido, departamento, correo FROM empleado ORDER BY nombre ASC');
    res.json(result.rows);
    console.log(result)
  } catch (err) {
    console.error('Error al obtener empleados:', err);
    res.status(500).json({ error: 'Error interno al obtener empleados.' });
  }
});

app.get('/api/vehiculos', async (req, res) => {
  try {
    const resultado = await pool.query(`
        SELECT v.id_vehiculo, v.marca, v.modelo, v.matricula, v.ano_adquisicion, v.estado, v.kilometraje,
               a.id_empleado AS id_empleado_asignado, e.nombre AS nombre_empleado_asignado, e.apellido AS apellido_empleado_asignado
        FROM Vehiculo v
        LEFT JOIN Asignacion a ON v.id_vehiculo = a.id_vehiculo AND a.fecha_fin IS NULL -- Solo asignaciones activas
        LEFT JOIN Empleado e ON a.id_empleado = e.id_empleado
        ORDER BY v.id_vehiculo ASC
    `);
    res.json(resultado.rows);
  } catch (err) {
    console.error('Error al obtener vehículos:', err.message, err.stack);
    res.status(500).json({ error: 'Error interno del servidor al obtener vehículos.' });
  }
});

app.post('/api/vehiculos', async (req, res) => {
  const { marca, modelo, matricula, ano_adquisicion, estado, kilometraje } = req.body;
  if (!marca || !modelo || !matricula) {
    return res.status(400).json({ error: 'Marca, modelo y matrícula son requeridos.' });
  }
  try {
    const nuevoVehiculo = await pool.query(
      'INSERT INTO Vehiculo (marca, modelo, matricula, ano_adquisicion, estado, kilometraje) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [marca, modelo, matricula, ano_adquisicion, estado || 'disponible', kilometraje || 0]
    );
    res.status(201).json(nuevoVehiculo.rows[0]);
  } catch (err) {
    console.error('Error al crear vehículo:', err);
     if (err.code === '23505') { 
        return res.status(409).json({ error: `La matrícula '${matricula}' ya existe.` });
    }
    res.status(500).json({ error: 'Error interno al crear vehículo.' });
  }
});


app.post('/api/asignaciones', async (req, res) => {
  const { id_vehiculo, id_empleado, fecha_inicio, fecha_fin, motivo_uso } = req.body;
  if (!id_vehiculo || !id_empleado || !fecha_inicio) {
    return res.status(400).json({ error: 'Vehículo, empleado y fecha de inicio son requeridos.' });
  }

  try {
    await pool.query('BEGIN');

    const asignacionActiva = await pool.query(
        'SELECT id_asignacion FROM Asignacion WHERE id_vehiculo = $1 AND fecha_fin IS NULL',
        [id_vehiculo]
    );

    if (asignacionActiva.rows.length > 0) {
        await pool.query('ROLLBACK');
        return res.status(409).json({ error: 'El vehículo ya tiene una asignación activa.' });
    }

    await pool.query(
        "UPDATE Vehiculo SET estado = 'en_uso' WHERE id_vehiculo = $1",
        [id_vehiculo]
    );

    const nuevaAsignacion = await pool.query(
      'INSERT INTO Asignacion (id_vehiculo, id_empleado, fecha_inicio, fecha_fin, motivo_uso) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id_vehiculo, id_empleado, fecha_inicio, fecha_fin, motivo_uso] 
    );

    await pool.query('COMMIT'); 
    res.status(201).json(nuevaAsignacion.rows[0]);

  } catch (err) {
    await pool.query('ROLLBACK'); 
    console.error('Error al crear asignación:', err);
    res.status(500).json({ error: 'Error interno al crear asignación.' });
  }
});

app.put('/api/asignaciones/:id_asignacion/finalizar', async (req, res) => {
    const { id_asignacion } = req.params;
    const { fecha_fin, kilometraje_actualizado } = req.body; 

    if (!fecha_fin) {
        return res.status(400).json({ error: 'La fecha de finalización es requerida.' });
    }

    try {
        await pool.query('BEGIN');

        const resultAsignacion = await pool.query(
            'UPDATE Asignacion SET fecha_fin = $1 WHERE id_asignacion = $2 AND fecha_fin IS NULL RETURNING id_vehiculo',
            [fecha_fin, id_asignacion]
        );

        if (resultAsignacion.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Asignación no encontrada o ya finalizada.' });
        }

        const { id_vehiculo } = resultAsignacion.rows[0];

        let updateVehiculoQuery = "UPDATE Vehiculo SET estado = 'disponible'";
        const queryParams = [];
        if (kilometraje_actualizado !== undefined) {
            updateVehiculoQuery += ", kilometraje = $1";
            queryParams.push(kilometraje_actualizado);
        }
        updateVehiculoQuery += " WHERE id_vehiculo = $" + (queryParams.length + 1);
        queryParams.push(id_vehiculo);

        await pool.query(updateVehiculoQuery, queryParams);

        await pool.query('COMMIT');
        res.json({ message: 'Vehículo devuelto y asignación finalizada correctamente.' });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error al finalizar asignación:', err);
        res.status(500).json({ error: 'Error interno al finalizar asignación.' });
    }
});


app.post('/api/reportes', async (req, res) => {
  const { id_vehiculo, id_empleado, descripcion, estado } = req.body;
  if (!id_vehiculo || !id_empleado || !descripcion) {
    return res.status(400).json({ error: 'Vehículo, empleado y descripción son requeridos.' });
  }
  try {
    const nuevoReporte = await pool.query(
      'INSERT INTO Reportes (id_vehiculo, id_empleado, fecha_reporte, descripcion, estado) VALUES ($1, $2, CURRENT_DATE, $3, $4) RETURNING *',
      [id_vehiculo, id_empleado, descripcion, estado || 'reportado']
    );
    res.status(201).json(nuevoReporte.rows[0]);
  } catch (err) {
    console.error('Error al crear reporte:', err);
    res.status(500).json({ error: 'Error interno al crear reporte.' });
  }
});

app.get('/api/reportes', async (req, res) => {
    try {
        const query = `
            SELECT r.id_reporte, r.fecha_reporte, r.descripcion, r.estado,
                   v.marca AS vehiculo_marca, v.modelo AS vehiculo_modelo, v.matricula AS vehiculo_matricula,
                   e.nombre AS empleado_nombre, e.apellido AS empleado_apellido,
                   m.id_mantenimiento, m.tipo_mantenimiento, m.fecha_mantenimiento AS fecha_inicio_mantenimiento,
                   mec.nombre AS mecanico_nombre, mec.apellido AS mecanico_apellido
            FROM Reportes r
            JOIN Vehiculo v ON r.id_vehiculo = v.id_vehiculo
            JOIN Empleado e ON r.id_empleado = e.id_empleado
            LEFT JOIN Mantenimiento m ON r.id_reporte = m.id_reporte -- Asumiendo que Mantenimiento tiene un id_reporte
            LEFT JOIN Mecanico mec ON m.id_mecanico = mec.id_mecanico
            ORDER BY r.fecha_reporte DESC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener reportes:', err);
        res.status(500).json({ error: 'Error interno al obtener reportes.' });
    }
});

app.get('/api/mecanicos', async (req, res) => {
    try {
        const result = await pool.query('SELECT id_mecanico, nombre, apellido FROM Mecanico ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener mecánicos:', err);
        res.status(500).json({ error: 'Error interno al obtener mecánicos.' });
    }
});

app.post('/api/mantenimientos', async (req, res) => {
    const { id_vehiculo, id_mecanico, tipo_mantenimiento, fecha_mantenimiento, observaciones, id_reporte_asociado } = req.body;
    if (!id_vehiculo || !id_mecanico || !tipo_mantenimiento || !fecha_mantenimiento) {
        return res.status(400).json({ error: 'Vehículo, mecánico, tipo y fecha de mantenimiento son requeridos.' });
    }
    try {
        await pool.query('BEGIN');

        const nuevoMantenimiento = await pool.query(
            'INSERT INTO Mantenimiento (id_vehiculo, id_mecanico, tipo_mantenimiento, fecha_mantenimiento, observaciones) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [id_vehiculo, id_mecanico, tipo_mantenimiento, fecha_mantenimiento, observaciones]
        );

        if (id_reporte_asociado) {
            await pool.query(
                "UPDATE Reportes SET estado = 'en_proceso' WHERE id_reporte = $1 AND estado = 'reportado'",
                [id_reporte_asociado]
            );
        }
        await pool.query(
            "UPDATE Vehiculo SET estado = 'mantenimiento' WHERE id_vehiculo = $1",
            [id_vehiculo]
        );

        await pool.query('COMMIT');
        res.status(201).json(nuevoMantenimiento.rows[0]);
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error al registrar mantenimiento:', err);
        res.status(500).json({ error: 'Error interno al registrar mantenimiento.' });
    }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Configurada' : 'NO CONFIGURADA');
  });
}