import { useState } from "react";
import type { Task } from "@/lib/types";
import VerifyBadge from "./VerifyBadge";
import ReminderPicker from "./ReminderPicker";

interface TaskCardProps {
  task: Task;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onSetReminder: (taskId: string, reminderAt: string) => void;
  onClearReminder: (taskId: string) => void;
  onUpdateTags: (taskId: string, tags: string[]) => void;
}

const priorityColors: Record<string, { bg: string; text: string }> = {
  high: { bg: "bg-red-100", text: "text-red-600" },
  medium: { bg: "bg-amber-100", text: "text-amber-600" },
  low: { bg: "bg-green-100", text: "text-green-600" },
};

const typeLabels: Record<string, string> = {
  task: "Task",
  meeting: "Meeting",
  reminder: "Reminder",
  note: "Note",
  bookmark: "Bookmark",
  credential: "Key",
  contact: "Contact",
  commitment: "Promise",
  idea: "Idea",
  resource: "Resource",
};

const typeColors: Record<string, string> = {
  task: "bg-indigo-100 text-indigo-700",
  meeting: "bg-blue-100 text-blue-700",
  reminder: "bg-purple-100 text-purple-700",
  note: "bg-gray-100 text-gray-600",
  bookmark: "bg-yellow-100 text-yellow-700",
  credential: "bg-red-100 text-red-700",
  contact: "bg-teal-100 text-teal-700",
  commitment: "bg-orange-100 text-orange-700",
  idea: "bg-pink-100 text-pink-700",
  resource: "bg-cyan-100 text-cyan-700",
};

export default function TaskCard({ task, onComplete, onDelete, onSetReminder, onClearReminder, onUpdateTags }: TaskCardProps) {
  const priority = priorityColors[task.priority] ?? { bg: "bg-amber-100", text: "text-amber-600" };
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState("");

  const tags = task.tags ?? [];

  const removeTag = (tag: string) => {
    onUpdateTags(task.id, tags.filter((t) => t !== tag));
  };

  const addTag = () => {
    const trimmed = newTag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onUpdateTags(task.id, [...tags, trimmed]);
    }
    setNewTag("");
    setAddingTag(false);
  };

  return (
    <div
      data-task-id={task.id}
      className={`flex items-start gap-2 px-2.5 py-2 border-b border-gray-100 ${
        task.completed ? "opacity-60" : ""
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onComplete(task.id)}
        className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer ${
          task.completed
            ? "bg-indigo-600 border-indigo-600"
            : "bg-white border-gray-300 hover:border-indigo-400"
        }`}
        title={task.completed ? "Mark incomplete" : "Mark complete"}
      >
        {task.completed && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Action text */}
        <div
          className={`text-sm font-semibold leading-snug ${
            task.completed ? "line-through text-gray-400" : "text-gray-900"
          }`}
        >
          {task.action}
        </div>

        {/* Badges row */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${typeColors[task.type] ?? "bg-gray-100 text-gray-600"}`}>
            {typeLabels[task.type] ?? task.type}
          </span>
          <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${priority.bg} ${priority.text}`}>
            {task.priority}
          </span>
          {task.deadline && (
            <span className="text-[11px] text-gray-500">
              Due: {new Date(task.deadline).toLocaleDateString()}
            </span>
          )}
          <ReminderPicker task={task} onSetReminder={onSetReminder} onClearReminder={onClearReminder} />
        </div>

        {/* Tags row — editable */}
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded group"
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="ml-0.5 text-slate-400 hover:text-red-500 cursor-pointer bg-transparent border-none p-0 leading-none hidden group-hover:inline"
              >
                x
              </button>
            </span>
          ))}
          {addingTag ? (
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTag(); if (e.key === "Escape") { setAddingTag(false); setNewTag(""); } }}
              onBlur={addTag}
              autoFocus
              placeholder="tag..."
              className="text-[11px] w-16 px-1 py-0.5 border border-indigo-300 rounded outline-none"
            />
          ) : (
            <button
              onClick={() => setAddingTag(true)}
              className="text-[11px] px-1 py-0.5 text-gray-400 hover:text-indigo-500 cursor-pointer bg-transparent border border-dashed border-gray-300 hover:border-indigo-400 rounded leading-none"
              title="Add tag"
            >
              +
            </button>
          )}
        </div>

        {/* Source */}
        <div className="mt-1">
          {task.sourceUrl && task.sourceUrl !== "clipboard" ? (
            <a
              href={task.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 no-underline hover:underline font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
              </svg>
              Source
            </a>
          ) : (
            <span className="text-xs text-gray-400">clipboard</span>
          )}
        </div>
      </div>

      {/* Badge + Delete */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <VerifyBadge txHash={task.txHash} />
        <button
          onClick={() => onDelete(task.id)}
          className="flex-shrink-0 mt-0.5 p-0.5 text-gray-300 hover:text-red-500 cursor-pointer bg-transparent border-none"
          title="Delete task"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
