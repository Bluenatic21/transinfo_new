"""merge heads: stars10 + final_rating_default_10

Revision ID: d0a8eac79cf4
Revises: add_stars10_to_reviews, 5dbc0ae38884
Create Date: 2025-09-18 17:30:22.830280

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd0a8eac79cf4'
down_revision: Union[str, Sequence[str], None] = ('add_stars10_to_reviews', '5dbc0ae38884')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
