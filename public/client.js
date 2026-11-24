const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const salaUrl = urlParams.get('sala');

let codigoSalaActual = '';
let soyAnfitrion = false;
let intervaloReloj = null;

if (salaUrl) {
  document.getElementById('btn-crear').classList.add('oculto');
  document.getElementById('btn-unirse').classList.remove('oculto');
}

function mostrarPantalla(id) {
  ['pantalla-inicio', 'pantalla-lobby', 'pantalla-elegir', 'pantalla-juego', 'pantalla-fin']
    .forEach(p => document.getElementById(p).classList.add('oculto'));
  document.getElementById(id).classList.remove('oculto');
}

// Botones de entrada
document.getElementById('btn-crear').onclick = () => {
  const nombre = document.getElementById('nombre').value.trim();
  if (!nombre) return alert('Escribe tu apodo primero');
  socket.emit('crearSala', nombre);
};

document.getElementById('btn-unirse').onclick = () => {
  const nombre = document.getElementById('nombre').value.trim();
  if (!nombre) return alert('Escribe tu apodo primero');
  socket.emit('unirseSala', { codigoSala: salaUrl.toUpperCase(), nombreJugador: nombre });
};

socket.on('salaCreada', ({ codigoSala, jugadores, esAnfitrion }) => {
  codigoSalaActual = codigoSala;
  soyAnfitrion = esAnfitrion;
  const nuevoUrl = `${window.location.origin}/?sala=${codigoSala}`;
  window.history.pushState({ path: nuevoUrl }, '', nuevoUrl);
  configurarLobby(codigoSala, jugadores, nuevoUrl);
});

socket.on('unidoExitosamente', ({ codigoSala, jugadores, esAnfitrion }) => {
  codigoSalaActual = codigoSala;
  soyAnfitrion = esAnfitrion;
  configurarLobby(codigoSala, jugadores, window.location.href);
});

function configurarLobby(codigo, jugadores, link) {
  mostrarPantalla('pantalla-lobby');
  document.getElementById('codigo-display').textContent = codigo;
  document.getElementById('link-invitacion').value = link;
  renderizarJugadores(jugadores, 'lista-jugadores');

  if (soyAnfitrion) {
    document.getElementById('btn-empezar').classList.remove('oculto');
  } else {
    document.getElementById('msg-espera-anfitrion').classList.remove('oculto');
  }
}

socket.on('actualizarJugadores', (jugadores) => {
  renderizarJugadores(jugadores, 'lista-jugadores');
});

function renderizarJugadores(jugadores, contenedorId) {
  const html = jugadores
    .sort((a, b) => b.puntos - a.puntos)
    .map(j => `<div class="jugador-chip">👤 ${j.nombre} <span class="puntos">${j.puntos} pts</span></div>`)
    .join('');
  document.getElementById(contenedorId).innerHTML = html;

  if (soyAnfitrion && contenedorId === 'lista-jugadores') {
    document.getElementById('btn-empezar').disabled = jugadores.length < 2;
  }
}

// Iniciar partida
document.getElementById('btn-empezar').onclick = () => socket.emit('iniciarRonda', codigoSalaActual);
document.getElementById('btn-siguiente-ronda').onclick = () => socket.emit('iniciarRonda', codigoSalaActual);

socket.on('faseElegirPalabra', ({ escritorId, escritorNombre }) => {
  detenerReloj();
  mostrarPantalla('pantalla-elegir');
  if (socket.id === escritorId) {
    document.getElementById('vista-escritor').classList.remove('oculto');
    document.getElementById('vista-esperando-palabra').classList.add('oculto');
    document.getElementById('input-palabra-secreta').value = '';
    document.getElementById('input-pista-secreta').value = '';
  } else {
    document.getElementById('vista-escritor').classList.add('oculto');
    document.getElementById('vista-esperando-palabra').classList.remove('oculto');
    document.getElementById('texto-quien-elige').textContent = `✍️ ${escritorNombre} está escribiendo la palabra secreta...`;
  }
});

document.getElementById('btn-enviar-palabra').onclick = () => {
  const palabra = document.getElementById('input-palabra-secreta').value.trim();
  const pista = document.getElementById('input-pista-secreta').value.trim();
  if (!/^[a-zA-ZñÑ\s]{2,20}$/.test(palabra)) {
    return alert('Usa solo letras (mínimo 2), sin tildes ni números.');
  }
  socket.emit('enviarPalabra', { codigoSala: codigoSalaActual, palabra, pista });
};

// Control del cronómetro en vivo
function iniciarReloj(tiempoInicio) {
  detenerReloj();
  const relojEl = document.getElementById('reloj-display');

  const actualizar = () => {
    const segundosTotales = Math.floor((Date.now() - tiempoInicio) / 1000);
    const min = String(Math.floor(segundosTotales / 60)).padStart(2, '0');
    const seg = String(segundosTotales % 60).padStart(2, '0');
    
    relojEl.textContent = `⏱️ ${min}:${seg}`;
    
    if (segundosTotales > 120) {
      relojEl.classList.add('timer-expirado');
    } else {
      relojEl.classList.remove('timer-expirado');
    }
  };

  actualizar();
  intervaloReloj = setInterval(actualizar, 1000);
}

function detenerReloj() {
  if (intervaloReloj) {
    clearInterval(intervaloReloj);
    intervaloReloj = null;
  }
}

// Tablero y SVG
socket.on('actualizarTablero', ({ palabraOculta, pista, vidas, letrasCorrectas, letrasIncorrectas, turnoId, turnoNombre, escritorId, tiempoInicio, jugadores }) => {
  mostrarPantalla('pantalla-juego');
  renderizarJugadores(jugadores, 'marcador-juego');
  document.getElementById('texto-pista').textContent = pista;
  document.getElementById('palabra-display').textContent = palabraOculta;
  
  iniciarReloj(tiempoInicio);

  for (let i = 0; i < 6; i++) {
    const parte = document.getElementById(`parte-${i}`);
    if (vidas <= i) {
      parte.classList.remove('oculto');
    } else {
      parte.classList.add('oculto');
    }
  }

  const esMiTurno = socket.id === turnoId;
  const soyEscritor = socket.id === escritorId;
  const banner = document.getElementById('indicador-turno');

  if (soyEscritor) {
    banner.className = 'turno-banner';
    banner.textContent = `👀 Tú pusiste la palabra. Turno de: ${turnoNombre}`;
  } else if (esMiTurno) {
    banner.className = 'turno-banner mi-turno';
    banner.textContent = '🟢 ¡ES TU TURNO! Toca una letra';
  } else {
    banner.className = 'turno-banner';
    banner.textContent = `⏳ Turno de: ${turnoNombre}`;
  }

  renderizarTeclado(letrasCorrectas, letrasIncorrectas, esMiTurno && !soyEscritor);
});

function renderizarTeclado(correctas, incorrectas, habilitar) {
  const letras = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
  const contenedor = document.getElementById('teclado');
  contenedor.innerHTML = '';

  letras.forEach(letra => {
    const btn = document.createElement('button');
    btn.textContent = letra;
    btn.className = 'tecla';

    if (correctas.includes(letra)) {
      btn.classList.add('tecla-ok');
      btn.disabled = true;
    } else if (incorrectas.includes(letra)) {
      btn.classList.add('tecla-mal');
      btn.disabled = true;
    } else {
      btn.disabled = !habilitar;
    }

    btn.onclick = () => socket.emit('intentarLetra', { codigoSala: codigoSalaActual, letra });
    contenedor.appendChild(btn);
  });
}

// Fin de ronda
socket.on('finRonda', ({ resultado, palabra, ganador, escritor, puntosEscritor, segundos, jugadores }) => {
  detenerReloj();
  mostrarPantalla('pantalla-fin');
  renderizarJugadores(jugadores, 'marcador-fin');
  
  if (resultado === 'victoria') {
    document.getElementById('titulo-resultado').textContent = `🎉 ¡${ganador} adivinó la palabra! (+100 pts)`;
    document.getElementById('detalle-puntos').textContent = 
      segundos <= 120 
        ? `Tiempo: ${segundos}s (menos de 2 min) → ${escritor} gana +${puntosEscritor} pts.`
        : `Tiempo: ${segundos}s (pasaron 2 min) → ${escritor} gana +${puntosEscritor} pts.`;
  } else {
    document.getElementById('titulo-resultado').textContent = '💀 ¡Ahorcados! Nadie adivinó (0 pts)';
    document.getElementById('detalle-puntos').textContent = `${escritor} gana +${puntosEscritor} pts por poner la palabra.`;
  }
      
  document.getElementById('palabra-revelada').textContent = `La palabra era: ${palabra}`;

  if (soyAnfitrion) {
    document.getElementById('btn-siguiente-ronda').classList.remove('oculto');
  } else {
    document.getElementById('msg-espera-ronda').classList.remove('oculto');
  }
});

socket.on('errorSala', (msg) => {
  detenerReloj();
  alert(msg);
  window.location.href = window.location.origin;
});

function copiarLink() {
  navigator.clipboard.writeText(document.getElementById('link-invitacion').value);
  alert('¡Enlace copiado! Envíalo a tus amigos.');
}

