import React, { useEffect, useState } from "react";
import { Plus, MessageSquare, Trash2, Code2, CheckCircle2, AlertCircle } from "lucide-react";
import { AddPromptModal } from "../components/AddPromptModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const PromptsPage: React.FC = () => {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<any | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/prompts");
      const data = await res.json();
      setPrompts(data);
      if (data.length > 0 && !selectedPrompt) {
        setSelectedPrompt(data[0]);
      }
    } catch (e) {
      console.error("Failed to fetch prompts:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    setDeletingPromptId(id);
  };

  const confirmDeletePrompt = async () => {
    if (!deletingPromptId) return;
    try {
      await fetch(`/api/prompts/${deletingPromptId}`, { method: "DELETE" });
      if (selectedPrompt?.id === deletingPromptId) {
        setSelectedPrompt(null);
      }
      loadPrompts();
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeletingPromptId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">MCP Prompts</h1>
          <p className="text-sm text-zinc-400">
            Define reusable prompt templates exposed as slash commands in Claude Code, Cursor, etc.
          </p>
        </div>
        <Button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-lg shadow-indigo-600/20"
        >
          <Plus className="h-4 w-4" />
          <span>Add Prompt</span>
        </Button>
      </div>

      {/* Grid: Prompt List on Left, Selected Prompt Detail on Right */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Prompts List */}
        <div className="col-span-5 space-y-3">
          {loading ? (
            <div className="py-8 text-center text-xs text-zinc-500 font-mono">Loading prompts...</div>
          ) : prompts.length === 0 ? (
            <Card className="glass-panel border-zinc-800 bg-zinc-900/50 p-6 text-center text-xs text-zinc-500 font-mono">
              No prompts created yet. Click "Add Prompt" to get started.
            </Card>
          ) : (
            prompts.map((prompt) => {
              const isSelected = selectedPrompt?.id === prompt.id;
              return (
                <Card
                  key={prompt.id}
                  onClick={() => setSelectedPrompt(prompt)}
                  className={`p-4 cursor-pointer border transition-all ${
                    isSelected
                      ? "bg-indigo-600/10 border-indigo-500/50 shadow-md shadow-indigo-500/5"
                      : "glass-panel bg-zinc-900/50 border-zinc-800 hover:bg-zinc-900/80"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <MessageSquare className="h-4 w-4 text-purple-400 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-zinc-100">{prompt.title || prompt.name}</h3>
                          <Badge variant="outline" className="font-mono text-[10px] text-indigo-400 bg-indigo-500/10 border-indigo-500/20">
                            /{prompt.name}
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                          {prompt.description || "No description"}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {/* Right Column: Selected Prompt Details & Template */}
        <div className="col-span-7">
          {selectedPrompt ? (
            <Card className="glass-panel border-zinc-800 bg-zinc-900/50 p-6 space-y-6">
              {/* Prompt Header & Actions */}
              <div className="flex items-start justify-between border-b border-zinc-800/80 pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-zinc-100">
                      {selectedPrompt.title || selectedPrompt.name}
                    </h2>
                    <Badge variant="outline" className="font-mono text-xs text-indigo-400 bg-indigo-500/10 border-indigo-500/20">
                      /{selectedPrompt.name}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">{selectedPrompt.description}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(selectedPrompt.id)}
                  className="h-8 w-8 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Declared Arguments */}
              <div className="space-y-3">
                <h3 className="font-semibold text-xs uppercase tracking-wider text-zinc-400">
                  Declared Arguments ({selectedPrompt.arguments?.length || 0})
                </h3>

                {selectedPrompt.arguments?.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">No arguments required for this prompt.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedPrompt.arguments?.map((arg: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex items-start justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-indigo-300">
                              {arg.name}
                            </span>
                            {arg.required ? (
                              <Badge variant="outline" className="text-[10px] text-rose-400 border-0 p-0 font-mono">required</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-zinc-500 border-0 p-0 font-mono">optional</Badge>
                            )}
                          </div>
                          {arg.description && (
                            <p className="text-xs text-zinc-400 mt-0.5">{arg.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Template Content */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Code2 className="h-3.5 w-3.5 text-purple-400" />
                    Content Template
                  </h3>
                </div>
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 font-mono text-xs text-zinc-200 whitespace-pre-wrap overflow-x-auto leading-relaxed">
                  {selectedPrompt.content_template}
                </div>
              </div>
            </Card>
          ) : (
            <Card className="glass-panel border-zinc-800 bg-zinc-900/50 p-12 text-center text-xs text-zinc-500 font-mono">
              Select a prompt to view details and template content.
            </Card>
          )}
        </div>
      </div>

      <AddPromptModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={loadPrompts}
      />

      <ConfirmModal
        isOpen={Boolean(deletingPromptId)}
        title="Delete Prompt"
        description="Are you sure you want to delete this prompt template?"
        confirmText="Delete Prompt"
        onClose={() => setDeletingPromptId(null)}
        onConfirm={confirmDeletePrompt}
      />
    </div>
  );
};
