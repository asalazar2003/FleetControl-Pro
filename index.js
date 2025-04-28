const express = require('express');
const path = require('path');

const app = express();

// Archivos estáticos (CSS, imágenes, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Rutas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/asignacion', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'asignacion.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/status', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'status.html'));
});

app.get('/vehiculos', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'vehiculos.html'));
});

module.exports = app