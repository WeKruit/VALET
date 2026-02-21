import type { FastifyBaseLogger } from "fastify";
import type {
  RequestKasmParams,
  RequestKasmResponse,
  KasmStatusResponse,
  KasmSession,
  KasmImage,
} from "./types.js";

export class KasmClient {
  private kasmApiUrl: string;
  private kasmApiKey: string;
  private kasmApiKeySecret: string;
  private logger: FastifyBaseLogger;

  constructor({
    kasmApiUrl,
    kasmApiKey,
    kasmApiKeySecret,
    logger,
  }: {
    kasmApiUrl: string;
    kasmApiKey: string;
    kasmApiKeySecret: string;
    logger: FastifyBaseLogger;
  }) {
    this.kasmApiUrl = kasmApiUrl;
    this.kasmApiKey = kasmApiKey;
    this.kasmApiKeySecret = kasmApiKeySecret;
    this.logger = logger;
  }

  async requestKasm(params: RequestKasmParams): Promise<RequestKasmResponse> {
    this.logger.info({ imageId: params.image_id }, "Requesting new Kasm session");
    return this.post<RequestKasmResponse>("/request_kasm", {
      image_id: params.image_id,
      user_id: params.user_id,
      ...(params.environment ? { environment: params.environment } : {}),
    });
  }

  async getKasmStatus(kasmId: string): Promise<KasmStatusResponse> {
    return this.post<KasmStatusResponse>("/get_kasm", { kasm_id: kasmId });
  }

  async destroyKasm(kasmId: string): Promise<void> {
    this.logger.info({ kasmId }, "Destroying Kasm session");
    await this.post("/destroy_kasm", { kasm_id: kasmId });
  }

  async keepalive(kasmId: string): Promise<void> {
    await this.post("/keepalive", { kasm_id: kasmId });
  }

  async getKasms(): Promise<KasmSession[]> {
    const response = await this.post<{ kasms: KasmSession[] }>("/get_kasms", {});
    return response.kasms;
  }

  async getImages(): Promise<KasmImage[]> {
    const response = await this.post<{ images: KasmImage[] }>("/get_images", {});
    return response.images;
  }

  private async post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.kasmApiUrl}${endpoint}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.kasmApiKey,
        api_key_secret: this.kasmApiKeySecret,
        ...body,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      this.logger.error(
        { endpoint, status: response.status, error: errorText },
        "Kasm API request failed",
      );
      throw new Error(`Kasm API error (${response.status}): ${errorText}`);
    }

    return (await response.json()) as T;
  }
}
