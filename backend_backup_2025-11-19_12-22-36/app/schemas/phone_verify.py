from pydantic import BaseModel, Field


class SendPhoneCodeIn(BaseModel):
    phone: str = Field(..., pattern=r"^\+?\d{10,15}$")
    lang: str = Field("ru")


class VerifyPhoneCodeIn(BaseModel):
    phone: str
    code: str = Field(..., min_length=4, max_length=8)
