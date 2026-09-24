import type {
  AnalyzeAnswerRequest,
  AnalyzeAnswerResponse,
  AnalyzeRequest,
  AnalyzeResponse,
  ApiError,
  StatusResponse,
} from '../shared/types.js';
import { validateAnalysis, validateAnswerAnalysis } from '../shared/validate.js';

export interface ClientError {
  code: string;
  message: string;
  retryable: boolean;
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw { code: 'aborted', message: 'Request cancelled.', retryable: true } satisfies ClientError;
    throw { code: 'network', message: 'Could not reach the Second Look server.', retryable: true } satisfies ClientError;
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw { code: 'bad_response', message: `Server returned HTTP ${res.status} without a readable body.`, retryable: true } satisfies ClientError;
  }
  if (!res.ok) {
    const e = (data as ApiError).error;
    throw { code: e?.code ?? 'error', message: e?.message ?? `HTTP ${res.status}`, retryable: e?.retryable ?? false } satisfies ClientError;
  }
  return data as T;
}

export async function fetchStatus(): Promise<StatusResponse> {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as StatusResponse;
  } catch {
    return { live: false, provider: null, model: null, reason: 'The Second Look server could not be reached.' };
  }
}

export async function analyzeReport(req: AnalyzeRequest, signal?: AbortSignal): Promise<AnalyzeResponse> {
  const out = await post<AnalyzeResponse>('/api/analyze', req, signal);
  // Re-validate on the client: never trust the shape blindly.
  out.result = validateAnalysis(out.result);
  return out;
}

export async function analyzeAnswer(req: AnalyzeAnswerRequest, signal?: AbortSignal): Promise<AnalyzeAnswerResponse> {
  const out = await post<AnalyzeAnswerResponse>('/api/analyze-answer', req, signal);
  out.result = validateAnswerAnalysis(out.result);
  return out;
}
