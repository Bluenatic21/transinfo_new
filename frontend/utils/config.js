ORDER_FIELDS = [
    { "name": "cargo_type", "label": "Тип груза", "type": "select", "required": True },
    { "name": "weight", "label": "Вес (кг)", "type": "number", "required": True },
    { "name": "volume", "label": "Объем (м3)", "type": "number", "required": False },
    { "name": "from_city", "label": "Город отправления", "type": "text", "required": True },
    { "name": "to_city", "label": "Город назначения", "type": "text", "required": True },
    { "name": "date_from", "label": "Дата погрузки", "type": "date", "required": True },
    { "name": "date_to", "label": "Дата доставки", "type": "date", "required": False },
    { "name": "contact", "label": "Контактное лицо", "type": "text", "required": True },
    { "name": "phone", "label": "Телефон", "type": "text", "required": True },
    # ...добавлять новые поля просто сюда
]
