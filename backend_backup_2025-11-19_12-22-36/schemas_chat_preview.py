# schemas_chat_preview.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ChatPreviewOut(BaseModel):
    id: int
    is_group: Optional[bool] = False
    group_name: Optional[str] = None
    group_avatar: Optional[str] = None
    updated_at: Optional[datetime] = None
    last_message: Optional[str] = None   # <-- должна быть строкой!
    last_message_at: Optional[datetime] = None
