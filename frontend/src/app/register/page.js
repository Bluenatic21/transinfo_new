"use client";
import RegisterForm from "../components/RegisterForm";

export default function RegisterPage() {
    return (
        <div
            style={{
                minHeight: "100vh",
                background: "linear-gradient(120deg, #182c47 0%, #254e7b 50%, #183872 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflowY: "auto",
            }}
        >
            <RegisterForm
                onSuccess={() => {
                    // После успешной регистрации возвращаем на главную или показываем уведомление
                    window.location.href = "/";
                }}
            />
        </div>
    );
}
