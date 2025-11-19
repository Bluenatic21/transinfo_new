from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Text, func, UniqueConstraint
from sqlalchemy import UniqueConstraint
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text, ForeignKey, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from database import engine, Base
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import uuid
from sqlalchemy.ext.declarative import declarative_base
import sqlalchemy as sa
import json
import enum
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.orm import relationship
import uuid


GROUP_ROLE_OWNER = "owner"
GROUP_ROLE_ADMIN = "admin"
GROUP_ROLE_MEMBER = "member"


class NotificationType(enum.Enum):
    ORDER = "ORDER"
    BID = "BID"
    CHAT = "CHAT"
    SYSTEM = "SYSTEM"
    ORDER_OVERDUE_1 = "ORDER_OVERDUE_1"
    ORDER_OVERDUE_4 = "ORDER_OVERDUE_4"
    ORDER_OVERDUE_7 = "ORDER_OVERDUE_7"
    ORDER_AUTO_DISABLED = "ORDER_AUTO_DISABLED"
    TRANSPORT_OVERDUE_1 = "TRANSPORT_OVERDUE_1"
    TRANSPORT_OVERDUE_4 = "TRANSPORT_OVERDUE_4"
    TRANSPORT_OVERDUE_7 = "TRANSPORT_OVERDUE_7"
    TRANSPORT_AUTO_DISABLED = "TRANSPORT_AUTO_DISABLED"
    ORDER_REMOVED = "ORDER_REMOVED"   # <--- Новое!
    AUTO_MATCH = "AUTO_MATCH"
    CONTACT_REQUEST = "CONTACT_REQUEST"
    CONTACT_ACCEPTED = "CONTACT_ACCEPTED"
    CONTACT_DECLINED = "CONTACT_DECLINED"
    REVIEW_RECEIVED = "REVIEW_RECEIVED"


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"),
                     index=True, nullable=False)
    type = Column(sa.Enum(NotificationType), nullable=False)
    message = Column(String, nullable=False)
    related_id = Column(String, nullable=True)
    payload = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    read = Column(Boolean, default=False)


class UserRole(enum.Enum):
    TRANSPORT = "TRANSPORT"
    OWNER = "OWNER"
    MANAGER = "MANAGER"
    EMPLOYEE = "EMPLOYEE"
    SUPPORT = "SUPPORT"
    ADMIN = "ADMIN"


# --- BILLING: Enums ---
class SubscriptionStatus(enum.Enum):
    ACTIVE = "ACTIVE"
    PAST_DUE = "PAST_DUE"
    CANCELED = "CANCELED"
    INCOMPLETE = "INCOMPLETE"

# --- BILLING: Core tables ---


class Subscription(Base):
    __tablename__ = "billing_subscriptions"
    id = sa.Column(sa.BigInteger, primary_key=True, autoincrement=True)
    account_id = sa.Column(sa.Integer, sa.ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = sa.Column(sa.Enum(UserRole), nullable=False)
    period = sa.Column(sa.String, nullable=False, default="monthly")
    status = sa.Column(sa.Enum(SubscriptionStatus),
                       nullable=False, default=SubscriptionStatus.ACTIVE)
    next_renewal_at = sa.Column(TIMESTAMP, nullable=True)
    processor = sa.Column(sa.String, nullable=False,
                          default="tbc")
    external_id = sa.Column(sa.String, nullable=True)
    created_at = sa.Column(TIMESTAMP, default=datetime.utcnow)
    updated_at = sa.Column(
        TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow)


class BillingUsageDaily(Base):
    __tablename__ = "billing_usage_daily"
    id = sa.Column(sa.BigInteger, primary_key=True, autoincrement=True)
    account_id = sa.Column(sa.Integer, sa.ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False, index=True)
    day = sa.Column(sa.Date, nullable=False, index=True)
    active_transport_count = sa.Column(sa.Integer, nullable=False, default=0)
    created_at = sa.Column(TIMESTAMP, default=datetime.utcnow)
    __table_args__ = (sa.UniqueConstraint(
        "account_id", "day", name="uq_billing_usage_daily"), )


class BillingPeriod(Base):
    __tablename__ = "billing_periods"
    id = sa.Column(sa.BigInteger, primary_key=True, autoincrement=True)
    subscription_id = sa.Column(sa.BigInteger, sa.ForeignKey(
        "billing_subscriptions.id", ondelete="CASCADE"), index=True)
    period_start = sa.Column(TIMESTAMP, nullable=False)
    period_end = sa.Column(TIMESTAMP, nullable=False)
    closed_at = sa.Column(TIMESTAMP, nullable=True)
    peak_active_transports = sa.Column(sa.Integer, nullable=False, default=0)
    chargeable_transport_slots = sa.Column(
        sa.Integer, nullable=False, default=0)  # max(0, peak - 1)
    employees_qty = sa.Column(sa.Integer, nullable=False, default=0)
    base_amount_usd_cents = sa.Column(
        sa.Integer, nullable=False, default=0)   # 30 GEL ≈ $15 -> 1500
    addons_amount_usd_cents = sa.Column(
        sa.Integer, nullable=False, default=0)  # слоты (7$) + seats (15$)
    invoice_number = sa.Column(sa.String, nullable=True)
    created_at = sa.Column(TIMESTAMP, default=datetime.utcnow)


class Payment(Base):
    __tablename__ = "billing_payments"
    id = sa.Column(sa.BigInteger, primary_key=True, autoincrement=True)
    subscription_id = sa.Column(sa.BigInteger, sa.ForeignKey(
        "billing_subscriptions.id", ondelete="SET NULL"), index=True)
    amount_usd_cents = sa.Column(sa.Integer, nullable=False)
    currency = sa.Column(sa.String, nullable=False, default="USD")
    # created|succeeded|failed
    status = sa.Column(sa.String, nullable=False, default="created")
    processor = sa.Column(sa.String, nullable=False, default="tbc")
    external_payment_id = sa.Column(sa.String, nullable=True)
    payload = sa.Column(JSONB, nullable=True)
    created_at = sa.Column(TIMESTAMP, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(Integer, index=True, unique=True, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(sa.Enum(UserRole), nullable=False)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    email_verified = Column(Boolean, default=False)
    email_verified_at = Column(DateTime, nullable=True)
    phone_verified = Column(Boolean, default=False)
    docs_verified = Column(Boolean, default=False)
    avatar = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    organization = Column(String, nullable=True)
    contact_person = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    whatsapp = Column(String, nullable=True)
    viber = Column(String, nullable=True)
    telegram = Column(String, nullable=True)
    country = Column(String, nullable=True)
    city = Column(String, nullable=True)
    person_type = Column(String, nullable=True)
    fleet = Column(String, nullable=True)
    profile_data = Column(JSONB, nullable=True)
    docs_files = Column(JSONB, default=list)
    verification_status = Column(String, default="not_sent")
    # Начальный рейтинг нового пользователя — 10/10 (полные 10 звёзд)
    final_rating = Column(Float, default=10.0)
    last_active_at = Column(DateTime, default=datetime.utcnow)
    # --- Terms consent ---
    accepted_terms = Column(Boolean, default=False, nullable=False)
    terms_version = Column(String, nullable=True)
    terms_accepted_at = Column(DateTime, nullable=True)
    terms_accepted_ip = Column(String, nullable=True)

    # --- Single-session auth (ровно одна активная сессия на аккаунт) ---
    session_uuid = Column(String, nullable=True, index=True)
    session_updated_at = Column(DateTime, default=datetime.utcnow)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"),
                     nullable=False, unique=True)
    last_seen_at = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_visit_at = Column(DateTime, default=datetime.utcnow)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    last_path = Column(String(512), nullable=True)


class SiteVisit(Base):
    __tablename__ = "site_visits"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey(
        "users.id"), nullable=True, index=True)
    visited_at = Column(DateTime, default=datetime.utcnow, index=True)
    path = Column(String(512), nullable=True)
    ip_address = Column(String(64), nullable=True)


class Review(Base):
    __tablename__ = "reviews"

    id = sa.Column(sa.BigInteger, primary_key=True, autoincrement=True)
    target_user_id = sa.Column(sa.BigInteger, sa.ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    author_user_id = sa.Column(sa.BigInteger, sa.ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)

    punctuality = sa.Column(sa.SmallInteger, nullable=False)
    communication = sa.Column(sa.SmallInteger, nullable=False)
    professionalism = sa.Column(sa.SmallInteger, nullable=False)
    terms = sa.Column(sa.SmallInteger, nullable=False)
    # Новая упрощённая оценка: 10 звёзд (1..10). Для новых отзывов используем только её.
    stars10 = sa.Column(sa.SmallInteger, nullable=True)
    comment = sa.Column(sa.Text, nullable=True)
    reported = sa.Column(sa.Boolean, nullable=False,
                         server_default=sa.text("false"))

    created_at = sa.Column(sa.DateTime(timezone=True),
                           server_default=sa.text("now()"), nullable=False)
    updated_at = sa.Column(sa.DateTime(timezone=True),
                           server_default=sa.text("now()"), nullable=False)

    target_user = sa.orm.relationship("User", foreign_keys=[target_user_id])
    author_user = sa.orm.relationship("User", foreign_keys=[author_user_id])


class Order(Base):
    __tablename__ = "orders"
    requested_rate_options = Column(JSONB, default=list)
    id = Column(Integer, primary_key=True, index=True)
    is_active = Column(sa.Boolean, default=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    cargo_items = Column(JSONB, default=list)
    from_locations = Column(JSONB, default=list)
    to_locations = Column(JSONB, default=list)
    from_locations_coords = Column(JSONB, default=list)
    to_locations_coords = Column(JSONB, default=list)
    loading_types = Column(JSONB, default=list)
    routes = Column(JSONB, default=list)
    attachments = Column(JSONB, default=list)
    gps_monitoring = Column(sa.Boolean, default=False)
    truck_type = Column(String)
    transport_type = Column(String)
    truck_quantity = Column(Integer, default=1)
    load_date = Column(String)
    unload_date = Column(String)
    has_customs = Column(sa.Boolean, default=False)
    customs_info = Column(String)
    adr = Column(sa.Boolean, default=False)
    adr_class = Column(String)
    temp_mode = Column(sa.Boolean, default=False)
    temp_from = Column(String)
    temp_to = Column(String)
    rate_type = Column(String)
    rate_with_vat = Column(String)
    rate_no_vat = Column(String)
    rate_cash = Column(String)
    rate_currency = Column(String)
    rate_to_card = Column(sa.Boolean, default=False)
    payment_scenario = Column(String)
    payment_days = Column(String)
    prepay_amount = Column(String)
    postpay_days = Column(String)
    payment_comment = Column(String)
    comment = Column(Text)
    phone = Column(String)
    email = Column(String)
    price = Column(String)
    username = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    owner_id = Column(Integer)
    # Счётчик просмотров детальной страницы
    views = Column(Integer, default=0)

    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

    # === NEW: нормализованные города (для локализации вывода) ===
    from_place_ids = Column(ARRAY(sa.BigInteger), server_default='{}')
    to_place_ids = Column(ARRAY(sa.BigInteger), server_default='{}')


class Transport(Base):
    __tablename__ = "transports"
    id = Column(UUID(as_uuid=True), primary_key=True,
                default=uuid.uuid4, unique=True, nullable=False)
    is_active = Column(sa.Boolean, default=True)
    transport_kind = Column(String)
    truck_type = Column(String)
    body_length = Column(String)
    body_width = Column(String)
    body_height = Column(String)
    trailer_length = Column(String)
    trailer_width = Column(String)
    trailer_height = Column(String)
    load_types = Column(JSONB, default=list)
    weight = Column(Float)
    volume = Column(Float)
    adr = Column(sa.Boolean, default=False)
    adr_class = Column(ARRAY(String))
    gps_monitor = Column(sa.Boolean, default=False)
    special = Column(JSONB, default=list)
    from_location = Column(String)
    from_radius = Column(String)
    from_location_lat = Column(Float, nullable=True)
    from_location_lng = Column(Float, nullable=True)
    to_locations = Column(JSONB)
    from_location_coords = Column(JSONB, nullable=True)
    ready_date_from = Column(String)
    ready_date_to = Column(String)
    mode = Column(String)
    regularity = Column(String)
    rate_type = Column(String)
    rate_with_vat = Column(String)
    rate_without_vat = Column(String)
    rate_cash = Column(String)
    bargain = Column(String)
    currency = Column(String)
    contact_name = Column(String)
    phone = Column(String)
    email = Column(String)
    comment = Column(Text)
    attachments = Column(JSONB, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    owner_id = Column(Integer)
    # Счётчик просмотров детальной страницы
    views = Column(Integer, default=0)

# --- Daily unique views (one per user per day) -------------------------------


class OrderDailyView(Base):
    __tablename__ = "order_daily_views"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, index=True, nullable=False)
    # "u:<id>" | "g:<hash>"
    viewer_key = Column(String, index=True, nullable=False)
    day = Column(Date, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("order_id", "viewer_key", "day",
                      name="uq_order_view_per_user_per_day"),)


class TransportDailyView(Base):
    __tablename__ = "transport_daily_views"
    id = Column(Integer, primary_key=True)
    transport_id = Column(String, index=True, nullable=False)
    # "u:<id>" | "g:<hash>"
    viewer_key = Column(String, index=True, nullable=False)
    day = Column(Date, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("transport_id", "viewer_key", "day",
                      name="uq_transport_view_per_user_per_day"),)

    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

    # === NEW: нормализованные города ===
    from_place_id = Column(sa.BigInteger, nullable=True)
    to_place_ids = Column(ARRAY(sa.BigInteger), server_default='{}')


class Chat(Base):
    __tablename__ = "chat"
    id = Column(Integer, primary_key=True, index=True)
    is_group = Column(Boolean, default=False)
    group_name = Column(String, nullable=True)
    group_avatar = Column(String, nullable=True)
    order_id = Column(Integer, nullable=True)
    transport_id = Column(UUID(as_uuid=True), nullable=True)
    owner_id = Column(Integer, nullable=True)   # <--- ДОБАВЬ ЭТУ СТРОКУ
    created_at = Column(TIMESTAMP, default=datetime.utcnow)
    participants = relationship("ChatParticipant", back_populates="chat")
    messages = relationship("ChatMessage", back_populates="chat")
    files = relationship("ChatFile", back_populates="chat")


class ChatParticipant(Base):
    __tablename__ = "chat_participant"
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey(
        "chat.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, nullable=False)
    role = Column(String(20))
    joined_at = Column(TIMESTAMP, default=datetime.utcnow)
    # Персональная «черта видимости» истории.
    # Все сообщения, отправленные до cleared_at, пользователю не показываются.
    cleared_at = Column(TIMESTAMP, nullable=True)
    chat = relationship("Chat", back_populates="participants")


class Place(Base):
    __tablename__ = "places"
    id = sa.Column(sa.BigInteger, primary_key=True)
    source = sa.Column(sa.String, nullable=False)  # 'osm'|'geonames'
    # osm_id или geonameid
    external_id = sa.Column(sa.BigInteger, nullable=False)
    osm_type = sa.Column(sa.String, nullable=True)  # 'N'|'W'|'R' для OSM
    lat = sa.Column(sa.Float, nullable=False)
    lon = sa.Column(sa.Float, nullable=False)
    country_iso2 = sa.Column(sa.String(2), nullable=False)
    translations = sa.Column(JSONB, nullable=False, default=dict)
    __table_args__ = (sa.UniqueConstraint(
        'source', 'external_id', name='uq_place_source_ext'),)


class ChatFile(Base):
    __tablename__ = "chat_file"
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey(
        "chat.id", ondelete="CASCADE"), nullable=False)
    uploader_id = Column(Integer, nullable=False)
    filename = Column(String(256))
    file_type = Column(String(128))
    file_url = Column(String(512))
    uploaded_at = Column(TIMESTAMP, default=datetime.utcnow)
    chat = relationship("Chat", back_populates="files")
    messages = relationship("ChatMessage", back_populates="file")


class ChatMessage(Base):
    __tablename__ = "chat_message"
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey(
        "chat.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(Integer, nullable=False)
    content = Column(Text)
    message_type = Column(String(16), default="text")
    file_id = Column(Integer, ForeignKey("chat_file.id"))
    sent_at = Column(TIMESTAMP, default=datetime.utcnow)
    order_id = Column(Integer, nullable=True)
    transport_id = Column(UUID(as_uuid=True), nullable=True)
    chat = relationship("Chat", back_populates="messages")
    file = relationship("ChatFile", back_populates="messages")
    is_read = Column(Boolean, default=False)
    reactions = relationship("ChatMessageReaction", backref="message",
                             cascade="all, delete-orphan")


class ChatMessageReaction(Base):
    __tablename__ = "chat_message_reaction"
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey(
        "chat_message.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    # Например: "like", "smile", "heart"
    reaction = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class Rating(Base):
    __tablename__ = "ratings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    author_id = Column(Integer, ForeignKey("users.id"))
    deal_id = Column(Integer, nullable=True)
    punctuality = Column(Integer, nullable=False)
    communication = Column(Integer, nullable=False)
    professionalism = Column(Integer, nullable=False)
    reliability = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class BidStatus(enum.Enum):
    new = "new"
    accepted = "accepted"
    rejected = "rejected"
    viewed = "viewed"


class Bid(Base):
    __tablename__ = "bids"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(String, nullable=False)
    currency = Column(String(16), nullable=True)
    comment = Column(String, nullable=True)
    status = Column(sa.Enum(BidStatus), default=BidStatus.new)
    created_at = Column(DateTime, default=datetime.utcnow)


class OrderComment(Base):
    __tablename__ = "order_comments"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", backref="order_comments", lazy="joined")


class InternalComment(Base):
    __tablename__ = "internal_comments"
    id = Column(Integer, primary_key=True)
    # «корневой» менеджер аккаунта, чтобы комментарий был виден всем его сотрудникам
    manager_id = Column(Integer, ForeignKey(
        "users.id"), index=True, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    order_id = Column(Integer, ForeignKey(
        "orders.id", ondelete="CASCADE"), nullable=True, index=True)
    transport_id = Column(UUID(as_uuid=True), ForeignKey(
        "transports.id", ondelete="CASCADE"), nullable=True, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class MatchesViewed(Base):
    __tablename__ = "matches_viewed"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    transport_id = Column(UUID(as_uuid=True), ForeignKey(
        "transports.id"), index=True)
    last_viewed_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint('user_id', 'transport_id',
                      name='matches_viewed_user_transport_uc'),)


class Match(Base):
    __tablename__ = "matches"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey(
        "orders.id"), nullable=True, index=True)
    transport_id = Column(UUID(as_uuid=True), ForeignKey(
        "transports.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"),
                     nullable=False, index=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # можешь добавить еще нужные тебе поля
    __table_args__ = (UniqueConstraint('order_id', 'transport_id',
                      'user_id', name='_order_transport_user_uc'),)

# --- Mute группы пользователем ---


class GroupMute(Base):
    __tablename__ = "group_mute"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"),
                     nullable=False, index=True)
    chat_id = Column(Integer, ForeignKey(
        "chat.id", ondelete="CASCADE"), nullable=False, index=True)
    muted = Column(Boolean, default=True)

    __table_args__ = (UniqueConstraint(
        "user_id", "chat_id", name="_user_chat_mute_uc"),)


class OrderMatchView(Base):
    __tablename__ = "order_match_views"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    order_id = Column(Integer, nullable=False)
    last_viewed_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint(
        'user_id', 'order_id', name='_user_order_uc'),)


class TransportMatchView(Base):
    __tablename__ = "transport_match_views"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    transport_id = Column(String, nullable=False)
    last_viewed_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (
        UniqueConstraint('user_id', 'transport_id',
                         name='transport_match_views_user_transport_uc'),
    )

    # === GPS Tracking ===


class TrackingSession(Base):
    __tablename__ = "tracking_sessions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(Integer, ForeignKey(
        "orders.id", ondelete="SET NULL"), nullable=True, index=True)
    transport_id = Column(UUID(as_uuid=True), ForeignKey(
        "transports.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by = Column(Integer, ForeignKey(
        "users.id", ondelete="SET NULL"), nullable=True)
    driver_id = Column(Integer, ForeignKey(
        "users.id", ondelete="SET NULL"), nullable=True)
    visibility = Column(String, default="private")  # "private" | "link"
    share_token = Column(String, unique=True, index=True, nullable=True)
    is_active = Column(Boolean, default=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    last_point_at = Column(DateTime, nullable=True)


class TrackingPoint(Base):
    __tablename__ = "tracking_points"
    id = Column(Integer, primary_key=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey(
        "tracking_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    ts = Column(DateTime, default=datetime.utcnow, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    speed = Column(Float)
    heading = Column(Float)
    accuracy = Column(Float)
    battery = Column(Float)
    source = Column(String, default="device")
    meta = Column(JSONB, default=dict)


class TrackingShare(Base):
    __tablename__ = "tracking_shares"
    id = Column(Integer, primary_key=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey(
        "tracking_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    recipient_user_id = Column(Integer, ForeignKey(
        "users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    stopped_at = Column(DateTime, nullable=True)


class TrackingShareLink(Base):
    __tablename__ = "tracking_share_links"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey(
        "tracking_sessions.id"), nullable=False, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=True)
    revoked = Column(Boolean, default=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("TrackingSession")


# === GPS Tracking Requests ===


class TrackingRequestStatus(enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    DECLINED = "DECLINED"
    CANCELED = "CANCELED"


class TrackingRequest(Base):
    __tablename__ = "tracking_requests"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey(
        "orders.id", ondelete="CASCADE"), nullable=True, index=True)

    requester_user_id = Column(Integer, ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False, index=True)
    target_user_id = Column(Integer, ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False, index=True)

    status = Column(sa.Enum(TrackingRequestStatus),
                    default=TrackingRequestStatus.PENDING, nullable=False, index=True)
    message = Column(String, nullable=True)

    session_id = Column(UUID(as_uuid=True), ForeignKey(
        "tracking_sessions.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow,
                        nullable=False, index=True)
    responded_at = Column(DateTime, nullable=True)

    # models.py (добавьте в конец)


class AdminAction(Base):
    __tablename__ = "admin_actions"
    id = Column(Integer, primary_key=True, index=True)
    admin_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # USER_PATCH, USER_VERIFY, и т.д.
    action = Column(String(100), nullable=False)
    # "user", "order", "transport", ...
    target_type = Column(String(50), nullable=False)
    target_id = Column(Integer, nullable=False)
    payload_before = Column(Text, nullable=True)
    payload_after = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    admin_user = relationship("User", backref="admin_actions")


class UserBlock(Base):
    __tablename__ = "user_blocks"
    id = Column(Integer, primary_key=True)
    blocker_id = Column(Integer, ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False, index=True)
    blocked_id = Column(Integer, ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint(
        "blocker_id", "blocked_id", name="uq_user_block"),)


class ContactRequest(Base):
    __tablename__ = "contact_requests"
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    receiver_id = Column(Integer, ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    # pending|accepted|declined
    status = Column(String(16), nullable=False, default="pending")
    created_at = Column(DateTime, nullable=False,
                        server_default=sa.text("now()"))

    __table_args__ = (
        UniqueConstraint("sender_id", "receiver_id",
                         name="uq_contact_request"),
    )


class UserContact(Base):
    __tablename__ = "user_contacts"
    id = sa.Column(sa.Integer, primary_key=True)
    user_id = sa.Column(sa.Integer, sa.ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    contact_id = sa.Column(sa.Integer, sa.ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    created_at = sa.Column(sa.DateTime(timezone=True),
                           server_default=sa.func.now(), nullable=False)

    __table_args__ = (
        sa.UniqueConstraint("user_id", "contact_id",
                            name="uq_user_contacts_pair"),
        sa.CheckConstraint("user_id <> contact_id",
                           name="ck_user_contacts_not_self"),
        sa.Index("ix_user_contacts_user_id", "user_id"),
        sa.Index("ix_user_contacts_contact_id", "contact_id"),
    )

# --- SAVED (закладки) ---


class SavedOrder(Base):
    __tablename__ = "saved_orders"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey(
        "users.id", ondelete="CASCADE"), index=True, nullable=False)
    order_id = Column(Integer, ForeignKey(
        "orders.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    __table_args__ = (
        UniqueConstraint("user_id", "order_id",
                         name="uq_saved_orders_user_order"),
    )


class SavedTransport(Base):
    __tablename__ = "saved_transports"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey(
        "users.id", ondelete="CASCADE"), index=True, nullable=False)
    transport_id = Column(UUID(as_uuid=True), ForeignKey(
        "transports.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    __table_args__ = (
        UniqueConstraint("user_id", "transport_id",
                         name="uq_saved_transports_user_transport"),
    )


class EmailVerification(Base):
    __tablename__ = "email_verifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                     unique=True, nullable=False)
    code_hash = Column(String(128), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    sent_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, nullable=False, server_default="0")
    user = relationship("User")


class PhoneVerification(Base):
    __tablename__ = "phone_verifications"
    id = Column(Integer, primary_key=True)
    phone = Column(String(32), unique=True, index=True, nullable=False)
    code_hash = Column(String(128), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    sent_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, nullable=False, server_default="0")
    verified_at = Column(DateTime, nullable=True)
