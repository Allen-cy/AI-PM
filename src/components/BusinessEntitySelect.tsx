"use client";

import { useEffect, useMemo, useState } from "react";
import { businessContextSearchParams, readStoredBusinessContext, readStoredDataClass } from "@/features/operating-model/client-context";

type DirectoryOption = { id: string; label: string; description: string };
type RichDirectoryOption = DirectoryOption & { entityType?: string; projectId?: string };
type Directory = { projects: RichDirectoryOption[]; people: RichDirectoryOption[]; evidence: RichDirectoryOption[]; formalOutputs: RichDirectoryOption[]; businessObjects: RichDirectoryOption[] };
type Kind = "project" | "person" | "evidence" | "formalOutput" | "businessObject";

const EMPTY_DIRECTORY: Directory = { projects: [], people: [], evidence: [], formalOutputs: [], businessObjects: [] };
const KEY: Record<Kind, keyof Directory> = { project: "projects", person: "people", evidence: "evidence", formalOutput: "formalOutputs", businessObject: "businessObjects" };

export function BusinessEntitySelect(props: {
  kind: Kind;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  entityType?: string | string[];
  projectId?: string;
  onSelectedOption?: (option: RichDirectoryOption | null) => void;
}) {
  const [directory, setDirectory] = useState<Directory>(EMPTY_DIRECTORY);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const context = readStoredBusinessContext();
      if (!context) { if (!cancelled) setError("请先选择业务身份"); return; }
      const query = businessContextSearchParams(context, readStoredDataClass());
      const response = await fetch(`/api/business-directory?${query.toString()}`, { cache: "no-store" });
      const body = await response.json() as { directory?: Directory; detail?: string; error?: string };
      if (!response.ok) { if (!cancelled) setError(body.detail || body.error || "业务目录不可用"); return; }
      if (!cancelled) { setDirectory(body.directory ?? EMPTY_DIRECTORY); setError(""); }
    }
    void load();
    const reload = () => void load();
    window.addEventListener("ai-pmo:business-context-changed", reload);
    window.addEventListener("ai-pmo:data-class-changed", reload);
    window.addEventListener("ai-pmo:project-context-changed", reload);
    return () => { cancelled = true; window.removeEventListener("ai-pmo:business-context-changed", reload); window.removeEventListener("ai-pmo:data-class-changed", reload); window.removeEventListener("ai-pmo:project-context-changed", reload); };
  }, []);
  const options = useMemo(() => {
    const types = props.entityType ? (Array.isArray(props.entityType) ? props.entityType : [props.entityType]) : [];
    return directory[KEY[props.kind]].filter(option => (!props.projectId || option.projectId === props.projectId) && (types.length === 0 || Boolean(option.entityType && types.includes(option.entityType))));
  }, [directory, props.entityType, props.kind, props.projectId]);
  return <select className={props.className || "input"} value={props.value} onChange={event => { const value = event.target.value; props.onChange(value); props.onSelectedOption?.(options.find(option => option.id === value) ?? null); }} disabled={props.disabled || Boolean(error)} title={error || undefined}>
    <option value="">{error || props.placeholder || "请选择"}</option>
    {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select>;
}

export function BusinessEntityMultiSelect(props: {
  kind: Exclude<Kind, "project" | "businessObject">;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [pending, setPending] = useState("");
  const [labels, setLabels] = useState<Record<string, string>>({});
  return <div style={{ display: "grid", gap: 7 }}>
    <BusinessEntitySelect kind={props.kind} value={pending} onChange={value => { setPending(""); if (value && !props.value.includes(value)) props.onChange([...props.value, value]); }} onSelectedOption={option => { if (option) setLabels(current => ({ ...current, [option.id]: option.label })); }} placeholder={props.placeholder} disabled={props.disabled} className={props.className}/>
    {props.value.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{props.value.map((value, index) => <button type="button" key={value} className="tag tag-blue" onClick={() => props.onChange(props.value.filter(item => item !== value))} title="移除">{labels[value] || `已选${props.kind === "person" ? "成员" : props.kind === "formalOutput" ? "成果" : "证据"} ${index + 1}`} ×</button>)}</div>}
  </div>;
}
