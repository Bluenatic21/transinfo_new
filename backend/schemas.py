from typing import Annotated, TypeAlias
from pydantic import Field, conint
from typing import TYPE_CHECKING
from pydantic import BaseModel, EmailStr, Field
try:
    # pydantic v2
    from pydantic import ConfigDict
except ImportError:
    ConfigDict = None
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
import enum
from enum import Enum
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid


class NotificationType(str, enum.Enum):
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
    ORDER_REMOVED = "ORDER_REMOVED"
    AUTO_MATCH = "AUTO_MATCH"

    CONTACT_REQUEST = "CONTACT_REQUEST"
    CONTACT_ACCEPTED = "CONTACT_ACCEPTED"
    CONTACT_DECLINED = "CONTACT_DECLINED"
    REVIEW_RECEIVED = "REVIEW_RECEIVED"


class NotificationOut(BaseModel):
    id: int
    type: NotificationType
    message: str
    related_id: Optional[str]
    payload: Optional[Dict[str, Any]]
    created_at: datetime
    read: bool

    class Config:
        from_attributes = True

# --- USERS ---


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(
        min_length=8, description="Новый пароль (не короче 8 символов)")


# === Верификация e-mail ===
class EmailVerifyRequest(BaseModel):
    email: EmailStr
    code: str  # 6 цифр


class EmailResendRequest(BaseModel):
    email: EmailStr


class UserRole(str, enum.Enum):
    TRANSPORT = "TRANSPORT"
    OWNER = "OWNER"
    MANAGER = "MANAGER"
    EMPLOYEE = "EMPLOYEE"
    SUPPORT = "SUPPORT"
    ADMIN = "ADMIN"

# Базовая схема пользователя (чтобы не дублировать)


class AttachmentItem(BaseModel):
    name: Optional[str] = ""
    file_type: Optional[str] = ""
    file_url: Optional[str] = ""

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    email: EmailStr
    role: UserRole

# --- Регистрация пользователя: отдельная схема ---


class UserRegister(UserBase):
    password: str
    accepted_terms: bool
    terms_version: Optional[str] = None
    # делаем обязательными непустыми строками (min_length=1)
    organization: str = Field(min_length=1)
    country:      str = Field(min_length=1)
    city:         str = Field(min_length=1)
    contact_person: str = Field(min_length=1)
    phone:        str = Field(min_length=1)
    # person_type обязателен ТОЛЬКО для TRANSPORT/OWNER — проверяем в auth.register
    person_type: Optional[str] = ""  # "ЮЛ", "ИП", "ФЛ" или ""
    fleet: Optional[str] = ""
    whatsapp: Optional[str] = ""
    viber: Optional[str] = ""
    telegram: Optional[str] = ""

# === НОВОЕ ===
# Регистрация сотрудника: те же поля, что и у обычного пользователя,
# но БЕЗ role и БЕЗ organization (она берётся от менеджера).


class EmployeeRegister(BaseModel):
    email: EmailStr
    password: str
    country: Optional[str] = ""
    city: Optional[str] = ""
    contact_person: Optional[str] = ""
    phone: Optional[str] = ""
    person_type: Optional[str] = ""
    fleet: Optional[str] = ""
    whatsapp: Optional[str] = ""
    viber: Optional[str] = ""
    telegram: Optional[str] = ""

    class Config:
        from_attributes = True

# Публичный профиль пользователя (API, фронт, личный кабинет)


class UserProfile(UserBase):
    id: int
    organization: Optional[str] = ""
    country: Optional[str] = ""
    city: Optional[str] = ""
    contact_person: Optional[str] = ""
    phone: Optional[str] = ""
    whatsapp: Optional[str] = ""
    viber: Optional[str] = ""
    telegram: Optional[str] = ""
    person_type: Optional[str] = ""
    fleet: Optional[str] = ""
    is_active: bool = True
    is_verified: bool = False
    email_verified: bool = False
    phone_verified: bool = False
    docs_verified: bool = False
    avatar: Optional[str] = None
    created_at: datetime
    # для расширения профиля по ролям
    profile_data: Optional[Dict[str, Any]] = None
    docs_files: Optional[list] = None
    final_rating: float = 10.0

    verification_status: Optional[str] = None

    class Config:
        from_attributes = True

# Для обновления профиля


class UserUpdate(BaseModel):
    organization: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    viber: Optional[str] = None
    telegram: Optional[str] = None
    person_type: Optional[str] = None
    fleet: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar: Optional[str] = None
    profile_data: Optional[Dict[str, Any]] = None
    docs_files: Optional[list] = None

    verification_status: Optional[str] = None

    class Config:
        from_attributes = True

# Вывод краткой информации (например, для списков)


class UserOut(BaseModel):
    id: int
    email: Optional[str] = None
    role: UserRole
    final_rating: float = 10.0
    organization: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    avatar: Optional[str] = None

    class Config:
        from_attributes = True

# JWT токен (login response)


class Token(BaseModel):
    access_token: str
    token_type: str

# --- ChatFile ---


class ChatFileBase(BaseModel):
    filename: str
    file_type: str
    file_url: str


class ChatFileOut(ChatFileBase):
    id: int
    uploader_id: int
    uploaded_at: datetime

    class Config:
        from_attributes = True

# --- ChatMessage ---


class ChatMessageBase(BaseModel):
    content: Optional[str] = None
    message_type: Optional[str] = None
    file_id: Optional[int] = None
    order_id: Optional[int] = None
    transport_id: Optional[uuid.UUID] = None
    client_id: Optional[str] = None      # 👈 добавили


class ChatMessageCreate(ChatMessageBase):
    pass


class ChatMessageOut(ChatMessageBase):
    id: int
    sender_id: int
    sent_at: datetime
    file: Optional[ChatFileOut] = None
    reactions: List['ChatMessageReactionOut'] = Field(
        default_factory=list)  # Правильное дефолтное значение

    class Config:
        from_attributes = True

# --- ChatMessageReaction ---


# --- ChatMessageReaction ---


class ChatMessageReactionBase(BaseModel):
    reaction: str  # emoji или название реакции


class ChatMessageReactionIn(BaseModel):  # <----- ДОБАВИТЬ ЭТО!
    reaction: str


class ChatMessageReactionCreate(ChatMessageReactionBase):
    pass


class ChatMessageReactionOut(ChatMessageReactionBase):
    id: int
    message_id: int
    user_id: int
    created_at: datetime
    # user: Optional[UserShort] = None  # Можно добавить, если надо имя пользователя

    class Config:
        from_attributes = True
# --- ChatParticipant ---


# --- Saved / bookmarks ---
class SavedToggleResponse(BaseModel):
    saved: bool


class ChatGroupRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class ChatParticipantBase(BaseModel):
    user_id: int
    role: Optional[ChatGroupRole] = None


class UserShort(BaseModel):
    id: int
    email: Optional[str] = None
    organization: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None

    class Config:
        from_attributes = True


class ChatParticipantOut(ChatParticipantBase):
    id: int
    joined_at: Optional[datetime] = None  # <-- было: datetime
    user: Optional[UserShort] = None

    class Config:
        from_attributes = True

# --- Chat ---


class ChatBase(BaseModel):
    order_id: Optional[int] = None
    transport_id: Optional[uuid.UUID] = None
    is_group: Optional[bool] = False
    group_name: Optional[str] = None
    group_avatar: Optional[str] = None
    owner_id: Optional[int] = None


class ChatOut(ChatBase):
    id: int
    created_at: datetime
    participants: List[ChatParticipantOut] = Field(default_factory=list)
    messages: List[ChatMessageOut] = Field(default_factory=list)
    files: List[ChatFileOut] = Field(default_factory=list)

    class Config:
        from_attributes = True

# --- ORDER ---


class CargoItem(BaseModel):
    name: str
    tons: str
    volume: Optional[str] = ""
    packaging: Optional[str] = ""
    pieces: Optional[str] = ""
    length: Optional[str] = ""
    width: Optional[str] = ""
    height: Optional[str] = ""
    diameter: Optional[str] = ""
    description: Optional[str] = ""


class OrderBase(BaseModel):
    requested_rate_options: List[str] = Field(default_factory=list)
    is_active: Optional[bool] = True
    title: str
    description: Optional[str] = ""
    cargo_items: List[CargoItem] = Field(default_factory=list)
    from_locations: List[str] = Field(default_factory=list)
    truck_quantity: Optional[int] = 1
    to_locations: List[str] = Field(default_factory=list)
    from_locations_coords: List[dict] = Field(default_factory=list)
    to_locations_coords: List[dict] = Field(default_factory=list)
    # === NEW: нормализованные id мест (для локализованного рендера) ===
    from_place_ids: List[int] = Field(default_factory=list)
    to_place_ids:   List[int] = Field(default_factory=list)
    loading_types: List[str] = Field(default_factory=list)
    routes: List[str] = Field(default_factory=list)
    attachments: List[AttachmentItem] = Field(default_factory=list)
    gps_monitoring: Optional[bool] = False
    truck_type: Optional[str] = ""
    transport_type: Optional[str] = ""
    load_date: str
    unload_date: Optional[str] = ""
    has_customs: Optional[bool] = False
    customs_info: Optional[str] = ""
    adr: Optional[bool] = False
    adr_class: Optional[str] = ""
    temp_mode: Optional[bool] = False
    temp_from: Optional[str] = ""
    temp_to: Optional[str] = ""
    rate_type: Optional[str] = ""
    rate_with_vat: Optional[str] = ""
    rate_no_vat: Optional[str] = ""
    rate_cash: Optional[str] = ""
    rate_currency: Optional[str] = ""
    rate_to_card: Optional[bool] = False
    payment_scenario: Optional[str] = ""
    payment_days: Optional[str] = ""
    prepay_amount: Optional[str] = ""
    postpay_days: Optional[str] = ""
    payment_comment: Optional[str] = ""
    comment: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    price: Optional[str] = ""
    username: Optional[str] = ""


class OrderCreate(OrderBase):
    pass


class Order(OrderBase):
    id: int
    created_at: datetime
    owner_id: Optional[int]
    views: int = 0

    class Config:
        from_attributes = True


class OrderOut(Order):
    matchesCount: int = 0  # или Optional[int]
    isMine: bool = False
    owner_name: Optional[str] = ""
    is_new: bool = False

    class Config:
        from_attributes = True

# --- TRANSPORT ---


class TransportBase(BaseModel):
    is_active: Optional[bool] = True
    transport_kind: Optional[str] = None
    truck_type: Optional[str] = None
    body_length: Optional[str] = None
    body_width: Optional[str] = None
    body_height: Optional[str] = None
    trailer_length: Optional[str] = None
    trailer_width: Optional[str] = None
    trailer_height: Optional[str] = None
    load_types: List[str] = Field(default_factory=list)
    weight: Optional[float] = None
    volume: Optional[float] = None
    adr: Optional[bool] = False
    adr_class: Optional[List[str]] = None
    gps_monitor: Optional[bool] = False
    special: List[str] = Field(default_factory=list)
    from_location: Optional[str] = None
    from_location_coords: Optional[dict] = None
    # === NEW: нормализованный id исходного места ===
    from_place_id: Optional[int] = None
    from_radius: Optional[str] = None
    to_locations: List[dict] = Field(default_factory=list)
    # === NEW: нормализованные id направлений ===
    to_place_ids: List[int] = Field(default_factory=list)
    from_location_lat: Optional[float] = None
    from_location_lng: Optional[float] = None
    ready_date_from: Optional[str] = None
    ready_date_to: Optional[str] = None
    mode: Optional[str] = None
    regularity: Optional[str] = None
    rate_type: Optional[str] = None
    rate_with_vat: Optional[str] = None
    rate_without_vat: Optional[str] = None
    rate_cash: Optional[str] = None
    bargain: Optional[str] = None
    currency: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    comment: Optional[str] = None
    attachments: List[AttachmentItem] = Field(default_factory=list)


class RatingOut(BaseModel):
    id: int
    user_id: int
    author_id: int
    punctuality: int
    communication: int
    professionalism: int
    reliability: int
    comment: Optional[str]
    created_at: datetime

    if ConfigDict:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            from_attributes = True


# Типовые алиасы совместимые с Pydantic v2 (и без «жёлтой» подсветки в IDE):
Score: TypeAlias = Annotated[int, Field(ge=0, le=10)]      # 0..10 (legacy)
Stars10: TypeAlias = Annotated[int, Field(ge=1, le=10)]    # 1..10 (основная)


class ReviewCreate(BaseModel):
    target_user_id: int
    stars10: Stars10
    comment: Optional[str] = Field(default=None, max_length=1000)


class ReviewOut(BaseModel):
    id: int
    author_user_id: int
    target_user_id: int
    stars10: Optional[int] = None
    punctuality: Optional[int] = None
    communication: Optional[int] = None
    professionalism: Optional[int] = None
    terms: Optional[int] = None
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class UserRatingOut(BaseModel):
    final_rating: float
    count_reviews: int


class TransportCreate(TransportBase):
    pass


class Transport(TransportBase):
    id: uuid.UUID
    created_at: datetime
    owner_id: Optional[int]
    matchesCount: Optional[int] = 0
    isMine: bool = False
    owner_name: Optional[str] = ""
    is_new: bool = False
    views: int = 0

    class Config:
        from_attributes = True


class RatingBase(BaseModel):
    user_id: int
    deal_id: Optional[int]
    punctuality: int
    communication: int
    professionalism: int
    reliability: int
    comment: Optional[str] = None


class RatingCreate(RatingBase):
    pass


class Rating(RatingBase):
    id: int
    author_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class BidBase(BaseModel):
    amount: str
    currency: Optional[str] = None
    comment: Optional[str] = None


class BidCreate(BidBase):
    pass


class OrderShort(BaseModel):
    id: int
    title: str
    from_locations: List[str] = []
    to_locations: List[str] = []
    # === NEW: добавим и в короткую схему, т.к. она приходит в BidOut ===
    from_place_ids: List[int] = []
    to_place_ids:   List[int] = []
    cargo_items: List[CargoItem] = []
    load_date: str
    price: Optional[str] = ""
    created_at: datetime
    owner_company: Optional[str] = ""
    owner_name: Optional[str] = ""
    owner_lastname: Optional[str] = ""

    class Config:
        from_attributes = True


class BidOut(BidBase):
    id: int
    order_id: int
    user_id: int
    status: str
    created_at: datetime
    user_name: Optional[str] = ""
    order: Optional[OrderShort] = None  # теперь все ок!

    class Config:
        from_attributes = True


class OrderCommentBase(BaseModel):
    content: str


class OrderCommentCreate(OrderCommentBase):
    pass


class OrderCommentOut(OrderCommentBase):
    id: int
    user_id: int
    order_id: int
    created_at: datetime
    username: Optional[str] = None
    avatar: Optional[str] = None
    contact_person: Optional[str] = None

    class Config:
        from_attributes = True


# ===== Internal comments (видны только в аккаунте менеджера) =====
class InternalCommentBase(BaseModel):
    content: str


class InternalCommentCreate(InternalCommentBase):
    order_id: Optional[int] = None
    transport_id: Optional[uuid.UUID] = None


class InternalCommentOut(InternalCommentBase):
    id: int
    manager_id: int
    author_id: int
    order_id: Optional[int] = None
    transport_id: Optional[uuid.UUID] = None
    created_at: datetime
    author_name: Optional[str] = None
    author_avatar: Optional[str] = None

    class Config:
        from_attributes = True


if TYPE_CHECKING:
    ChatMessageOut.update_forward_refs()

    # === GPS Tracking Schemas ===


class TrackingSessionCreate(BaseModel):
    order_id: Optional[int] = None
    transport_id: Optional[uuid.UUID] = None  # UUID string
    visibility: Optional[str] = "private"  # "private" | "link"


class TrackingSessionOut(BaseModel):
    id: uuid.UUID
    order_id: Optional[int]
    transport_id: Optional[uuid.UUID]
    visibility: str
    share_token: Optional[str]
    is_active: bool
    started_at: datetime
    ended_at: Optional[datetime] = None
    last_point_at: Optional[datetime] = None
    # ORM serialization (v2 + fallback для v1)
    if ConfigDict:
        model_config = ConfigDict(from_attributes=True)
    else:
        if ConfigDict:
            model_config = ConfigDict(from_attributes=True)
        else:
            class Config:
                from_attributes = True


class TrackingPointIn(BaseModel):
    lat: float
    lng: float
    ts: Optional[datetime] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    accuracy: Optional[float] = None
    battery: Optional[float] = None


class TrackingPointOut(TrackingPointIn):
    ts: datetime

# === GPS Tracking Share Schemas ===


class TrackingShareCreate(BaseModel):
    recipient_ids: List[int]


class TrackingShareOut(BaseModel):
    id: int
    session_id: uuid.UUID
    recipient_user_id: int
    active: bool
    created_at: datetime


class CreateShareLinkIn(BaseModel):
    expires_in_hours: Optional[int] = 24 * 7


class TrackingShareLinkOut(BaseModel):
    token: str
    url: str
    expires_at: Optional[datetime] = None
    revoked: bool


class TrackingShareRecipientOut(BaseModel):
    user_id: int
    user_name: Optional[str] = None
    created_at: datetime


class IncomingShareItem(BaseModel):
    session: TrackingSessionOut
    from_user_id: int
    from_user_name: Optional[str]
    transport_id: Optional[uuid.UUID] = None
    order_id: Optional[int] = None
    last_point_at: Optional[datetime] = None


class OutgoingShareItem(BaseModel):
    session: TrackingSessionOut
    to_user_id: int
    to_user_name: Optional[str]
    transport_id: Optional[uuid.UUID] = None
    order_id: Optional[int] = None
    last_point_at: Optional[datetime] = None


# === Tracking Requests Schemas ===
class TrackingRequestCreate(BaseModel):
    order_id: Optional[int] = None
    target_ids: List[int]
    message: Optional[str] = None


class TrackingRequestRespond(BaseModel):
    accept: bool


class TrackingRequestOut(BaseModel):
    id: int
    order_id: Optional[int] = None
    requester_user_id: int
    target_user_id: int
    status: str
    message: Optional[str] = None
    session_id: Optional[uuid.UUID] = None
    created_at: datetime
    responded_at: Optional[datetime] = None

    if ConfigDict:
        model_config = ConfigDict(from_attributes=True)
    else:
        if ConfigDict:
            model_config = ConfigDict(from_attributes=True)
        else:
            class Config:
                from_attributes = True


class IncomingRequestItem(BaseModel):
    request: TrackingRequestOut
    from_user_name: Optional[str] = None
    from_user_id: Optional[int] = None


class OutgoingRequestItem(BaseModel):
    request: TrackingRequestOut
    to_user_name: Optional[str] = None
