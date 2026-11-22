import React, { useState, useEffect, useCallback } from "react";

/* ============================================================
   CampusGo — AdminDashboard.js

   Password-only admin login (POST /api/admin/login), then one
   tab per schema.sql table (everything server.js exposes CRUD
   routes for — `users` is intentionally excluded since it has
   no admin CRUD routes). Every write sends the admin token in
   an `x-admin-token` header, per server.js's requireAdmin.

   Table + field definitions live in one TABLES config below, so
   list/add/edit/delete forms are generated rather than hand-
   written per table — same idea as registerCrudRoutes in
   server.js, just on the frontend.

   Ownership (vendor_name): this dashboard deliberately never
   sends an X-Vendor-Name header. server.js treats that absence
   as "this is an admin request" — full access to the four
   catalog tables' vendor_name field, including claiming
   "Unclaimed" items or reassigning ownership, which a vendor's
   own app (campusgo-vendor-app) can never do through its
   ownership-checked path. Leave vendor_name blank when adding an
   item here to keep it unclaimed.
   ============================================================ */

// Set REACT_APP_API_BASE in your deploy environment (e.g. Render's
// Environment tab) to point at your deployed backend. Falls back to
// the local dev default when it's not set.
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000/api";

const COLORS = {
  bg: "#0B1A16",
  surface: "#122720",
  surface2: "#183129",
  spice: "#E8622D",
  spiceLight: "#FF8A54",
  palm: "#1F8A73",
  cream: "#F6EFE4",
  muted: "#9FB3AC",
  line: "#24443A",
  danger: "#E85D5D",
};

const cardStyle = { background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 20 };
const labelStyle = { display: "block", fontSize: 12, color: COLORS.muted, marginBottom: 6, fontWeight: 600 };
const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${COLORS.line}`, background: COLORS.bg, color: COLORS.cream, fontSize: 14 };
const btnBase = { padding: "10px 18px", borderRadius: 9, fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer", fontFamily: "inherit" };
const btnPrimary = { ...btnBase, background: COLORS.spice, color: "#fff" };
const btnGhost = { ...btnBase, background: COLORS.surface2, color: COLORS.cream, border: `1px solid ${COLORS.line}` };
const btnDanger = { ...btnBase, background: "rgba(232,93,93,0.15)", color: "#FFC9C9", border: `1px solid ${COLORS.danger}`, padding: "6px 12px", fontSize: 12 };
const btnSmall = { ...btnGhost, padding: "6px 12px", fontSize: 12 };

/* ---------------- Table + field config ---------------- */
const TABLES = [
  {
    key: "hostels",
    label: "Hostels",
    endpoint: "hostels",
    fields: [{ name: "name", type: "text", required: true }],
  },
  {
    key: "menu_items",
    label: "Food Menu",
    endpoint: "menu_items",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "category", type: "select", required: true, options: ["Rice", "Swallow", "Quick Bites", "Snacks", "Drinks", "Breakfast"] },
      { name: "vendor_name", type: "text", helper: "Leave blank to keep this item unclaimed" },
      { name: "price", type: "number", required: true },
      { name: "emoji", type: "text" },
      { name: "unit", type: "text" },
    ],
  },
  {
    key: "gas_items",
    label: "Gas Filling",
    endpoint: "gas_items",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "category", type: "select", required: true, options: ["Refill", "Swap", "Accessories"] },
      { name: "vendor_name", type: "text", helper: "Leave blank to keep this item unclaimed" },
      { name: "price", type: "number", required: true },
      { name: "emoji", type: "text" },
      { name: "unit", type: "text" },
    ],
  },
  {
    key: "laundry_items",
    label: "Laundry",
    endpoint: "laundry_items",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "category", type: "select", required: true, options: ["Wash", "Iron", "Dry Clean"] },
      { name: "vendor_name", type: "text", helper: "Leave blank to keep this item unclaimed" },
      { name: "price", type: "number", required: true },
      { name: "emoji", type: "text" },
      { name: "unit", type: "text" },
    ],
  },
  {
    key: "stationery_items",
    label: "Stationery",
    endpoint: "stationery_items",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "category", type: "select", required: true, options: ["Books", "Writing", "Paper", "Printing", "Tools"] },
      { name: "vendor_name", type: "text", helper: "Leave blank to keep this item unclaimed" },
      { name: "price", type: "number", required: true },
      { name: "emoji", type: "text" },
      { name: "unit", type: "text" },
    ],
  },
  {
    key: "orders",
    label: "Orders",
    endpoint: "orders",
    fields: [
      { name: "order_code", type: "text", required: true },
      { name: "user_id", type: "number", required: true },
      { name: "service", type: "select", required: true, options: ["food", "gas", "laundry", "stationery"] },
      { name: "hostel_id", type: "number" },
      { name: "status", type: "text", default: "Order placed" },
      { name: "step_index", type: "number", default: 0 },
      { name: "progress", type: "number", step: "0.01", default: 0.08 },
      { name: "minutes_left", type: "number", default: 18 },
      { name: "subtotal", type: "number", required: true },
      { name: "delivery_fee", type: "number", default: 300 },
      { name: "total", type: "number", required: true },
      { name: "payment_method", type: "select", required: true, options: ["card", "transfer", "cash"] },
    ],
  },
  {
    key: "order_items",
    label: "Order Items",
    endpoint: "order_items",
    fields: [
      { name: "order_id", type: "number", required: true },
      { name: "source_table", type: "select", required: true, options: ["menu_items", "gas_items", "laundry_items", "stationery_items"] },
      { name: "source_id", type: "number", required: true },
      { name: "name", type: "text", required: true },
      { name: "emoji", type: "text" },
      { name: "price", type: "number", required: true },
      { name: "qty", type: "number", step: "0.01", default: 1 },
    ],
  },
  {
    key: "vendor_bank_accounts",
    label: "Vendor Payout Accounts",
    endpoint: "vendor_bank_accounts",
    fields: [
      { name: "vendor_name", type: "text", required: true, helper: "Must match the business name used in the vendor app exactly" },
      { name: "bank_code", type: "text", required: true },
      { name: "bank_name", type: "text", required: true },
      { name: "account_number", type: "text", required: true },
      { name: "account_name", type: "text", required: true, helper: "Normally filled in automatically by Flutterwave's account verification" },
    ],
  },
  {
    key: "vendor_earnings",
    label: "Vendor Earnings & Payouts",
    endpoint: "vendor_earnings",
    fields: [
      { name: "order_id", type: "number", required: true },
      { name: "vendor_name", type: "text", required: true },
      { name: "gross_amount", type: "number", required: true },
      { name: "commission_amount", type: "number", required: true },
      { name: "net_amount", type: "number", required: true, helper: "What the vendor is actually owed (gross minus commission)" },
      { name: "payout_status", type: "select", required: true, options: ["pending", "paid"], helper: "Set to 'paid' once you've sent this vendor their money, by any method" },
      { name: "paid_at", type: "text", helper: "e.g. 2026-08-27 14:30:00 — leave blank until paid" },
    ],
  },
];

/* ---------------- API helper ---------------- */
async function apiFetch(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["x-admin-token"] = token;
  const res = await fetch(`${API_BASE}/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    const err = new Error("Admin session expired or invalid");
    err.unauthorized = true;
    throw err;
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && data.error) message = data.error;
    } catch (_) {}
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

/* ---------------- Login screen ---------------- */
function AdminLogin({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }
      onLogin(data.token);
    } catch (err) {
      setError("Couldn't reach the server. Make sure it's running on http://localhost:5000.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, color: COLORS.cream, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <form onSubmit={submit} style={{ ...cardStyle, width: 340 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>CampusGo Admin</h2>
        <p style={{ color: COLORS.muted, fontSize: 13, margin: "0 0 20px" }}>Sign in with the admin password to manage the app's data.</p>
        {error && (
          <div style={{ background: "rgba(232,93,93,0.12)", border: `1px solid ${COLORS.danger}`, color: "#FFC9C9", fontSize: 13, padding: "10px 12px", borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}
        <label style={labelStyle}>Admin password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ ...inputStyle, marginBottom: 16 }}
          placeholder="••••••••"
          required
        />
        <button type="submit" disabled={loading} style={{ ...btnPrimary, width: "100%", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

/* ---------------- Add / edit form ---------------- */
function RecordForm({ table, initial, onCancel, onSubmit }) {
  const [values, setValues] = useState(() => {
    const v = {};
    table.fields.forEach((f) => {
      const existing = initial ? initial[f.name] : undefined;
      v[f.name] = existing !== undefined && existing !== null ? String(existing) : (f.default !== undefined ? String(f.default) : "");
    });
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleChange(field, raw) {
    setValues((prev) => ({ ...prev, [field.name]: raw }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const payload = {};
    table.fields.forEach((f) => {
      const raw = values[f.name];
      if (raw === "" || raw === undefined) return; // skip empty optional fields
      payload[f.name] = f.type === "number" ? Number(raw) : raw;
    });
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...cardStyle, marginBottom: 20 }}>
      <h4 style={{ margin: "0 0 14px" }}>{initial ? `Edit ${table.label} #${initial.id}` : `Add ${table.label}`}</h4>
      {error && (
        <div style={{ background: "rgba(232,93,93,0.12)", border: `1px solid ${COLORS.danger}`, color: "#FFC9C9", fontSize: 13, padding: "8px 12px", borderRadius: 8, marginBottom: 14 }}>
          {error}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14 }}>
        {table.fields.map((f) => (
          <div key={f.name}>
            <label style={labelStyle}>{f.name}{f.required ? " *" : ""}</label>
            {f.type === "select" ? (
              <select value={values[f.name]} onChange={(e) => handleChange(f, e.target.value)} required={f.required} style={inputStyle}>
                <option value="">-- select --</option>
                {f.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === "number" ? "number" : "text"}
                step={f.type === "number" ? (f.step || "any") : undefined}
                value={values[f.name]}
                onChange={(e) => handleChange(f, e.target.value)}
                required={f.required}
                style={inputStyle}
              />
            )}
            {f.helper && <p style={{ fontSize: 11, color: COLORS.muted, margin: "4px 0 0" }}>{f.helper}</p>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add"}
        </button>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </form>
  );
}

/* ---------------- One tab: list + add/edit/delete for a table ---------------- */
function TableTab({ table, token, onUnauthorized }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRow, setEditingRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(table.endpoint); // list is public, no token needed
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [table.endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(values) {
    try {
      await apiFetch(table.endpoint, { method: "POST", token, body: values });
      setShowAddForm(false);
      load();
    } catch (err) {
      if (err.unauthorized) return onUnauthorized();
      throw err;
    }
  }

  async function handleUpdate(id, values) {
    try {
      await apiFetch(`${table.endpoint}/${id}`, { method: "PUT", token, body: values });
      setEditingRow(null);
      load();
    } catch (err) {
      if (err.unauthorized) return onUnauthorized();
      throw err;
    }
  }

  async function handleDelete(id) {
    if (!window.confirm(`Delete ${table.label} #${id}? This cannot be undone.`)) return;
    try {
      await apiFetch(`${table.endpoint}/${id}`, { method: "DELETE", token });
      load();
    } catch (err) {
      if (err.unauthorized) return onUnauthorized();
      alert(err.message);
    }
  }

  const columns = ["id", ...table.fields.map((f) => f.name)];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>{table.label}</h2>
        {!showAddForm && !editingRow && (
          <button
            style={btnPrimary}
            onClick={() => {
              setShowAddForm(true);
              setEditingRow(null);
            }}
          >
            + Add {table.label.replace(/s$/, "")}
          </button>
        )}
      </div>

      {showAddForm && (
        <RecordForm table={table} onCancel={() => setShowAddForm(false)} onSubmit={handleCreate} />
      )}
      {editingRow && (
        <RecordForm
          table={table}
          initial={editingRow}
          onCancel={() => setEditingRow(null)}
          onSubmit={(values) => handleUpdate(editingRow.id, values)}
        />
      )}

      {loading && <p style={{ color: COLORS.muted }}>Loading…</p>}
      {error && <p style={{ color: COLORS.danger }}>{error}</p>}

      {!loading && !error && (
        <div style={{ ...cardStyle, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} style={{ textAlign: "left", padding: "10px 14px", borderBottom: `1px solid ${COLORS.line}`, color: COLORS.muted, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {c}
                  </th>
                ))}
                <th style={{ padding: "10px 14px", borderBottom: `1px solid ${COLORS.line}` }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c} style={{ padding: "10px 14px", borderBottom: `1px solid ${COLORS.line}`, whiteSpace: "nowrap" }}>
                      {c === "vendor_name" && (row[c] === null || row[c] === undefined || row[c] === "")
                        ? <span style={{ color: COLORS.muted, fontStyle: "italic" }}>Unclaimed</span>
                        : (row[c] === null || row[c] === undefined ? "" : String(row[c]))}
                    </td>
                  ))}
                  <td style={{ padding: "10px 14px", borderBottom: `1px solid ${COLORS.line}`, whiteSpace: "nowrap" }}>
                    <button
                      style={{ ...btnSmall, marginRight: 8 }}
                      onClick={() => {
                        setEditingRow(row);
                        setShowAddForm(false);
                      }}
                    >
                      Edit
                    </button>
                    <button style={btnDanger} onClick={() => handleDelete(row.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} style={{ padding: 16, color: COLORS.muted, textAlign: "center" }}>
                    No rows yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Root dashboard: login gate + tab nav ---------------- */
function AdminDashboard() {
  const [token, setToken] = useState(() => sessionStorage.getItem("cg_admin_token") || "");
  const [activeTab, setActiveTab] = useState(TABLES[0].key);

  function handleLogin(newToken) {
    sessionStorage.setItem("cg_admin_token", newToken);
    setToken(newToken);
  }

  function handleLogout() {
    sessionStorage.removeItem("cg_admin_token");
    setToken("");
  }

  function handleUnauthorized() {
    handleLogout();
  }

  if (!token) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  const activeTable = TABLES.find((t) => t.key === activeTab) || TABLES[0];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.cream, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: `1px solid ${COLORS.line}` }}>
        <b style={{ fontSize: 18 }}>CampusGo Admin</b>
        <button style={btnGhost} onClick={handleLogout}>Log out</button>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <nav style={{ width: 200, flexShrink: 0, borderRight: `1px solid ${COLORS.line}`, padding: 18, minHeight: "calc(100vh - 61px)" }}>
          {TABLES.map((t) => (
            <div
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                cursor: "pointer",
                marginBottom: 6,
                fontSize: 14,
                fontWeight: 600,
                background: activeTab === t.key ? COLORS.spice : "transparent",
                color: activeTab === t.key ? "#fff" : COLORS.muted,
              }}
            >
              {t.label}
            </div>
          ))}
        </nav>
        <main style={{ flex: 1, padding: 28 }}>
          <TableTab key={activeTable.key} table={activeTable} token={token} onUnauthorized={handleUnauthorized} />
        </main>
      </div>
    </div>
  );
}

export default AdminDashboard;
