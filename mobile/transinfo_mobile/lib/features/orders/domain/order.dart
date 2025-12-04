class Order {
  Order({
    required this.id,
    required this.title,
    required this.fromLocations,
    required this.toLocations,
    required this.loadDate,
    required this.truckType,
    required this.price,
    required this.createdAt,
    required this.views,
  });

  factory Order.fromJson(Map<String, dynamic> json) {
    return Order(
      id: json['id'] as int,
      title: (json['title'] as String?) ?? '',
      fromLocations: List<String>.from(json['from_locations'] as List? ?? <String>[]),
      toLocations: List<String>.from(json['to_locations'] as List? ?? <String>[]),
      loadDate: (json['load_date'] as String?) ?? '',
      truckType: (json['truck_type'] as String?) ?? '',
      price: (json['price'] as String?) ?? '',
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? '') ?? DateTime.now(),
      views: (json['views'] as int?) ?? 0,
    );
  }

  final int id;
  final String title;
  final List<String> fromLocations;
  final List<String> toLocations;
  final String loadDate;
  final String truckType;
  final String price;
  final DateTime createdAt;
  final int views;
}
