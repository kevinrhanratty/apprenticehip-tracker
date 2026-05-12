import { useState, useEffect, useRef } from "react";

const TASK_CATEGORIES = [
  "Rough-In Wiring",
  "Panel Installation / Upgrade",
  "Service & Repair",
  "Conduit Bending & Installation",
  "Device & Fixture Installation",
  "Load Calculations",
  "Code Inspection Prep",
  "Troubleshooting & Diagnostics",
  "Generator / Transfer Switch",
  "Low Voltage / Data",
  "Trenching / Underground",
  "Safety & Lockout/Tagout",
  "Blueprint Reading",
  "Tool Maintenance",
  "Other",
];

const STORAGE_KEY = "apprenticeship_tracker_v1";

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { entries: [], employers: [], supervisors: [] };
  } catch { return { entries: [], employers: [], supervisors: [] }; }
}

function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function weekOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().split("T")[0];
}

function totalHours(entries) {
  return entries.reduce((s, e) => s + Number(e.hours || 0), 0);
}

const VIEWS = ["log", "weekly", "summary", "settings"];

export default function App() {
  const [data, setData] = useState(loadData);
  const [view, setView] = useState("log");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [signModal, setSignModal] = useState(null);
  const [filterWeek, setFilterWeek] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => { saveData(data); }, [data]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(""), 2500); return () => clearTimeout(t); }
  }, [toast]);

  function showToast(msg) { setToast(msg); }

  function addEntry(entry) {
    if (editId) {
      setData(d => ({ ...d, entries: d.entries.map(e => e.id === editId ? { ...entry, id: editId } : e) }));
      setEditId(null);
      showToast("Entry updated");
    } else {
      const newEntry = { ...entry, id: Date.now(), signatures: [] };
      setData(d => ({ ...d, entries: [newEntry, ...d.entries] }));
      showToast("Hours logged");
    }
    setShowForm(false);
  }

  function deleteEntry(id) {
    if (window.confirm("Delete this entry?")) {
      setData(d => ({ ...d, entries: d.entries.filter(e => e.id !== id) }));
      showToast("Entry deleted");
    }
  }

  function addSignature(entryId, sig) {
    setData(d => ({
      ...d,
      entries: d.entries.map(e =>
        e.id === entryId
          ? { ...e, signatures: [...(e.signatures || []), { ...sig, date: new Date().toISOString() }] }
          : e
      ),
    }));
    setSignModal(null);
    showToast("Signed off");
  }

  function startEdit(entry) {
    setEditId(entry.id);
    setShowForm(true);
  }

  const weeks = [...new Set(data.entries.map(e => weekOf(e.date)))].sort((a, b) => b.localeCompare(a));
  const filteredEntries = filterWeek
    ? data.entries.filter(e => weekOf(e.date) === filterWeek)
    : data.entries;

  const totalAll = totalHours(data.entries);
  const totalPrimary = totalHours(data.entries.filter(e => e.type === "primary"));
  const totalRelated = totalHours(data.entries.filter(e => e.type === "related"));

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", fontFamily: "var(--font-sans)" }}>
      <h2 className="sr-only">Electrical Apprenticeship Hour Tracker</h2>

      {/* Header */}
      <div style={{ background: "#1a2332", padding: "1rem 1.25rem 0", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <div>
            <div style={{ fontSize: 11, color: "#7a9cc0", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>IBEW Apprenticeship</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: "#e8f0f8" }}>Hour Tracker</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#7a9cc0" }}>Total hours</div>
            <div style={{ fontSize: 24, fontWeight: 500, color: "#f0c040" }}>{totalAll.toFixed(1)}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 0, borderTop: "0.5px solid rgba(255,255,255,0.1)" }}>
          {[["log","i ti-list","Log"],["weekly","i ti-calendar","Weekly"],["summary","i ti-chart-bar","Summary"],["settings","i ti-settings","Settings"]].map(([v, icon, label]) => (
            <button key={v} onClick={() => setView(v)} style={{
              flex: 1, background: "none", border: "none", borderBottom: view === v ? "2px solid #f0c040" : "2px solid transparent",
              color: view === v ? "#f0c040" : "#7a9cc0", padding: "8px 0", fontSize: 11, cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3, transition: "color 0.15s"
            }}>
              <i className={`ti ${icon.split(" ")[1]}`} style={{ fontSize: 18 }} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1a2332", color: "#e8f0f8", padding: "10px 20px", borderRadius: 24,
          fontSize: 13, zIndex: 999, boxShadow: "0 4px 16px rgba(0,0,0,0.3)", whiteSpace: "nowrap"
        }}>{toast}</div>
      )}

      {/* Content */}
      <div style={{ padding: "1rem 1rem 5rem" }}>
        {view === "log" && (
          <LogView
            entries={filteredEntries}
            weeks={weeks}
            filterWeek={filterWeek}
            setFilterWeek={setFilterWeek}
            onEdit={startEdit}
            onDelete={deleteEntry}
            onSign={setSignModal}
          />
        )}
        {view === "weekly" && <WeeklyView entries={data.entries} weeks={weeks} />}
        {view === "summary" && <SummaryView entries={data.entries} totalAll={totalAll} totalPrimary={totalPrimary} totalRelated={totalRelated} />}
        {view === "settings" && <SettingsView data={data} setData={setData} showToast={showToast} />}
      </div>

      {/* FAB */}
      {view === "log" && !showForm && (
        <button onClick={() => { setEditId(null); setShowForm(true); }} style={{
          position: "fixed", bottom: 24, right: 20, width: 52, height: 52, borderRadius: "50%",
          background: "#f0c040", border: "none", color: "#1a2332", fontSize: 26, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)"
        }} aria-label="Add entry">
          <i className="ti ti-plus" aria-hidden="true" />
        </button>
      )}

      {/* Entry Form Modal */}
      {showForm && (
        <EntryForm
          data={data}
          editEntry={editId ? data.entries.find(e => e.id === editId) : null}
          onSave={addEntry}
          onCancel={() => { setShowForm(false); setEditId(null); }}
        />
      )}

      {/* Sign Modal */}
      {signModal && (
        <SignModal
          entry={data.entries.find(e => e.id === signModal)}
          supervisors={data.supervisors}
          onSign={sig => addSignature(signModal, sig)}
          onClose={() => setSignModal(null)}
        />
      )}
    </div>
  );
}

function LogView({ entries, weeks, filterWeek, setFilterWeek, onEdit, onDelete, onSign }) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <i className="ti ti-filter" style={{ color: "var(--color-text-secondary)", fontSize: 16 }} aria-hidden="true" />
        <select value={filterWeek} onChange={e => setFilterWeek(e.target.value)} style={{ flex: 1, fontSize: 13 }}>
          <option value="">All entries</option>
          {weeks.map(w => (
            <option key={w} value={w}>Week of {formatDate(w)}</option>
          ))}
        </select>
      </div>
      {sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--color-text-secondary)" }}>
          <i className="ti ti-clipboard" style={{ fontSize: 40, display: "block", marginBottom: 12 }} aria-hidden="true" />
          <div style={{ fontSize: 15 }}>No entries yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Tap + to log your first hours</div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(entry => <EntryCard key={entry.id} entry={entry} onEdit={onEdit} onDelete={onDelete} onSign={onSign} />)}
      </div>
    </div>
  );
}

function EntryCard({ entry, onEdit, onDelete, onSign }) {
  const [expanded, setExpanded] = useState(false);
  const sigs = entry.signatures || [];
  return (
    <div style={{ background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)", overflow: "hidden" }}>
      <div onClick={() => setExpanded(x => !x)} style={{ padding: "12px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 2 }}>{formatDate(entry.date)}</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>{entry.task}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{entry.employer}</div>
          </div>
          <div style={{ textAlign: "right", marginLeft: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: "#f0c040" }}>{Number(entry.hours).toFixed(1)}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>hrs</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: entry.type === "primary" ? "#e6f1fb" : "#eaf3de", color: entry.type === "primary" ? "#185fa5" : "#3b6d11" }}>
            {entry.type === "primary" ? "Primary (on-the-job)" : "Related (classroom)"}
          </span>
          {sigs.length > 0 && (
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#eaf3de", color: "#3b6d11" }}>
              <i className="ti ti-check" style={{ fontSize: 11 }} aria-hidden="true" /> {sigs.length} signature{sigs.length > 1 ? "s" : ""}
            </span>
          )}
          <i className={`ti ti-chevron-${expanded ? "up" : "down"}`} style={{ fontSize: 14, color: "var(--color-text-secondary)", marginLeft: "auto" }} aria-hidden="true" />
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", padding: "12px 14px" }}>
          {entry.supervisor && <Row label="Supervisor" value={entry.supervisor} />}
          {entry.foreman && <Row label="Foreman" value={entry.foreman} />}
          {entry.notes && <Row label="Notes" value={entry.notes} />}

          {sigs.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>Sign-offs</div>
              {sigs.map((s, i) => (
                <div key={i} style={{ fontSize: 12, padding: "6px 10px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{s.signerName}</span>
                  <span style={{ color: "var(--color-text-secondary)" }}> · {s.role}</span>
                  {s.pin && <span style={{ color: "var(--color-text-secondary)" }}> · PIN verified</span>}
                  <div style={{ color: "var(--color-text-secondary)", fontSize: 11, marginTop: 2 }}>{new Date(s.date).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => onSign(entry.id)} style={{ flex: 1, fontSize: 13, padding: "8px 0", borderRadius: "var(--border-radius-md)", background: "#1a2332", color: "#f0c040", border: "none", cursor: "pointer" }}>
              <i className="ti ti-writing" aria-hidden="true" /> Sign off
            </button>
            <button onClick={() => onEdit(entry)} style={{ flex: 1, fontSize: 13, padding: "8px 0" }}>
              <i className="ti ti-edit" aria-hidden="true" /> Edit
            </button>
            <button onClick={() => onDelete(entry.id)} style={{ fontSize: 13, padding: "8px 12px", color: "var(--color-text-danger)", borderColor: "var(--color-border-danger)" }}>
              <i className="ti ti-trash" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 13 }}>
      <span style={{ color: "var(--color-text-secondary)", minWidth: 80 }}>{label}</span>
      <span style={{ color: "var(--color-text-primary)", flex: 1 }}>{value}</span>
    </div>
  );
}

function WeeklyView({ entries, weeks }) {
  const [selWeek, setSelWeek] = useState(weeks[0] || "");
  useEffect(() => { if (!selWeek && weeks[0]) setSelWeek(weeks[0]); }, [weeks]);

  const weekEntries = entries.filter(e => weekOf(e.date) === selWeek);
  const byTask = {};
  weekEntries.forEach(e => { byTask[e.task] = (byTask[e.task] || 0) + Number(e.hours); });
  const weekTotal = totalHours(weekEntries);
  const primaryHrs = totalHours(weekEntries.filter(e => e.type === "primary"));
  const relatedHrs = totalHours(weekEntries.filter(e => e.type === "related"));

  return (
    <div>
      <select value={selWeek} onChange={e => setSelWeek(e.target.value)} style={{ width: "100%", marginBottom: 14, fontSize: 14 }}>
        {weeks.map(w => <option key={w} value={w}>Week of {formatDate(w)}</option>)}
        {weeks.length === 0 && <option>No entries yet</option>}
      </select>

      {selWeek && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            <StatCard label="Total" value={weekTotal.toFixed(1)} unit="hrs" color="#f0c040" />
            <StatCard label="Primary" value={primaryHrs.toFixed(1)} unit="hrs" color="#5dcaa5" />
            <StatCard label="Related" value={relatedHrs.toFixed(1)} unit="hrs" color="#7f77dd" />
          </div>

          <div style={{ background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>Hours by task</div>
            {Object.keys(byTask).length === 0 && (
              <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>No entries this week</div>
            )}
            {Object.entries(byTask).sort((a, b) => b[1] - a[1]).map(([task, hrs]) => (
              <div key={task} style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{task}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 60, height: 4, borderRadius: 2, background: "var(--color-background-secondary)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, (hrs / weekTotal) * 100)}%`, height: "100%", background: "#f0c040", borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, minWidth: 36, textAlign: "right" }}>{hrs.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>Daily breakdown</div>
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day, i) => {
              const dayIdx = i === 6 ? 0 : i + 1;
              const dayEntries = weekEntries.filter(e => new Date(e.date + "T00:00:00").getDay() === dayIdx);
              const dayHrs = totalHours(dayEntries);
              return (
                <div key={day} style={{ padding: "9px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: dayHrs > 0 ? "var(--color-text-primary)" : "var(--color-text-secondary)", minWidth: 36 }}>{day}</span>
                  {dayHrs > 0 ? (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                      <div style={{ width: 80, height: 4, borderRadius: 2, background: "var(--color-background-secondary)" }}>
                        <div style={{ width: `${Math.min(100, (dayHrs / 10) * 100)}%`, height: "100%", background: "#5dcaa5", borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, minWidth: 36, textAlign: "right" }}>{dayHrs.toFixed(1)} hrs</span>
                    </div>
                  ) : <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>—</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, unit, color }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "10px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{unit}</div>
    </div>
  );
}

function SummaryView({ entries, totalAll, totalPrimary, totalRelated }) {
  const NC_LIMITED_TARGET = 3000;
  const NC_PRIMARY_TARGET = 2000;
  const pct = Math.min(100, (totalAll / NC_LIMITED_TARGET) * 100);
  const pctPrimary = Math.min(100, (totalPrimary / NC_PRIMARY_TARGET) * 100);

  const byCategory = {};
  entries.forEach(e => { byCategory[e.task] = (byCategory[e.task] || 0) + Number(e.hours); });

  const byEmployer = {};
  entries.forEach(e => { if (e.employer) byEmployer[e.employer] = (byEmployer[e.employer] || 0) + Number(e.hours); });

  const signed = entries.filter(e => (e.signatures || []).length > 0).length;

  return (
    <div>
      <div style={{ background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)", padding: "14px", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10, fontWeight: 500 }}>NC Limited License progress</div>
        <ProgressBar label="Total hours" current={totalAll} target={NC_LIMITED_TARGET} color="#f0c040" />
        <ProgressBar label="Primary (on-the-job)" current={totalPrimary} target={NC_PRIMARY_TARGET} color="#5dcaa5" />
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 8 }}>NC requires 3,000 total hours (min. 2,000 primary) for Limited EC license</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <StatCard label="Total entries" value={entries.length} unit="records" color="var(--color-text-primary)" />
        <StatCard label="Signed entries" value={signed} unit="records" color="#5dcaa5" />
        <StatCard label="Primary hrs" value={totalPrimary.toFixed(1)} unit="hrs" color="#5dcaa5" />
        <StatCard label="Related hrs" value={totalRelated.toFixed(1)} unit="hrs" color="#7f77dd" />
      </div>

      <div style={{ background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)", overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>Hours by task type</div>
        {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([task, hrs]) => (
          <div key={task} style={{ padding: "9px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-primary)", flex: 1 }}>{task}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 50, height: 4, borderRadius: 2, background: "var(--color-background-secondary)" }}>
                <div style={{ width: `${Math.min(100, (hrs / totalAll) * 100)}%`, height: "100%", background: "#f0c040", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, minWidth: 40, textAlign: "right" }}>{hrs.toFixed(1)}</span>
            </div>
          </div>
        ))}
        {Object.keys(byCategory).length === 0 && <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>No data yet</div>}
      </div>

      <div style={{ background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)", overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>Hours by employer</div>
        {Object.entries(byEmployer).sort((a, b) => b[1] - a[1]).map(([emp, hrs]) => (
          <div key={emp} style={{ padding: "9px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-primary)" }}>{emp}</span>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{hrs.toFixed(1)} hrs</span>
          </div>
        ))}
        {Object.keys(byEmployer).length === 0 && <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>No data yet</div>}
      </div>
    </div>
  );
}

function ProgressBar({ label, current, target, color }) {
  const pct = Math.min(100, (current / target) * 100);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: "var(--color-text-primary)" }}>{label}</span>
        <span style={{ color: "var(--color-text-secondary)" }}>{current.toFixed(0)} / {target.toLocaleString()} hrs ({pct.toFixed(1)}%)</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--color-background-secondary)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

function EntryForm({ data, editEntry, onSave, onCancel }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState(editEntry ? { ...editEntry } : {
    date: today, task: TASK_CATEGORIES[0], type: "primary",
    hours: "", employer: data.employers[0] || "", supervisor: "", foreman: "", notes: ""
  });

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function submit() {
    if (!form.date || !form.task || !form.hours || Number(form.hours) <= 0) {
      alert("Please fill in date, task, and hours.");
      return;
    }
    onSave(form);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ background: "var(--color-background-primary)", borderRadius: "20px 20px 0 0", padding: "1.25rem 1.25rem 2rem", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{editEntry ? "Edit entry" : "Log hours"}</div>
          <button onClick={onCancel} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-secondary)" }} aria-label="Close">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        <Label text="Date" />
        <input type="date" value={form.date} onChange={e => set("date", e.target.value)} style={{ width: "100%", marginBottom: 12 }} />

        <Label text="Task / work type" />
        <select value={form.task} onChange={e => set("task", e.target.value)} style={{ width: "100%", marginBottom: 12 }}>
          {TASK_CATEGORIES.map(t => <option key={t}>{t}</option>)}
        </select>

        <Label text="Hour type" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[["primary", "Primary (on-the-job)"], ["related", "Related (classroom)"]].map(([val, label]) => (
            <button key={val} onClick={() => set("type", val)} style={{
              padding: "10px 8px", borderRadius: "var(--border-radius-md)", fontSize: 12, cursor: "pointer",
              background: form.type === val ? "#1a2332" : "var(--color-background-secondary)",
              color: form.type === val ? "#f0c040" : "var(--color-text-secondary)",
              border: form.type === val ? "1px solid #1a2332" : "0.5px solid var(--color-border-tertiary)",
            }}>{label}</button>
          ))}
        </div>

        <Label text="Hours worked" />
        <input type="number" min="0.5" max="24" step="0.5" value={form.hours}
          onChange={e => set("hours", e.target.value)} placeholder="e.g. 8" style={{ width: "100%", marginBottom: 12 }} />

        <Label text="Employer" />
        <input value={form.employer} onChange={e => set("employer", e.target.value)}
          list="employer-list" placeholder="Employer name" style={{ width: "100%", marginBottom: 12 }} />
        <datalist id="employer-list">{data.employers.map(e => <option key={e} value={e} />)}</datalist>

        <Label text="Journeyman / supervisor" />
        <input value={form.supervisor} onChange={e => set("supervisor", e.target.value)}
          list="sup-list" placeholder="Name" style={{ width: "100%", marginBottom: 12 }} />
        <datalist id="sup-list">{data.supervisors.map(s => <option key={s.name} value={s.name} />)}</datalist>

        <Label text="Foreman" />
        <input value={form.foreman} onChange={e => set("foreman", e.target.value)}
          placeholder="Name (optional)" style={{ width: "100%", marginBottom: 12 }} />

        <Label text="Notes" />
        <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
          placeholder="Job description, location, skills practiced..." rows={3}
          style={{ width: "100%", resize: "vertical", padding: 8, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)", fontSize: 14, fontFamily: "var(--font-sans)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", marginBottom: 16 }} />

        <button onClick={submit} style={{ width: "100%", padding: "13px", background: "#1a2332", color: "#f0c040", border: "none", borderRadius: "var(--border-radius-lg)", fontSize: 15, fontWeight: 500, cursor: "pointer" }}>
          {editEntry ? "Save changes" : "Log hours"}
        </button>
      </div>
    </div>
  );
}

function Label({ text }) {
  return <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 5, fontWeight: 500 }}>{text}</div>;
}

function SignModal({ entry, supervisors, onSign, onClose }) {
  const [form, setForm] = useState({ signerName: "", role: "Journeyman", pin: "" });
  const [step, setStep] = useState("info");

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function proceed() {
    if (!form.signerName) { alert("Please enter your name."); return; }
    if (supervisors.find(s => s.name === form.signerName && s.pin)) {
      setStep("pin");
    } else {
      onSign({ signerName: form.signerName, role: form.role, pin: false });
    }
  }

  function verifyPin() {
    const sup = supervisors.find(s => s.name === form.signerName);
    if (sup && sup.pin && sup.pin === form.pin) {
      onSign({ signerName: form.signerName, role: form.role, pin: true });
    } else {
      alert("Incorrect PIN. Try again.");
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem", width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>Sign off on entry</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "var(--color-text-secondary)" }} aria-label="Close">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        {entry && (
          <div style={{ fontSize: 12, background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px", marginBottom: 14, color: "var(--color-text-secondary)" }}>
            {formatDate(entry.date)} · {entry.task} · {Number(entry.hours).toFixed(1)} hrs
          </div>
        )}

        {step === "info" && (
          <>
            <Label text="Your name" />
            <input value={form.signerName} onChange={e => set("signerName", e.target.value)}
              list="signer-list" placeholder="Full name" style={{ width: "100%", marginBottom: 12 }} />
            <datalist id="signer-list">{supervisors.map(s => <option key={s.name} value={s.name} />)}</datalist>

            <Label text="Your role" />
            <select value={form.role} onChange={e => set("role", e.target.value)} style={{ width: "100%", marginBottom: 16 }}>
              {["Journeyman", "Foreman", "Master Electrician", "Employer / EC License Holder"].map(r => <option key={r}>{r}</option>)}
            </select>

            <button onClick={proceed} style={{ width: "100%", padding: "11px", background: "#1a2332", color: "#f0c040", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 14, cursor: "pointer" }}>
              Continue
            </button>
          </>
        )}

        {step === "pin" && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14 }}>
              A PIN is registered for <strong>{form.signerName}</strong>. Enter it to verify your identity.
            </div>
            <Label text="4-digit PIN" />
            <input type="password" maxLength={4} inputMode="numeric" value={form.pin}
              onChange={e => set("pin", e.target.value)} placeholder="••••" style={{ width: "100%", marginBottom: 16, letterSpacing: "0.3em", fontSize: 18, textAlign: "center" }} />
            <button onClick={verifyPin} style={{ width: "100%", padding: "11px", background: "#1a2332", color: "#f0c040", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 14, cursor: "pointer" }}>
              Verify & sign
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SettingsView({ data, setData, showToast }) {
  const [newEmp, setNewEmp] = useState("");
  const [newSup, setNewSup] = useState({ name: "", role: "Journeyman", pin: "" });

  function addEmployer() {
    if (!newEmp.trim()) return;
    setData(d => ({ ...d, employers: [...d.employers, newEmp.trim()] }));
    setNewEmp("");
    showToast("Employer added");
  }

  function removeEmployer(emp) {
    setData(d => ({ ...d, employers: d.employers.filter(e => e !== emp) }));
  }

  function addSupervisor() {
    if (!newSup.name.trim()) return;
    setData(d => ({ ...d, supervisors: [...d.supervisors, { ...newSup, name: newSup.name.trim() }] }));
    setNewSup({ name: "", role: "Journeyman", pin: "" });
    showToast("Supervisor added");
  }

  function removeSupervisor(name) {
    setData(d => ({ ...d, supervisors: d.supervisors.filter(s => s.name !== name) }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `apprenticeship_hours_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Data exported");
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (imported.entries) { setData(imported); showToast("Data imported"); }
        else alert("Invalid file format.");
      } catch { alert("Could not read file."); }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    if (window.confirm("Delete ALL entries? This cannot be undone.")) {
      setData(d => ({ ...d, entries: [] }));
      showToast("All entries cleared");
    }
  }

  return (
    <div>
      <Section title="Employers">
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={newEmp} onChange={e => setNewEmp(e.target.value)}
            placeholder="Employer name" style={{ flex: 1 }}
            onKeyDown={e => e.key === "Enter" && addEmployer()} />
          <button onClick={addEmployer} style={{ padding: "8px 14px" }}>Add</button>
        </div>
        {data.employers.map(emp => (
          <div key={emp} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 13 }}>
            <span>{emp}</span>
            <button onClick={() => removeEmployer(emp)} style={{ border: "none", background: "none", color: "var(--color-text-danger)", cursor: "pointer", fontSize: 16 }} aria-label="Remove">
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </div>
        ))}
        {data.employers.length === 0 && <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>No employers added</div>}
      </Section>

      <Section title="Supervisors / journeymen (for sign-off)">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          <input value={newSup.name} onChange={e => setNewSup(s => ({ ...s, name: e.target.value }))}
            placeholder="Full name" />
          <select value={newSup.role} onChange={e => setNewSup(s => ({ ...s, role: e.target.value }))}>
            {["Journeyman", "Foreman", "Master Electrician", "Employer / EC License Holder"].map(r => <option key={r}>{r}</option>)}
          </select>
          <input type="password" maxLength={4} inputMode="numeric" value={newSup.pin}
            onChange={e => setNewSup(s => ({ ...s, pin: e.target.value }))}
            placeholder="4-digit PIN (optional, for verification)" />
          <button onClick={addSupervisor}>Add supervisor</button>
        </div>
        {data.supervisors.map(sup => (
          <div key={sup.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 13 }}>
            <div>
              <div style={{ fontWeight: 500 }}>{sup.name}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{sup.role}{sup.pin ? " · PIN set" : ""}</div>
            </div>
            <button onClick={() => removeSupervisor(sup.name)} style={{ border: "none", background: "none", color: "var(--color-text-danger)", cursor: "pointer", fontSize: 16 }} aria-label="Remove">
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </div>
        ))}
        {data.supervisors.length === 0 && <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>No supervisors added</div>}
      </Section>

      <Section title="Data management">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={exportData} style={{ textAlign: "left", padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <i className="ti ti-download" style={{ fontSize: 18 }} aria-hidden="true" /> Export all data (JSON backup)
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, padding: "11px 14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", cursor: "pointer" }}>
            <i className="ti ti-upload" style={{ fontSize: 18 }} aria-hidden="true" /> Import data from backup
            <input type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
          </label>
          <button onClick={clearAll} style={{ textAlign: "left", padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--color-text-danger)", borderColor: "var(--color-border-danger)" }}>
            <i className="ti ti-trash" style={{ fontSize: 18 }} aria-hidden="true" /> Clear all entries
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 12 }}>
          Tip: Export a backup regularly and save it to iCloud or Google Drive so your records are never lost.
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)", marginBottom: 12, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>{title}</div>
      <div style={{ padding: "12px 14px" }}>{children}</div>
    </div>
  );
}
