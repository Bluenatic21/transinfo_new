# -*- coding: utf-8 -*-
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Index, text
import enum
from database import Base


class TicketStatus(enum.Enum):
    OPEN = "OPEN"
    PENDING = "PENDING"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    __table_args__ = (
        Index(
            "ux_support_open_user",
            "user_id",
            unique=True,
            postgresql_where=text("status IN ('OPEN','PENDING')")
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String, nullable=False)
    category = Column(String, nullable=True)
    priority = Column(String, nullable=True)
    status = Column(Enum(TicketStatus), nullable=False,
                    default=TicketStatus.OPEN)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    agent_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    chat_id = Column(Integer, ForeignKey("chat.id"), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False,
                        default=datetime.utcnow, onupdate=datetime.utcnow)
    last_message_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    # Старт «последней минуты» (обратный отсчёт). None — отсчёт не начат/сбит.
    countdown_started_at = Column(DateTime(timezone=True), nullable=True)


class SupportRating(Base):
    __tablename__ = "support_ratings"
    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey(
        "support_tickets.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"),
                     nullable=False, index=True)
    score = Column(Integer, nullable=False)  # 1..5
    comment = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
