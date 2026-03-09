import { useState } from "react";
import type { Task } from "@/lib/types";

interface ReminderPickerProps {
  task: Task;
  onSetReminder: (taskId: string, reminderAt: string) => void;
  onClearReminder: (taskId: string) => void;
}

export default function ReminderPicker({ task, onSetReminder, onClearReminder }: ReminderPickerProps) {
  const [showPicker, setShowPicker] = useState(false);

  // State 1: Has reminder -- show time + clear button
  if (task.reminderAt) {
    return (
      <span className="flex items-center gap-0.5 text-[11px] text-amber-600">
        <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span className="truncate max-w-[90px]" title={new Date(task.reminderAt).toLocaleString()}>
          {new Date(task.reminderAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onClearReminder(task.id); }}
          className="ml-0.5 text-amber-400 hover:text-red-500 cursor-pointer bg-transparent border-none p-0 leading-none text-xs"
          title="Clear reminder"
        >
          x
        </button>
      </span>
    );
  }

  // State 3: No reminder, picker open -- show datetime input
  if (showPicker) {
    return (
      <input
        type="datetime-local"
        min={new Date().toISOString().slice(0, 16)}
        autoFocus
        className="text-[11px] border border-gray-200 rounded px-1 py-0.5 w-[140px]"
        onChange={(e) => {
          if (e.target.value) {
            onSetReminder(task.id, new Date(e.target.value).toISOString());
            setShowPicker(false);
          }
        }}
        onBlur={() => setShowPicker(false)}
      />
    );
  }

  // State 2: No reminder, picker closed -- show bell icon button
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setShowPicker(true); }}
      className="text-gray-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-0 leading-none"
      title="Set reminder"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    </button>
  );
}
