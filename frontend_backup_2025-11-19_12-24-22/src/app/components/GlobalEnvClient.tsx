"use client";
import { useEffect } from "react";
import { API_BASE } from "@/config/env";

export default function GlobalEnvClient() {
  useEffect(() => {
    try {
      (window as any).API_URL = API_BASE;
    } catch { }
  }, []);
  return null;
}
