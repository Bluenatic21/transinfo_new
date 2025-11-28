"use client";
import ProfileSidebar from "../components/ProfileSidebar";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useUser } from "../UserContext";
import { useParams } from "next/navigation";
import { useTheme } from "../providers/ThemeProvider";
import MonitoringSoonGuard from "./MonitoringSoonGuard";

export default function ProfileLayout({ children }) {
    const isMobile = useIsMobile();
    const { user } = useUser();
    const params = useParams();
    // Align the page background with the navigation/ sidebar area
    const pageBackground = "var(--sidebar-bg)";

    // Как узнать чей профиль? Допустим url: /profile/[id]
    // params.id — это id профиля, user.id — id залогиненного
    const profileId = params?.id || user?.id?.toString();
    const isOwnProfile = user && String(user.id) === String(profileId);

    if (isMobile) return children;

    return (
        <div style={{
            display: "flex",
            flexDirection: "row",
            minHeight: "100vh",
            width: "100vw",
            // Keep the entire page the same color as the navigation section
            background: pageBackground
        }}>
            {isOwnProfile && <ProfileSidebar />}
            <div style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: "100vh"
            }}>
                {children}
            </div>
        </div>
    );
}
