import 'package:flutter/material.dart';

class TransportsScreen extends StatelessWidget {
  const TransportsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    const backgroundColor = Color(0xFF020C1A);
    const cardColor = Color(0xFF06213A);

    // Пока используем мок-данные, чтобы просто видеть красивый список
    const items = _mockTransports;

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        backgroundColor: const Color(0xFF041322),
        title: const Text('Транспорт'),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: items.length,
        separatorBuilder: (context, index) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final t = items[index];
          return Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: cardColor,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Маршрут
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.local_shipping_outlined,
                      color: Colors.white,
                      size: 22,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${t.fromCity} → ${t.toCity}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${t.fromCountry} • ${t.toCountry}',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Основные параметры
                Wrap(
                  spacing: 12,
                  runSpacing: 6,
                  children: [
                    _InfoChip(
                      icon: Icons.scale_outlined,
                      label: '${t.weightTons} т',
                    ),
                    _InfoChip(
                      icon: Icons.calendar_month_outlined,
                      label: t.date,
                    ),
                    _InfoChip(icon: Icons.local_shipping, label: t.bodyType),
                    if (t.tempMode != null)
                      _InfoChip(
                        icon: Icons.ac_unit_outlined,
                        label: t.tempMode!,
                      ),
                  ],
                ),

                const SizedBox(height: 8),

                // Доп. инфо
                if (t.comment != null && t.comment!.isNotEmpty)
                  Text(
                    t.comment!,
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF041322),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white70),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(color: Colors.white70, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _TransportMock {
  const _TransportMock({
    required this.fromCity,
    required this.toCity,
    required this.fromCountry,
    required this.toCountry,
    required this.weightTons,
    required this.date,
    required this.bodyType,
    this.tempMode,
    this.comment,
  });

  final String fromCity;
  final String toCity;
  final String fromCountry;
  final String toCountry;
  final double weightTons;
  final String date;
  final String bodyType;
  final String? tempMode;
  final String? comment;
}

// Здесь просто примерные данные — позже заменим на реальные из API
const List<_TransportMock> _mockTransports = [
  _TransportMock(
    fromCity: 'Тбилиси',
    toCity: 'Батуми',
    fromCountry: 'Грузия',
    toCountry: 'Грузия',
    weightTons: 20,
    date: '10.12',
    bodyType: 'Рефрижератор',
    tempMode: '+5 / +7 °C',
    comment: 'Скоропортящиеся продукты, только европейская машина.',
  ),
  _TransportMock(
    fromCity: 'Минск',
    toCity: 'Тбилиси',
    fromCountry: 'Беларусь',
    toCountry: 'Грузия',
    weightTons: 22,
    date: '12.12',
    bodyType: 'Тент',
    comment: 'Нужна попутная загрузка, без перегрузок по пути.',
  ),
  _TransportMock(
    fromCity: 'Ростов-на-Дону',
    toCity: 'Тбилиси',
    fromCountry: 'Россия',
    toCountry: 'Грузия',
    weightTons: 21,
    date: '08.12',
    bodyType: 'Тент',
    comment: 'Косметическая химия в паллетах.',
  ),
];
