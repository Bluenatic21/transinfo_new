"""set default 10.0 for users.final_rating and backfill NULLs"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# ЗАМЕНИТЕ на фактический ID, который сгенерировал Alembic
revision: str = "<REV_ID>"
down_revision: Union[str, None] = "f1971ad75bfe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Ставим дефолт 10.0 на users.final_rating
    op.alter_column("users", "final_rating", server_default=sa.text("10.0"))

    # 2) Один раз проставляем 10.0 там, где NULL (существующие записи)
    op.execute("UPDATE users SET final_rating = 10.0 WHERE final_rating IS NULL")


def downgrade() -> None:
    # Снимаем дефолт
    op.alter_column("users", "final_rating", server_default=None)
