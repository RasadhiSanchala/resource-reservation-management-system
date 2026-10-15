"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace-icon";
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
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60";

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

    const [resourceSearch, setResourceSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<Category | "ALL">("ALL");
    const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
    const isBusy = isSaving || statusPendingId !== null;
    const visibleResources = resources.filter((resource) => {
        if (categoryFilter !== "ALL" && resource.category !== categoryFilter) return false;
        if (statusFilter === "ACTIVE" && !resource.isActive) return false;
        if (statusFilter === "INACTIVE" && resource.isActive) return false;
        const query = resourceSearch.trim().toLowerCase();
        return !query || [resource.name, resource.location, resource.description ?? ""]
            .some((text) => text.toLowerCase().includes(query));
    });
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
        <main className="min-h-screen flex-1 bg-[#f5f7fc] text-slate-900">
            <div className="mx-auto w-full max-w-7xl space-y-7 px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
                <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0b1a35] via-[#122c58] to-[#1846a2] p-6 text-white shadow-[0_18px_48px_-26px_rgba(22,53,122,.65)] sm:p-9">
                    <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-24 h-72 w-72 rounded-full border border-white/10 bg-white/5" />
                    <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 right-32 h-60 w-60 rounded-full bg-sky-400/10 blur-2xl" />
                    <div className="relative flex flex-wrap items-end justify-between gap-6">
                        <div className="max-w-2xl">
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-blue-100">
                                <WorkspaceIcon name="layers" size={14} /> Resource workspace
                            </span>
                            <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-[40px]">Everything you need, in one place.</h1>
                            <p className="mt-3 max-w-xl text-sm leading-7 text-blue-100/90 sm:text-base">Organize your rooms, equipment and shared assets. Keep every resource ready for its next reservation.</p>
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                            <Link href="/reservations" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20">
                                <WorkspaceIcon name="calendar" size={17} /> View reservations
                            </Link>
                            <button type="button" onClick={() => document.getElementById("resource-form-section")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-blue-900 shadow-sm transition hover:bg-blue-50">
                                <WorkspaceIcon name="plus" size={17} /> Add resource
                            </button>
                        </div>
                    </div>
                </header>

                <section aria-label="Resource summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: "Total resources", value: resources.length, info: "In your resource directory", icon: "grid" as const, color: "bg-blue-50 text-blue-700" },
                        { label: "Active resources", value: activeCount, info: "Ready for new bookings", icon: "check-circle" as const, color: "bg-emerald-50 text-emerald-700" },
                        { label: "Inactive resources", value: inactiveCount, info: "Currently unavailable", icon: "power" as const, color: "bg-amber-50 text-amber-700" },
                        { label: "Meeting rooms", value: resources.filter((r) => r.category === "ROOM").length, info: "Spaces in the directory", icon: "layers" as const, color: "bg-violet-50 text-violet-700" },
                    ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(30,58,98,.035)]">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                                    <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{item.value}</p>
                                </div>
                                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.color}`}>
                                    <WorkspaceIcon name={item.icon} size={21} />
                                </span>
                            </div>
                            <p className="mt-3 text-xs text-slate-400">{item.info}</p>
                        </div>
                    ))}
                </section>

                <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[365px_minmax(0,1fr)]">
                    <section id="resource-form-section" aria-labelledby="resource-form-heading" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white px-5 py-5 sm:px-6">
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white shadow-sm">
                                <WorkspaceIcon name={editingId ? "edit" : "plus"} size={20} />
                            </span>
                            <h2 id="resource-form-heading" className="mt-3 text-xl font-extrabold tracking-tight">{editingId ? "Edit resource" : "Register a resource"}</h2>
                            <p className="mt-1 text-sm leading-6 text-slate-500">{editingId ? "You're editing an existing item. Save when you're ready." : "Add a space or asset to make it available for bookings."}</p>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-6">
                            <label className="block text-xs font-bold text-slate-700" htmlFor="resource-name">
                                Resource name <span className="text-rose-600">*</span>
                                <input id="resource-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Conference Room A" maxLength={120} required disabled={isBusy} />
                            </label>
                            <label className="block text-xs font-bold text-slate-700" htmlFor="resource-category">
                                Category <span className="text-rose-600">*</span>
                                <select id="resource-category" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as Category)} disabled={isBusy}>
                                    <option value="ROOM">Room / Space</option><option value="EQUIPMENT">Equipment</option><option value="OTHER">Other resource</option>
                                </select>
                            </label>
                            <label className="block text-xs font-bold text-slate-700" htmlFor="resource-location">
                                Location <span className="text-rose-600">*</span>
                                <input id="resource-location" className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Floor 2, West Wing" maxLength={160} required disabled={isBusy} />
                            </label>
                            <label className="block text-xs font-bold text-slate-700" htmlFor="resource-capacity">
                                Capacity <span className="font-normal text-slate-400">(optional)</span>
                                <input id="resource-capacity" type="number" min="1" step="1" className={inputClass} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 12" disabled={isBusy} />
                            </label>
                            <label className="block text-xs font-bold text-slate-700" htmlFor="resource-description">
                                Description <span className="font-normal text-slate-400">(optional)</span>
                                <textarea id="resource-description" className={`${inputClass} resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe this resource..." maxLength={1000} rows={3} disabled={isBusy} />
                            </label>
                            {feedback && (
                                <div role="status" aria-live="polite" className={`flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm ${feedback.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
                                    <WorkspaceIcon name={feedback.success ? "check-circle" : "alert"} size={18} className="mt-0.5 shrink-0" /> {feedback.message}
                                </div>
                            )}
                            <button type="submit" disabled={isBusy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60">
                                <WorkspaceIcon name={editingId ? "check" : "plus"} size={18} /> {isSaving ? "Saving..." : editingId ? "Save changes" : "Create resource"}
                            </button>
                            {editingId && <button type="button" disabled={isBusy} onClick={cancelEditing} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Cancel editing</button>}
                            <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500"><WorkspaceIcon name="shield" size={17} className="mt-0.5 shrink-0 text-blue-600" />Resource status and capacity rules are checked before changes are saved.</div>
                        </form>
                    </section>

                    <section aria-labelledby="resource-list-heading" className="min-w-0 space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="mb-1 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-blue-700"><WorkspaceIcon name="layers" size={15} /> Resource directory</div>
                                    <h2 id="resource-list-heading" className="text-xl font-extrabold tracking-tight sm:text-2xl">Your resources</h2>
                                    <p className="mt-1 text-sm text-slate-500">Search, filter, or update your shared assets.</p>
                                </div>
                                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{visibleResources.length} of {resources.length}</span>
                            </div>
                            <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_140px]">
                                <label className="relative block">
                                    <span className="sr-only">Search resources</span>
                                    <WorkspaceIcon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input type="search" value={resourceSearch} onChange={(e) => setResourceSearch(e.target.value)} placeholder="Search name or location..." className={`${inputClass} mt-0 pl-10`} />
                                </label>
                                <label><span className="sr-only">Filter category</span>
                                    <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as Category | "ALL")} className={`${inputClass} mt-0`}>
                                        <option value="ALL">All categories</option><option value="ROOM">Rooms</option><option value="EQUIPMENT">Equipment</option><option value="OTHER">Other</option>
                                    </select>
                                </label>
                                <label><span className="sr-only">Filter status</span>
                                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")} className={`${inputClass} mt-0`}>
                                        <option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
                                    </select>
                                </label>
                            </div>
                        </div>
                        {statusFeedback && (
                            <div role="status" aria-live="polite" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${statusFeedback.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
                                <WorkspaceIcon name={statusFeedback.success ? "check-circle" : "alert"} size={18} /> {statusFeedback.message}
                            </div>
                        )}
                        {visibleResources.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
                                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><WorkspaceIcon name={resources.length === 0 ? "plus" : "search"} size={26} /></span>
                                <h3 className="mt-4 text-lg font-bold">{resources.length === 0 ? "No resources yet" : "No matching resources"}</h3>
                                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">{resources.length === 0 ? "Use the form to register the first room or piece of equipment." : "Try another search term or change the filters."}</p>
                                {resources.length > 0 && <button type="button" className="mt-4 text-sm font-bold text-blue-700 hover:underline" onClick={() => { setResourceSearch(""); setCategoryFilter("ALL"); setStatusFilter("ALL"); }}>Clear filters</button>}
                            </div>
                        ) : (
                            <div className="grid gap-4 xl:grid-cols-2">
                                {visibleResources.map((resource) => (
                                    <article key={resource.id} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_2px_12px_rgba(30,58,98,.035)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg">
                                        <div className="flex-1 p-5 sm:p-6">
                                            <div className="flex items-start justify-between gap-3">
                                                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${resource.category === "ROOM" ? "bg-blue-50 text-blue-700" : resource.category === "EQUIPMENT" ? "bg-violet-50 text-violet-700" : "bg-amber-50 text-amber-700"}`}>
                                                    <WorkspaceIcon name={resource.category === "ROOM" ? "layers" : resource.category === "EQUIPMENT" ? "monitor" : "grid"} size={23} />
                                                </span>
                                                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${resource.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${resource.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />{resource.isActive ? "Active" : "Inactive"}
                                                </span>
                                            </div>
                                            <div className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.17em] text-blue-600">{resource.category === "ROOM" ? "Room / Space" : resource.category === "EQUIPMENT" ? "Equipment" : "Other resource"}</div>
                                            <h3 className="mt-1.5 break-words text-lg font-extrabold tracking-tight text-slate-900">{resource.name}</h3>
                                            <p className="mt-2 flex items-start gap-2 text-sm text-slate-500"><WorkspaceIcon name="pin" size={17} className="mt-0.5 shrink-0" /><span className="break-words">{resource.location}</span></p>
                                            <p className="mt-3 min-h-10 text-sm leading-6 text-slate-500">{resource.description || "No description provided for this resource."}</p>
                                            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600"><WorkspaceIcon name="users" size={16} className="text-blue-600" /> {resource.capacity === null ? "No capacity limit configured" : `Capacity: ${resource.capacity}`}</div>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-6">
                                            <button type="button" disabled={isBusy} onClick={() => startEditing(resource)} aria-label={`Edit ${resource.name}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><WorkspaceIcon name="edit" size={15} /> Edit</button>
                                            <button type="button" disabled={isBusy} onClick={() => handleToggleStatus(resource)} aria-label={`${resource.isActive ? "Deactivate" : "Activate"} ${resource.name}`} className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${resource.isActive ? "border-rose-200 bg-white text-rose-700 hover:bg-rose-50" : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"}`}>
                                                <WorkspaceIcon name="power" size={15} /> {statusPendingId === resource.id ? "Updating..." : resource.isActive ? "Deactivate" : "Activate"}
                                            </button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
                <p className="pb-4 text-center text-xs text-slate-400">RRMS · Resource directory and management</p>
            </div>
        </main>
    );
}
