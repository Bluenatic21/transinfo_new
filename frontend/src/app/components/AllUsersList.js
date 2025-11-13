import { useEffect, useState } from "react";
import { useLang } from "../i18n/LangProvider";
import { api } from "@/config/env";

export default function AllUsersList() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const { t } = useLang();

    useEffect(() => {
        fetch(api("/users"), {
            headers: { Authorization: "Bearer " + localStorage.getItem("token") }
        })
            .then(r => r.json())
            .then(data => setUsers(data))
            .catch(() => setUsers([]))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ color: "#4FC3F7" }}>{t("users.loading", "Загрузка пользователей...")}</div>;

    return (
        <div style={{
            margin: "20px 0",
            padding: 18,
            borderRadius: 14,
            background: "rgba(25,45,68,0.94)",
            boxShadow: "0 2px 18px #29527b12"
        }}>
            <div style={{ fontWeight: 700, color: "#43c8ff", fontSize: 19, marginBottom: 14 }}>
                {t("users.all", "Все пользователи")} ({users.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {users.map(u => (
                    <div key={u.id} style={{
                        background: "#172c48",
                        borderRadius: 8,
                        padding: "10px 18px",
                        color: "#b9e2ff",
                        fontSize: 16,
                        boxShadow: "0 1px 6px #29527b11"
                    }}>
                        <b>{u.organization || u.name || u.email}</b>
                        <span style={{ marginLeft: 9, fontSize: 13, color: "#82B1FF" }}>
                            ({u.email})
                        </span>
                        <span style={{ marginLeft: 13, fontSize: 13, color: "#b2c6e2" }}>
                            [{u.role}]
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
