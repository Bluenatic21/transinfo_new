# -*- coding: utf-8 -*-
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SupportTicketCreate(BaseModel):
    subject: str = Field(..., min_length=3, max_length=200)
    category: Optional[str] = None
    priority: Optional[str] = "normal"
    message: Optional[str] = None  # первое сообщение пользователя (необязательно)


class SupportTicketOut(BaseModel):
    id: int
    subject: str
    category: Optional[str]
    priority: Optional[str]
    status: str
    user_id: int
    agent_user_id: Optional[int]
    chat_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime

    class Config:
        from_attributes = True


class SupportAssignRequest(BaseModel):
    agent_user_id: Optional[int] = None  # None -> самопривязка текущим SUPPORT


class SupportTicketUpdateStatus(BaseModel):
    status: str  # OPEN | PENDING | RESOLVED | CLOSED


class SupportRateRequest(BaseModel):
    score: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None
