import 'package:flutter/material.dart';

class ServiceScreen extends StatelessWidget {
  const ServiceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    const backgroundColor = Color(0xFF020C1A);
    const cardColor = Color(0xFF06213A);

    final items = _serviceItems;

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        backgroundColor: const Color(0xFF041322),
        title: const Text('О сервисе'),
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: items.length,
        itemBuilder: (context, index) {
          final item = items[index];
          return Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Container(
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(16),
                    ),
                    child: Image.asset(
                      item.assetPath,
                      height: 180,
                      width: double.infinity,
                      fit: BoxFit.cover,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${item.emoji} ${item.title}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          item.description,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 13,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ServiceItem {
  const _ServiceItem({
    required this.title,
    required this.description,
    required this.emoji,
    required this.assetPath,
  });

  final String title;
  final String description;
  final String emoji;
  final String assetPath;
}

// здесь нужно, чтобы assetPath совпадал с именами файлов в assets/service/
const List<_ServiceItem> _serviceItems = [
  _ServiceItem(
    emoji: '📍',
    title: 'Умная карта и геоаналитика',
    description:
        'Мы используем кластеризацию и интеллектуальные подсказки на карте: '
        'группировка заявок по регионам, выделение оптимальных маршрутов, фильтр по радиусу '
        'и ключевым точкам. Это помогает видеть картину целиком и быстро находить наиболее '
        'подходящие варианты.',
    assetPath: 'assets/service/service_6.png',
  ),
  _ServiceItem(
    emoji: '🔔',
    title: 'Автоматические уведомления о новых предложениях',
    description:
        'Вам не нужно часами сидеть в поиске. Как только появляется груз или транспорт, '
        'соответствующий вашим критериям, система сразу уведомляет вас.',
    assetPath: 'assets/service/service_1.png',
  ),
  _ServiceItem(
    emoji: '🛡',
    title: 'Безопасность и контроль сделок',
    description:
        'Мы исключаем “серые” схемы: валидация пользователей, фиксация всех этапов сделки, '
        'защита файлов и переписок. Это делает платформу надёжным инструментом для бизнеса.',
    assetPath: 'assets/service/service_4.png',
  ),
  _ServiceItem(
    emoji: '👥',
    title: 'Многоуровневая система ролей',
    description:
        'В одной учётной записи можно управлять разными ролями: грузовладелец, перевозчик '
        'или экспедитор. Это удобно для компаний, где несколько сотрудников работают в одной '
        'системе с разными правами доступа.',
    assetPath: 'assets/service/service_3.png',
  ),
  _ServiceItem(
    emoji: '🎯',
    title: 'Интеллектуальная система подбора',
    description:
        'Наша платформа автоматически сопоставляет грузы и транспорт по маршруту, дате, '
        'типу кузова, радиусу поиска и даже текущей геолокации. Вы получаете только '
        'релевантные предложения — без ручной фильтрации.',
    assetPath: 'assets/service/service_7.png',
  ),
  _ServiceItem(
    emoji: '⚡',
    title: 'Работа в реальном времени',
    description:
        'Все обновления происходят мгновенно: новые заявки, изменения маршрутов, статус доставки '
        'или сообщения в чате. Платформа синхронизирует данные между пользователями без задержек.',
    assetPath: 'assets/service/service_2.png',
  ),
  _ServiceItem(
    emoji: '🌍',
    title: 'Гибкость и масштабируемость',
    description:
        'TransInfo одинаково хорошо работает для локальных перевозок и международной логистики. '
        'Система готова к росту: чем больше заявок и транспорта, тем эффективнее работает механизм '
        'интеллектуального подбора.',
    assetPath: 'assets/service/service_5.png',
  ),
];
