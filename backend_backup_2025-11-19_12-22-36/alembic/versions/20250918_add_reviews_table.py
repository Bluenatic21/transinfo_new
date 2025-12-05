"""add reviews table

Revision ID: add_reviews_table
Revises: f1971ad75bfe
Create Date: 2025-09-18
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "add_reviews_table"
down_revision = "f1971ad75bfe"
branch_labels = None
depends_on = None


def _ensure_indexes(bind, table_name: str, expected_indexes: dict[str, list[str]]) -> None:
    """Create missing indexes from expected_indexes{name -> columns} if they don't exist."""
    insp = sa.inspect(bind)
    if not insp.has_table(table_name):
        return
    existing = {ix["name"] for ix in insp.get_indexes(table_name)}
    for name, cols in expected_indexes.items():
        if name not in existing:
            op.create_index(name, table_name, cols)


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1) Создаём таблицу только если её ещё нет
    if not insp.has_table("reviews"):
        op.create_table(
            "reviews",
            sa.Column("id", sa.BigInteger,
                      primary_key=True, autoincrement=True),
            sa.Column(
                "target_user_id",
                sa.BigInteger,
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "author_user_id",
                sa.BigInteger,
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("punctuality", sa.SmallInteger, nullable=False),
            sa.Column("communication", sa.SmallInteger, nullable=False),
            sa.Column("professionalism", sa.SmallInteger, nullable=False),
            sa.Column("terms", sa.SmallInteger, nullable=False),
            sa.Column("comment", sa.Text, nullable=True),
            sa.Column("reported", sa.Boolean, nullable=False,
                      server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text("now()")),
        )

    # 2) Гарантируем, что индексы существуют (создадим недостающие)
    _ensure_indexes(
        bind,
        "reviews",
        {
            "ix_reviews_target_user": ["target_user_id"],
            "ix_reviews_author_user": ["author_user_id"],
            "ix_reviews_created_at": ["created_at"],
        },
    )


def downgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("reviews"):
        # Удаляем индексы, только если они существуют
        existing = {ix["name"] for ix in insp.get_indexes("reviews")}
        for name in ("ix_reviews_created_at", "ix_reviews_author_user", "ix_reviews_target_user"):
            if name in existing:
                op.drop_index(name, table_name="reviews")

        # И саму таблицу — только если есть
        op.drop_table("reviews")
