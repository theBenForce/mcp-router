import React from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";

export interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title = "Confirm Action",
  description = "Are you sure you want to proceed?",
  confirmText = "Delete",
  cancelText = "Cancel",
  variant = "danger",
  onClose,
  onConfirm,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md shadow-2xl p-6">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="font-semibold text-lg text-zinc-100">{title}</DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 mt-1">{description}</DialogDescription>
          </div>
        </DialogHeader>

        <DialogFooter className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-300">
            {cancelText}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={
              variant === "danger"
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
