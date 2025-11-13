"""add match viewed tables

Revision ID: c84002d39f2f
Revises: 91e865a5e98d
Create Date: 2025-08-04 10:49:07.178814

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c84002d39f2f'
down_revision: Union[str, Sequence[str], None] = '91e865a5e98d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'order_match_views',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('user_id', sa.Integer, nullable=False),
        sa.Column('order_id', sa.Integer, nullable=False),
        sa.Column('last_viewed_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'order_id', name='_user_order_uc')
    )
    op.create_table(
        'transport_match_views',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('user_id', sa.Integer, nullable=False),
        sa.Column('transport_id', sa.String, nullable=False),
        sa.Column('last_viewed_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'transport_id', name='_user_transport_uc')
    )

def downgrade() -> None:
    op.drop_table('order_match_views')
    op.drop_table('transport_match_views')
