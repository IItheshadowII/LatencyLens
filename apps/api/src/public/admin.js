const table = document.getElementById("results");
const refreshBtn = document.getElementById("refresh");
const cloudInput = document.getElementById("cloud");

const fmt = (v) => (v === null || v === undefined ? "-" : Number(v).toFixed(1));

const renderRows = (rows) => {
  if (!table) return;
  table.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const classification = row.classification || "-";
    const pillClass = (classification || "").toLowerCase();
    const pingAvg = row.ping && typeof row.ping.avg === 'number' ? fmt(row.ping.avg) + ' ms' : '-';
    const pingJitter = row.ping && typeof row.ping.jitter === 'number' ? fmt(row.ping.jitter) + ' ms' : '-';
    const down = row.download && typeof row.download.mbps === 'number' ? fmt(row.download.mbps) + ' Mbps' : '-';
    const up = row.upload && typeof row.upload.mbps === 'number' ? fmt(row.upload.mbps) + ' Mbps' : '-';
    const ts = new Date(row.createdAt || row.timestamp || Date.now()).toLocaleString();

    tr.innerHTML = `
      <td>${row.cloud || '-'}</td>
      <td><span class="pill ${pillClass}">${classification}</span></td>
      <td>${pingAvg}</td>
      <td>${pingJitter}</td>
      <td>${down}</td>
      <td>${up}</td>
      <td>${ts}</td>
    `;
    table.appendChild(tr);
  });
};

const loadResults = async () => {
  if (!refreshBtn) return;
  refreshBtn.disabled = true;
  try {
    const cloud = cloudInput ? cloudInput.value.trim() : '';
    const params = new URLSearchParams();
    if (cloud) params.set("cloud", cloud);
    const response = await fetch(`/api/results?${params.toString()}`);
    if (!response.ok) throw new Error('Fetch failed: ' + response.status);
    const data = await response.json();
    renderRows(data.data || []);
  } catch (err) {
    console.error('Error loading results', err);
    if (table) {
      table.innerHTML = '<tr><td colspan="7">Error cargando resultados</td></tr>';
    }
  } finally {
    refreshBtn.disabled = false;
  }
};

if (refreshBtn) refreshBtn.addEventListener("click", loadResults);
if (cloudInput) cloudInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadResults();
});

// initial load
loadResults();
