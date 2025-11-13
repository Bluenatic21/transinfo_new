"""add terms consent fields to users (no-op placeholder after 06c7038b2379)

Revision ID: f1971ad75bfe
Revises: 06c7038b2379
Create Date: 2025-09-17 20:02:41.573609
"""

from typing import Sequence, Union

# Alembic API
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = "f1971ad75bfe"
down_revision: Union[str, None] = "06c7038b2379"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    NO-OP.

    Эта ревизия служит для выравнивания веток миграций:
    все реальные изменения схемы (колонки согласия с условиями)
    уже добавлены предыдущей миграцией 06c7038b2379.
    """
    pass


def downgrade() -> None:
    """
    NO-OP.

    Откат реальных изменений выполняется предыдущей миграцией,
    поэтому здесь ничего не делаем.
    """
    pass
