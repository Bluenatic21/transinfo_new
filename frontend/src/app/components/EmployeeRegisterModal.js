"use client";
import EmployeeRegisterForm from "./EmployeeRegisterForm";
import { useLang } from "../i18n/LangProvider";

export default function EmployeeRegisterModal({ visible, onClose, onDone }) {
    const { t } = useLang();
    if (!visible) return null;
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 1210,
                backdropFilter: "blur(3px)",
                background: "rgba(16, 24, 43, 0.62)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflowY: "auto",
            }}
            role="dialog"
            aria-modal="true"
            aria-label={t("employee.register.title", "Регистрация сотрудника")}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: 430,
                    width: "100%",
                    margin: "32px 8px",
                    background: "rgba(34,36,52,0.94)",
                    borderRadius: 18,
                    border: "1px solid #233a5a",
                    padding: 16,
                }}
            >
                <EmployeeRegisterForm
                    onSuccess={() => {
                        if (onDone) onDone(); // перезагрузим список в EmployeeList
                        onClose();
                    }}
                />
            </div>
        </div>
    );
}
