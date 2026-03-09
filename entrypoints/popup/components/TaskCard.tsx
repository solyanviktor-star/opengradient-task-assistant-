import type { Task } from "@/lib/types";
import VerifyBadge from "./VerifyBadge";
import ReminderPicker from "./ReminderPicker";

interface TaskCardProps {
  task: Task;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onSetReminder: (taskId: string, reminderAt: string) => void;
  onClearReminder: (taskId: string) => void;
}

const priorityColors: Record<string, { bg: string; text: string }> = {
  high: { bg: "bg-red-100", text: "text-red-600" },
  medium: { bg: "bg-amber-100", text: "text-amber-600" },
  low: { bg: "bg-green-100", text: "text-green-600" },
};

const typeLabels: Record<string, string> = {
  call: "Call",
  meeting: "Meeting",
  task: "Task",
  note: "Note",
  reminder: "Reminder",
};

export default function TaskCard({ task, onComplete, onDelete, onSetReminder, onClearReminder }: TaskCardProps) {
  const priority = priorityColors[task.priority] ?? { bg: "bg-amber-100", text: "text-amber-600" };

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
          <span className="text-[11px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-semibold">
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

        {/* Source */}
        <div className="mt-0.5">
          {task.sourceUrl && task.sourceUrl !== "clipboard" ? (
            <a
              href={task.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-indigo-500 hover:text-indigo-700 no-underline hover:underline"
            >
              source
            </a>
          ) : (
            <span className="text-[11px] text-gray-400">clipboard</span>
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
