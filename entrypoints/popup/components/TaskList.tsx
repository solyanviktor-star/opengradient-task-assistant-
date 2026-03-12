import { useMemo } from "react";
import type { Task } from "@/lib/types";
import TaskCard from "./TaskCard";
import SearchBar from "./SearchBar";

interface TaskListProps {
  tasks: Task[];
  searchQuery: string;
  onSearch: (query: string) => void;
  categories: string[];
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  activeTab: "do" | "schedule" | "saved";
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onSetReminder: (taskId: string, reminderAt: string, note: string | null) => void;
  onClearReminder: (taskId: string) => void;
  onUpdateTags: (taskId: string, tags: string[]) => void;
}

// ── Date helpers ──

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const taskDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = today.getTime() - taskDate.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: now.getFullYear() !== date.getFullYear() ? "numeric" : undefined });
}

function formatScheduleLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = eventDate.getTime() - today.getTime();
  const days = Math.floor(diff / 86400000);

  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  if (days < 0) return `${Math.abs(days)}d ago, ${time}`;
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days < 7) return `${date.toLocaleDateString("en-US", { weekday: "long" })}, ${time}`;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

function relativeCountdown(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return "past";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `in ${days}d`;
}

// ── Grouping ──

function groupByDate(tasks: Task[]): { label: string; tasks: Task[] }[] {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const d = new Date(task.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const arr = groups.get(key) ?? [];
    arr.push(task);
    groups.set(key, arr);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, tasks]) => ({ label: formatDateLabel(key), tasks }));
}

// ── Component ──

export default function TaskList({ tasks, searchQuery, onSearch, categories, activeCategory, onCategoryChange, activeTab, onComplete, onDelete, onSetReminder, onClearReminder, onUpdateTags }: TaskListProps) {
  const grouped = useMemo(() => groupByDate(tasks), [tasks]);

  // Schedule: sort by deadline ascending (closest first)
  const scheduleSorted = useMemo(() => {
    if (activeTab !== "schedule") return [];
    return [...tasks].sort((a, b) => {
      const aTime = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bTime = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return aTime - bTime;
    });
  }, [tasks, activeTab]);

  const emptyMessage = searchQuery || activeCategory
    ? "No matching items."
    : activeTab === "do"
      ? "Nothing to do. Nice!"
      : activeTab === "schedule"
        ? "No meetings scheduled."
        : "Nothing saved yet.";

  return (
    <div>
      <div className="mb-2">
        <SearchBar onSearch={onSearch} />
      </div>

      {categories.length > 0 && (
        <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => onCategoryChange(null)}
            className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
              activeCategory === null
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryChange(activeCategory === cat ? null : cat)}
              className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
                activeCategory === cat
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-4">
          {emptyMessage}
        </div>
      ) : activeTab === "schedule" ? (
        /* ── Schedule: timeline view ── */
        <div className="max-h-80 overflow-y-auto rounded-md border border-gray-200">
          {scheduleSorted.map((task) => (
            <div
              key={task.id}
              data-task-id={task.id}
              className="flex items-center gap-2.5 px-2.5 py-2 border-b border-gray-100"
            >
              {/* Time column */}
              <div className="flex-shrink-0 w-[100px] text-right">
                <div className="text-xs font-semibold text-gray-800">
                  {task.deadline ? formatScheduleLabel(task.deadline) : "No date"}
                </div>
                {task.deadline && (
                  <div className={`text-[10px] ${
                    new Date(task.deadline).getTime() < Date.now() ? "text-red-400" : "text-indigo-400"
                  }`}>
                    {relativeCountdown(task.deadline)}
                  </div>
                )}
              </div>
              {/* Divider */}
              <div className="w-px h-8 bg-indigo-200 flex-shrink-0" />
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{task.action}</div>
                {task.context && (
                  <div className="text-[11px] text-gray-400 truncate">{task.context}</div>
                )}
                {task.reminderNote && (
                  <div className="text-[11px] text-amber-500 truncate">{task.reminderNote}</div>
                )}
              </div>
              {/* Delete */}
              <button
                onClick={() => onDelete(task.id)}
                className="flex-shrink-0 p-0.5 text-gray-300 hover:text-red-500 cursor-pointer bg-transparent border-none"
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        /* ── Do / Saved: grouped by date ── */
        <div className="max-h-80 overflow-y-auto rounded-md border border-gray-200">
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="sticky top-0 z-10 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-500 border-b border-gray-200">
                {group.label}
              </div>
              {group.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={onComplete}
                  onDelete={onDelete}
                  onSetReminder={onSetReminder}
                  onClearReminder={onClearReminder}
                  onUpdateTags={onUpdateTags}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
