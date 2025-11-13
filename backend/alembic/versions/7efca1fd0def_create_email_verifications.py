from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "7efca1fd0def"
down_revision = "6aedc824f047"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # Ð•ÑÐ»Ð¸ Ñ‚Ð°Ð±Ð»Ð¸Ñ†Ð° ÑƒÐ¶Ðµ ÐµÑÑ‚ÑŒ â€” Ð¿Ñ€Ð¾Ð¿ÑƒÑÐºÐ°ÐµÐ¼ ÑÐ¾Ð·Ð´Ð°Ð½Ð¸Ðµ
    if "email_verifications" in insp.get_table_names():
        return

    op.create_table(
        "email_verifications",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("code_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(),
                  server_default="0", nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id"),
    )


def downgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # Ð£Ð´Ð°Ð»ÑÐµÐ¼ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ ÐµÑÐ»Ð¸ Ñ‚Ð°Ð±Ð»Ð¸Ñ†Ð° ÐµÑÑ‚ÑŒ
    if "email_verifications" in insp.get_table_names():
        op.drop_table("email_verifications")
