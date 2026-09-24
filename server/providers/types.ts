export interface StructuredRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface StructuredResponse {
  data: unknown;
  model: string;
  notes: string[];
}

export interface ModelProvider {
  readonly name: string;
  readonly model: string;
  generateStructured(req: StructuredRequest): Promise<StructuredResponse>;
}

export class ProviderError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean,
    public status = 502,
  ) {
    super(message);
  }
}
