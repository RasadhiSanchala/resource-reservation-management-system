
export type ResourceView = {
    id: string;
    name: string;
    category: "ROOM" | "EQUIPMENT" | "OTHER";
    location: string;
    description: string | null;
    capacity: number | null;
    isActive: boolean;
};
