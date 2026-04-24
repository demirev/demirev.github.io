// Sofia Elections Map — static Leaflet app.
// Loads data/manifest.json, then each election's precincts.geojson + parties.json.

const MAP_CENTER = [42.6977, 23.3219]; // Sofia
const MAP_ZOOM = 11;

// Distinct palette for categorical (winning-party) coloring. Index = rank
// among parties with at least one precinct won. The remainder share "other".
const PARTY_PALETTE = [
  "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
  "#ffcc00", "#a65628", "#f781bf", "#17becf", "#7f7f7f",
  "#1b9e77", "#d95f02", "#7570b3",
];
const OTHER_COLOR = "#bbbbbb";
const NO_DATA_COLOR = "#eeeeee";

// Sequential ramp for numeric variables (light → dark).
const SEQ_FROM = "#f7fbff";
const SEQ_TO = "#08306b";

const state = {
  manifest: null,
  electionId: null,
  parties: {},        // {party_no: name}
  knownColors: {},    // {party_no: hex | null} — from the per-election color file
  partyColors: {},    // {party_no: hex} — final colors after rank + palette fill
  partyRank: [],      // [party_no, ...] in descending total-vote order
  geojson: null,
  layer: null,
  variable: "winner",
  selectedLayer: null,
};

const map = L.map("map", { preferCanvas: true }).setView(MAP_CENTER, MAP_ZOOM);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

init();

async function init() {
  state.manifest = await fetchJSON("./data/manifest.json");
  populateElectionSelect();
  await loadElection(pickDefaultElectionId());
}

function pickDefaultElectionId() {
  const elections = state.manifest?.elections || [];
  if (!elections.length) return null;
  const declared = state.manifest.default;
  if (declared && elections.some((e) => e.id === declared)) return declared;
  // Manifest is written newest-first, so elections[0] is the latest.
  return elections[0].id;
}

function populateElectionSelect() {
  const sel = document.getElementById("election-select");
  sel.innerHTML = "";
  for (const e of state.manifest.elections) {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.label;
    sel.appendChild(opt);
  }
  sel.value = pickDefaultElectionId();
  sel.addEventListener("change", () => loadElection(sel.value));
}

async function loadElection(electionId) {
  state.electionId = electionId;
  const base = `./data/${electionId}`;
  const [partiesRaw, geojson] = await Promise.all([
    fetchJSON(`${base}/parties.json`),
    fetchJSON(`${base}/precincts.geojson`),
  ]);
  state.parties = {};
  state.knownColors = {};
  for (const [num, entry] of Object.entries(partiesRaw)) {
    state.parties[num] = entry.name;
    state.knownColors[num] = entry.color || null;
  }
  state.geojson = geojson;
  assignPartyColors();
  populateVariableSelect();
  renderLayer();
  closeDetail();
}

function assignPartyColors() {
  // Rank parties by total votes across all Sofia precincts; top N get
  // distinct palette entries, rest share OTHER_COLOR.
  const totals = {};
  for (const f of state.geojson.features) {
    const parties = f.properties.results?.parties || {};
    for (const [pno, v] of Object.entries(parties)) {
      totals[pno] = (totals[pno] || 0) + v;
    }
  }
  const ranked = Object.entries(totals)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([pno]) => pno);
  state.partyRank = ranked;
  state.partyColors = {};

  // Known colors are reserved first and do not consume palette slots. The
  // remaining palette is assigned to uncolored parties in descending rank order.
  let paletteIdx = 0;
  for (const pno of ranked) {
    const known = state.knownColors[pno];
    if (known) {
      state.partyColors[pno] = known;
    } else if (paletteIdx < PARTY_PALETTE.length) {
      state.partyColors[pno] = PARTY_PALETTE[paletteIdx++];
    } else {
      state.partyColors[pno] = OTHER_COLOR;
    }
  }
}

function populateVariableSelect() {
  const sel = document.getElementById("variable-select");
  sel.innerHTML = "";
  const options = [
    { value: "winner", label: "Winning party" },
    { value: "turnout", label: "Turnout %" },
    { value: "invalid_share", label: "Invalid ballot %" },
    { value: "no_one_share", label: '"No one" vote %' },
    { value: "eligible", label: "Eligible voters" },
    { value: "voted", label: "Total voters" },
    { value: "valid", label: "Valid votes" },
  ];
  // Add per-party share options, ordered by total votes.
  for (const pno of state.partyRank) {
    options.push({
      value: `party:${pno}`,
      label: `Share — ${shortPartyName(state.parties[pno] || pno)}`,
    });
  }
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    sel.appendChild(opt);
  }
  sel.value = state.variable;
  sel.onchange = () => {
    state.variable = sel.value;
    restyle();
    renderLegend();
  };
}

function renderLayer() {
  if (state.layer) state.layer.remove();
  state.layer = L.geoJSON(state.geojson, {
    style: featureStyle,
    onEachFeature: (feature, layer) => {
      layer.on({
        click: (e) => {
          if (state.selectedLayer) state.layer.resetStyle(state.selectedLayer);
          state.selectedLayer = layer;
          layer.setStyle({ weight: 2.5, color: "#000" });
          layer.bringToFront();
          showDetail(feature);
        },
        mouseover: (e) => {
          if (layer !== state.selectedLayer) {
            layer.setStyle({ weight: 1.5, color: "#333" });
          }
        },
        mouseout: (e) => {
          if (layer !== state.selectedLayer) {
            state.layer.resetStyle(layer);
          }
        },
      });
    },
  }).addTo(map);
  renderLegend();
}

function restyle() {
  if (!state.layer) return;
  state.layer.setStyle(featureStyle);
  if (state.selectedLayer) {
    state.selectedLayer.setStyle({ weight: 2.5, color: "#000" });
    state.selectedLayer.bringToFront();
  }
}

function featureStyle(feature) {
  return {
    fillColor: fillFor(feature),
    fillOpacity: 0.72,
    color: "#777",
    weight: 0.4,
  };
}

function fillFor(feature) {
  const r = feature.properties.results;
  if (!r) return NO_DATA_COLOR;
  if (state.variable === "winner") {
    if (r.winner == null) return NO_DATA_COLOR;
    return state.partyColors[r.winner] || OTHER_COLOR;
  }
  const value = numericValue(r, state.variable);
  if (value == null) return NO_DATA_COLOR;
  const { min, max } = numericRange();
  return sequentialColor(value, min, max);
}

function numericValue(results, variable) {
  if (variable.startsWith("party:")) {
    const pno = variable.slice(6);
    const v = results.parties?.[pno] || 0;
    return results.valid > 0 ? v / results.valid : 0;
  }
  return results[variable];
}

// Cache of min/max per (electionId, variable) since restyle runs per-feature.
let _rangeCache = { key: null, min: 0, max: 1 };
function numericRange() {
  const key = `${state.electionId}|${state.variable}`;
  if (_rangeCache.key === key) return _rangeCache;
  let min = Infinity, max = -Infinity;
  for (const f of state.geojson.features) {
    const v = numericValue(f.properties.results || {}, state.variable);
    if (v == null || !isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min) || !isFinite(max) || min === max) { min = 0; max = max > 0 ? max : 1; }
  _rangeCache = { key, min, max };
  return _rangeCache;
}

function sequentialColor(v, min, max) {
  const t = (v - min) / (max - min);
  return lerpColor(SEQ_FROM, SEQ_TO, Math.max(0, Math.min(1, t)));
}

function lerpColor(aHex, bHex, t) {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function renderLegend() {
  const el = document.getElementById("legend");
  el.innerHTML = "";
  if (state.variable === "winner") {
    const wonCounts = new Map();
    for (const f of state.geojson.features) {
      const w = f.properties.results?.winner;
      if (w == null) continue;
      const key = String(w);
      wonCounts.set(key, (wonCounts.get(key) || 0) + 1);
    }
    const winners = [...wonCounts.entries()].sort((a, b) => b[1] - a[1]);
    let otherCount = 0;
    for (const [pno, count] of winners) {
      const color = state.partyColors[pno];
      if (!color || color === OTHER_COLOR) {
        otherCount += count;
        continue;
      }
      const row = document.createElement("div");
      row.className = "legend-row";
      row.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span>${shortPartyName(state.parties[pno] || pno)} <span style="color:#888">(${count})</span></span>`;
      el.appendChild(row);
    }
    if (otherCount > 0) {
      const row = document.createElement("div");
      row.className = "legend-row";
      row.innerHTML = `<span class="legend-swatch" style="background:${OTHER_COLOR}"></span><span>Other <span style="color:#888">(${otherCount})</span></span>`;
      el.appendChild(row);
    }
    return;
  }
  const { min, max } = numericRange();
  const gradient = document.createElement("div");
  gradient.className = "legend-gradient";
  gradient.style.setProperty("--grad-from", SEQ_FROM);
  gradient.style.setProperty("--grad-to", SEQ_TO);
  el.appendChild(gradient);
  const scale = document.createElement("div");
  scale.className = "legend-scale";
  scale.innerHTML = `<span>${formatValue(min, state.variable)}</span><span>${formatValue(max, state.variable)}</span>`;
  el.appendChild(scale);
}

function showDetail(feature) {
  const props = feature.properties;
  const r = props.results || {};
  document.getElementById("detail-title").textContent = `Precinct ${props.id}`;
  document.getElementById("detail-address").textContent = props.address || "";

  const dl = document.getElementById("detail-summary");
  dl.innerHTML = "";
  const rows = [
    ["Eligible voters", fmtInt(r.eligible)],
    ["Voted", `${fmtInt(r.voted)} (${fmtPct(r.turnout)})`],
    ["Valid votes", `${fmtInt(r.valid)} (${fmtPct(r.voted ? r.valid / r.voted : 0)})`],
    ["Invalid ballots", `${fmtInt(r.invalid)} (${fmtPct(r.invalid_share)})`],
    ['"No one"', `${fmtInt(r.no_one)} (${fmtPct(r.no_one_share)})`],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    dl.appendChild(dt); dl.appendChild(dd);
  }

  const tbl = document.getElementById("detail-parties");
  tbl.innerHTML = "";
  const entries = Object.entries(r.parties || {})
    .map(([pno, v]) => [pno, v])
    .sort((a, b) => b[1] - a[1]);
  const valid = r.valid || 0;
  for (const [pno, votes] of entries) {
    if (!votes) continue;
    const tr = document.createElement("tr");
    const color = state.partyColors[pno] || OTHER_COLOR;
    tr.innerHTML =
      `<td><span class="party-swatch" style="background:${color}"></span></td>` +
      `<td>${escapeHtml(state.parties[pno] || pno)}</td>` +
      `<td>${fmtInt(votes)}</td>` +
      `<td>${fmtPct(valid ? votes / valid : 0)}</td>`;
    tbl.appendChild(tr);
  }

  document.getElementById("detail").classList.remove("hidden");
}

function closeDetail() {
  document.getElementById("detail").classList.add("hidden");
  if (state.selectedLayer && state.layer) {
    state.layer.resetStyle(state.selectedLayer);
    state.selectedLayer = null;
  }
}

document.getElementById("detail-close").addEventListener("click", closeDetail);

function shortPartyName(name) {
  if (!name) return "";
  const s = String(name).replace(/^(ПП|КП|ИК|БСП)\s+/u, "");
  return s.length > 34 ? s.slice(0, 32) + "…" : s;
}

function fmtInt(n) {
  if (n == null || !isFinite(n)) return "—";
  return Math.round(n).toLocaleString("bg-BG");
}

function fmtPct(x) {
  if (x == null || !isFinite(x)) return "—";
  return (x * 100).toFixed(1) + "%";
}

function formatValue(v, variable) {
  if (variable === "turnout" || variable === "invalid_share" || variable === "no_one_share" || variable.startsWith("party:")) {
    return fmtPct(v);
  }
  return fmtInt(v);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
  return r.json();
}
