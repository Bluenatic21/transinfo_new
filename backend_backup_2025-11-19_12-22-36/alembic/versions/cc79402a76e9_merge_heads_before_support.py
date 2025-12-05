"""merge heads before support

Revision ID: cc79402a76e9
Revises: 20250825_add_contact_notif_types, e4159bd5260f
Create Date: 2025-09-02 15:42:21.319191

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cc79402a76e9'
down_revision: Union[str, Sequence[str], None] = ('20250825_add_contact_notif_types', 'e4159bd5260f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
