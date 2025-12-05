def sanitize_order_for_public(o: dict) -> dict:
    """
    Вернуть только публичные поля заказа. Ничего лишнего: контакты, цены,
    комментарии, файлы, телефоны, личные id — убрать.
    Подгони список полей под то, что у тебя уже отдаёт /public/orders_map
    """
    allowed = {
        "id",
        "from_place_ids", "to_place_ids",
        "from_locations_coords", "to_locations_coords",
        "date_from", "date_to",
        "body_type", "loading_types",
        "weight", "volume",
        "country_from", "country_to",
        # добавь сюда любые безопасные поля, которые уже видят гости
    }
    return {k: v for k, v in (o or {}).items() if k in allowed}
