const hostname = globalThis.location?.hostname ?? '';
const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';

export const API_BASE_URL = isLocal ? 'http://localhost:4330/api' : '/apps/radio-ai/api';
