let noticiasGlobal = [];
let charts = {};
const cross = { connotacion: null, relevancia: null, dateKey: null };

// === THEME toggle (dark default) ===
function initTheme(){
  try{
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('themeToggle');
    if (btn){
      btn.textContent = saved === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
      btn.onclick = () => {
        const curr = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = (curr === 'dark') ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        btn.textContent = next === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
        actualizarDashboard(); // re-render for axis/legend contrast
      };
    }
  }catch(e){ console.warn('Theme init error', e); }
}

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

// Read CSS variables to style axes in charts
function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Agrupación por día, semana, mes
function keyForGroup(dateStr, groupBy){
  if (!dateStr) return '';
  if (groupBy === 'day') return dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  if (groupBy === 'month'){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    return `${y}-${m}`;
  }
  // week (ISO-like)
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

// helper to fade colors
function dimColor(hex, alpha){
  const r = parseInt(hex.substr(1,2),16);
  const g = parseInt(hex.substr(3,2),16);
  const b = parseInt(hex.substr(5,2),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// HTML legend plugin (outside)
function htmlLegendPlugin(containerId, byDataset=false){
  return {
    id: `htmlLegend_${containerId}`,
    afterUpdate(chart){
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = '';
      const items = byDataset
        ? chart.legend?.legendItems
        : chart.options.plugins.legend.labels.generateLabels(chart);
      (items || []).forEach((item) => {
        const btn = document.createElement('button');
        btn.className = 'item';
        const sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = item.fillStyle || item.strokeStyle;
        btn.appendChild(sw);
        const tx = document.createElement('span');
        tx.textContent = item.text;
        btn.appendChild(tx);
        btn.onclick = () => {
          if (byDataset){
            const vis = chart.isDatasetVisible(item.datasetIndex);
            chart.setDatasetVisibility(item.datasetIndex, !vis);
          } else {
            chart.toggleDataVisibility(item.index);
          }
          chart.update();
        };
        container.appendChild(btn);
      });
    }
  };
}

function graficar(noticias) {
  destruirGraficos();

  const groupBy = document.getElementById('groupBy').value;
  const tickColor = cssVar('--ink-soft') || '#cbd5e1';
  const gridColor = cssVar('--grid') || '#1f2937';

  // Relevancia (pie)
  const conteoRel = { alta: 0, media: 0, baja: 0 };
  const coloresRel = { alta: "#ef4444", media: "#f59e0b", baja: "#10b981" };
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
        legend: { display:false },
        tooltip: { callbacks: { label: (ctx) => {
          const total = relData.reduce((a,b)=>a+b,0) || 1;
          const val = ctx.parsed;
          const pct = (val/total*100).toFixed(1);
          return `${ctx.label}: ${val} (${pct}%)`;
        }} },
      }
    },
    plugins: [htmlLegendPlugin('legendRelevancia')]
  });

  // Connotación (pie)
  const conteoCon = { positiva: 0, negativa: 0, neutral: 0 };
  const coloresCon = { positiva:"#10b981", negativa:"#ef4444", neutral:"#94a3b8" };
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
        legend: { display:false },
        tooltip: { callbacks: { label: (ctx) => {
          const total = conData.reduce((a,b)=>a+b,0) || 1;
          const val = ctx.parsed;
          const pct = (val/total*100).toFixed(1);
          return `${ctx.label}: ${val} (${pct}%)`;
        }} },
      }
    },
    plugins: [htmlLegendPlugin('legendConnotacion')]
  });

  // Top 5 Fuentes
  {
    const map = new Map();
    noticias.forEach(o => { const k=(o.Fuente??'').toString().trim(); if(k) map.set(k,(map.get(k)||0)+1); });
    const pairs = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const labels = pairs.map(p=>p[0]);
    const counts = pairs.map(p=>p[1]);
    const total = noticias.length || 1;
    const percents = counts.map(c => +(c/total*100).toFixed(1));

    charts.topFuentes = new Chart(document.getElementById('graficoTopFuentes'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Noticias', data: counts, backgroundColor: "#3b82f6" }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => {
            const i = ctx.dataIndex; return `${ctx.formattedValue} (${percents[i]}%)`;
          } } }
        },
        scales: { x: { beginAtZero: true, ticks: { precision:0, color: tickColor }, grid:{ color: gridColor } },
                  y: { ticks:{ color: tickColor }, grid:{ color: gridColor } } },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          const val = labels[idx];
          const sel = document.getElementById('filtroFuente');
          sel.value = sel.value === val ? '' : val;
          actualizarDashboard();
        }
      }
    });
  }

  // Top 5 Temas
  {
    const map = new Map();
    noticias.forEach(o => { const k=(o.Tema??'').toString().trim(); if(k) map.set(k,(map.get(k)||0)+1); });
    const pairs = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const labels = pairs.map(p=>p[0]);
    const counts = pairs.map(p=>p[1]);
    const total = noticias.length || 1;
    const percents = counts.map(c => +(c/total*100).toFixed(1));

    charts.topTemas = new Chart(document.getElementById('graficoTopTemas'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Noticias', data: counts, backgroundColor: "#8b5cf6" }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => {
            const i = ctx.dataIndex; return `${ctx.formattedValue} (${percents[i]}%)`;
          } } }
        },
        scales: { x: { beginAtZero: true, ticks: { precision:0, color: tickColor }, grid:{ color: gridColor } },
                  y: { ticks:{ color: tickColor }, grid:{ color: gridColor } } },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          const val = labels[idx];
          const sel = document.getElementById('filtroTema');
          sel.value = sel.value === val ? '' : val;
          actualizarDashboard();
        }
      }
    });
  }

  // Temporal apilado 100%
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
        { label: "Positiva", data: pctPos, backgroundColor: "#10b981", stack: "polaridad" },
        { label: "Neutral",  data: pctNeu, backgroundColor: "#94a3b8", stack: "polaridad" },
        { label: "Negativa", data: pctNeg, backgroundColor: "#ef4444", stack: "polaridad" }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, resizeDelay: 50,
      plugins: {
        legend: { display:false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%` } },
      },
      layout: { padding: 0 },
      scales: {
        x: { stacked: true, ticks: { autoSkip: true, maxTicksLimit: 8, color: tickColor }, grid:{ color: gridColor } },
        y: { stacked: true, beginAtZero: true, max: 100,
             ticks: { callback: (v) => v + "%", color: tickColor }, grid:{ color: gridColor } }
      },
      onClick: (evt, elements) => {
        if (!elements.length) { cross.dateKey = null; actualizarDashboard(); return; }
        const idx = elements[0].index;
        const val = fechas[idx];
        cross.dateKey = (cross.dateKey === val) ? null : val;
        actualizarDashboard();
      }
    },
    plugins: [htmlLegendPlugin('legendTemporal', true)]
  });

  // Polaridad promedio por fecha (línea −1..1)
  const polPorFecha = {};
  noticias.forEach(n => {
    const key = keyForGroup(n.Fecha, groupBy);
    const p = Number(n.Polaridad);
    if (isNaN(p)) return;
    if (!polPorFecha[key]) polPorFecha[key] = { suma:0, cant:0 };
    polPorFecha[key].suma += p;
    polPorFecha[key].cant += 1;
  });
  const labelsPol = Object.keys(polPorFecha).sort();
  const polAvgVals = labelsPol.map(f => +(polPorFecha[f].suma / polPorFecha[f].cant).toFixed(3));
  const dataPoints = polAvgVals.map((y, i) => ({ x: i, y }));
  const npts = dataPoints.length;
  const minX = -0.5;
  const maxX = (npts === 1) ? 0.5 : (npts - 0.5);

  charts.polaridadProm = new Chart(document.getElementById("graficoPolaridadProm"), {
    type: 'line',
    data: {
      datasets: [{
        label: "Polaridad promedio (−1 a 1)",
        data: dataPoints,
        borderColor: "#8b5cf6",
        pointBackgroundColor: "#8b5cf6",
        pointRadius: 3,
        fill: false,
        tension: .2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, resizeDelay: 50,
      scales: {
        x: {
          type: 'linear',
          min: minX,
          max: maxX,
          ticks: {
            color: tickColor,
            callback: (value) => {
              const i = Math.round(value);
              return (i >= 0 && i < labelsPol.length) ? labelsPol[i] : '';
            },
            autoSkip: true,
            maxTicksLimit: 8
          },
          grid: { display: false }
        },
        y: { suggestedMin: -1, suggestedMax: 1, ticks:{ color: tickColor }, grid:{ color: gridColor } }
      },
      plugins: { legend: { display:false } },
      layout: { padding: 0 }
    },
    plugins: [htmlLegendPlugin('legendPolaridad', true)]
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
  initTheme();
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
