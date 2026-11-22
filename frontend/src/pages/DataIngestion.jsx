// Data ingestion page: pick or drop a .csv/.xlsx file, preview it, then upload.
// Upload sends the original file as multipart form data to POST /api/ingest.
import { useRef, useState } from "react";
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILE_BYTES,
  getExtension,
  parseFile,
} from "../lib/parseFile.js";
import "./DataIngestion.css";

const PREVIEW_ROWS = 50;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

export default function DataIngestion({ onUploaded }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState({ state: "idle", message: "" });

  function reset() {
    setFile(null);
    setSheets([]);
    setActiveSheet(0);
    setError("");
    setUpload({ state: "idle", message: "" });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(selected) {
    if (!selected) return;
    reset();

    if (!ACCEPTED_EXTENSIONS.includes(getExtension(selected.name))) {
      setError(`"${selected.name}" is not supported. Please choose a .csv or .xlsx file.`);
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setError(`File is ${formatBytes(selected.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }

    setFile(selected);
    setParsing(true);
    try {
      setSheets(await parseFile(selected));
    } catch (err) {
      setError(`Could not read the file: ${err?.message || err}`);
      setFile(null);
    } finally {
      setParsing(false);
    }
  }

  async function handleUpload() {
    setUpload({ state: "uploading", message: "" });
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/ingest", { method: "POST", body });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `Server responded with ${res.status}`);
      }
      const result = await res.json();
      setUpload({ state: "done", message: `${file.name} uploaded: ${result.rows.toLocaleString()} rows.` });
      onUploaded?.(result);
    } catch (err) {
      setUpload({ state: "error", message: `Upload failed: ${err.message}` });
    }
  }

  function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files[0]);
  }

  const sheet = sheets[activeSheet];
  const [header = [], ...body] = sheet?.rows ?? [];
  const columnCount = Math.max(header.length, ...body.map((r) => r.length), 0);
  const columns = Array.from({ length: columnCount }, (_, i) => header[i]);

  return (
    <main className="ingest">
      <header className="ingest__header">
        <h1>Data ingestion</h1>
        <p>Upload a CSV or Excel (.xlsx) file. You can check the preview before uploading.</p>
      </header>

      {!file && (
        <label
          className={`dropzone${dragging ? " dropzone--active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => handleFile(e.target.files[0])}
            hidden
          />
          <svg className="dropzone__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          <span className="dropzone__title">Drag and drop a file here</span>
          <span className="dropzone__hint">
            or <span className="dropzone__link">browse</span> · .csv or .xlsx, up to{" "}
            {formatBytes(MAX_FILE_BYTES)}
          </span>
        </label>
      )}

      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      {file && (
        <section className="card">
          <div className="file">
            <div className="file__badge">{getExtension(file.name).slice(1).toUpperCase()}</div>
            <div className="file__meta">
              <strong className="file__name">{file.name}</strong>
              <span className="file__details">
                {formatBytes(file.size)}
                {sheet && ` · ${body.length.toLocaleString()} rows · ${columnCount} columns`}
              </span>
            </div>
            <div className="file__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={reset}
                disabled={upload.state === "uploading"}
              >
                Remove
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleUpload}
                disabled={parsing || !sheet || upload.state === "uploading" || upload.state === "done"}
              >
                {upload.state === "uploading" ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>

          {upload.message && (
            <div
              className={`alert ${upload.state === "done" ? "alert--success" : "alert--error"}`}
              role="status"
            >
              {upload.message}
            </div>
          )}

          {parsing && <p className="muted">Reading file…</p>}

          {sheets.length > 1 && (
            <div className="tabs" role="tablist">
              {sheets.map((s, i) => (
                <button
                  key={s.name}
                  type="button"
                  role="tab"
                  aria-selected={i === activeSheet}
                  className={`tab${i === activeSheet ? " tab--active" : ""}`}
                  onClick={() => setActiveSheet(i)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {sheet && columnCount === 0 && <p className="muted">This sheet is empty.</p>}

          {sheet && columnCount > 0 && (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="rownum">#</th>
                      {columns.map((name, i) => (
                        <th key={i}>{formatCell(name) || `Column ${i + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {body.slice(0, PREVIEW_ROWS).map((row, r) => (
                      <tr key={r}>
                        <td className="rownum">{r + 1}</td>
                        {columns.map((_, c) => (
                          <td key={c}>{formatCell(row[c])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {body.length > PREVIEW_ROWS && (
                <p className="muted">
                  Showing the first {PREVIEW_ROWS} of {body.length.toLocaleString()} rows.
                </p>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
