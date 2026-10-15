export type ReservationView = {
  id: string;
  resourceId: string;
  requesterName: string;
  team: string | null;
  purpose: string | null;
  attendeeCount: number | null;
  startAt: string;
  endAt: string;
  status: "CONFIRMED" | "CANCELLED";
  createdAt: string;
  cancelledAt: string | null;
  resource: {
    id: string;
    name: string;
    location: string;
    category: "ROOM" | "EQUIPMENT" | "OTHER";
    capacity: number | null;
    isActive: boolean;
  };
};
