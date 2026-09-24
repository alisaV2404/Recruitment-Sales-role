// Anthropic Messages API adapter (raw HTTPS + server-sent events).
// The API key is read from the server environment only and never reaches the browser.

import { ModelProvider, ProviderError, StructuredRequest, StructuredResponse } from './types.js';

const API_VERSION = '2023-06-01';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

interface Options {
  apiKey: string;
  baseUrl: string;
  model: string;
  useFallbacks: boolean;
  timeoutMs: number;
}

export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';
  readonly model: string;

  constructor(private opts: Options) {
    this.model = opts.model;
  }

  async generateStructured(req: StructuredRequest): Promise<StructuredResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: req.maxTokens,
      stream: true,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: req.schema } },
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    };
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': this.opts.apiKey,
      'anthropic-version': API_VERSION,
    };
    if (this.opts.useFallbacks) {
      body.fallbacks = 'default';
      headers['anthropic-beta'] = FALLBACK_BETA;
    }

    const timeout = AbortSignal.timeout(this.opts.timeoutMs);
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetch(`${this.opts.baseUrl.replace(/\/$/, '')}/v1/messages`, { method: 'POST', headers, body: JSON.stringify(body), signal });
    } catch (err) {
      if (timeout.aborted) throw new ProviderError('timeout', 'The model did not respond in time.', true, 504);
      throw new ProviderError('network', `Could not reach the model provider: ${(err as Error).message}`, true);
    }

    if (!res.ok) {
      let detail = '';
      try {
        const j = (await res.json()) as { error?: { type?: string; message?: string } };
        detail = j.error?.message ?? '';
      } catch {
        /* ignore */
      }
      const retryable = res.status === 429 || res.status >= 500;
      const code = res.status === 401 ? 'auth' : res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'provider_unavailable' : 'bad_request';
      throw new ProviderError(code, `Model provider returned HTTP ${res.status}${detail ? `: ${detail}` : ''}`, retryable, res.status === 401 ? 502 : res.status >= 500 ? 502 : res.status === 429 ? 429 : 502);
    }

    return this.readStream(res, timeout);
  }

  private async readStream(res: Response, timeout: AbortSignal): Promise<StructuredResponse> {
    if (!res.body) throw new ProviderError('empty', 'Empty response from the model provider.', true);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const blockTypes = new Map<number, string>();
    let text = '';
    let model = this.model;
    let stopReason: string | null = null;
    const notes: string[] = [];

    const handle = (event: string, data: string) => {
      if (!data) return;
      let j: any;
      try {
        j = JSON.parse(data);
      } catch {
        return;
      }
      switch (j.type ?? event) {
        case 'message_start':
          if (j.message?.model) model = j.message.model;
          break;
        case 'content_block_start':
          blockTypes.set(j.index, j.content_block?.type ?? 'unknown');
          if (j.content_block?.type === 'fallback') {
            notes.push('The primary model declined and the request was completed by a fallback model.');
          }
          break;
        case 'content_block_delta':
          if (blockTypes.get(j.index) === 'text' && j.delta?.type === 'text_delta') text += j.delta.text;
          break;
        case 'message_delta':
          if (j.delta?.stop_reason) stopReason = j.delta.stop_reason;
          break;
        case 'error':
          throw new ProviderError(
            j.error?.type === 'overloaded_error' ? 'provider_unavailable' : 'stream_error',
            `Model stream error: ${j.error?.message ?? 'unknown error'}`,
            true,
          );
      }
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let event = '';
          const dataLines: string[] = [];
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          handle(event, dataLines.join('\n'));
        }
      }
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (timeout.aborted) throw new ProviderError('timeout', 'The model did not finish in time.', true, 504);
      throw new ProviderError('network', `Connection to the model was interrupted: ${(err as Error).message}`, true);
    }

    if (stopReason === 'refusal') {
      throw new ProviderError('refusal', 'The model declined to process this request.', false);
    }
    if (stopReason === 'max_tokens') {
      throw new ProviderError('incomplete', 'The model response was cut off before completion. Try again, or shorten the document.', true);
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ProviderError('invalid_json', 'The model returned output that is not valid JSON.', true);
    }
    return { data, model, notes };
  }
}
