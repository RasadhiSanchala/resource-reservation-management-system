"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
    createResourceAction,
    updateResourceAction,
    setResourceStatusAction,
} from "../actions/resource.actions";
import type { ResourceView } from "../types/resource-view.type";

type Props = {
    resources: ResourceView[];
};

type Category = ResourceView["category"];

type Feedback = {
    success: boolean;
    message: string;
};

const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

export function ResourceManagement({ resources }: Props) {
    const router = useRouter();

    const [name, setName] = useState("");
    const [category, setCategory] = useState<Category>("ROOM");
    const [location, setLocation] = useState("");
    const [capacity, setCapacity] = useState("");
    const [description, setDescription] = useState("");

    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
    const [statusFeedback, setStatusFeedback] = useState<Feedback | null>(null);

    const isBusy = isSaving || statusPendingId !== null;
    const activeCount = resources.filter((resource) => resource.isActive).length;
    const inactiveCount = resources.length - activeCount;

    function resetForm() {
        setName("");
        setCategory("ROOM");
        setLocation("");
        setCapacity("");
        setDescription("");
        setEditingId(null);
    }

    function startEditing(resource: ResourceView) {
        if (isBusy) return;

        setEditingId(resource.id);
        setName(resource.name);
        setCategory(resource.category);
        setLocation(resource.location);
        setCapacity(resource.capacity?.toString() ?? "");
        setDescription(resource.description ?? "");
        setFeedback(null);

        document.getElementById("resource-form-section")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    }

    function cancelEditing() {
        if (isBusy) return;
        resetForm();
        setFeedback(null);
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (isBusy) return;

        setIsSaving(true);
        setFeedback(null);

        try {
            const input = { name, category, location, capacity, description };
            const result = editingId
                ? await updateResourceAction(editingId, input)
                : await createResourceAction(input);

            setFeedback(result);

            if (result.success) {
                resetForm();
                router.refresh();
            }
        } catch {
            setFeedback({
                success: false,
                message: "An unexpected error occurred. Please try again.",
            });
        } finally {
            setIsSaving(false);
        }
    }

    async function handleToggleStatus(resource: ResourceView) {
        if (isBusy) return;

        const newStatus = !resource.isActive;
        const action = newStatus ? "activate" : "deactivate";
        const confirmed = window.confirm(
            `Are you sure you want to ${action} "${resource.name}"?`,
        );

        if (!confirmed) return;

        setStatusPendingId(resource.id);
        setStatusFeedback(null);

        try {
            const result = await setResourceStatusAction(resource.id, newStatus);
            setStatusFeedback(result);

            if (result.success) {
                router.refresh();
            }
        } catch {
            setStatusFeedback({
                success: false,
                message: "Unable to update resource status. Please try again.",
            });
        } finally {
            setStatusPendingId(null);
        }
    }

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
            <div className="mx-auto max-w-6xl space-y-8">
                <header>
                    <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
                        Resource Reservation Management System
                    </p>
                    <h1 className="mt-2 text-3xl font-bold">Resource Management</h1>
                    <p className="mt-2 text-slate-600">
                        Manage organizational facilities and shared resources.
                    </p>
                </header>

                <section className="grid gap-4 sm:grid-cols-3">
                    {[
                        { label: "Total Resources", value: resources.length },
                        { label: "Active Resources", value: activeCount },
                        { label: "Inactive Resources", value: inactiveCount },
                    ].map((item) => (
                        <div
                            key={item.label}
                            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                        >
                            <p className="text-sm text-slate-500">{item.label}</p>
                            <p className="mt-2 text-3xl font-bold">{item.value}</p>
                        </div>
                    ))}
                </section>

                <div className="grid items-start gap-6 lg:grid-cols-[350px_minmax(0,1fr)]">
                    <section
                        id="resource-form-section"
                        className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
                    >
                        <h2 className="text-xl font-semibold">
                            {editingId ? "Edit Resource" : "Add Resource"}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            {editingId
                                ? "Update the selected resource information."
                                : "Register a new resource for reservations."}
                        </p>

                        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                            <div>
                                <label htmlFor="resource-name" className="text-sm font-medium">
                                    Resource Name *
                                </label>
                                <input
                                    id="resource-name"
                                    className={inputClass}
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder="Meeting Room A"
                                    maxLength={120}
                                    required
                                    disabled={isBusy}
                                />
                            </div>

                            <div>
                                <label htmlFor="resource-category" className="text-sm font-medium">
                                    Category *
                                </label>
                                <select
                                    id="resource-category"
                                    className={inputClass}
                                    value={category}
                                    onChange={(event) => setCategory(event.target.value as Category)}
                                    disabled={isBusy}
                                >
                                    <option value="ROOM">Room</option>
                                    <option value="EQUIPMENT">Equipment</option>
                                    <option value="OTHER">Other</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="resource-location" className="text-sm font-medium">
                                    Location *
                                </label>
                                <input
                                    id="resource-location"
                                    className={inputClass}
                                    value={location}
                                    onChange={(event) => setLocation(event.target.value)}
                                    placeholder="Floor 2"
                                    maxLength={160}
                                    required
                                    disabled={isBusy}
                                />
                            </div>

                            <div>
                                <label htmlFor="resource-capacity" className="text-sm font-medium">
                                    Capacity (optional)
                                </label>
                                <input
                                    id="resource-capacity"
                                    type="number"
                                    min="1"
                                    step="1"
                                    className={inputClass}
                                    value={capacity}
                                    onChange={(event) => setCapacity(event.target.value)}
                                    placeholder="10"
                                    disabled={isBusy}
                                />
                            </div>

                            <div>
                                <label htmlFor="resource-description" className="text-sm font-medium">
                                    Description (optional)
                                </label>
                                <textarea
                                    id="resource-description"
                                    className={inputClass}
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                    placeholder="Additional resource information"
                                    maxLength={1000}
                                    rows={3}
                                    disabled={isBusy}
                                />
                            </div>

                            {feedback && (
                                <p
                                    role="status"
                                    aria-live="polite"
                                    className={`rounded-lg p-3 text-sm ${feedback.success
                                            ? "bg-green-50 text-green-800"
                                            : "bg-red-50 text-red-800"
                                        }`}
                                >
                                    {feedback.message}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={isBusy}
                                className="w-full rounded-lg bg-blue-700 px-4 py-3 font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSaving
                                    ? "Saving..."
                                    : editingId
                                        ? "Save Changes"
                                        : "Create Resource"}
                            </button>

                            {editingId && (
                                <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={cancelEditing}
                                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Cancel Editing
                                </button>
                            )}
                        </form>
                    </section>

                    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="mb-5">
                            <h2 className="text-xl font-semibold">All Resources</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Resources currently registered in the system.
                            </p>
                        </div>

                        {statusFeedback && (
                            <div
                                role="status"
                                aria-live="polite"
                                className={`mb-4 rounded-lg p-3 text-sm ${statusFeedback.success
                                        ? "bg-green-50 text-green-800"
                                        : "bg-red-50 text-red-800"
                                    }`}
                            >
                                {statusFeedback.message}
                            </div>
                        )}

                        {resources.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center">
                                <p className="font-medium">No resources found</p>
                                <p className="mt-1 text-sm text-slate-500">
                                    Create your first resource using the form.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-162.5 text-left text-sm">
                                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                                        <tr>
                                            <th className="p-3 font-semibold">Resource</th>
                                            <th className="p-3 font-semibold">Category</th>
                                            <th className="p-3 font-semibold">Location</th>
                                            <th className="p-3 font-semibold">Capacity</th>
                                            <th className="p-3 font-semibold">Status</th>
                                            <th className="p-3 font-semibold">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {resources.map((resource) => (
                                            <tr key={resource.id} className="hover:bg-slate-50">
                                                <td className="p-3 font-medium">{resource.name}</td>
                                                <td className="p-3">{resource.category}</td>
                                                <td className="p-3">{resource.location}</td>
                                                <td className="p-3">{resource.capacity ?? "Not set"}</td>
                                                <td className="p-3">
                                                    <span
                                                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${resource.isActive
                                                                ? "bg-green-100 text-green-800"
                                                                : "bg-slate-200 text-slate-700"
                                                            }`}
                                                    >
                                                        {resource.isActive ? "Active" : "Inactive"}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={isBusy}
                                                            onClick={() => startEditing(resource)}
                                                            className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                                            aria-label={`Edit ${resource.name}`}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isBusy}
                                                            onClick={() => handleToggleStatus(resource)}
                                                            className={`rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${resource.isActive
                                                                    ? "border-red-200 text-red-700 hover:bg-red-50"
                                                                    : "border-green-200 text-green-700 hover:bg-green-50"
                                                                }`}
                                                            aria-label={`${resource.isActive ? "Deactivate" : "Activate"} ${resource.name}`}
                                                        >
                                                            {statusPendingId === resource.id
                                                                ? "Updating..."
                                                                : resource.isActive
                                                                    ? "Deactivate"
                                                                    : "Activate"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </main>
    );
}
