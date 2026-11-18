'use client';

import { useEffect, useRef, useState } from 'react';
import {backendApi} from '../services/backendApi'
import '../styles/new-subject.css';

type UploadState = 'idle' | 'uploading' | 'uploaded' | 'error';
type EmbedState = 'idle' | 'running' | 'done' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called once embedding finishes so the parent can refresh and select the subject. */
  onCreated: (subject: string) => void;
}

const INVALID_NAME = /[\\/:*?"<>|]/;

export default function NewSubjectModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [embedState, setEmbedState] = useState<EmbedState>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();
  const nameError =
    trimmed && (INVALID_NAME.test(trimmed) || trimmed === '.' || trimmed === '..' || trimmed.toLowerCase() === 'root')
      ? 'Name contains invalid characters or is reserved'
      : null;

  const locked = uploadState === 'uploading' || embedState === 'running';

  function closeStream() {
    esRef.current?.close();
    esRef.current = null;
  }

  function reset() {
    closeStream();
    setName('');
    setFiles([]);
    setUploadState('idle');
    setEmbedState('idle');
    setLogs([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Close the stream on unmount
  useEffect(() => closeStream, []);

  // Keep the log scrolled to the newest message
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [logs]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !locked) handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locked]);

  if (!open) return null;

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles(picked);
    // Changing files invalidates a previous upload
    setUploadState('idle');
    setEmbedState('idle');
    setLogs([]);
    setError(null);
  }

  async function handleUpload() {
    if (!trimmed || nameError || files.length === 0) return;
    setUploadState('uploading');
    setError(null);

    const form = new FormData();
    files.forEach((f) => form.append('files', f));

    try {
      // `subject` is a plain function arg in FastAPI -> query param.
      // Don't set Content-Type manually; the browser adds the multipart boundary.
      const res = await backendApi.post('/uploadFiles', form, { params: { subject: trimmed } });
      // The backend returns 200 even on failure, so check the status text.
      if (res.data?.status === 'File(s) uploaded') {
        setUploadState('uploaded');
      } else {
        setUploadState('error');
        setError(res.data?.status ?? 'Upload failed');
      }
    } catch (err) {
      console.error(err);
      setUploadState('error');
      setError('Upload failed. Check your connection and try again.');
    }
  }

  function handleEmbed() {
    if (uploadState !== 'uploaded') return;
    closeStream();
    setEmbedState('running');
    setLogs([]);
    setError(null);

    const base = (backendApi.defaults.baseURL ?? '').replace(/\/$/, '');
    const es = new EventSource(`${base}/embed?subject=${encodeURIComponent(trimmed)}`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent) => {
      const msg = String(e.data ?? '').trim();
      if (!msg) return;

      // The server re-sends the same message every 0.5s as a heartbeat; skip repeats.
      setLogs((prev) => (prev[prev.length - 1] === msg ? prev : [...prev, msg]));

      if (msg === 'Completed the Process') {
        // Close explicitly, otherwise EventSource auto-reconnects and re-runs /embed.
        closeStream();
        setEmbedState('done');
        onCreated(trimmed);
      }
    };

    es.onerror = () => {
      // Fires on a dropped connection; EventSource would retry and restart the job.
      if (esRef.current === es) {
        closeStream();
        setEmbedState((s) => (s === 'done' ? s : 'error'));
        setError('Connection lost while embedding.');
      }
    };
  }

  function handleCancelEmbed() {
    closeStream();
    setEmbedState('idle');
    setLogs((prev) => [...prev, 'Stopped']);
  }

  return (
    <div className="ns-overlay" onMouseDown={(e) => e.target === e.currentTarget && !locked && handleClose()}>
      <div className="ns-modal" role="dialog" aria-modal="true" aria-labelledby="ns-title">
        <div className="ns-header">
          <h2 id="ns-title" className="ns-title">New subject</h2>
          <button className="ns-close" onClick={handleClose} disabled={locked} aria-label="Close">×</button>
        </div>

        <div className="ns-body">
          <label className="ns-field">
            <span className="ns-label">Subject name</span>
            <input
              className="ns-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setUploadState('idle');
                setEmbedState('idle');
              }}
              placeholder="e.g. Operating Systems"
              disabled={locked}
              autoFocus
            />
            {nameError && <span className="ns-error">{nameError}</span>}
          </label>

          <div className="ns-field">
            <span className="ns-label">Files</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,application/pdf"
              onChange={onPickFiles}
              disabled={locked}
              className="ns-file"
            />
            {files.length > 0 && (
              <ul className="ns-filelist">
                {files.map((f) => (
                  <li key={f.name + f.size}>{f.name}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="ns-actions">
            <button
              className="ns-btn"
              onClick={handleUpload}
              disabled={!trimmed || !!nameError || files.length === 0 || locked || uploadState === 'uploaded'}
            >
              {uploadState === 'uploading' ? 'Uploading…' : uploadState === 'uploaded' ? 'Uploaded ✓' : 'Upload files'}
            </button>

            {embedState === 'running' ? (
              <button className="ns-btn ns-btn--ghost" onClick={handleCancelEmbed}>Stop</button>
            ) : (
              <button
                className="ns-btn ns-btn--primary"
                onClick={handleEmbed}
                disabled={uploadState !== 'uploaded' || embedState === 'done'}
              >
                {embedState === 'done' ? 'Embedded ✓' : embedState === 'error' ? 'Retry embedding' : 'Start embedding'}
              </button>
            )}
          </div>

          {error && <p className="ns-error" role="alert">{error}</p>}

          {(logs.length > 0 || embedState === 'running') && (
            <div className="ns-log" aria-live="polite">
              {logs.map((l, i) => {
                const isLast = i === logs.length - 1;
                const running = embedState === 'running' && isLast;
                return (
                  <div key={i} className={`ns-log__line ${running ? 'is-running' : 'is-done'}`}>
                    <span className="ns-log__icon">{running ? <span className="ns-spinner" /> : '✓'}</span>
                    {l}
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        {embedState === 'done' && (
          <div className="ns-footer">
            <button className="ns-btn ns-btn--primary" onClick={handleClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
