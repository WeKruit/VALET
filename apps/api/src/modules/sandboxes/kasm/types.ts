// ─── Kasm REST API Request/Response Types ───

export interface RequestKasmParams {
  image_id: string;
  user_id: string;
  environment?: Record<string, string>;
}

export interface RequestKasmResponse {
  kasm_id: string;
  status: string;
  share_id: string;
  username: string;
  kasm_url: string;
  session_token: string;
  operational_status: string;
  hostname: string;
  port_map: Record<string, { port: number; path: string }>;
}

export interface KasmStatusResponse {
  kasm: {
    kasm_id: string;
    status: string;
    operational_status: string;
    hostname: string;
    port_map: Record<string, { port: number; path: string }>;
    kasm_url: string;
    image: { image_id: string; friendly_name: string };
  };
}

export interface KasmSession {
  kasm_id: string;
  status: string;
  operational_status: string;
  hostname: string;
  kasm_url: string;
  user_id: string;
  image_id: string;
  port_map: Record<string, { port: number; path: string }>;
}

export interface KasmImage {
  image_id: string;
  friendly_name: string;
  image_src: string;
  available: boolean;
  enabled: boolean;
}
