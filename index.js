const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Archivos estáticos (CSS, imágenes, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Rutas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/asignacion', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'asignacion.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
});