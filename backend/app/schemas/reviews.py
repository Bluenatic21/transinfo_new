from pydantic import BaseModel, Field
from typing import Optional, Annotated, TypeAlias
from datetime import datetime

# Для дружбы с Pylance/Pydantic v2: статический алиас вместо conint(...)
Score: TypeAlias = Annotated[int, Field(ge=0, le=10)]


class ReviewCreate(BaseModel):
    target_user_id: int
    punctuality: Score
    communication: Score
    professionalism: Score
    terms: Score
    comment: Optional[str] = Field(default=None, max_length=1000)


class ReviewOut(BaseModel):
    id: int
    author_user_id: int
    target_user_id: int
    punctuality: int
    communication: int
    professionalism: int
    terms: int
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class UserRatingOut(BaseModel):
    final_rating: float
    count_reviews: int
