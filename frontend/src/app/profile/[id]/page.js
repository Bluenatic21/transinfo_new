"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import ProfileCard from "@/app/components/ProfileCard";
import UserReviewsList from "@/app/components/ratings/UserReviewsList";
import LeaveReview from "@/app/components/ratings/LeaveReview";
import { useUser } from "@/app/UserContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMessenger } from "@/app/components/MessengerContext";
import {
  FaWhatsapp,
  FaTelegramPlane,
  FaViber,
  FaEnvelope,
  FaPhoneAlt,
  FaComments,
} from "react-icons/fa";
import { useLang } from "@/app/i18n/LangProvider";
import { api } from "@/config/env";
import { useTheme } from "@/app/providers/ThemeProvider";

// Карточка с вашим отзывом
function YourReviewCard({ review }) {
  const { t } = useLang?.() || { t: (_k, f) => f };
  const ts = review?.created_at
    ? new Date(review.created_at).toLocaleString()
    : null;
  return (
    <div
      style={{
        background: "#182740",
        borderRadius: 12,
        padding: 12, // компактнее
        width: "100%", // на ширину секции отзывов
        maxWidth: "100%",
        margin: "16px 0 0", // убрали авто-центрирование контейнера
        border: "1px solid #1f3556",
        boxShadow: "0 2px 8px rgba(60,130,255,0.09)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          lineHeight: 1.25,
          fontSize: 16,
          fontWeight: 600,
          color: "#e3f2fd",
        }}
      >
        <span style={{ color: "#53ee5c" }}>
          {t("reviews.youRated", "Вы оценили этого пользователя")}
        </span>
        <span style={{ opacity: 0.5 }}>•</span>
        <span>
          {t("reviews.yourScore", "Ваша оценка")}:{" "}
          <b style={{ color: "#53ee5c" }}>{review?.stars10 ?? 10}</b>{" "}
          {t("reviews.max10", "/ 10")}
        </span>
        {ts && (
          <>
            <span style={{ opacity: 0.5 }}>•</span>
            <span style={{ color: "#b0bec5", fontWeight: 500 }}>{ts}</span>
          </>
        )}
      </div>
      {review?.comment ? (
        <div
          style={{
            marginTop: 6,
            color: "#b0bec5",
            fontSize: 14,
            lineHeight: 1.3,
          }}
        >
          {review.comment}
        </div>
      ) : null}
    </div>
  );
}

export default function OtherUserProfile() {
  const { t } = useLang?.() || { t: (_k, f) => f };
  const { resolvedTheme } = useTheme();
  const isLightTheme = resolvedTheme === "light";
  const reviewTitleColor = isLightTheme ? "#0f1b2a" : "#e3f2fd";
  const reviewDotColor = isLightTheme ? "#0284c7" : "#72ebff";
  const params = useParams();
  const id = params.id;
  const cleanId = Array.isArray(id) ? id[0] : id;
  const numericId = cleanId.replace(/^\[|\]$/g, "");
  const { user: currentUser } = useUser();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [yourReview, setYourReview] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const isMobile = useIsMobile();

  const { openMessenger } = useMessenger
    ? useMessenger()
    : { openMessenger: null };

  useEffect(() => {
    function profileCardChatListener() {
      handleChatClick();
    }
    window.addEventListener("profileCardChatClick", profileCardChatListener);
    return () => {
      window.removeEventListener(
        "profileCardChatClick",
        profileCardChatListener
      );
    };
  }, [user]);

  async function handleChatClick() {
    if (!user?.id) return;
    const token = localStorage.getItem("token");
    if (!token) {
      alert(t("common.loginRequired", "Необходимо войти в систему"));
      return;
    }
    const resp = await fetch(api(`/chat/by_user/${user.id}`), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (resp.status === 401) {
      alert(t("common.sessionExpired", "Сессия истекла, войдите снова"));
      return;
    }
    const data = await resp.json();
    if (data?.chat_id && openMessenger) {
      openMessenger(data.chat_id);
    }
  }

  useEffect(() => {
    if (!id) return;
    let cleanId = Array.isArray(id) ? id[0] : id;
    cleanId = cleanId.replace(/^\[|\]$/g, "");
    setLoading(true);
    fetch(api(`/users/${cleanId}`))
      .then((res) => res.json())
      .then(setUser)
      .finally(() => setLoading(false));
  }, [id]);

  // Проверка, оставлял ли отзыв текущий пользователь этому пользователю
  useEffect(() => {
    if (!currentUser?.id || !user?.id || currentUser.id === user.id) {
      setYourReview(null);
      return;
    }
    setReviewLoading(true);
    fetch(api(`/users/${user.id}/reviews?page=1&per_page=50`))
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        const mine = Array.isArray(list)
          ? list.find((x) => x.author_user_id === currentUser.id)
          : null;
        setYourReview(mine || null);
      })
      .finally(() => setReviewLoading(false));
  }, [user, currentUser]);

  if (loading)
    return (
      <div className="profile-loading">
        {t("profile.loading", "Загрузка профиля...")}
      </div>
    );
  if (!user)
    return (
      <div className="profile-notfound">
        {t("profile.notFound", "Пользователь не найден")}
      </div>
    );

  const isOwnProfile = currentUser?.id === user.id;

  // --- Десктоп ---
  if (!isMobile) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          maxWidth: 1150,
          marginLeft: "auto",
          marginRight: "auto",
          marginTop: 44,
          padding: "44px 0 66px 0",
          position: "relative",
        }}
      >
        <div style={{ flex: 1 }}>
          <ProfileCard user={user} readOnly={!isOwnProfile} setUser={setUser} />
          {!isOwnProfile &&
            (reviewLoading ? (
              <div>{t("reviews.checking", "Проверка отзыва...")}</div>
            ) : yourReview ? (
              <YourReviewCard review={yourReview} />
            ) : (
              <section
                style={{
                  marginTop: 18,
                  paddingTop: 16,
                  borderTop: "1px solid #193158",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <h3 style={{ fontWeight: 700, color: "#43c8ff" }}>
                    {t("reviews.rateUser", "Оценить пользователя")}
                  </h3>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    {t(
                      "reviews.scoreAffects",
                      "Ваша оценка влияет на общий рейтинг"
                    )}
                  </span>
                </div>
                <LeaveReview
                  targetUserId={user.id}
                  onReviewSent={setYourReview}
                  className="max-w-3xl"
                />
              </section>
            ))}
          {/* Отзывы — как в собственном профиле */}
          <section
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px solid #233a5a",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: reviewDotColor,
                }}
              />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 18,
                  color: reviewTitleColor,
                  letterSpacing: ".01em",
                }}
              >
                {t("reviews.title", "Отзывы")}
              </span>
            </div>
            <UserReviewsList userId={user?.id} />
          </section>
        </div>
      </div>
    );
  }

  // --- Мобильная версия ---
  return (
    <div className="profile-page-root">
      <ProfileCard user={user} readOnly={!isOwnProfile} />
      {!isOwnProfile &&
        (reviewLoading ? (
          <div>{t("reviews.checking", "Проверка отзыва...")}</div>
        ) : yourReview ? (
          <YourReviewCard review={yourReview} />
        ) : (
          <section
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid #193158",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <h3 style={{ fontWeight: 700, color: "#43c8ff" }}>
                {t("reviews.rateUser", "Оценить пользователя")}
              </h3>
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                {t("reviews.scoreVisible", "Оценка видна другим")}
              </span>
            </div>
            <LeaveReview targetUserId={user.id} onReviewSent={setYourReview} />
          </section>
        ))}
      {/* Отзывы — как в собственном профиле */}
      <section
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: "1px solid #233a5a",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: reviewDotColor,
            }}
          />
          <span
            style={{
              fontWeight: 700,
              fontSize: 18,
              color: reviewTitleColor,
              letterSpacing: ".01em",
            }}
          >
            {t("reviews.title", "Отзывы")}
          </span>
        </div>
        <UserReviewsList userId={user?.id} />
      </section>
    </div>
  );
}
