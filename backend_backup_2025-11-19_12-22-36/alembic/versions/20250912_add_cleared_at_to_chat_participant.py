"""add cleared_at to chat_participant

Revision ID: a25910cd9999
Revises: d7a99bc1d802
Create Date: 2025-09-12 14:20:00
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a25910cd9999'
down_revision = 'd7a99bc1d802'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'chat_participant',
        sa.Column('cleared_at', sa.TIMESTAMP(timezone=False), nullable=True)
    )


def downgrade():
    op.drop_column('chat_participant', 'cleared_at')
