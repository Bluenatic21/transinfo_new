"""add contact notification types

Revision ID: 20250825_add_contact_notif_types
Revises: 20250825_add_contacts
Create Date: 2025-08-25 18:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20250825_add_contact_notif_types"
down_revision = "20250825_add_contacts"
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    for val in ("CONTACT_REQUEST","CONTACT_ACCEPTED","CONTACT_DECLINED"):
        conn.execute(sa.text("""
        DO $$ BEGIN
            IF NOT EXISTS (
               SELECT 1 FROM pg_type t
               JOIN pg_enum e ON t.oid = e.enumtypid
               WHERE t.typname = 'notificationtype' AND e.enumlabel = :v
            ) THEN
               ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS :v;
            END IF;
        END $$;
        """).bindparams(v=val))

def downgrade():
    # Enum значения назад не удаляем — это нормальная практика для PG enum.
    pass
