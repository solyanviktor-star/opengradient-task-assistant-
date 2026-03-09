import type { Task } from "@/lib/types";
import TaskCard from "./TaskCard";

interface TaskListProps {
  tasks: Task[];
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onSetReminder: (taskId: string, reminderAt: string) => void;
  onClearReminder: (taskId: string) => void;
}

export default function TaskList({ tasks, onComplete, onDelete, onSetReminder, onClearReminder }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-4">
        No tasks yet. Copy text or screenshot and extract!
      </div>
    );
  }

  return (
    <div className="max-h-80 overflow-y-auto rounded-md border border-gray-200">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onComplete={onComplete}
          onDelete={onDelete}
          onSetReminder={onSetReminder}
          onClearReminder={onClearReminder}
        />
      ))}
    </div>
  );
}
