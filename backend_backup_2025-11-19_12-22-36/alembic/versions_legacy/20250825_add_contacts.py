"""contacts & contact_requests

Revision ID: 20250825_add_contacts
Revises: f2b1d3e2a7c1
Create Date: 2025-08-25 15:50:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20250825_add_contacts"
down_revision = "f2b1d3e2a7c1"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "contact_requests",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("sender_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("receiver_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),  # pending|accepted|declined
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("sender_id", "receiver_id", name="uq_contact_request"),
    )
    op.create_index("ix_contact_requests_receiver", "contact_requests", ["receiver_id"])

    op.create_table(
        "user_contacts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contact_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("user_id", "contact_id", name="uq_user_contact"),
    )
    op.create_index("ix_user_contacts_user", "user_contacts", ["user_id"])
    op.create_index("ix_user_contacts_contact", "user_contacts", ["contact_id"])

def downgrade():
    op.drop_index("ix_user_contacts_contact", table_name="user_contacts")
    op.drop_index("ix_user_contacts_user", table_name="user_contacts")
    op.drop_table("user_contacts")
    op.drop_index("ix_contact_requests_receiver", table_name="contact_requests")
    op.drop_table("contact_requests")
