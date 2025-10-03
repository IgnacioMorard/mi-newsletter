let noticiasGlobal = [];
let charts = {};

async function cargarNoticias() {
  const resp = await fetch("noticias_enriquecidas.json");
  return await resp.json();
}

function aplicarFiltros() {
  const selFuente = document.getElementById("filtroFuente").value;
  const selTema = document.getElementById("filtroTema").value;
  const fechaInicio = document.getElementById("fechaInicio").value;
  const fechaFin = document.getElementById("fechaFin").value;

  return noticiasGlobal.filter(n => {
    let ok = true;
    if (selFuente && n.Fuente !== selFuente) ok = false;
    if (selTema && n.Tema !== selTema) ok = false;
    if (fechaInicio && n.Fecha < fechaInicio) ok = false;
    if (fechaFin && n.Fecha > fechaFin) ok = false;
    return ok;
  });
}

function renderNoticias(noticias) {
  const contenedor = document.getElementById("noticias");
  contenedor.innerHTML = "";
  noticias.forEach(n => {
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
  // destruir gráficos previos
  Object.values(charts).forEach(c => c.destroy());

  // Relevancia
  const conteoRel = { alta: 0, media: 0, baja: 0 };
  noticias.forEach(n => conteoRel[n.Relevancia]++);
  charts.relevancia = new Chart(document.getElementById("graficoRelevancia"), {
    type: 'pie',
    data: { labels: Object.keys(conteoRel), datasets: [{ data: Object.values(conteoRel), backgroundColor: ["#e74c3c","#f1c40f","#2ecc71"] }] }
  });

  // Connotación
  const conteoCon = { positiva: 0, negativa: 0, neutral: 0 };
  noticias.forEach(n => conteoCon[n.Connotacion]++);
  charts.connotacion = new Chart(document.getElementById("graficoConnotacion"), {
    type: 'pie',
    data: { labels: Object.keys(conteoCon), datasets: [{ data: Object.values(conteoCon), backgroundColor: ["#2ecc71","#e74c3c","#95a5a6"] }] }
  });

  // Temporal
  const agrupado = {};
  noticias.forEach(n => {
    if (!agrupado[n.Fecha]) agrupado[n.Fecha] = { positiva:0, negativa:0, neutral:0 };
    agrupado[n.Fecha][n.Connotacion]++;
  });
  const fechas = Object.keys(agrupado).sort();
  const positivas = fechas.map(f => agrupado[f].positiva);
  const negativas = fechas.map(f => agrupado[f].negativa);
  const neutrales = fechas.map(f => agrupado[f].neutral);

  charts.temporal = new Chart(document.getElementById("graficoTemporal"), {
    type: 'line',
    data: {
      labels: fechas,
      datasets: [
        { label: "Positivas", data: positivas, borderColor: "#2ecc71", fill: false },
        { label: "Negativas", data: negativas, borderColor: "#e74c3c", fill: false },
        { label: "Neutrales", data: neutrales, borderColor: "#95a5a6", fill: false }
      ]
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

  // aplicar cambios en filtros
  [selFuente, selTema, document.getElementById("fechaInicio"), document.getElementById("fechaFin")].forEach(el => {
    el.onchange = actualizarDashboard;
  });
}

function actualizarDashboard() {
  const filtradas = aplicarFiltros();
  renderNoticias(filtradas);
  graficar(filtradas);
}

window.onload = async () => {
  noticiasGlobal = await cargarNoticias();
  cargarFiltros(noticiasGlobal);
  actualizarDashboard();
};
