import { useEffect, useState } from "react";
import type { Role } from "../types.ts";
import { api } from "../api.ts";
import { ROLE_LABEL } from "./status.tsx";
import { useToast } from "./Toast.tsx";

export function RolesView() {
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Role | null>(null);

  const load = () =>
    api<Role[]>("/roles").then((rs) => {
      setRoles(rs);
      if (!selected && rs.length) setSelected(rs[0]!.id);
    });

  useEffect(() => {
    void load();
    api<{ models: string[] }>("/models").then((m) => setModels(m.models)).catch(() => {});
  }, []);

  useEffect(() => {
    const role = roles.find((r) => r.id === selected);
    setDraft(role ? structuredClone(role) : null);
  }, [selected, roles]);

  const save = async () => {
    if (!draft) return;
    try {
      await api(`/roles/${draft.id}`, { method: "PUT", body: JSON.stringify(draft) });
      toast(`${draft.name} 저장됨`);
      void load();
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e), "err");
    }
  };

  return (
    <div className="flex h-full">
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-line bg-panel py-3">
        <h2 className="px-4 pb-2 text-[15px] font-semibold">🎭 신하</h2>
        {roles.map((role) => (
          <button
            key={role.id}
            onClick={() => setSelected(role.id)}
            className={`block w-full px-4 py-2 text-left transition ${
              selected === role.id ? "bg-panel-3 shadow-[inset_2px_0_0_var(--color-gold)]" : "hover:bg-panel-2"
            }`}
          >
            <span className="block text-[13px] font-medium">{role.name}</span>
            <span className="font-mono text-[11px] text-faint">{role.id} · {role.policy.runner}</span>
          </button>
        ))}
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        {!draft ? (
          <p className="text-faint">역할을 선택하세요</p>
        ) : (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold">{draft.name}</h3>
              <button
                onClick={save}
                className="rounded-lg bg-gold px-4 py-1.5 text-[13px] font-semibold text-ink transition hover:brightness-110"
              >
                저장
              </button>
            </div>
            <p className="mt-0.5 text-[12px] text-faint">
              변경은 <code className="font-mono">~/.court/roles/{draft.id}.json</code>에 저장되어 내장 정의를 덮어씁니다
            </p>

            <label className="mt-5 block text-[12px] text-dim">
              시스템 프롬프트
              <textarea
                value={draft.systemPrompt}
                onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                rows={6}
                className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed outline-none focus:border-gold/50"
              />
            </label>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {(["planner", "executor", "cheap"] as const).map((tier) => (
                <label key={tier} className="block text-[12px] text-dim">
                  {tier === "planner" ? "사고 (planner)" : tier === "executor" ? "실행 (executor)" : "경량 (cheap)"}
                  <input
                    list="model-list"
                    value={draft.policy.models[tier] ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, policy: { ...draft.policy, models: { ...draft.policy.models, [tier]: e.target.value } } })
                    }
                    className="mt-1 w-full rounded-lg border border-line bg-ink/60 px-2.5 py-1.5 font-mono text-[11.5px] outline-none focus:border-gold/50"
                  />
                </label>
              ))}
              <datalist id="model-list">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-[12px] text-dim">
                러너
                <select
                  value={draft.policy.runner}
                  onChange={(e) => setDraft({ ...draft, policy: { ...draft.policy, runner: e.target.value } })}
                  className="mt-1 block w-full rounded-lg border border-line bg-ink/60 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-gold/50"
                >
                  <option value="llm">llm — 순수 완성 (도구 없음)</option>
                  <option value="claude">claude — Claude Code (파일·셸 접근)</option>
                  <option value="codex">codex — Codex CLI</option>
                </select>
              </label>
              <label className="block text-[12px] text-dim">
                자동 결재 한도 (이 위험도 미만은 자동 통과)
                <select
                  value={draft.policy.autoApproveBelow}
                  onChange={(e) => setDraft({ ...draft, policy: { ...draft.policy, autoApproveBelow: e.target.value } })}
                  className="mt-1 block w-full rounded-lg border border-line bg-ink/60 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-gold/50"
                >
                  <option value="low">low — 전부 결재 요청</option>
                  <option value="medium">medium — low만 자동</option>
                  <option value="high">high — medium까지 자동</option>
                  <option value="critical">critical — high까지 자동</option>
                </select>
              </label>
            </div>

            <label className="mt-4 block text-[12px] text-dim">
              금지 도구 (쉼표 구분 — CLI 레벨에서 물리 차단)
              <input
                value={(draft.policy.disallowedTools ?? []).join(", ")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    policy: {
                      ...draft.policy,
                      disallowedTools: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    },
                  })
                }
                placeholder="Edit, Write, Bash"
                className="mt-1 w-full rounded-lg border border-line bg-ink/60 px-2.5 py-1.5 font-mono text-[11.5px] outline-none focus:border-gold/50"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

export { ROLE_LABEL };
