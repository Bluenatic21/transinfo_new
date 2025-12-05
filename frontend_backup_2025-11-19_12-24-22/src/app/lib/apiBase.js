// Централизация: тонкий прокси на @/config/env
import { API_BASE, api as withApi, api, abs, ws } from "@/config/env";

export { API_BASE, api, abs, ws, withApi };
export const API = API_BASE;   // для старых импортов типа `import { API } from ".../apiBase"`
export default API_BASE;       // для `import API from ".../apiBase"`
