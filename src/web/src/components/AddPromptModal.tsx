import React, { useState } from "react";
import { X, Plus, Trash2, HelpCircle } from "lucide-react";

interface AddPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddPromptModal: React.FC<AddPromptModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentTemplate, setContentTemplate] = useState("");
  const [args, setArgs] = useState<Array<{ name: string; description: string; required: boolean }>>([
    { name: "", description: "", required: true },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddArgument = () => {
    setArgs([...args, { name: "", description: "", required: false }]);
  };

  const handleRemoveArgument = (index: number) => {
    setArgs(args.filter((_, i) => i !== index));
  };

  const handleArgChange = (index: number, field: string, value: any) => {
    const newArgs = [...args];
    newArgs[index] = { ...newArgs[index], [field]: value };
    setArgs(newArgs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Prompt name is required.");
      return;
    }
    if (!contentTemplate.trim()) {
      setError("Content template is required.");
      return;
    }

    // Filter out empty arg names
    const filteredArgs = args
      .filter((a) => a.name.trim().length > 0)
      .map((a) => ({
        name: a.name.trim(),
        description: a.description.trim(),
        required: a.required,
      }));

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim().toLowerCase().replace(/\s+/g, "_"),
          title: title.trim(),
          description: description.trim(),
          contentTemplate: contentTemplate.trim(),
          arguments: filteredArgs,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create prompt");
      }

      // Reset form
      setName("");
      setTitle("");
      setDescription("");
      setContentTemplate("");
      setArgs([{ name: "", description: "", required: true }]);

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Create MCP Prompt</h2>
            <p className="text-xs text-zinc-400">
              Expose reusable templates as slash commands in LLM clients
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Prompt Name */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Prompt Identifier <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. code_review"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 font-mono focus:outline-none focus:border-indigo-500"
                required
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Will appear as slash command <code className="text-indigo-400">/{name || "name"}</code>
              </p>
            </div>

            {/* Display Title */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Display Title
              </label>
              <input
                type="text"
                placeholder="e.g. Request Code Review"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Description
            </label>
            <input
              type="text"
              placeholder="e.g. Asks the LLM to analyze code quality and suggest fixes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Content Template */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-zinc-300">
                Message Content Template <span className="text-rose-400">*</span>
              </label>
              <span className="text-[11px] text-indigo-400 font-mono flex items-center gap-1">
                <HelpCircle className="h-3 w-3" /> Use {"{{argName}}"} placeholders
              </span>
            </div>
            <textarea
              rows={4}
              placeholder="Please review the following {{language}} code:\n\n```{{language}}\n{{code}}\n```"
              value={contentTemplate}
              onChange={(e) => setContentTemplate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 font-mono focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          {/* Prompt Arguments */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-zinc-300">
                Prompt Arguments ({args.length})
              </label>
              <button
                type="button"
                onClick={handleAddArgument}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Argument</span>
              </button>
            </div>

            {args.map((arg, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80"
              >
                <input
                  type="text"
                  placeholder="Arg Name (e.g. code)"
                  value={arg.name}
                  onChange={(e) => handleArgChange(idx, "name", e.target.value)}
                  className="w-1/3 px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={arg.description}
                  onChange={(e) => handleArgChange(idx, "description", e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
                <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={arg.required}
                    onChange={(e) => handleArgChange(idx, "required", e.target.checked)}
                    className="rounded bg-zinc-900 border-zinc-800 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Required</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleRemoveArgument(idx)}
                  className="p-1 rounded text-zinc-500 hover:text-rose-400 transition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition"
            >
              {loading ? "Creating..." : "Save Prompt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
