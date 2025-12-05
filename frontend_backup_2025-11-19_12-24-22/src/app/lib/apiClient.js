import axios from "axios";
import { API_BASE } from "@/config/env";
// Централизация: всегда берём базу API из @/config/env
const api = axios.create({ baseURL: API_BASE });
api.interceptors.request.use(cfg => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
    return cfg;
});
export default api;