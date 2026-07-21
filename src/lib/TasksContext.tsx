import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { syncGoogleDriveInBackground } from "./googleDriveSync";
import { api } from "./api";

export type TaskType = "UPLOAD" | "MATCH" | "GENERATE";

export interface AppTask {
  id: string;
  type: TaskType;
  title: string;
  percent: number;
  eta: number;
  status: "running" | "completed" | "error";
  error?: string;
  message?: string;
}

interface TasksContextType {
  tasks: AppTask[];
  addTask: (task: Omit<AppTask, "id" | "status" | "percent" | "eta">) => string;
  updateTask: (id: string, updates: Partial<AppTask>) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
  pendingTender: any | null;
  setPendingTender: (tender: any | null) => void;
  pendingExpert: any | null;
  setPendingExpert: (expert: any | null) => void;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [pendingTender, setPendingTenderState] = useState<any | null>(null);
  const [pendingExpert, setPendingExpertState] = useState<any | null>(null);

  useEffect(() => {
    Promise.all([
      api.getAppSetting("draft-pending-tender", null),
      api.getAppSetting("draft-pending-expert", null),
    ])
      .then(([tender, expert]) => {
        setPendingTenderState(tender);
        setPendingExpertState(expert);
      })
      .catch((error) => console.error("Unable to load ingestion drafts:", error));
  }, []);

  const setPendingTender = (tender: any | null) => {
    setPendingTenderState(tender);
    void api
      .saveAppSetting("draft-pending-tender", tender)
      .catch((error) => console.error("Unable to save tender draft:", error));
  };

  const setPendingExpert = (expert: any | null) => {
    setPendingExpertState(expert);
    void api
      .saveAppSetting("draft-pending-expert", expert)
      .catch((error) => console.error("Unable to save expert draft:", error));
  };

  const addTask = (
    task: Omit<AppTask, "id" | "status" | "percent" | "eta">,
  ) => {
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTask: AppTask = {
      ...task,
      id,
      status: "running",
      percent: 0,
      eta: 0,
    };
    setTasks((prev) => [...prev, newTask]);
    return id;
  };

  const updateTask = (id: string, updates: Partial<AppTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    );
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const clearCompleted = () => {
    setTasks((prev) => prev.filter((t) => t.status === "running"));
  };

  useEffect(() => {
    // Initial sync
    syncGoogleDriveInBackground(addTask, updateTask);

    // Poll every 3 minutes
    const interval = setInterval(
      () => {
        syncGoogleDriveInBackground(addTask, updateTask);
      },
      3 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, []);

  return (
    <TasksContext.Provider
      value={{
        tasks,
        addTask,
        updateTask,
        removeTask,
        clearCompleted,
        pendingTender,
        setPendingTender,
        pendingExpert,
        setPendingExpert,
      }}
    >
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (context === undefined) {
    throw new Error("useTasks must be used within a TasksProvider");
  }
  return context;
}
