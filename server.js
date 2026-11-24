const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const salas = {};

io.on('connection', (socket) => {
  // 1. Crear sala
  socket.on('crearSala', (nombreJugador) => {
    const codigoSala = Math.random().toString(36).substring(2, 6).toUpperCase();
    salas[codigoSala] = {
      jugadores: [{ id: socket.id, nombre: nombreJugador, puntos: 0 }],
      indiceEscritor: 0,
      indiceAdivinador: 1,
      palabraSecreta: '',
      pistaSecreta: '',
      letrasCorrectas: [],
      letrasIncorrectas: [],
      vidas: 6,
      estado: 'esperando'
    };
    socket.join(codigoSala);
    socket.emit('salaCreada', { codigoSala, jugadores: salas[codigoSala].jugadores, esAnfitrion: true });
  });

  // 2. Unirse a sala
  socket.on('unirseSala', ({ codigoSala, nombreJugador }) => {
    const sala = salas[codigoSala];
    if (!sala) return socket.emit('errorSala', 'La sala no existe o ya terminó.');
    if (sala.estado !== 'esperando') return socket.emit('errorSala', 'La partida ya está en curso. Espera a la siguiente ronda.');

    sala.jugadores.push({ id: socket.id, nombre: nombreJugador, puntos: 0 });
    socket.join(codigoSala);
    
    io.to(codigoSala).emit('actualizarJugadores', sala.jugadores);
    socket.emit('unidoExitosamente', { codigoSala, jugadores: sala.jugadores, esAnfitrion: false });
  });

  // 3. Iniciar ronda
  socket.on('iniciarRonda', (codigoSala) => {
    const sala = salas[codigoSala];
    if (!sala || sala.jugadores.length < 2) return;

    sala.estado = 'eligiendo';
    sala.palabraSecreta = '';
    sala.pistaSecreta = '';
    sala.letrasCorrectas = [];
    sala.letrasIncorrectas = [];
    sala.vidas = 6;

    const escritor = sala.jugadores[sala.indiceEscritor];
    sala.indiceAdivinador = (sala.indiceEscritor + 1) % sala.jugadores.length;

    io.to(codigoSala).emit('faseElegirPalabra', {
      escritorId: escritor.id,
      escritorNombre: escritor.nombre
    });
  });

  // 4. Recibir palabra y pista
  socket.on('enviarPalabra', ({ codigoSala, palabra, pista }) => {
    const sala = salas[codigoSala];
    if (!sala) return;

    sala.palabraSecreta = palabra.trim().toUpperCase();
    sala.pistaSecreta = pista.trim() || 'Sin pista';
    sala.estado = 'jugando';

    enviarEstadoJuego(codigoSala);
  });

  // 5. Intentar letra
  socket.on('intentarLetra', ({ codigoSala, letra }) => {
    const sala = salas[codigoSala];
    if (!sala || sala.estado !== 'jugando') return;

    const jugadorTurno = sala.jugadores[sala.indiceAdivinador];
    if (socket.id !== jugadorTurno.id) return;

    if (sala.letrasCorrectas.includes(letra) || sala.letrasIncorrectas.includes(letra)) return;

    if (sala.palabraSecreta.includes(letra)) {
      sala.letrasCorrectas.push(letra);
      jugadorTurno.puntos += 10; // +10 puntos por acierto
    } else {
      sala.letrasIncorrectas.push(letra);
      sala.vidas -= 1;
    }

    // Verificar victoria
    const letrasUnicas = [...new Set(sala.palabraSecreta.replace(/ /g, '').split(''))];
    const gano = letrasUnicas.every(l => sala.letrasCorrectas.includes(l));

    if (gano) {
      jugadorTurno.puntos += 50; // +50 puntos bonus por completar la palabra
      sala.estado = 'esperando';
      sala.indiceEscritor = (sala.indiceEscritor + 1) % sala.jugadores.length;
      return io.to(codigoSala).emit('finRonda', {
        resultado: 'victoria',
        palabra: sala.palabraSecreta,
        ganador: jugadorTurno.nombre,
        jugadores: sala.jugadores
      });
    }

    // Verificar derrota
    if (sala.vidas <= 0) {
      sala.jugadores[sala.indiceEscritor].puntos += 30; // +30 puntos para quien puso la palabra difícil
      sala.estado = 'esperando';
      sala.indiceEscritor = (sala.indiceEscritor + 1) % sala.jugadores.length;
      return io.to(codigoSala).emit('finRonda', {
        resultado: 'derrota',
        palabra: sala.palabraSecreta,
        escritor: sala.jugadores[(sala.indiceEscritor - 1 + sala.jugadores.length) % sala.jugadores.length].nombre,
        jugadores: sala.jugadores
      });
    }

    // Siguiente adivinador
    do {
      sala.indiceAdivinador = (sala.indiceAdivinador + 1) % sala.jugadores.length;
    } while (sala.indiceAdivinador === sala.indiceEscritor);

    enviarEstadoJuego(codigoSala);
  });

  // Desconexión
  socket.on('disconnect', () => {
    for (const codigo in salas) {
      const sala = salas[codigo];
      const idx = sala.jugadores.findIndex(j => j.id === socket.id);
      if (idx !== -1) {
        sala.jugadores.splice(idx, 1);
        if (sala.jugadores.length === 0) {
          delete salas[codigo];
        } else {
          if (sala.indiceEscritor >= sala.jugadores.length) sala.indiceEscritor = 0;
          io.to(codigo).emit('actualizarJugadores', sala.jugadores);
        }
      }
    }
  });
});

function enviarEstadoJuego(codigoSala) {
  const sala = salas[codigoSala];
  const palabraOculta = sala.palabraSecreta
    .split('')
    .map(letra => (letra === ' ' ? '   ' : (sala.letrasCorrectas.includes(letra) ? letra : '_')))
    .join(' ');

  const adivinadorActual = sala.jugadores[sala.indiceAdivinador];
  const escritorActual = sala.jugadores[sala.indiceEscritor];

  io.to(codigoSala).emit('actualizarTablero', {
    palabraOculta,
    pista: sala.pistaSecreta,
    vidas: sala.vidas,
    letrasCorrectas: sala.letrasCorrectas,
    letrasIncorrectas: sala.letrasIncorrectas,
    turnoId: adivinadorActual.id,
    turnoNombre: adivinadorActual.nombre,
    escritorId: escritorActual.id,
    jugadores: sala.jugadores
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
