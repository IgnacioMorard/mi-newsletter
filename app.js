let noticiasGlobal = [];
let charts = {};

async function cargarNoticias() {
  const resp = await fetch("noticias_enriquecidas.json");
  return await resp.json();
}

function normalizarConnotacion(v){
  const s = (v ?? '').toString().trim().toLowerCase();
  if (s === 'positiva' || s === 'negativa' || s === 'neutral') return s;
  return 'neutral';
}
function normalizarRelevancia(v){
  const s = (v ?? '').toString().trim().toLowerCase();
  if (s === 'alta' || s === 'media' || s === 'baja') return s;
  return 'baja';
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
    const con = normalizarConnotacion(n.Connotacion);
    card.innerHTML = `
      <h2><a href="${n.Link}" target="_blank" rel="noopener noreferrer">${n.Título}</a></h2>
      <p><strong>Fecha:</strong> ${n.Fecha}</p>
      <p><strong>Fuente:</strong> ${n.Fuente} | <strong>Tema:</strong> ${n.Tema ?? "-"}</p>
      <p><strong>Relevancia:</strong> ${normalizarRelevancia(n.Relevancia)} |
         <strong>Connotación:</strong> ${con} (${Number(n.Polaridad).toFixed(3)})</p>
    `;
    contenedor.appendChild(card);
  });
}

function destruirGraficos(){
  Object.values(charts).forEach(c => { try{ c.destroy(); }catch(_){} });
  charts = {};
}

function graficar(noticias) {
  destruirGraficos();

  // === Relevancia ===
  const conteoRel = { alta: 0, media: 0, baja: 0 };
  noticias.forEach(n => {
    const k = normalizarRelevancia(n.Relevancia);
    if (k in conteoRel) conteoRel[k]++;
  });
  charts.relevancia = new Chart(document.getElementById("graficoRelevancia"), {
    type: 'pie',
    data: {
      labels: Object.keys(conteoRel),
      datasets: [{
        data: Object.values(conteoRel),
        backgroundColor: ["#e74c3c","#f1c40f","#2ecc71"]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  // === Connotación ===
  const conteoCon = { positiva: 0, negativa: 0, neutral: 0 };
  noticias.forEach(n => {
    const c = normalizarConnotacion(n.Connotacion);
    conteoCon[c]++;
  });
  charts.connotacion = new Chart(document.getElementById("graficoConnotacion"), {
    type: 'pie',
    data: {
      labels: Object.keys(conteoCon),
      datasets: [{
        data: Object.values(conteoCon),
        backgroundColor: ["#2ecc71","#e74c3c","#95a5a6"]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  // === Temporal por connotación (conteo) ===
  const agrupado = {};
  noticias.forEach(n => {
    const fecha = n.Fecha;
    const con = normalizarConnotacion(n.Connotacion);
    if (!agrupado[fecha]) agrupado[fecha] = { positiva:0, negativa:0, neutral:0 };
    agrupado[fecha][con]++;
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
        { label: "Positivas", data: positivas, borderColor: "#2ecc71", fill: false, tension: .2 },
        { label: "Negativas", data: negativas, borderColor: "#e74c3c", fill: false, tension: .2 },
        { label: "Neutrales", data: neutrales, borderColor: "#95a5a6", fill: false, tension: .2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true } },
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 8 } },
        y: { beginAtZero: true, precision: 0 }
      }
    }
  });

  // === Polaridad promedio por fecha ===
  const polPorFecha = {};
  noticias.forEach(n => {
    const f = n.Fecha;
    const p = Number(n.Polaridad) || 0;
    if (!polPorFecha[f]) polPorFecha[f] = { suma:0, cant:0 };
    polPorFecha[f].suma += p;
    polPorFecha[f].cant += 1;
  });
  const fechasPol = Object.keys(polPorFecha).sort();
  const polAvg = fechasPol.map(f => +(polPorFecha[f].suma / polPorFecha[f].cant).toFixed(3));

  charts.polaridadProm = new Chart(document.getElementById("graficoPolaridadProm"), {
    type: 'line',
    data: {
      labels: fechasPol,
      datasets: [{
        label: "Polaridad promedio (−1 a 1)",
        data: polAvg,
        borderColor: "#8e44ad",
        fill: false,
        tension: .2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { suggestedMin: -1, suggestedMax: 1 }
      }
    }
  });
}

function cargarFiltros(noticias) {
  const fuentes = [...new Set(noticias.map(n => n.Fuente).filter(Boolean))].sort();
  const temas = [...new Set(noticias.map(n => n.Tema).filter(Boolean))].sort();
  const selFuente = document.getElementById("filtroFuente");
  const selTema = document.getElementById("filtroTema");
  fuentes.forEach(f => selFuente.innerHTML += `<option value="${f}">${f}</option>`);
  temas.forEach(t => selTema.innerHTML += `<option value="${t}">${t}</option>`);

  [selFuente, selTema, document.getElementById("fechaInicio"), document.getElementById("fechaFin")]
    .forEach(el => el.onchange = actualizarDashboard);
}

function actualizarDashboard() {
  const filtradas = aplicarFiltros();
  renderNoticias(filtradas);
  graficar(filtradas);
}

window.onload = async () => {
  try {
    noticiasGlobal = await cargarNoticias();
    cargarFiltros(noticiasGlobal);
    actualizarDashboard();
  } catch (e){
    console.error("Error cargando noticias:", e);
    const contenedor = document.getElementById("noticias");
    contenedor.innerHTML = "<p>No se pudo cargar el JSON. Verificá el nombre del archivo y el hosting (GitHub Pages).</p>";
  }
};
