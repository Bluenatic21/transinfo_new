class TransportItem {
  TransportItem({
    required this.id,
    this.fromLocation,
    this.toLocations = const [],
    this.transportKind,
    this.truckType,
    this.weight,
    this.volume,
    this.readyDateFrom,
    this.readyDateTo,
    this.mode,
    this.contactName,
    this.phone,
    this.comment,
    this.rateWithVat,
    this.currency,
    this.createdAt,
  });

  final String id;
  final String? fromLocation;
  final List<String> toLocations;
  final String? transportKind;
  final String? truckType;
  final double? weight;
  final double? volume;
  final String? readyDateFrom;
  final String? readyDateTo;
  final String? mode;
  final String? contactName;
  final String? phone;
  final String? comment;
  final String? rateWithVat;
  final String? currency;
  final DateTime? createdAt;

  String? get mainDestination => toLocations.isNotEmpty ? toLocations.first : null;

  factory TransportItem.fromJson(Map<String, dynamic> json) {
    final toLocationsRaw = json['to_locations'];
    final toLocations = <String>[];
    if (toLocationsRaw is List) {
      for (final item in toLocationsRaw) {
        if (item is Map<String, dynamic>) {
          final location = item['location']?.toString();
          if (location != null && location.isNotEmpty) {
            toLocations.add(location);
          }
        } else if (item != null) {
          final location = item.toString();
          if (location.isNotEmpty) {
            toLocations.add(location);
          }
        }
      }
    }

    return TransportItem(
      id: json['id']?.toString() ?? '',
      fromLocation: json['from_location']?.toString(),
      toLocations: toLocations,
      transportKind: json['transport_kind']?.toString(),
      truckType: json['truck_type']?.toString(),
      weight: (json['weight'] is num) ? (json['weight'] as num).toDouble() : null,
      volume: (json['volume'] is num) ? (json['volume'] as num).toDouble() : null,
      readyDateFrom: json['ready_date_from']?.toString(),
      readyDateTo: json['ready_date_to']?.toString(),
      mode: json['mode']?.toString(),
      contactName: json['contact_name']?.toString(),
      phone: json['phone']?.toString(),
      comment: json['comment']?.toString(),
      rateWithVat: json['rate_with_vat']?.toString(),
      currency: json['currency']?.toString(),
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString())
          : null,
    );
  }
}
