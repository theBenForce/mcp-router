import React, { useEffect, useState } from "react";
import { Plus, MessageSquare, Trash2, Code2, Search, X } from "lucide-react";
import { AddPromptModal } from "../components/AddPromptModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { TwoPaneLayout } from "../components/TwoPaneLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export const PromptsPage: React.FC = () => {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<any | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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

  const filteredPrompts = prompts.filter((prompt) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (prompt.name && prompt.name.toLowerCase().includes(q)) ||
      (prompt.title && prompt.title.toLowerCase().includes(q)) ||
      (prompt.description && prompt.description.toLowerCase().includes(q)) ||
      (prompt.content_template && prompt.content_template.toLowerCase().includes(q))
    );
  });

  return (
    <>
      <TwoPaneLayout
        title="MCP Prompts"
        description="Define reusable prompt templates exposed as slash commands in Claude Code, Cursor, etc."
        actionLabel="Add Prompt"
        onActionClick={() => setIsAddModalOpen(true)}
        leftHeader={
          <div className="relative shrink-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              type="text"
              placeholder="Search prompts by name or command..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 h-9 text-xs bg-zinc-950/60 border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus:border-indigo-500/50 focus:ring-indigo-500/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        }
        leftContent={
          <div className="space-y-2.5 pr-1">
            {loading ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">Loading prompts...</div>
            ) : filteredPrompts.length === 0 ? (
              <Card className="glass-panel border-zinc-800 bg-zinc-900/50 p-6 text-center text-xs text-zinc-500 font-mono">
                {searchQuery
                  ? "No prompts match your search."
                  : 'No prompts created yet. Click "Add Prompt" to get started.'}
              </Card>
            ) : (
              filteredPrompts.map((prompt) => {
                const isSelected = selectedPrompt?.id === prompt.id;
                const argCount = prompt.arguments?.length || 0;

                return (
                  <div
                    key={prompt.id}
                    onClick={() => setSelectedPrompt(prompt)}
                    className={`group relative p-3.5 rounded-xl border transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600/10 border-indigo-500/40 shadow-md shadow-indigo-500/5 text-zinc-100"
                        : "glass-panel bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900/80 hover:border-zinc-700/80 text-zinc-300"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-3 bottom-3 w-1 bg-indigo-500 rounded-r-full shadow-sm shadow-indigo-500" />
                    )}

                    <div className="space-y-2 pl-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <MessageSquare className="h-4 w-4 text-purple-400 shrink-0" />
                          <h3 className="font-semibold text-sm text-zinc-100 truncate">
                            {prompt.title || prompt.name}
                          </h3>
                        </div>

                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] text-indigo-400 bg-indigo-500/10 border-indigo-500/20 shrink-0"
                        >
                          /{prompt.name}
                        </Badge>
                      </div>

                      <p className="text-xs text-zinc-400 line-clamp-1">
                        {prompt.description || "No description provided."}
                      </p>

                      <div className="flex items-center justify-between text-[10px] font-mono pt-1 text-zinc-500 border-t border-zinc-800/40">
                        <span className="text-zinc-400">
                          {argCount} arg{argCount === 1 ? "" : "s"}
                        </span>
                        <span className="text-zinc-500 font-mono text-[10px]">
                          command template
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        }
        rightContent={
          selectedPrompt ? (
            <Card className="glass-panel border-zinc-800 bg-zinc-900/50 p-6 flex flex-col h-full min-h-0 overflow-hidden">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-zinc-800/80 pb-4 shrink-0">
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
                  title="Delete Prompt"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Scrollable details */}
              <ScrollArea className="flex-1 min-h-0 pt-4 pr-2">
                <div className="space-y-6">
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
                </div>
              </ScrollArea>
            </Card>
          ) : (
            <Card className="glass-panel border-zinc-800 bg-zinc-900/50 p-12 text-center text-xs text-zinc-500 font-mono flex-1 flex items-center justify-center">
              Select a prompt to view details and template content.
            </Card>
          )
        }
      />

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
    </>
  );
};
