'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage, readNdjson } from '@/lib/client/stream';
import { saveAudio } from '@/lib/client/audioStore';
import { clock } from '@/lib/format';
import type { Progress } from '@/lib/pipeline';

type Phase = 'idle' | 'recording' | 'ready' | 'processing';
const MAX_SECONDS = 30 * 60;
const STAGES: { key: Progress['stage']; label: string }[] = [
  { key: 'transcribing', label: 'Transcribing the audio' },
  { key: 'indexing', label: 'Indexing for search' },
  { key: 'summarizing', label: 'Writing the notes' },
];

function pickMime(): string {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) if (MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

export default function RecordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState('recording.webm');
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<Progress['stage'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stopRef = useRef<() => void>(() => undefined);
  const started = useRef(0);

  useEffect(() => () => stopRef.current(), []);

  const start = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError('Microphone access was blocked. Allow it in your browser’s site settings, or upload a recording instead.');
      return;
    }
    const mime = pickMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined);
    const parts: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
    recorder.onstop = () => {
      const type = (recorder.mimeType || mime || 'audio/webm').split(';')[0]!;
      setAudio(new Blob(parts, { type }));
      setFileName(`recording.${type.includes('mp4') ? 'm4a' : type.split('/')[1]}`);
      setPhase('ready');
    };

    // Live waveform, drawn like a pen moving across the ruled page.
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const history: number[] = [];
    let raf = 0;
    const draw = () => {
      const c = canvas.current;
      if (c) {
        const g = c.getContext('2d')!;
        const w = (c.width = c.clientWidth * devicePixelRatio);
        const h = (c.height = c.clientHeight * devicePixelRatio);
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        history.push(peak);
        const bar = 3 * devicePixelRatio;
        const max = Math.floor(w / (bar * 2));
        if (history.length > max) history.splice(0, history.length - max);
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#1d2a22';
        history.forEach((p, i) => {
          const bh = Math.max(bar, p * h * 0.9);
          g.fillRect(i * bar * 2, (h - bh) / 2, bar, bh);
        });
        g.fillStyle = '#c2453d';
        g.fillRect(history.length * bar * 2, 0, 2 * devicePixelRatio, h);
        setSeconds((Date.now() - started.current) / 1000);
        if ((Date.now() - started.current) / 1000 > MAX_SECONDS) stopRef.current();
      }
      raf = requestAnimationFrame(draw);
    };

    stopRef.current = () => {
      cancelAnimationFrame(raf);
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => undefined);
      stopRef.current = () => undefined;
    };
    started.current = Date.now();
    recorder.start(1000);
    setPhase('recording');
    draw();
  }, []);

  function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setAudio(file);
    setFileName(file.name);
    setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    setSeconds(0);
    setPhase('ready');
  }

  async function process() {
    if (!audio) return;
    setPhase('processing');
    setStage('transcribing');
    setError(null);
    const form = new FormData();
    form.append('audio', audio, fileName);
    form.append('title', title);
    form.append('source', seconds > 0 ? 'recording' : 'upload');
    const res = await fetch('/api/meetings', { method: 'POST', body: form });
    if (!res.ok) {
      setError(await errorMessage(res));
      setPhase('ready');
      return;
    }
    for await (const p of readNdjson<Progress>(res)) {
      if (p.stage === 'done') {
        await saveAudio(p.meetingId, audio);
        router.push(`/m/${p.meetingId}`);
        return;
      }
      if (p.stage === 'error') {
        setError(p.message);
        setPhase('ready');
        return;
      }
      setStage(p.stage);
    }
  }

  const stageIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <section className="recorder">
      <h1>{phase === 'processing' ? 'Making your notes' : phase === 'recording' ? 'Listening…' : 'Record a meeting'}</h1>
      {phase === 'idle' && (
        <p className="lede">
          Put your device in the middle of the table and press record. When you stop, you&apos;ll get a transcript and notes, usually within a minute.
        </p>
      )}

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {(phase === 'idle' || phase === 'recording') && (
        <div className="pad" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
            <button
              className={`mic${phase === 'recording' ? ' live' : ''}`}
              onClick={phase === 'recording' ? () => stopRef.current() : start}
              aria-label={phase === 'recording' ? 'Stop recording' : 'Start recording'}
            >
              {phase === 'recording' ? 'Stop' : 'Record'}
            </button>
            <span className="clock mono" aria-live="off">
              {clock(seconds)}
            </span>
          </div>
          <canvas ref={canvas} className="wave" aria-hidden="true" />
        </div>
      )}

      {phase === 'idle' && (
        <label
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pickFile(e.dataTransfer.files[0]);
          }}
        >
          Or drop an existing recording here (mp3, m4a, wav, webm; up to 25 MB), or <u>choose a file</u>.
          <input type="file" accept="audio/*,video/webm,video/mp4" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
        </label>
      )}

      {phase === 'ready' && audio && (
        <div style={{ display: 'grid', gap: 14, width: '100%', maxWidth: 560 }}>
          <audio controls src={URL.createObjectURL(audio)} />
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Title (optional)</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leave empty and we’ll name it from the conversation" maxLength={120} />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn primary" onClick={process}>
              Make notes
            </button>
            <button
              className="btn quiet"
              onClick={() => {
                setAudio(null);
                setPhase('idle');
                setSeconds(0);
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {phase === 'processing' && (
        <ol className="stages pad" style={{ maxWidth: 560 }} aria-live="polite">
          {STAGES.map((s, i) => (
            <li key={s.key} data-state={i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'waiting'}>
              <span>{s.label}</span>
              <span className="mono">{i < stageIndex ? 'done' : i === stageIndex ? '…' : ''}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
