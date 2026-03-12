import { useState } from "react";
import type { Task } from "@/lib/types";

interface ReminderPickerProps {
  task: Task;
  onSetReminder: (taskId: string, reminderAt: string, note: string | null) => void;
  onClearReminder: (taskId: string) => void;
}

export default function ReminderPicker({ task, onSetReminder, onClearReminder }: ReminderPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerValue, setPickerValue] = useState('');
  const [note, setNote] = useState('');

  const confirm = () => {
    if (!pickerValue) return;
    onSetReminder(task.id, new Date(pickerValue).toISOString(), note.trim() || null);
    setShowPicker(false);
    setPickerValue('');
    setNote('');
  };

  const cancel = () => {
    setShowPicker(false);
    setPickerValue('');
    setNote('');
  };

  // State 1: Has reminder -- show time + note + clear button
  if (task.reminderAt) {
    return (
      <span className="flex items-center gap-0.5 text-[11px] text-amber-600">
        <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span className="truncate max-w-[90px]" title={`${new Date(task.reminderAt).toLocaleString()}${task.reminderNote ? '\n' + task.reminderNote : ''}`}>
          {new Date(task.reminderAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {task.reminderNote && (
          <span className="text-amber-500 truncate max-w-[60px]" title={task.reminderNote}>
            ({task.reminderNote})
          </span>
        )}
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

  // State 2: Picker open
  if (showPicker) {
    return (
      <div className="flex flex-col gap-1 mt-0.5">
        <div className="flex items-center gap-1">
          <input
            type="datetime-local"
            min={new Date().toISOString().slice(0, 16)}
            autoFocus
            value={pickerValue}
            className="text-[11px] border border-gray-200 rounded px-1 py-0.5 w-[140px]"
            onChange={(e) => setPickerValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') cancel(); }}
          />
          <button
            onClick={(e) => { e.stopPropagation(); confirm(); }}
            className="text-[11px] bg-indigo-500 text-white rounded px-1.5 py-0.5 hover:bg-indigo-600 cursor-pointer border-none leading-none"
            title="Confirm reminder"
          >
            ✓
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); cancel(); }}
            className="text-[11px] text-gray-400 hover:text-red-500 cursor-pointer bg-transparent border-none p-0 leading-none"
            title="Cancel"
          >
            x
          </button>
        </div>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') cancel(); }}
          placeholder="Note (optional)..."
          className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 w-full"
        />
      </div>
    );
  }

  // State 3: Bell button
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
