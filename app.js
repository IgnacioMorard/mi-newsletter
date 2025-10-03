let noticiasGlobal = [];
let charts = {};
const cross = { connotacion: null, relevancia: null, dateKey: null };

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

function aplicarFiltrosBase() {
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

function aplicarCrossFilters(arr){
  return arr.filter(n => {
    if (cross.connotacion && n._signo !== cross.connotacion) return false;
    if (cross.relevancia && normRelevancia(n.Relevancia) !== cross.relevancia) return false;
    if (cross.dateKey){
      const key = keyForGroup(n.Fecha, document.getElementById('groupBy').value);
      if (key !== cross.dateKey) return false;
    }
    return true;
  });
}

function aplicarFiltros() {
  const base = aplicarFiltrosBase();
  return aplicarCrossFilters(base);
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

function dimColor(hex, alpha){
  const r = parseInt(hex.substr(1,2),16);
  const g = parseInt(hex.substr(3,2),16);
  const b = parseInt(hex.substr(5,2),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function graficar(noticias) {
  destruirGraficos();

  const groupBy = document.getElementById('groupBy').value;

  // === Relevancia (pie con cross-filter + sombreado) ===
  const conteoRel = { alta: 0, media: 0, baja: 0 };
  const coloresRel = { alta: "#e74c3c", media: "#f1c40f", baja: "#2ecc71" };
  noticias.forEach(n => {
    const k = normRelevancia(n.Relevancia);
    if (k in conteoRel) conteoRel[k]++;
  });
  const relLabels = Object.keys(conteoRel);
  const relData = Object.values(conteoRel);
  const relColors = relLabels.map(lbl => {
    if (!cross.relevancia) return coloresRel[lbl];
    return (cross.relevancia === lbl) ? coloresRel[lbl] : dimColor(coloresRel[lbl], 0.25);
  });
  charts.relevancia = new Chart(document.getElementById("graficoRelevancia"), {
    type: 'pie',
    data: { labels: relLabels, datasets: [{ data: relData, backgroundColor: relColors }] },
    options: {
      responsive: true, maintainAspectRatio: false, resizeDelay: 50,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { bodyFont: { size: 11 } },
      },
      layout: { padding: 0 },
      onClick: (evt, elems) => {
        if (!elems.length) { cross.relevancia = null; actualizarDashboard(); return; }
        const idx = elems[0].index;
        const val = relLabels[idx];
        cross.relevancia = (cross.relevancia === val) ? null : val;
        actualizarDashboard();
      }
    }
  });

  // === Connotación (pie por signo con cross-filter + sombreado) ===
  const conteoCon = { positiva: 0, negativa: 0, neutral: 0 };
  const coloresCon = { positiva:"#2ecc71", negativa:"#e74c3c", neutral:"#95a5a6" };
  noticias.forEach(n => { conteoCon[n._signo]++; });
  const conLabels = ["positiva","negativa","neutral"];
  const conData = [conteoCon.positiva, conteoCon.negativa, conteoCon.neutral];
  const conColors = conLabels.map(lbl => {
    if (!cross.connotacion) return coloresCon[lbl];
    return (cross.connotacion === lbl) ? coloresCon[lbl] : dimColor(coloresCon[lbl], 0.25);
  });
  charts.connotacion = new Chart(document.getElementById("graficoConnotacion"), {
    type: 'pie',
    data: { labels: conLabels, datasets: [{ data: conData, backgroundColor: conColors }] },
    options: {
      responsive: true, maintainAspectRatio: false, resizeDelay: 50,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { bodyFont: { size: 11 } },
      },
      layout: { padding: 0 },
      onClick: (evt, elems) => {
        if (!elems.length) { cross.connotacion = null; actualizarDashboard(); return; }
        const idx = elems[0].index;
        const val = conLabels[idx];
        cross.connotacion = (cross.connotacion === val) ? null : val;
        actualizarDashboard();
      }
    }
  });

  // === Temporal (100% apiladas por signo) con click por fecha ===
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

  const colorPos = cross.dateKey ? dimColor("#2ecc71", 0.6) : "#2ecc71";
  const colorNeu = cross.dateKey ? dimColor("#95a5a6", 0.6) : "#95a5a6";
  const colorNeg = cross.dateKey ? dimColor("#e74c3c", 0.6) : "#e74c3c";

  charts.temporal = new Chart(document.getElementById("graficoTemporal"), {
    type: 'bar',
    data: {
      labels: fechas,
      datasets: [
        { label: "Positiva", data: pctPos, backgroundColor: colorPos, stack: "polaridad" },
        { label: "Neutral",  data: pctNeu, backgroundColor: colorNeu, stack: "polaridad" },
        { label: "Negativa", data: pctNeg, backgroundColor: colorNeg, stack: "polaridad" }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, resizeDelay: 50,
      plugins: {
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%` } },
        legend: { display: true, labels: { font: { size: 11 } } }
      },
      layout: { padding: 0 },
      scales: {
        x: { stacked: true, ticks: { autoSkip: true, maxTicksLimit: 8 } },
        y: { stacked: true, beginAtZero: true, max: 100,
             ticks: { callback: (v) => v + "%" } }
      },
      onClick: (evt, elements) => {
        if (!elements.length) { cross.dateKey = null; actualizarDashboard(); return; }
        const idx = elements[0].index;
        const val = fechas[idx];
        cross.dateKey = (cross.dateKey === val) ? null : val;
        actualizarDashboard();
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

  const lineColor = cross.dateKey ? dimColor("#8e44ad", 0.6) : "#8e44ad";

  charts.polaridadProm = new Chart(document.getElementById("graficoPolaridadProm"), {
    type: 'line',
    data: {
      labels: fechasPol,
      datasets: [{
        label: "Polaridad promedio (−1 a 1)",
        data: polAvg,
        borderColor: lineColor,
        fill: false,
        tension: .2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, resizeDelay: 50,
      scales: { y: { suggestedMin: -1, suggestedMax: 1 } },
      plugins: { legend: { labels: { font: { size: 11 } } } },
      layout: { padding: 0 }
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
  document.getElementById('ventana').onchange = () => {
    aplicarVentanaFechas(noticiasGlobal);
    actualizarDashboard();
  };
  document.getElementById('btnLimpiar').onclick = () => {
    cross.connotacion = null; cross.relevancia = null; cross.dateKey = null;
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
