/**
 * Recordings never leave this browser except to be transcribed: the server keeps
 * only the transcript. The audio itself is kept here, in IndexedDB, for playback.
 */
const DB = 'voicebrief';
const STORE = 'audio';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const saveAudio = (meetingId: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, meetingId)).catch(() => undefined);
export const loadAudio = (meetingId: string) => tx<Blob | undefined>('readonly', (s) => s.get(meetingId)).catch(() => undefined);
export const deleteAudio = (meetingId: string) => tx('readwrite', (s) => s.delete(meetingId)).catch(() => undefined);
