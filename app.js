async function cargarNoticias() {
  const resp = await fetch("noticias_enriquecidas.json");
  return await resp.json();
}

function renderNoticias(noticias, filtroFuente = "", filtroTema = "") {
  const contenedor = document.getElementById("noticias");
  contenedor.innerHTML = "";

  const filtradas = noticias.filter(n => {
    let ok = true;
    if (filtroFuente && n.Fuente !== filtroFuente) ok = false;
    if (filtroTema && n.Tema !== filtroTema) ok = false;
    return ok;
  });

  filtradas.forEach(n => {
    const card = document.createElement("div");
    card.className = "noticia";
    card.innerHTML = `
      <h2><a href="${n.Link}" target="_blank">${n.Título}</a></h2>
      <p><strong>Fecha:</strong> ${n.Fecha}</p>
      <p><strong>Fuente:</strong> ${n.Fuente} | <strong>Tema:</strong> ${n.Tema}</p>
      <p><strong>Relevancia:</strong> ${n.Relevancia} | 
         <strong>Connotación:</strong> ${n.Connotacion} (${n.Polaridad})</p>
    `;
    contenedor.appendChild(card);
  });
}

function graficar(noticias) {
  const ctx = document.getElementById("graficoRelevancia").getContext("2d");
  const conteo = { alta: 0, media: 0, baja: 0 };
  noticias.forEach(n => conteo[n.Relevancia]++);

  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(conteo),
      datasets: [{
        data: Object.values(conteo),
        backgroundColor: ["#e74c3c", "#f1c40f", "#2ecc71"]
      }]
    }
  });
}

function cargarFiltros(noticias) {
  const fuentes = [...new Set(noticias.map(n => n.Fuente))];
  const temas = [...new Set(noticias.map(n => n.Tema))];

  const selFuente = document.getElementById("filtroFuente");
  const selTema = document.getElementById("filtroTema");

  fuentes.forEach(f => selFuente.innerHTML += `<option value="${f}">${f}</option>`);
  temas.forEach(t => selTema.innerHTML += `<option value="${t}">${t}</option>`);

  selFuente.onchange = () => renderNoticias(noticias, selFuente.value, selTema.value);
  selTema.onchange = () => renderNoticias(noticias, selFuente.value, selTema.value);
}

window.onload = async () => {
  const noticias = await cargarNoticias();
  cargarFiltros(noticias);
  renderNoticias(noticias);
  graficar(noticias);
};
