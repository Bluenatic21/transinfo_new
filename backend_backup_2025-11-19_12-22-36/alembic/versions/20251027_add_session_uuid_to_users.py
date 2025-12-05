"""add session_uuid and session_updated_at to users

Revision ID: a1b2c3d4e5f6
Revises: 6aedc824f047
Create Date: 2025-10-27
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'e0d7954f5526'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column(
        'session_uuid', sa.String(), nullable=True))
    op.add_column('users', sa.Column(
        'session_updated_at', sa.DateTime(), nullable=True))
    try:
        op.create_index('ix_users_session_uuid', 'users',
                        ['session_uuid'], unique=False)
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_index('ix_users_session_uuid', table_name='users')
    except Exception:
        pass
    op.drop_column('users', 'session_updated_at')
    op.drop_column('users', 'session_uuid')
