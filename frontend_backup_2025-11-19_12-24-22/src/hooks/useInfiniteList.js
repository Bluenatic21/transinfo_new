"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/config/env";
import { useLang } from "./i18n/LangProvider";
/**
 * Универсальный хук:
 *  - endpoint: абсолютный или относительный URL без limit/offset
 *  - pageSize: размер страницы (по умолчанию 30)
 *  - fetcher: функция (url) => Response (по умолчанию window.fetch)
 * Возвращает: { items, loadMore, reload, loading, eof, error, sentinelRef }
 */
export default function useInfiniteList({
    endpoint,
    pageSize = 30,
    fetcher = (url) => fetch(url),
}) {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const [items, setItems] = useState([]);
    const [offset, setOffset] = useState(0);
    const [eof, setEof] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const sentinelRef = useRef(null);
    const firstLoadRef = useRef(false);

    const fetchPage = useCallback(async (reset = false) => {
        if (loading) return;
        setLoading(true);
        setError(null);
        try {
            const off = reset ? 0 : offset;
            const base = endpoint.startsWith("http") ? endpoint : api(endpoint);
            const hasQuery = base.includes("?");
            const url =
                base +
                (hasQuery ? "&" : "?") +
                `limit=${pageSize}&offset=${off}`;
            const res = await fetcher(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const page = await res.json();
            const arr = Array.isArray(page) ? page : [];
            if (reset) {
                setItems(arr);
                setOffset(arr.length);
                setEof(arr.length < pageSize);
            } else {
                setItems((prev) => [...prev, ...arr]);
                setOffset(off + arr.length);
                if (arr.length < pageSize) setEof(true);
            }
        } catch (e) {
            console.error("[useInfiniteList] fetch error:", e);
            setError(t("common.loadFailed", "Не удалось загрузить данные."));
        } finally {
            setLoading(false);
        }
    }, [endpoint, pageSize, fetcher, loading, offset]);

    // первая загрузка
    useEffect(() => {
        if (!firstLoadRef.current) {
            firstLoadRef.current = true;
            fetchPage(true);
        }
    }, [fetchPage]);

    // IntersectionObserver
    useEffect(() => {
        if (!sentinelRef.current) return;
        const el = sentinelRef.current;
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !loading && !eof) {
                        fetchPage(false);
                    }
                });
            },
            { rootMargin: "200px" }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [fetchPage, loading, eof]);

    const loadMore = useCallback(() => !loading && !eof && fetchPage(false), [loading, eof, fetchPage]);
    const reload = useCallback(() => fetchPage(true), [fetchPage]);

    return { items, loadMore, reload, loading, eof, error, sentinelRef };
}
