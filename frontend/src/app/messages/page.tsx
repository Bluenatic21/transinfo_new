"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import MessengerSidebar from "@/app/components/MessengerSidebar";
import { useMessenger } from "@/app/components/MessengerContext";
import { useLang } from "@/app/i18n/LangProvider";

export default function MessagesPage() {
    const router = useRouter();
    const { fetchChatList } = useMessenger();
    const { t } = useLang?.() || { t: (_k, f) => f };

    useEffect(() => {
        try { fetchChatList && fetchChatList({ force: true }); } catch { }
    }, [fetchChatList]);

    const handleOpen = (chatId: number) => {
        if (!chatId) return;
        router.push(`/messages/${chatId}`);
    };

    return (
        <div className="min-h-[100dvh] flex flex-col bg-[#0b1220] text-slate-100 pb-24">
            <header className="sticky top-0 z-10 bg-[#0b1220]/90 backdrop-blur border-b border-white/10">
                <div className="max-w-screen-sm mx-auto px-4 py-3 flex items-center justify-between">
                    <h1 className="text-lg font-semibold tracking-wide">{t("messages.title", "Сообщения")}</h1>
                    <div />
                </div>
            </header>

            <main className="flex-1 max-w-screen-sm mx-auto w-full overflow-y-auto">
                <MessengerSidebar onSelectChat={handleOpen} selectedChat={null} />
            </main>
        </div>
    );
}
