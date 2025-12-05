import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

class HomeMapCard extends StatelessWidget {
  const HomeMapCard({super.key});

  @override
  Widget build(BuildContext context) {
    const cardColor = Color(0xFF06213A);

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Верхняя строка: "Развернуть карту" + легенда
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              TextButton.icon(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const FullMapScreen(),
                    ),
                  );
                },
                icon: const Icon(Icons.open_in_full, color: Colors.white),
                label: const Text(
                  'Развернуть карту',
                  style: TextStyle(color: Colors.white),
                ),
              ),
              Row(
                children: const [
                  _LegendDot(color: Color(0xFF0091FF), label: 'Транспорт'),
                  SizedBox(width: 8),
                  _LegendDot(color: Color(0xFFFFC107), label: 'Груз'),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Сама карта
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              height: 220,
              width: double.infinity,
              child: FlutterMap(
                options: const MapOptions(
                  initialCenter: LatLng(41.7151, 44.8271), // Тбилиси
                  initialZoom: 3.5,
                ),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'ge.transinfo.mobile',
                  ),
                  MarkerLayer(markers: _demoMarkers),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// Полноэкранная карта по кнопке "Развернуть карту"
class FullMapScreen extends StatelessWidget {
  const FullMapScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020C1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF041322),
        title: const Text('Карта'),
      ),
      body: FlutterMap(
        options: const MapOptions(
          initialCenter: LatLng(41.7151, 44.8271),
          initialZoom: 4,
        ),
        children: [
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'ge.transinfo.mobile',
          ),
          MarkerLayer(markers: _demoMarkers),
        ],
      ),
    );
  }
}

// Примеры маркеров (пока просто демо, потом подцепим API бекенда)
final List<Marker> _demoMarkers = [
  Marker(
    point: const LatLng(41.7151, 44.8271), // Тбилиси
    width: 40,
    height: 40,
    child: _MapMarker(color: Color(0xFF0091FF), icon: Icons.local_shipping),
  ),
  Marker(
    point: const LatLng(55.7558, 37.6173), // Москва
    width: 40,
    height: 40,
    child: _MapMarker(color: Color(0xFFFFC107), icon: Icons.inventory_2),
  ),
  Marker(
    point: const LatLng(50.4501, 30.5234), // Киев
    width: 40,
    height: 40,
    child: _MapMarker(color: Color(0xFF0091FF), icon: Icons.local_shipping),
  ),
];

class _MapMarker extends StatelessWidget {
  const _MapMarker({required this.color, required this.icon});

  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        boxShadow: const [
          BoxShadow(color: Colors.black54, blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      child: Icon(icon, color: Colors.white, size: 20),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(color: Colors.white70, fontSize: 11),
        ),
      ],
    );
  }
}
