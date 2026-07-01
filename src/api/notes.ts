import type { NotebookEntry } from '../types'
import { apiAuthHeaders, apiBearerHeader, apiUrl, getApiConfigError, readApiError } from './http'

type NoteJson = {
  id: string
  text: string
  createdAt: string
  updatedAt: string
}

export type LoadNotesResult =
  | { ok: true; notes: NotebookEntry[] }
  | { ok: false; error: string }

export type NoteMutationResult =
  | { ok: true; note: NotebookEntry }
  | { ok: false; error: string }

export type DeleteNoteResult = { ok: true } | { ok: false; error: string }

function parseNoteJson(raw: NoteJson): NotebookEntry {
  return {
    id: raw.id,
    text: raw.text,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  }
}

export async function loadNotesAsync(): Promise<LoadNotesResult> {
  const configError = getApiConfigError()
  if (configError) {
    return { ok: false, error: configError }
  }

  try {
    const res = await fetch(apiUrl('/api/notes'), {
      headers: { Authorization: apiBearerHeader() },
    })
    if (!res.ok) {
      return {
        ok: false,
        error: await readApiError(res, `讀取筆記失敗（HTTP ${res.status}）`),
      }
    }

    const body: unknown = await res.json()
    if (
      typeof body !== 'object' ||
      body === null ||
      !Array.isArray((body as { notes?: unknown }).notes)
    ) {
      return { ok: false, error: '筆記資料格式錯誤' }
    }

    const notes = ((body as { notes: NoteJson[] }).notes ?? []).map(parseNoteJson)
    return { ok: true, notes }
  } catch {
    return { ok: false, error: '無法連線後端，請確認 exchange-api 是否在跑' }
  }
}

export async function createNoteAsync(text: string): Promise<NoteMutationResult> {
  const configError = getApiConfigError()
  if (configError) {
    return { ok: false, error: configError }
  }

  try {
    const res = await fetch(apiUrl('/api/notes'), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      return {
        ok: false,
        error: await readApiError(res, `新增筆記失敗（HTTP ${res.status}）`),
      }
    }

    const body: unknown = await res.json()
    if (typeof body !== 'object' || body === null || !('note' in body)) {
      return { ok: false, error: '筆記資料格式錯誤' }
    }

    return { ok: true, note: parseNoteJson((body as { note: NoteJson }).note) }
  } catch {
    return { ok: false, error: '無法連線後端' }
  }
}

export async function updateNoteAsync(id: string, text: string): Promise<NoteMutationResult> {
  const configError = getApiConfigError()
  if (configError) {
    return { ok: false, error: configError }
  }

  try {
    const res = await fetch(apiUrl(`/api/notes/${encodeURIComponent(id)}`), {
      method: 'PUT',
      headers: apiAuthHeaders(),
      body: JSON.stringify({ text }),
    })
    if (res.status === 404) {
      return { ok: false, error: '找不到該筆記' }
    }
    if (!res.ok) {
      return {
        ok: false,
        error: await readApiError(res, `更新筆記失敗（HTTP ${res.status}）`),
      }
    }

    const body: unknown = await res.json()
    if (typeof body !== 'object' || body === null || !('note' in body)) {
      return { ok: false, error: '筆記資料格式錯誤' }
    }

    return { ok: true, note: parseNoteJson((body as { note: NoteJson }).note) }
  } catch {
    return { ok: false, error: '無法連線後端' }
  }
}

export async function deleteNoteAsync(id: string): Promise<DeleteNoteResult> {
  const configError = getApiConfigError()
  if (configError) {
    return { ok: false, error: configError }
  }

  try {
    const res = await fetch(apiUrl(`/api/notes/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: { Authorization: apiBearerHeader() },
    })
    if (res.status === 404) {
      return { ok: false, error: '找不到該筆記' }
    }
    if (!res.ok && res.status !== 204) {
      return {
        ok: false,
        error: await readApiError(res, `刪除筆記失敗（HTTP ${res.status}）`),
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: '無法連線後端' }
  }
}
