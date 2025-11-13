"use client";
import React from "react";

type Props = { label?: string; children: React.ReactNode };
type State = { hasError: boolean; error?: unknown };

export default class SafeBoundary extends React.Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(error: unknown): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: unknown, info: unknown) {
        if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.error(`[SafeBoundary:${this.props.label ?? "component"}]`, error, info);
        }
    }

    render() {
        if (this.state.hasError) return null; // не роняем всю страницу
        return this.props.children;
    }
}
