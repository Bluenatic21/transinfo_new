export const metadata = { title: "Пользовательское соглашение — Transinfo" };

const TERMS_VERSION = "2025-09-17-ru-v1"; // синхронизируй с backend/auth.py

import TermsClient from "./TermsClient";

export default function TermsPage() {
    return <TermsClient termsVersion={TERMS_VERSION} />;
}
