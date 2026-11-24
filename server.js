const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir los archivos de la carpeta 'public'
app.use(express.static('public'));

// Almacén en memoria de las salas activas
const salas = {};

io.on('connection', (socket) => {
  // 1. Crear una sala nueva
  socket.on('crearSala', (nombreJugador) => {
    const codigoSala = Math.random().toString(36).substring(2, 6).toUpperCase();
    salas[codigoSala] = {
      jugadores: [{ id: socket.id, nombre: nombreJugador }],
      palabraSecreta: '',
      turnoActual: 0
    };
    socket.join(codigoSala);
    socket.emit('salaCreada', { codigoSala, jugadores: salas[codigoSala].jugadores });
  });

  // 2. Unirse a una sala existente por enlace o código
  socket.on('unirseSala', ({ codigoSala, nombreJugador }) => {
    const sala = salas[codigoSala];
    if (!sala) {
      return socket.emit('errorSala', 'La sala no existe o ya terminó.');
    }
    sala.jugadores.push({ id: socket.id, nombre: nombreJugador });
    socket.join(codigoSala);
    
    // Avisar a todos en la sala que entró alguien nuevo
    io.to(codigoSala).emit('actualizarJugadores', sala.jugadores);
    socket.emit('unidoExitosamente', { codigoSala, jugadores: sala.jugadores });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
