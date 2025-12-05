"""merge heads: cleared_at + previous merge

Revision ID: bd5dd6682fd6
Revises: a25910cd9999, merge_20250912
Create Date: 2025-09-12 15:08:53.290027

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bd5dd6682fd6'
down_revision: Union[str, Sequence[str], None] = ('a25910cd9999', 'merge_20250912')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
