const socket = io();

// Leer si el usuario entró mediante un enlace con ?sala=XXXX
const urlParams = new URLSearchParams(window.location.search);
const salaUrl = urlParams.get('sala');

const btnCrear = document.getElementById('btn-crear');
const btnUnirse = document.getElementById('btn-unirse');
const inputNombre = document.getElementById('nombre');

// Si hay código en el enlace, cambiar el botón principal
if (salaUrl) {
  btnCrear.classList.add('oculto');
  btnUnirse.classList.remove('oculto');
}

btnCrear.addEventListener('click', () => {
  const nombre = inputNombre.value.trim();
  if (!nombre) return alert('Escribe tu apodo primero');
  socket.emit('crearSala', nombre);
});

btnUnirse.addEventListener('click', () => {
  const nombre = inputNombre.value.trim();
  if (!nombre) return alert('Escribe tu apodo primero');
  socket.emit('unirseSala', { codigoSala: salaUrl.toUpperCase(), nombreJugador: nombre });
});

socket.on('salaCreada', ({ codigoSala, jugadores }) => {
  // Actualizar la URL sin recargar la página
  const nuevoUrl = `${window.location.origin}/?sala=${codigoSala}`;
  window.history.pushState({ path: nuevoUrl }, '', nuevoUrl);
  mostrarSala(codigoSala, jugadores, nuevoUrl);
});

socket.on('unidoExitosamente', ({ codigoSala, jugadores }) => {
  mostrarSala(codigoSala, jugadores, window.location.href);
});

socket.on('actualizarJugadores', (jugadores) => {
  renderizarLista(jugadores);
});

socket.on('errorSala', (mensaje) => {
  alert(mensaje);
  window.location.href = window.location.origin; // Volver al inicio
});

function mostrarSala(codigo, jugadores, link) {
  document.getElementById('pantalla-inicio').classList.add('oculto');
  document.getElementById('pantalla-sala').classList.remove('oculto');
  document.getElementById('codigo-display').textContent = codigo;
  document.getElementById('link-invitacion').value = link;
  renderizarLista(jugadores);
}

function renderizarLista(jugadores) {
  const lista = document.getElementById('lista-jugadores');
  lista.innerHTML = jugadores.map(j => `<li>👤 ${j.nombre}</li>`).join('');
}

function copiarLink() {
  const inputLink = document.getElementById('link-invitacion');
  inputLink.select();
  navigator.clipboard.writeText(inputLink.value);
  alert('¡Enlace copiado!');
}
