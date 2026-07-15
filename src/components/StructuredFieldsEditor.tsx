"use client";

type Field = { key: string; label: string; value: string };

function fieldsFrom(value: Record<string, unknown>, labels: Record<string, string>): Field[] {
  const entries = Object.entries(value);
  return (entries.length > 0 ? entries : [["", ""]]).map(([key, item]) => ({ key, label: labels[key] || key, value: item === null || item === undefined ? "" : String(item) }));
}

export function StructuredFieldsEditor(props: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  labels?: Record<string, string>;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  fixedKeys?: boolean;
}) {
  const labels = props.labels ?? {};
  const fields = fieldsFrom(props.value, labels);
  const commit = (next: Field[]) => props.onChange(Object.fromEntries(next.filter(item => item.key.trim()).map(item => [item.key.trim(), item.value])));
  return <div style={{ display: "grid", gap: 8 }}>
    {fields.map((field, index) => <div key={`${field.key}:${index}`} style={{ display: "grid", gridTemplateColumns: props.fixedKeys ? "minmax(130px,.7fr) minmax(180px,1.8fr)" : "minmax(130px,.8fr) minmax(180px,1.7fr) auto", gap: 8, alignItems: "center" }}>
      {props.fixedKeys ? <label style={{ color: "var(--text2)", fontSize: ".78rem" }}>{field.label || `字段 ${index + 1}`}</label> : <input className="input" value={field.key} placeholder={props.keyPlaceholder || "字段名"} onChange={event => commit(fields.map((item, position) => position === index ? { ...item, key: event.target.value, label: event.target.value } : item))}/>} 
      <input className="input" value={field.value} placeholder={props.valuePlaceholder || "填写内容"} onChange={event => commit(fields.map((item, position) => position === index ? { ...item, value: event.target.value } : item))}/>
      {!props.fixedKeys && <button type="button" className="btn-secondary" onClick={() => commit(fields.filter((_, position) => position !== index))}>移除</button>}
    </div>)}
    {!props.fixedKeys && <button type="button" className="btn-secondary" style={{ justifySelf: "start" }} onClick={() => commit([...fields, { key: `field_${fields.length + 1}`, label: `字段 ${fields.length + 1}`, value: "" }])}>+添加字段</button>}
  </div>;
}
