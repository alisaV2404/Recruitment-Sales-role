// Local persistence (this browser only). Demo sessions are saved automatically; user documents
// only after the explicit "Save on this device" action.

import type { Session } from './model.js';

const INDEX_KEY = 'secondlook:index:v1';
const SESSION_KEY = (id: string) => `secondlook:session:v1:${id}`;

export interface SavedEntry {
  id: string;
  title: string;
  kind: 'demo' | 'user';
  updatedAt: string;
  questions: number;
}

export function listSaved(): SavedEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as SavedEntry[]) : [];
    return Array.isArray(list) ? list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: SavedEntry[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

export function persist(s: Session): string | null {
  if (s.kind !== 'demo' && !s.savedOnDevice) return null;
  try {
    localStorage.setItem(SESSION_KEY(s.id), JSON.stringify(s));
    const list = listSaved().filter((e) => e.id !== s.id);
    list.push({ id: s.id, title: s.title, kind: s.kind, updatedAt: s.updatedAt, questions: s.analysis?.questions.length ?? 0 });
    writeIndex(list);
    return null;
  } catch (err) {
    return `Could not save on this device: ${(err as Error).message}`;
  }
}

export function loadSaved(id: string): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY(id));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function removeSaved(id: string) {
  try {
    localStorage.removeItem(SESSION_KEY(id));
    writeIndex(listSaved().filter((e) => e.id !== id));
  } catch {
    /* storage unavailable */
  }
}
