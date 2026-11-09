using FactoryOps.Domain.Enums;

namespace FactoryOps.Domain.Entities;

public class Equipment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid OrganizationId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string SerialNumber { get; set; } = string.Empty;

    public string? Manufacturer { get; set; }

    public string? Model { get; set; }

    public EquipmentStatus Status { get; set; } = EquipmentStatus.Operational;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public Organization Organization { get; set; } = null!;
}
