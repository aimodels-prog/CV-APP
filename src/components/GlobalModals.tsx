import React from "react";
import { useTasks } from "../lib/TasksContext";
import { ConfirmTenderModal } from "./ConfirmTenderModal";
import AddExpertModal from "./AddExpertModal";
import { api } from "../lib/api";

export function GlobalModals() {
  const { pendingTender, setPendingTender, pendingExpert, setPendingExpert, updateTask } = useTasks();

  const isTenderArray = Array.isArray(pendingTender);
  const currentTender = isTenderArray ? pendingTender[0] : pendingTender;

  const isExpertArray = Array.isArray(pendingExpert);
  const currentExpert = isExpertArray ? pendingExpert[0] : pendingExpert;

  const confirmSaveTender = async (confirmedTender: any) => {
    try {
      const taskId = confirmedTender._taskId;
      delete confirmedTender._taskId;
      await api.saveTender(confirmedTender);
      if (taskId) {
        updateTask(taskId, {
          message: `Success! Tender ${confirmedTender.name} ingested.`,
        });
      }

      const remaining = isTenderArray ? pendingTender.slice(1) : [];
      if (remaining.length > 0) {
        setPendingTender(remaining);
      } else {
        setPendingTender(null);
        window.dispatchEvent(new Event("tenders-updated"));
      }
    } catch (err) {
      console.error("Failed to save tender:", err);
      throw err;
    }
  };

  const confirmSaveExpert = async (confirmedExpert: any) => {
    try {
      const taskId = confirmedExpert._taskId;
      delete confirmedExpert._taskId;
      
      // If we provided onSave from AddExpertModal, it uses the provided function.
      // Wait, AddExpertModal handles its own API calls when onSave is not provided.
      // Let's actually call api.saveExperts here since we have it.
      // Wait, AddExpertModal doesn't need to know about taskId.
      // The saving logic is already handled if we pass it, so let's just let it save.
      
      await api.saveExperts([confirmedExpert]);
      if (taskId) {
        updateTask(taskId, {
          message: `Success! Expert ${confirmedExpert.fullName || confirmedExpert.name} ingested.`,
        });
      }

      const remaining = isExpertArray ? pendingExpert.slice(1) : [];
      if (remaining.length > 0) {
        setPendingExpert(remaining);
      } else {
        setPendingExpert(null);
        window.dispatchEvent(new Event("expertsUpdated"));
      }
    } catch (err) {
      console.error("Failed to save expert:", err);
      throw err;
    }
  };

  return (
    <>
      {currentTender && (
        <ConfirmTenderModal
          tender={currentTender}
          onSave={confirmSaveTender}
          onCancel={() => {
            if (currentTender._taskId) {
              updateTask(currentTender._taskId, {
                status: "error",
                message: "Tender insertion cancelled by user.",
              });
            }
            const remaining = isTenderArray ? pendingTender.slice(1) : [];
            if (remaining.length > 0) {
              setPendingTender(remaining);
            } else {
              setPendingTender(null);
            }
          }}
        />
      )}
      
      {currentExpert && (
        <AddExpertModal
          isOpen={true}
          initialData={currentExpert}
          onSave={confirmSaveExpert}
          onSuccess={() => {}}
          onClose={() => {
            if (currentExpert._taskId) {
              updateTask(currentExpert._taskId, {
                status: "error",
                message: "Expert insertion cancelled by user.",
              });
            }
            const remaining = isExpertArray ? pendingExpert.slice(1) : [];
            if (remaining.length > 0) {
              setPendingExpert(remaining);
            } else {
              setPendingExpert(null);
            }
          }}
        />
      )}
    </>
  );
}
