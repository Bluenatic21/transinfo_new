"""Set default 10 for users.final_rating and backfill NULL/0 -> 10"""

from alembic import op
import sqlalchemy as sa
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '5dbc0ae38884'
down_revision: Union[str, Sequence[str], None] = '<REV_ID>'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Явно raw SQL — работает надёжно в Postgres
    op.execute("ALTER TABLE users ALTER COLUMN final_rating SET DEFAULT 10")
    # Обновим существующие записи: и NULL, и нули
    op.execute(
        "UPDATE users SET final_rating = 10 WHERE final_rating IS NULL OR final_rating = 0")


def downgrade() -> None:
    # Уберём дефолт; данные не трогаем
    op.execute("ALTER TABLE users ALTER COLUMN final_rating DROP DEFAULT")
