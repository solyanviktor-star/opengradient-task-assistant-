import type { Task } from "@/lib/types";
import TaskCard from "./TaskCard";
import SearchBar from "./SearchBar";

interface TaskListProps {
  tasks: Task[];
  searchQuery: string;
  onSearch: (query: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onSetReminder: (taskId: string, reminderAt: string) => void;
  onClearReminder: (taskId: string) => void;
}

export default function TaskList({ tasks, searchQuery, onSearch, onComplete, onDelete, onSetReminder, onClearReminder }: TaskListProps) {
  return (
    <div>
      <div className="mb-2">
        <SearchBar onSearch={onSearch} />
      </div>

      {tasks.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-4">
          {searchQuery ? "No matching tasks found." : "No tasks yet. Copy text or screenshot and extract!"}
        </div>
      ) : (
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
      )}
    </div>
  );
}
