
import { Suspense } from "react";
import { connection } from "next/server";

import { ResourceManagement } from "@/features/resources/components/resource-management";
import { listResources } from "@/features/resources/services/resource.service";
import type { ResourceView } from "@/features/resources/types/resource-view.type";

// Load fresh resource data from PostgreSQL.
async function ResourcesContent() {
    // Ensure database queries execute at request time.
    await connection();

    const dbResources = await listResources();

    const resources: ResourceView[] = dbResources.map((resource) => ({
        id: resource.id,
        name: resource.name,
        category: resource.category,
        location: resource.location,
        description: resource.description,
        capacity: resource.capacity,
        isActive: resource.isActive,
    }));

    return <ResourceManagement resources={resources} />;
}

// Resource Management page with a loading fallback.
export default function ResourcesPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-slate-50 p-10 text-slate-900">
                    <p>Loading resources...</p>
                </main>
            }
        >
            <ResourcesContent />
        </Suspense>
    );
}
