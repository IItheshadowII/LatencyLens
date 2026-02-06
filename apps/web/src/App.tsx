import { useMemo, useState, type ChangeEvent } from "react";

const DEFAULT_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const DEFAULT_UPLOAD_BYTES = 3 * 1024 * 1024;
const PING_COUNT = 30;
const PING_TIMEOUT_MS = 2000;

type PingStats = {
  samples: number[];
  timeouts: number;
  avg: number | null;
  median: number | null;
  p95: number | null;
  jitter: number | null;
  loss: number;
};

type ThroughputStats = {
  bytes: number;
  seconds: number;
  mbps: number | null;
};

type TestResult = {
  cloud: string;
  timestamp: string;
  userAgent: string;
  screen: string;
  ip?: string;
  ping: PingStats;
  download: ThroughputStats;
  upload: ThroughputStats;
  classification: "VERDE" | "AMARILLO" | "ROJO";
};

const apiBase = import.meta.env.VITE_API_BASE || "";

const classifyResult = (ping: PingStats, download: ThroughputStats, upload: ThroughputStats) => {
  const avg = ping.avg ?? Infinity;
  const jitter = ping.jitter ?? Infinity;
  const loss = ping.loss;
  const down = download.mbps ?? 0;
  const up = upload.mbps ?? 0;

  if (avg < 80 && jitter < 15 && loss === 0 && down >= 10 && up >= 2) {
    return "VERDE";
  }

  if (avg > 150 || jitter > 30 || loss > 0.05 || down < 5 || up < 1) {
    return "ROJO";
  }

  return "AMARILLO";
};

const formatNumber = (value?: number | null, decimals = 1) =>
  value === null || value === undefined ? "-" : value.toFixed(decimals);

const calculateStats = (samples: number[], timeouts: number): PingStats => {
  if (samples.length === 0) {
    return {
      samples,
      timeouts,
      avg: null,
      median: null,
      p95: null,
      jitter: null,
      loss: timeouts / PING_COUNT
    };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const p95 = sorted[p95Index] ?? sorted[sorted.length - 1];
  const jitterValues = samples.slice(1).map((value, idx) => Math.abs(value - samples[idx]));
  const jitter = jitterValues.length
    ? jitterValues.reduce((sum, value) => sum + value, 0) / jitterValues.length
    : 0;

  return {
    samples,
    timeouts,
    avg,
    median,
    p95,
    jitter,
    loss: timeouts / PING_COUNT
  };
};

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeCloudUrl = (raw: string) => {
  if (!raw) return { normalized: "", error: "Ingresá una URL" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch (error) {
    return { normalized: "", error: "La URL no es válida" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { normalized: "", error: "La URL debe comenzar con http o https" };
  }

  const normalized = url.origin;
  if (url.pathname !== "/" || url.search || url.hash) {
    return { normalized, error: "La URL no debe incluir path. Se usará solo el origen." };
  }

  return { normalized, error: "" };
};

const bytesToMb = (bytes: number) => bytes / 1024 / 1024;

const App = () => {
  const [cloudInput, setCloudInput] = useState("");
  const [normalizedCloud, setNormalizedCloud] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<TestResult | null>(null);

  const updateLogs = (message: string) =>
    setLogs((prev: string[]) => [...prev, `${new Date().toLocaleTimeString()} - ${message}`]);

  const validateCloud = () => {
    const { normalized, error } = normalizeCloudUrl(cloudInput.trim());
    setNormalizedCloud(normalized);
    setValidationMessage(error);
    return { normalized, error };
  };

  const runPingTest = async (cloud: string) => {
    const samples: number[] = [];
    let timeouts = 0;

    for (let i = 0; i < PING_COUNT; i += 1) {
      const url = `${cloud}/connection-probe/download.ashx?bytes=1&t=${Date.now()}-${i}`;
      const start = performance.now();
      try {
        const response = await fetchWithTimeout(url, {}, PING_TIMEOUT_MS);
        if (!response.ok) throw new Error("Ping failed");
        await response.arrayBuffer();
        const end = performance.now();
        samples.push(end - start);
      } catch (error) {
        timeouts += 1;
      }
      setProgress(Math.round(((i + 1) / PING_COUNT) * 40));
    }

    return calculateStats(samples, timeouts);
  };

  const runDownloadTest = async (cloud: string, bytes: number): Promise<ThroughputStats> => {
    const url = `${cloud}/connection-probe/download.ashx?bytes=${bytes}&t=${Date.now()}`;
    const start = performance.now();
    const response = await fetchWithTimeout(url, {}, 15000);
    if (!response.ok) throw new Error("Download failed");
    await response.arrayBuffer();
    const seconds = (performance.now() - start) / 1000;
    return {
      bytes,
      seconds,
      mbps: seconds > 0 ? (bytes * 8) / seconds / 1024 / 1024 : null
    };
  };

  const runUploadTest = async (cloud: string, bytes: number): Promise<ThroughputStats> => {
    const buffer = new Uint8Array(bytes);
    const start = performance.now();
    const response = await fetchWithTimeout(
      `${cloud}/connection-probe/upload.ashx?t=${Date.now()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream"
        },
        body: buffer
      },
      15000
    );
    if (!response.ok) throw new Error("Upload failed");
    await response.json();
    const seconds = (performance.now() - start) / 1000;
    return {
      bytes,
      seconds,
      mbps: seconds > 0 ? (bytes * 8) / seconds / 1024 / 1024 : null
    };
  };

  const handleRunTest = async () => {
    if (running) return;
    const { normalized, error } = validateCloud();
    if (!normalized) return;

    setRunning(true);
    setWarning(null);
    setLogs([]);
    setResult(null);
    setProgress(0);

    if (error) {
      updateLogs(`Normalizando URL a ${normalized}`);
    }

    updateLogs("Verificando endpoint /connection-probe/download.ashx?bytes=1");
    try {
      const response = await fetchWithTimeout(
        `${normalized}/connection-probe/download.ashx?bytes=1&t=${Date.now()}`,
        {},
        PING_TIMEOUT_MS
      );
      if (!response.ok) {
        throw new Error("Probe no responde");
      }
    } catch (error) {
      setWarning("El Cloud no respondió al probe. El test puede ser incompleto.");
      updateLogs("Advertencia: el Cloud no respondió al probe inicial.");
    }

    updateLogs("Iniciando pruebas de latencia y jitter...");
    let pingStats: PingStats;
    try {
      pingStats = await runPingTest(normalized);
    } catch (error) {
      pingStats = calculateStats([], PING_COUNT);
      updateLogs("Error al medir latencia.");
    }

    setProgress(45);
    updateLogs("Iniciando prueba de descarga...");
    let downloadStats: ThroughputStats;
    try {
      downloadStats = await runDownloadTest(normalized, DEFAULT_DOWNLOAD_BYTES);
    } catch (error) {
      downloadStats = { bytes: DEFAULT_DOWNLOAD_BYTES, seconds: 0, mbps: null };
      updateLogs("Error al medir descarga.");
    }

    setProgress(75);
    updateLogs("Iniciando prueba de carga...");
    let uploadStats: ThroughputStats;
    try {
      uploadStats = await runUploadTest(normalized, DEFAULT_UPLOAD_BYTES);
    } catch (error) {
      uploadStats = { bytes: DEFAULT_UPLOAD_BYTES, seconds: 0, mbps: null };
      updateLogs("Error al medir carga.");
    }

    setProgress(100);

    const ip = apiBase
      ? await fetch(`${apiBase}/api/ip`).then((res) => res.json()).then((data) => data.ip).catch(() => undefined)
      : undefined;

    const newResult: TestResult = {
      cloud: normalized,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      ip,
      ping: pingStats,
      download: downloadStats,
      upload: uploadStats,
      classification: classifyResult(pingStats, downloadStats, uploadStats)
    };

    setResult(newResult);

    if (apiBase) {
      updateLogs("Enviando resultados al backend...");
      fetch(`${apiBase}/api/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newResult)
      }).catch(() => updateLogs("No se pudo enviar al backend."));
    }

    setRunning(false);
  };

  const resultJson = useMemo(() => (result ? JSON.stringify(result, null, 2) : ""), [result]);

  const handleCopy = async () => {
    if (!resultJson) return;
    await navigator.clipboard.writeText(resultJson);
  };

  const handleDownloadJson = () => {
    if (!resultJson) return;
    const blob = new Blob([resultJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `praxis-connection-test-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Praxis Connection Test</h1>
          <p>Medí la conexión real entre el navegador y tu Cloud de Praxis.</p>
        </div>
        <div className={`status-pill ${result?.classification?.toLowerCase() || ""}`}>
          {result ? result.classification : "Listo"}
        </div>
      </header>

      <section className="card">
        <label className="label" htmlFor="cloud">
          URL del Cloud
        </label>
        <div className="input-row">
          <input
            id="cloud"
            type="url"
            placeholder="https://cloud123.praxisclouds.com"
            value={cloudInput}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setCloudInput(event.target.value)}
            onBlur={validateCloud}
          />
          <button className="primary" onClick={handleRunTest} disabled={running}>
            {running ? "Corriendo..." : "Run test"}
          </button>
        </div>
        {validationMessage && <p className="helper warning">{validationMessage}</p>}
        {warning && <p className="helper warning">{warning}</p>}
        {normalizedCloud && (
          <p className="helper">URL normalizada: {normalizedCloud}</p>
        )}
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Latencia & jitter</h2>
          <div className="metrics">
            <div>
              <span className="metric-label">RTT avg</span>
              <span className="metric-value">{formatNumber(result?.ping.avg)} ms</span>
            </div>
            <div>
              <span className="metric-label">RTT p95</span>
              <span className="metric-value">{formatNumber(result?.ping.p95)} ms</span>
            </div>
            <div>
              <span className="metric-label">Jitter</span>
              <span className="metric-value">{formatNumber(result?.ping.jitter)} ms</span>
            </div>
            <div>
              <span className="metric-label">Timeouts</span>
              <span className="metric-value">{result?.ping.timeouts ?? 0}</span>
            </div>
            <div>
              <span className="metric-label">Loss</span>
              <span className="metric-value">
                {result ? `${(result.ping.loss * 100).toFixed(1)}%` : "-"}
              </span>
            </div>
          </div>
        </div>
        <div className="card">
          <h2>Throughput</h2>
          <div className="metrics">
            <div>
              <span className="metric-label">Download</span>
              <span className="metric-value">{formatNumber(result?.download.mbps)} Mbps</span>
              <span className="metric-sub">{bytesToMb(DEFAULT_DOWNLOAD_BYTES)} MB</span>
            </div>
            <div>
              <span className="metric-label">Upload</span>
              <span className="metric-value">{formatNumber(result?.upload.mbps)} Mbps</span>
              <span className="metric-sub">{bytesToMb(DEFAULT_UPLOAD_BYTES)} MB</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Diagnóstico</h2>
        <div className="diag-grid">
          <div>
            <span className="metric-label">Cloud</span>
            <span className="metric-value">{result?.cloud ?? "-"}</span>
          </div>
          <div>
            <span className="metric-label">Timestamp</span>
            <span className="metric-value">{result?.timestamp ?? "-"}</span>
          </div>
          <div>
            <span className="metric-label">Navegador</span>
            <span className="metric-value">{result?.userAgent ?? "-"}</span>
          </div>
          <div>
            <span className="metric-label">Resolución</span>
            <span className="metric-value">{result?.screen ?? "-"}</span>
          </div>
          <div>
            <span className="metric-label">IP (server)</span>
            <span className="metric-value">{result?.ip ?? "-"}</span>
          </div>
        </div>
        <div className="button-row">
          <button onClick={handleCopy} disabled={!result}>Copiar diagnóstico</button>
          <button onClick={handleDownloadJson} disabled={!result}>Descargar JSON</button>
        </div>
      </section>

      <section className="card">
        <h2>Logs</h2>
        <div className="logs">
          {logs.length === 0 ? <span>Sin logs todavía.</span> : logs.map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <span>Todo el test se ejecuta desde el navegador. El backend solo recibe resultados.</span>
      </footer>
    </div>
  );
};

export default App;
