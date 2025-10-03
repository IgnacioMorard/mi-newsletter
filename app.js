let noticiasGlobal = [];
let charts = {};

async function cargarNoticias() {
  const resp = await fetch("noticias_enriquecidas.json");
  return await resp.json();
}

function signLabel(p, thr){
  if (p > thr) return 'positiva';
  if (p < -thr) return 'negativa';
  return 'neutral';
}
function normRelevancia(v){
  const s = (v ?? '').toString().trim().toLowerCase();
  if (s === 'alta' || s === 'media' || s === 'baja') return s;
  return 'baja';
}

function keyForGroup(dateStr, groupBy){
  if (!dateStr) return '';
  if (groupBy === 'day') return dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1)/7);
  const y = tmp.getUTCFullYear();
  const ww = weekNo.toString().padStart(2,'0');
  return `${y}-W${ww}`;
}

function aplicarVentanaFechas(noticias){
  const ventana = document.getElementById('ventana').value;
  if (ventana === 'all') return;
  const maxDate = noticias.reduce((acc, n) => acc > n.Fecha ? acc : n.Fecha, '0000-00-00');
  const d = new Date(maxDate + 'T00:00:00');
  const days = parseInt(ventana, 10);
  const start = new Date(d);
  start.setDate(d.getDate() - (days - 1));
  const y = start.getFullYear();
  const m = String(start.getMonth()+1).padStart(2,'0');
  const dd = String(start.getDate()).padStart(2,'0');
  document.getElementById('fechaInicio').value = `${y}-${m}-${dd}`;
  document.getElementById('fechaFin').value = maxDate;
}

function aplicarFiltros() {
  const selFuente = document.getElementById("filtroFuente").value;
  const selTema = document.getElementById("filtroTema").value;
  const fechaInicio = document.getElementById("fechaInicio").value;
  const fechaFin = document.getElementById("fechaFin").value;
  const umbral = Number(document.getElementById('umbral').value) || 0.05;

  return noticiasGlobal.filter(n => {
    let ok = true;
    if (selFuente && n.Fuente !== selFuente) ok = false;
    if (selTema && n.Tema !== selTema) ok = false;
    if (fechaInicio && n.Fecha < fechaInicio) ok = false;
    if (fechaFin && n.Fecha > fechaFin) ok = false;
    return ok;
  }).map(n => ({
    ...n,
    _signo: signLabel(Number(n.Polaridad)||0, umbral)
  }));
}

function renderNoticias(noticias) {
  const contenedor = document.getElementById("noticias");
  contenedor.innerHTML = "";
  noticias.forEach(n => {
    const card = document.createElement("div");
    card.className = "noticia";
    card.innerHTML = `
      <h2><a href="${n.Link}" target="_blank" rel="noopener noreferrer">${n.Título}</a></h2>
      <p><strong>Fecha:</strong> ${n.Fecha}</p>
      <p><strong>Fuente:</strong> ${n.Fuente} | <strong>Tema:</strong> ${n.Tema ?? "-"}</p>
    `;
    contenedor.appendChild(card);
  });
}

function destruirGraficos(){
  Object.values(charts).forEach(c => { try{ c.destroy(); }catch(_){} });
  charts = {};
}

function calcKPIs(noticias){
  const total = noticias.length;
  const pols = noticias.map(n => Number(n.Polaridad)).filter(v => !isNaN(v));
  const avg = pols.length ? (pols.reduce((a,b)=>a+b,0)/pols.length) : 0;
  const sorted = [...pols].sort((a,b)=>a-b);
  let med = 0;
  if (sorted.length){
    const mid = Math.floor(sorted.length/2);
    med = sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
  }
  const pos = noticias.filter(n => n._signo === 'positiva').length;
  const pctPos = total ? (pos/total*100) : 0;

  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiPctPos').textContent = pctPos.toFixed(1) + '%';
  document.getElementById('kpiPolAvg').textContent = avg.toFixed(3);
  document.getElementById('kpiPolMed').textContent = med.toFixed(3);
}

function graficar(noticias) {
  destruirGraficos();

  // === Relevancia ===
  const conteoRel = { alta: 0, media: 0, baja: 0 };
  noticias.forEach(n => {
    const k = normRelevancia(n.Relevancia);
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

  // === Connotación (por signo de polaridad y umbral) ===
  const conteoCon = { positiva: 0, negativa: 0, neutral: 0 };
  noticias.forEach(n => { conteoCon[n._signo]++; });
  charts.connotacion = new Chart(document.getElementById("graficoConnotacion"), {
    type: 'pie',
    data: {
      labels: ["Positiva","Negativa","Neutral"],
      datasets: [{
        data: [conteoCon.positiva, conteoCon.negativa, conteoCon.neutral],
        backgroundColor: ["#2ecc71","#e74c3c","#95a5a6"]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  // === Temporal (100% apiladas por signo) ===
  const groupBy = document.getElementById('groupBy').value;
  const porFecha = {};
  noticias.forEach(n => {
    const key = keyForGroup(n.Fecha, groupBy);
    if (!porFecha[key]) porFecha[key] = { pos:0, neg:0, neu:0, total:0 };
    if (n._signo === 'positiva') porFecha[key].pos += 1;
    else if (n._signo === 'negativa') porFecha[key].neg += 1;
    else porFecha[key].neu += 1;
    porFecha[key].total += 1;
  });
  const fechas = Object.keys(porFecha).sort();
  const pctPos = fechas.map(f => porFecha[f].total ? +(porFecha[f].pos/porFecha[f].total*100).toFixed(2) : 0);
  const pctNeg = fechas.map(f => porFecha[f].total ? +(porFecha[f].neg/porFecha[f].total*100).toFixed(2) : 0);
  const pctNeu = fechas.map(f => porFecha[f].total ? +(porFecha[f].neu/porFecha[f].total*100).toFixed(2) : 0);

  charts.temporal = new Chart(document.getElementById("graficoTemporal"), {
    type: 'bar',
    data: {
      labels: fechas,
      datasets: [
        { label: "Positiva", data: pctPos, backgroundColor: "#2ecc71", stack: "polaridad" },
        { label: "Neutral",  data: pctNeu, backgroundColor: "#95a5a6", stack: "polaridad" },
        { label: "Negativa", data: pctNeg, backgroundColor: "#e74c3c", stack: "polaridad" }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%` } },
        legend: { display: true }
      },
      scales: {
        x: { stacked: true, ticks: { autoSkip: true, maxTicksLimit: 8 } },
        y: { stacked: true, beginAtZero: true, max: 100,
             ticks: { callback: (v) => v + "%" } }
      }
    }
  });

  // === Polaridad promedio por fecha (línea −1..1) ===
  const polPorFecha = {};
  noticias.forEach(n => {
    const key = keyForGroup(n.Fecha, groupBy);
    const p = Number(n.Polaridad);
    if (isNaN(p)) return;
    if (!polPorFecha[key]) polPorFecha[key] = { suma:0, cant:0 };
    polPorFecha[key].suma += p;
    polPorFecha[key].cant += 1;
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
      scales: { y: { suggestedMin: -1, suggestedMax: 1 } }
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

  ['filtroFuente','filtroTema','fechaInicio','fechaFin','groupBy','ventana','umbral'].forEach(id => {
    document.getElementById(id).onchange = actualizarDashboard;
  });
  // Aplicar ventana al inicio si se elige diferente de 'all'
  document.getElementById('ventana').onchange = () => {
    aplicarVentanaFechas(noticiasGlobal);
    actualizarDashboard();
  };
}

function actualizarDashboard() {
  const filtradas = aplicarFiltros();
  renderNoticias(filtradas);
  calcKPIs(filtradas);
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
