import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ============================================================
   CampusGo — food, gas, laundry & stationery for campus life.

   All four catalogs (food, gas, laundry, stationery), plus
   hostels, are fetched live from the server on load:
     GET /api/menu_items
     GET /api/gas_items
     GET /api/laundry_items
     GET /api/stationery_items
     GET /api/hostels
   Filter categories for each service are derived from whatever
   categories are actually present in that service's fetched
   items, so new categories added server-side show up here
   automatically — no local constants to keep in sync.
   ============================================================ */

// Set REACT_APP_API_BASE and REACT_APP_VENDOR_APP_URL in your deploy
// environment (e.g. Render's Environment tab) to point at your
// deployed backend and vendor app. Falls back to local dev defaults
// when those aren't set.
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000/api";

// The vendor app now lives in its own separate project (see
// campusgo-vendor-app/) rather than inside this app's public folder.
// Update this to wherever it's actually running — the default matches
// its own `npm start` (see campusgo-vendor-app/README.md).
const VENDOR_APP_URL = process.env.REACT_APP_VENDOR_APP_URL || "http://localhost:4000";
const APP_NAME = "CampusGo";

// Flutterwave dashboard → Settings → API Keys. The PUBLIC key is safe
// to ship in frontend code (that's what it's for) — never put the
// secret key here, that lives only in the backend's .env.
const FLUTTERWAVE_PUBLIC_KEY = process.env.REACT_APP_FLUTTERWAVE_PUBLIC_KEY || "FLWPUBK_TEST-your-test-public-key";

// Google Cloud Console → APIs & Services → Credentials → OAuth 2.0
// Client IDs. Authorized JavaScript origins must include exactly the
// URL this app runs on (e.g. http://localhost:3000).
const GOOGLE_CLIENT_ID = "568817275949-uvdtdeeqfegmu6bjsafei1odlinlpohf.apps.googleusercontent.com";

const COLORS = {
  bg: "#0B1A16",
  surface: "#122720",
  surface2: "#183129",
  surface3: "#1E3B31",
  spice: "#E8622D",
  spiceLight: "#FF8A54",
  palm: "#1F8A73",
  palmLight: "#3DBFA0",
  cream: "#F6EFE4",
  muted: "#9FB3AC",
  line: "#24443A",
  danger: "#E85D5D",
};

/* ---------------- Services ---------------- */
const SERVICES = [
  { key: "food", label: "Food Delivery", icon: "🍛", tagline: "Campus meals, delivered hot in ~18 min" },
  { key: "gas", label: "Gas Filling", icon: "🔥", tagline: "Cooking gas refills & swaps, brought to you" },
  { key: "laundry", label: "Laundry", icon: "🧺", tagline: "Wash, iron & dry-clean pickup service" },
  { key: "stationery", label: "Stationery", icon: "📚", tagline: "Books, printing & writing supplies" },
];
const serviceByKey = (key) => SERVICES.find((s) => s.key === key);

// Filter-tab categories are derived from whatever's actually in a
// fetched item list, so they always match the live server data.
function categoriesFromItems(items) {
  const unique = Array.from(new Set((items || []).map((it) => it.category).filter(Boolean)));
  return ["All", ...unique];
}

function stepsForService(service) {
  if (service === "laundry") {
    return ["Order placed", "Picked up from you", "Washing / Ironing", "Out for delivery", "Delivered"];
  }
  return ["Order placed", "Vendor preparing", "Rider picked up", "Out for delivery", "Delivered"];
}

function naira(n) {
  return "₦" + Number(n).toLocaleString();
}

/* ---------------- Delivery location & ETA ---------------- */
// Dispatch hub coordinates — this is a placeholder near OAU's campus
// center. Swap in your actual pickup/dispatch point's exact lat/lng
// for real distance estimates.
const HUB_LOCATION = { lat: 7.5181, lng: 4.5284 };

// Rough fallback distances (km from the hub) for hostels/zones when a
// user can't or won't share their exact location. Edit these to match
// your real hostels — anything not listed falls back to 1.5km.
const HOSTEL_DISTANCE_KM = {
  "Angola Hall": 0.8,
  "Mozambique Hall": 1.0,
  "Awolowo Hall": 1.4,
  "Fajuyi Hall": 1.8,
  "Off-campus (Ede Road)": 4.5,
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Base prep/dispatch time + a per-km rate, clamped to a sane range so
// a bad GPS reading can't produce a wildly high or low estimate.
function estimateMinutes(distanceKm, service) {
  const prep = service === "laundry" ? 15 : service === "gas" ? 10 : 8;
  const perKm = 5;
  const raw = prep + distanceKm * perKm;
  return Math.max(10, Math.min(60, Math.round(raw)));
}

function distanceForOrder(location, hostel) {
  if (location && typeof location.lat === "number" && typeof location.lng === "number") {
    return haversineKm(location.lat, location.lng, HUB_LOCATION.lat, HUB_LOCATION.lng);
  }
  return HOSTEL_DISTANCE_KM[hostel] ?? 1.5;
}

/* ---------------- Global CSS ---------------- */
function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap');
      *{box-sizing:border-box;}
      body{margin:0;}
      .oc-mono{font-family:'JetBrains Mono', monospace;}
      .oc-toast{ animation: oc-toast-in .25s ease forwards; }
      @keyframes oc-toast-in{ from{ transform:translate(-50%,80px); } to{ transform:translate(-50%,0); } }
      .oc-hero{ display:grid; grid-template-columns:1.1fr 0.9fr; gap:48px; }
      .oc-service-grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
      .oc-auth-wrap{ display:grid; grid-template-columns:1fr 1fr; }
      .oc-dash-grid{ display:grid; grid-template-columns:1fr 340px; gap:24px; align-items:start; }
      .oc-pay-grid{ display:grid; grid-template-columns:1.2fr 0.8fr; gap:28px; }
      .oc-nav-links{ display:flex; align-items:center; gap:6px; }
      .oc-nav-toggle{ display:none; }
      @media (max-width: 860px){
        .oc-hero{ grid-template-columns:1fr; padding:40px 20px !important; }
        .oc-service-grid{ grid-template-columns:1fr 1fr; }
        .oc-auth-wrap{ grid-template-columns:1fr; }
        .oc-auth-visual{ display:none !important; }
        .oc-dash-grid{ grid-template-columns:1fr; }
        .oc-pay-grid{ grid-template-columns:1fr; }
        .oc-nav-links{ position:fixed; top:64px; left:0; right:0; background:${COLORS.bg}; flex-direction:column; align-items:stretch; padding:14px 20px; border-bottom:1px solid ${COLORS.line}; display:none; z-index:39; }
        .oc-nav-links.open{ display:flex; }
        .oc-nav-toggle{ display:block !important; }
      }
      @media (max-width: 520px){
        .oc-service-grid{ grid-template-columns:1fr; }
      }
    `}</style>
  );
}

/* ---------------- ETA Ring ---------------- */
function EtaRing({ progress = 0.5, minutesLeft = 18, size = 150 }) {
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  const gradId = "ocGrad" + size;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.line} strokeWidth="10" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r} stroke={`url(#${gradId})`} strokeWidth="10" fill="none"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={COLORS.spice} />
          <stop offset="100%" stopColor={COLORS.spiceLight} />
        </linearGradient>
      </defs>
      <text x="50%" y="47%" textAnchor="middle" fill={COLORS.cream} fontFamily="JetBrains Mono, monospace" fontSize={size >= 100 ? 30 : 13} fontWeight="700">{minutesLeft}</text>
      {size >= 100 && <text x="50%" y="63%" textAnchor="middle" fill={COLORS.muted} fontFamily="JetBrains Mono, monospace" fontSize="11">MIN LEFT</text>}
    </svg>
  );
}

/* ---------------- Toast ---------------- */
function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="oc-toast" style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translate(-50%,0)",
      background: COLORS.surface3, border: `1px solid ${COLORS.palm}`, color: COLORS.cream,
      padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600, zIndex: 100,
      boxShadow: "0 10px 30px rgba(0,0,0,0.35)", maxWidth: "88vw", textAlign: "center",
    }}>{message}</div>
  );
}

/* ---------------- Shared style helpers ---------------- */
const btnBase = { padding: "14px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center", gap: 8, border: "none", cursor: "pointer", fontFamily: "inherit" };
const btnPrimary = { ...btnBase, background: COLORS.spice, color: "#fff" };
const btnGhost = { ...btnBase, background: COLORS.surface2, color: COLORS.cream, border: `1px solid ${COLORS.line}` };
const cardStyle = { background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 24, marginBottom: 20 };

/* ---------------- Nav ---------------- */
function Nav({ active, user, cartCount, activeOrderId, goTo, logout, showToast }) {
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const linkStyle = (isActive) => ({ padding: "9px 16px", borderRadius: 999, fontSize: 14, fontWeight: 600, color: isActive ? COLORS.bg : COLORS.muted, background: isActive ? COLORS.spiceLight : "transparent", cursor: "pointer" });
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", background: "rgba(11,26,22,0.9)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${COLORS.line}` }}>
      <div onClick={() => goTo("hub")} style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: 20, cursor: "pointer" }}>
        <EtaRing progress={0.65} minutesLeft={18} size={30} />
        {APP_NAME}
      </div>
      <button className="oc-nav-toggle" onClick={() => setOpen(!open)} style={{ background: "none", color: COLORS.cream, fontSize: 22, border: "none", cursor: "pointer" }}>☰</button>
      <div className={`oc-nav-links${open ? " open" : ""}`}>
        <span style={linkStyle(active === "hub")} onClick={() => goTo("hub")}>Services</span>
        <span style={linkStyle(active === "tracking")} onClick={() => (activeOrderId ? goTo("tracking") : showToast("No active order right now"))}>Track Order</span>
        <a href={VENDOR_APP_URL} target="_blank" rel="noreferrer" style={{ ...linkStyle(false), textDecoration: "none" }}>🏪 Vendor</a>
        <button onClick={() => goTo("hub")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 999, background: COLORS.surface2, color: COLORS.cream, fontSize: 14, fontWeight: 600, border: `1px solid ${COLORS.line}`, cursor: "pointer" }}>
          🛒 Cart
          <span style={{ background: COLORS.spice, color: "#fff", fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "JetBrains Mono, monospace", padding: "0 4px" }}>{cartCount}</span>
        </button>
        <span style={linkStyle(false)} onClick={logout}>Log out</span>
      </div>
    </div>
  );
}

/* ---------------- Service tile (shared by Landing + Hub) ---------------- */
function ServiceTile({ service, onClick, badge }) {
  return (
    <div onClick={onClick} style={{
      background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 18, padding: 22,
      cursor: "pointer", position: "relative", transition: "border-color .15s ease, transform .15s ease",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.palm; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.line; e.currentTarget.style.transform = "none"; }}
    >
      {badge && <span style={{ position: "absolute", top: 14, right: 14, background: "rgba(232,98,45,0.15)", color: COLORS.spiceLight, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999 }}>{badge}</span>}
      <div style={{ fontSize: 34, marginBottom: 12 }}>{service.icon}</div>
      <h4 style={{ fontSize: 17, marginBottom: 6 }}>{service.label}</h4>
      <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>{service.tagline}</p>
    </div>
  );
}

/* ---------------- Landing ---------------- */
function Landing({ goTo, openAuth, pickService }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: `1px solid ${COLORS.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: 20 }}>
          <EtaRing progress={0.65} minutesLeft={18} size={30} /> {APP_NAME}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ color: COLORS.muted, cursor: "pointer", fontWeight: 600, fontSize: 14 }} onClick={() => openAuth("login")}>Log in</span>
          <button style={{ ...btnPrimary, padding: "9px 18px", fontSize: 14 }} onClick={() => openAuth("signup")}>Sign up</button>
        </div>
      </div>

      <div className="oc-hero" style={{ maxWidth: 1180, margin: "0 auto", padding: "64px 28px 40px", alignItems: "center" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "JetBrains Mono, monospace", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.palmLight, background: "rgba(31,138,115,0.12)", border: `1px solid ${COLORS.palm}`, borderRadius: 999, padding: "6px 14px", marginBottom: 20 }}>
            ● Live on campus
          </div>
          <h1 style={{ fontSize: 50, lineHeight: 1.05, fontWeight: 800, margin: "0 0 18px" }}>
            Everything campus life needs, <span style={{ color: COLORS.spiceLight }}>in one app.</span>
          </h1>
          <p style={{ color: COLORS.muted, fontSize: 17, lineHeight: 1.6, maxWidth: 480, marginBottom: 28 }}>
            Food, cooking gas, laundry, and stationery — ordered in a tap and delivered straight to your hostel. One account, one cart, one tracker for everything.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button style={{ ...btnPrimary, padding: "16px 28px", fontSize: 16 }} onClick={() => openAuth("signup")}>Get started →</button>
            <button style={{ ...btnGhost, padding: "16px 28px", fontSize: 16 }} onClick={() => document.getElementById("ocServices")?.scrollIntoView({ behavior: "smooth" })}>See what's on offer</button>
          </div>
          <div style={{ display: "flex", gap: 28, marginTop: 32, flexWrap: "wrap" }}>
            {[["4", "services in one app"], ["18 min", "avg delivery"], ["4.8★", "student rating"]].map(([b, s]) => (
              <div key={s}>
                <b style={{ display: "block", fontFamily: "JetBrains Mono, monospace", fontSize: 22, color: COLORS.spiceLight }}>{b}</b>
                <span style={{ fontSize: 12, color: COLORS.muted }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 24, padding: 32, position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <EtaRing progress={0.62} minutesLeft={18} size={160} />
            <div style={{ fontSize: 13, color: COLORS.muted, textAlign: "center" }}>
              Order <b style={{ color: COLORS.cream }}>#CG-2417</b> is on the way to <b style={{ color: COLORS.cream }}>Angola Hall</b>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: COLORS.surface2, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: "12px 14px", width: "100%" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.palmLight, flexShrink: 0 }} />
              <div>
                <b style={{ fontSize: 13, display: "block" }}>6kg Gas Refill ×1</b>
                <small style={{ color: COLORS.muted, fontSize: 11 }}>Out for delivery · Rider: Tunde</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section id="ocServices" style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 28px 64px" }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 28 }}>Pick what you need</h2>
          <p style={{ color: COLORS.muted, fontSize: 14 }}>Sign up once, order any of these, any time.</p>
        </div>
        <div className="oc-service-grid">
          {SERVICES.map((s) => (
            <ServiceTile key={s.key} service={s} onClick={() => { pickService(s.key); openAuth("signup"); }} />
          ))}
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${COLORS.line}`, padding: 28, textAlign: "center", color: COLORS.muted, fontSize: 13 }}>
        {APP_NAME} · Food, gas, laundry & stationery for campus students · Ile-Ife, Nigeria
        <div style={{ marginTop: 10 }}>
          <a href={VENDOR_APP_URL} target="_blank" rel="noreferrer" style={{ color: COLORS.spiceLight, fontWeight: 600, textDecoration: "none" }}>Are you a vendor? Manage your menu →</a>
        </div>
      </footer>
    </div>
  );
}

/* ---------------- Google Identity Services loader ---------------- */
// Loads the GIS script once and resolves when window.google.accounts.id
// is ready to use. Safe to call from multiple components.
let gisLoadPromise = null;
function loadGoogleIdentityScript() {
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      resolve();
      return;
    }
    const existing = document.getElementById("google-identity-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.id = "google-identity-script";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script"));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

/* ---------------- Flutterwave checkout loader ---------------- */
// Loads Flutterwave's inline checkout script once and resolves when
// window.FlutterwaveCheckout is ready to use.
let flwLoadPromise = null;
function loadFlutterwaveScript() {
  if (flwLoadPromise) return flwLoadPromise;
  flwLoadPromise = new Promise((resolve, reject) => {
    if (window.FlutterwaveCheckout) { resolve(); return; }
    const existing = document.getElementById("flutterwave-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Flutterwave")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.flutterwave.com/v3.js";
    script.id = "flutterwave-script";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Flutterwave"));
    document.head.appendChild(script);
  });
  return flwLoadPromise;
}

/* ---------------- Auth (Google Sign-In + email/password) ---------------- */
function Auth({ authMode, setAuthMode, hostels, onAuth, goTo }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [hostel, setHostel] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const buttonRef = useRef(null);
  const isLogin = authMode === "login";

  async function submitPassword(e) {
    e.preventDefault();
    setError("");
    if (!email || !pass) { setError("Please enter your email and password."); return; }
    if (!isLogin && pass.length < 6) { setError("Password must be at least 6 characters."); return; }

    setLoading(true);
    try {
      if (isLogin) {
        const res = await fetch(`${API_BASE}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pass }) });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Login failed."); return; }
        onAuth(data, null, "Welcome back!");
      } else {
        const res = await fetch(`${API_BASE}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name: name || "Student", email, password: pass }) });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Registration failed."); return; }
        onAuth(data, hostel || (hostels[0] && hostels[0].name), "Account created — welcome to " + APP_NAME + " 🎉");
      }
    } catch (err) {
      setError("Couldn't reach the " + APP_NAME + " server. Make sure it's running on http://localhost:5000.");
    } finally {
      setLoading(false);
    }
  }

  const handleCredential = useCallback(async (response) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: response.credential, // Google ID token (JWT), verified server-side
          hostel: hostel || (hostels[0] && hostels[0].name) || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Google sign-in failed."); return; }
      const msg = data.isNewUser ? `Welcome to ${APP_NAME} 🎉` : "Welcome back!";
      onAuth(data.user || data, data.hostel || hostel, msg);
    } catch (err) {
      setError("Couldn't reach the " + APP_NAME + " server. Make sure it's running on http://localhost:5000.");
    } finally {
      setLoading(false);
    }
  }, [hostel, hostels, onAuth]);

  // Load the GIS script and initialize once.
  useEffect(() => {
    let cancelled = false;
    loadGoogleIdentityScript()
      .then(() => { if (!cancelled) setGisReady(true); })
      .catch(() => { if (!cancelled) setError("Couldn't load Google Sign-In. Check your connection and try again."); });
    return () => { cancelled = true; };
  }, []);

  // Render the official Google button whenever we're ready, and re-render
  // if the callback's closed-over values (hostel, hostels) change.
  useEffect(() => {
    if (!gisReady || !buttonRef.current || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredential,
      auto_select: false,
    });
    buttonRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(buttonRef.current, {
      type: "standard",
      theme: "filled_black",
      size: "large",
      shape: "pill",
      text: isLogin ? "signin_with" : "signup_with",
      width: 320,
    });
  }, [gisReady, handleCredential, isLogin]);

  const field = { marginBottom: 16 };
  const label = { display: "block", fontSize: 12, color: COLORS.muted, marginBottom: 6, fontWeight: 600 };
  const input = { width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.cream, fontSize: 14 };

  return (
    <div className="oc-auth-wrap" style={{ minHeight: "100vh" }}>
      <div className="oc-auth-visual" style={{ background: `linear-gradient(160deg, ${COLORS.surface3}, ${COLORS.bg} 70%)`, display: "flex", flexDirection: "column", justifyContent: "center", padding: 60, borderRight: `1px solid ${COLORS.line}` }}>
        <EtaRing progress={0.4} minutesLeft={24} size={90} />
        <h2 style={{ fontSize: 34, margin: "24px 0 14px", maxWidth: 380 }}>{isLogin ? `Welcome back to ${APP_NAME}` : `Join ${APP_NAME} today`}</h2>
        <p style={{ color: COLORS.muted, maxWidth: 360, lineHeight: 1.6 }}>
          {isLogin ? "Sign in to order food, gas, laundry or stationery — and track it all in one place." : "One account for food, gas, laundry and stationery — delivered to your hostel."}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ display: "flex", background: COLORS.surface2, borderRadius: 12, padding: 4, marginBottom: 28 }}>
            <button onClick={() => setAuthMode("login")} style={{ flex: 1, textAlign: "center", padding: 10, borderRadius: 9, fontWeight: 600, fontSize: 14, border: "none", cursor: "pointer", color: isLogin ? "#fff" : COLORS.muted, background: isLogin ? COLORS.spice : "none" }}>Log in</button>
            <button onClick={() => setAuthMode("signup")} style={{ flex: 1, textAlign: "center", padding: 10, borderRadius: 9, fontWeight: 600, fontSize: 14, border: "none", cursor: "pointer", color: !isLogin ? "#fff" : COLORS.muted, background: !isLogin ? COLORS.spice : "none" }}>Sign up</button>
          </div>
          {error && <div style={{ background: "rgba(232,93,93,0.12)", border: `1px solid ${COLORS.danger}`, color: "#FFC9C9", fontSize: 13, padding: "10px 12px", borderRadius: 10, marginBottom: 16 }}>{error}</div>}

          {!isLogin && (
            <div style={field}>
              <label style={label}>Hostel / delivery zone</label>
              <select style={input} value={hostel} onChange={(e) => setHostel(e.target.value)}>
                {hostels.length === 0 && <option value="">Loading hostels…</option>}
                {hostels.map((h) => <option key={h.id} value={h.name}>{h.name}</option>)}
              </select>
              <p style={{ fontSize: 12, color: COLORS.muted, marginTop: 6 }}>Used to set up delivery if this is your first time signing in.</p>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "8px 0 4px" }}>
            {loading && <div style={{ fontSize: 13, color: COLORS.muted }}>Signing you in…</div>}
            <div ref={buttonRef} />
            {!gisReady && !error && <div style={{ fontSize: 13, color: COLORS.muted }}>Loading Google Sign-In…</div>}
          </div>

          <p style={{ fontSize: 11, color: COLORS.muted, textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
            {APP_NAME} never sees or stores your Google password.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0" }}>
            <div style={{ flex: 1, height: 1, background: COLORS.line }} />
            <span style={{ fontSize: 12, color: COLORS.muted, fontWeight: 600 }}>OR</span>
            <div style={{ flex: 1, height: 1, background: COLORS.line }} />
          </div>

          <form onSubmit={submitPassword}>
            {!isLogin && (
              <div style={field}>
                <label style={label}>Full name</label>
                <input style={input} type="text" placeholder="e.g. Daniel Adewale" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div style={field}>
              <label style={label}>Email</label>
              <input style={input} type="email" placeholder="you@student.oauife.edu.ng" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div style={field}>
              <label style={label}>Password</label>
              <input style={input} type="password" placeholder="••••••••" minLength={6} value={pass} onChange={(e) => setPass(e.target.value)} required />
            </div>
            <button type="submit" disabled={loading} style={{ ...btnPrimary, width: "100%", justifyContent: "center", padding: "16px 28px", fontSize: 16, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Please wait…" : isLogin ? "Log in" : "Create account"}
            </button>
          </form>

          <div style={{ textAlign: "center", fontSize: 13, color: COLORS.muted, marginTop: 18 }}>
            {isLogin ? (
              <>New here? <button onClick={() => setAuthMode("signup")} style={{ background: "none", border: "none", color: COLORS.spiceLight, fontWeight: 700, cursor: "pointer" }}>Create an account</button></>
            ) : (
              <>Already have an account? <button onClick={() => setAuthMode("login")} style={{ background: "none", border: "none", color: COLORS.spiceLight, fontWeight: 700, cursor: "pointer" }}>Log in</button></>
            )}
          </div>
          <div style={{ textAlign: "center", fontSize: 13, color: COLORS.muted, marginTop: 10 }}>
            <button onClick={() => goTo("landing")} style={{ background: "none", border: "none", color: COLORS.spiceLight, fontWeight: 700, cursor: "pointer" }}>← Back to home</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Hub (post-login home: service picker + orders) ---------------- */
function Hub({ user, hostel, setHostel, hostels, carts, itemsByService, orders, activeOrderId, goToCatalog, goTo }) {
  const active = orders.find((o) => o.id === activeOrderId && o.status !== "Delivered");
  const cartBadge = (key) => {
    const count = Object.values(carts[key] || {}).reduce((a, b) => a + b, 0);
    return count > 0 ? `${count} in cart` : null;
  };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 24 }}>Hey {(user.full_name || "there").split(" ")[0]}, what do you need today?</h2>
          <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 4 }}>Pick a service to get started.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: "10px 14px" }}>
          <label style={{ fontSize: 12, color: COLORS.muted, fontWeight: 600 }}>Deliver to</label>
          <select value={hostel} onChange={(e) => setHostel(e.target.value)} style={{ background: "none", border: "none", color: COLORS.cream, fontWeight: 700, fontSize: 14 }}>
            {hostels.map((h) => <option key={h.id} value={h.name}>{h.name}</option>)}
          </select>
        </div>
      </div>

      {active && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: "linear-gradient(90deg, rgba(232,98,45,0.15), rgba(31,138,115,0.1))", border: `1px solid ${COLORS.spice}`, borderRadius: 16, padding: "16px 20px", marginBottom: 28, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <EtaRing progress={active.progress} minutesLeft={active.minutesLeft} size={54} />
            <div>
              <b style={{ fontSize: 15, display: "block" }}>{serviceByKey(active.service)?.icon} Order #{active.id} · {active.status}</b>
              <span style={{ fontSize: 12, color: COLORS.muted }}>{active.items.length} item{active.items.length > 1 ? "s" : ""} → {active.hostel}</span>
            </div>
          </div>
          <button style={btnPrimary} onClick={() => goTo("tracking")}>Track order →</button>
        </div>
      )}

      <div className="oc-service-grid" style={{ marginBottom: 36 }}>
        {SERVICES.map((s) => (
          <ServiceTile key={s.key} service={s} badge={cartBadge(s.key)} onClick={() => goToCatalog(s.key)} />
        ))}
      </div>

      {orders.length > 0 && (
        <div>
          <h3 style={{ fontSize: 18, marginBottom: 14 }}>Recent orders</h3>
          {orders.slice().reverse().map((o) => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{serviceByKey(o.service)?.icon}</span>
                <div>
                  <b style={{ fontSize: 14 }}>#{o.id}</b>
                  <div style={{ fontSize: 12, color: COLORS.muted }}>{serviceByKey(o.service)?.label} · {o.items.length} item{o.items.length > 1 ? "s" : ""} · {o.hostel}</div>
                </div>
              </div>
              <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", background: o.status === "Delivered" ? "rgba(31,138,115,0.18)" : "rgba(232,98,45,0.18)", color: o.status === "Delivered" ? COLORS.palmLight : COLORS.spiceLight }}>{o.status}</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>{naira(o.total + 300)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- ItemPhoto ---------------- */
// Shows an item's real photo when it has one (uploaded by the vendor),
// and quietly falls back to the emoji if there's no photo or it fails
// to load, so a broken link never leaves an empty box.
function ItemPhoto({ item, size, radius, emojiSize }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size?.w ?? "100%", height: size?.h ?? 110, borderRadius: radius ?? 12, background: COLORS.surface2, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: emojiSize ?? 44, flexShrink: 0 };
  if (item.image_url && !failed) {
    return (
      <div style={box}>
        <img src={item.image_url} alt={item.name} loading="lazy" onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
    );
  }
  return <div style={box}>{item.emoji || "🛍️"}</div>;
}

/* ---------------- Generic Catalog (used by all 4 services) ---------------- */
function Catalog({ service, items, loading, categories, activeCategory, setActiveCategory, searchQuery, setSearchQuery, cart, changeQty, goCheckout, goTo }) {
  const q = searchQuery.trim().toLowerCase();
  const filtered = items.filter((it) => {
    const matchesCategory = !categories || activeCategory === "All" || it.category === activeCategory;
    const matchesSearch = q === "" || it.name.toLowerCase().includes(q) || (it.category || "").toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = items.find((m) => String(m.id) === String(id));
    return sum + (item ? Number(item.price) * qty : 0);
  }, 0);
  const fee = cartCount > 0 ? 300 : 0;

  const filterChip = (c) => ({ padding: "8px 16px", borderRadius: 999, background: activeCategory === c ? COLORS.palm : COLORS.surface, border: `1px solid ${activeCategory === c ? COLORS.palm : COLORS.line}`, color: activeCategory === c ? "#fff" : COLORS.muted, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer" });

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <span onClick={() => goTo("hub")} style={{ cursor: "pointer", color: COLORS.muted, fontSize: 13 }}>← Services</span>
      </div>
      <h2 style={{ fontSize: 24, marginBottom: 4 }}>{service.icon} {service.label}</h2>
      <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 20 }}>{service.tagline}</p>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: COLORS.muted, fontSize: 16, pointerEvents: "none" }}>🔍</span>
        <input
          type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${service.label.toLowerCase()}…`}
          style={{ width: "100%", padding: "13px 16px 13px 44px", borderRadius: 12, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.cream, fontSize: 14 }}
        />
        {searchQuery && <span onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: COLORS.muted, fontSize: 14, cursor: "pointer", fontWeight: 700 }}>✕</span>}
      </div>

      {categories && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
          {categories.map((c) => <button key={c} style={filterChip(c)} onClick={() => setActiveCategory(c)}>{c}</button>)}
        </div>
      )}

      {loading && <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.muted, fontSize: 14 }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.muted, fontSize: 14 }}>
          Nothing matches "<span style={{ color: COLORS.cream }}>{searchQuery}</span>". Try a different search{categories ? " or category" : ""}.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="oc-dash-grid">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px,1fr))", gap: 18 }}>
            {filtered.map((it) => {
              const qty = cart[it.id] || 0;
              return (
                <div key={it.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                  <ItemPhoto item={it} size={{ w: "100%", h: 140 }} radius={12} emojiSize={44} />
                  {it.category && <div style={{ fontSize: 11, color: COLORS.palmLight, textTransform: "uppercase", letterSpacing: ".06em", fontFamily: "JetBrains Mono, monospace" }}>{it.category}</div>}
                  <h4 style={{ fontSize: 16, margin: 0 }}>{it.name}</h4>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                    <span style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: COLORS.spiceLight, fontSize: 15 }}>{naira(it.price)}</span>
                      {it.unit && <span style={{ fontSize: 11, color: COLORS.muted }}>{it.unit}</span>}
                    </span>
                    {qty === 0 ? (
                      <div onClick={() => changeQty(it.id, 1)} style={{ width: 34, height: 34, borderRadius: 10, background: COLORS.spice, color: "#fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, cursor: "pointer" }}>+</div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div onClick={() => changeQty(it.id, -1)} style={{ width: 22, height: 22, borderRadius: 6, background: COLORS.surface2, color: COLORS.cream, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, cursor: "pointer" }}>−</div>
                        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, minWidth: 16, textAlign: "center" }}>{qty}</div>
                        <div onClick={() => changeQty(it.id, 1)} style={{ width: 22, height: 22, borderRadius: 6, background: COLORS.surface2, color: COLORS.cream, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, cursor: "pointer" }}>+</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 20, position: "sticky", top: 90 }}>
            <h3 style={{ fontSize: 17, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              Your cart <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: COLORS.muted }}>{cartCount} item{cartCount !== 1 ? "s" : ""}</span>
            </h3>
            {cartCount === 0 ? (
              <div style={{ color: COLORS.muted, fontSize: 13, textAlign: "center", padding: "30px 0" }}>Your cart is empty.<br />Add something →</div>
            ) : (
              <>
                {Object.entries(cart).map(([id, qty]) => {
                  const item = items.find((m) => String(m.id) === String(id));
                  if (!item) return null;
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${COLORS.line}` }}>
                      <ItemPhoto item={item} size={{ w: 36, h: 36 }} radius={8} emojiSize={22} />
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{item.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div onClick={() => changeQty(item.id, -1)} style={{ width: 22, height: 22, borderRadius: 6, background: COLORS.surface2, color: COLORS.cream, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, cursor: "pointer" }}>−</div>
                        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, minWidth: 16, textAlign: "center" }}>{qty}</div>
                        <div onClick={() => changeQty(item.id, 1)} style={{ width: 22, height: 22, borderRadius: 6, background: COLORS.surface2, color: COLORS.cream, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, cursor: "pointer" }}>+</div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.muted, marginTop: 8 }}><span>Subtotal</span><span style={{ fontFamily: "JetBrains Mono, monospace" }}>{naira(cartTotal)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.muted, marginTop: 4 }}><span>{service.key === "laundry" ? "Pickup & delivery fee" : "Delivery fee"}</span><span style={{ fontFamily: "JetBrains Mono, monospace" }}>{naira(fee)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: COLORS.cream, fontWeight: 700, fontSize: 15, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COLORS.line}` }}><span>Total</span><span style={{ fontFamily: "JetBrains Mono, monospace" }}>{naira(cartTotal + fee)}</span></div>
                <button style={{ ...btnPrimary, width: "100%", justifyContent: "center", marginTop: 16 }} onClick={goCheckout}>Proceed to checkout →</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Payment ---------------- */
function Payment({ service, lines, hostel, payMethod, setPayMethod, deliveryLocation, setDeliveryLocation, placeOrder, paying, goTo }) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [manualAddress, setManualAddress] = useState("");

  if (!lines || lines.length === 0) {
    return (
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "40px 28px" }}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <h3>Your cart is empty</h3>
          <p style={{ color: COLORS.muted, fontSize: 14, marginBottom: 16 }}>Add something before checking out.</p>
          <button style={btnPrimary} onClick={() => goTo("hub")}>Back to services</button>
        </div>
      </div>
    );
  }
  const sub = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const fee = 300;
  const total = sub + fee;
  const feeLabel = service?.key === "laundry" ? "Pickup & delivery fee" : "Delivery fee";

  const distanceKm = distanceForOrder(deliveryLocation, hostel);
  const etaMinutes = estimateMinutes(distanceKm, service?.key);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocError("Your browser doesn't support location sharing — enter your location manually below instead.");
      return;
    }
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDeliveryLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: "gps",
          address: "",
        });
        setLocating(false);
      },
      (err) => {
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — you can still enter your location manually below."
            : "Couldn't get your location — you can still enter it manually below."
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const methodOpt = (val, em, lbl) => {
    const sel = payMethod === val;
    return (
      <div key={val} onClick={() => setPayMethod(val)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, border: `1px solid ${sel ? COLORS.spice : COLORS.line}`, background: sel ? "rgba(232,98,45,0.08)" : COLORS.surface2, cursor: "pointer" }}>
        <span style={{ fontSize: 20 }}>{em}</span>
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{lbl}</span>
        <span style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${sel ? COLORS.spice : COLORS.line}`, flexShrink: 0, background: sel ? `radial-gradient(circle, ${COLORS.spice} 0 45%, transparent 46%)` : "none" }} />
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "40px 28px" }}>
      <h2 style={{ fontSize: 26, marginBottom: 6 }}>Checkout — {service?.icon} {service?.label}</h2>
      <p style={{ color: COLORS.muted, fontSize: 14, marginBottom: 24 }}>Delivering to <b style={{ color: COLORS.cream }}>{hostel}</b></p>
      <div className="oc-pay-grid">
        <div>
          <div style={cardStyle}>
            <h3 style={{ fontSize: 16, marginBottom: 16 }}>Payment method</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {methodOpt("card", "💳", "Debit / Credit Card")}
              {methodOpt("transfer", "🏦", "Bank Transfer")}
              {methodOpt("cash", "💵", "Cash on Delivery")}
            </div>
            {payMethod === "card" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                <div><label style={{ display: "block", fontSize: 12, color: COLORS.muted, marginBottom: 6, fontWeight: 600 }}>Card number</label>
                  <input style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.cream, fontSize: 14 }} type="text" placeholder="4242 4242 4242 4242" maxLength={19} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={{ display: "block", fontSize: 12, color: COLORS.muted, marginBottom: 6, fontWeight: 600 }}>Expiry</label>
                    <input style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.cream, fontSize: 14 }} type="text" placeholder="MM/YY" /></div>
                  <div><label style={{ display: "block", fontSize: 12, color: COLORS.muted, marginBottom: 6, fontWeight: 600 }}>CVV</label>
                    <input style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.cream, fontSize: 14 }} type="text" placeholder="123" maxLength={3} /></div>
                </div>
              </div>
            )}
          </div>
          <div style={cardStyle}>
            <h3 style={{ fontSize: 16, marginBottom: 16 }}>{service?.key === "laundry" ? "Pickup details" : "Delivery details"}</h3>
            <label style={{ display: "block", fontSize: 12, color: COLORS.muted, marginBottom: 6, fontWeight: 600 }}>Hostel / Room number</label>
            <input style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.cream, fontSize: 14, marginBottom: 16 }} type="text" placeholder={`e.g. ${hostel}, Room 214`} />

            <label style={{ display: "block", fontSize: 12, color: COLORS.muted, marginBottom: 6, fontWeight: 600 }}>Exact pickup / drop-off location</label>
            <p style={{ fontSize: 12, color: COLORS.muted, margin: "0 0 10px" }}>
              Share your precise location so your rider can find you fast — this is what the delivery estimate below is based on.
            </p>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              style={{ ...btnGhost, width: "100%", justifyContent: "center", marginBottom: 10, opacity: locating ? 0.7 : 1 }}
            >
              {locating ? "Getting your location…" : deliveryLocation?.source === "gps" ? "📍 Location captured — tap to refresh" : "📍 Use my current location"}
            </button>
            {deliveryLocation?.source === "gps" && (
              <div style={{ fontSize: 12, color: COLORS.palm, marginBottom: 10, fontFamily: "JetBrains Mono, monospace" }}>
                ✓ {deliveryLocation.lat.toFixed(5)}, {deliveryLocation.lng.toFixed(5)}
              </div>
            )}
            {locError && (
              <div style={{ fontSize: 12, color: COLORS.spiceLight, marginBottom: 10 }}>{locError}</div>
            )}
            <input
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.cream, fontSize: 14 }}
              type="text"
              placeholder="Or describe your location — e.g. behind Angola Hall gate, near the mosque"
              value={manualAddress}
              onChange={(e) => {
                setManualAddress(e.target.value);
                setDeliveryLocation({ lat: null, lng: null, source: "manual", address: e.target.value });
              }}
            />
          </div>
        </div>
        <div>
          <div style={cardStyle}>
            <h3 style={{ fontSize: 16, marginBottom: 16 }}>Order summary</h3>
            {lines.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.muted, padding: "6px 0" }}>
                <span>{l.emoji || "🛍️"} {l.name} ×{l.qty}</span>
                <span style={{ color: COLORS.cream, fontFamily: "JetBrains Mono, monospace" }}>{naira(l.price * l.qty)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.muted, padding: "6px 0" }}><span>{feeLabel}</span><span style={{ color: COLORS.cream, fontFamily: "JetBrains Mono, monospace" }}>{naira(fee)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${COLORS.line}`, marginTop: 8, paddingTop: 12, fontSize: 16, fontWeight: 700, color: COLORS.cream }}><span>Total</span><span style={{ fontFamily: "JetBrains Mono, monospace" }}>{naira(total)}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "12px 14px", borderRadius: 10, background: COLORS.surface2, border: `1px solid ${COLORS.line}` }}>
              <span style={{ fontSize: 18 }}>⏱️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Estimated delivery: ~{etaMinutes} min</div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>
                  {deliveryLocation?.source === "gps" ? `Based on your location (~${distanceKm.toFixed(1)}km away)` : "Based on your hostel — share your exact location for a more accurate estimate"}
                </div>
              </div>
            </div>
            <button
              style={{ ...btnPrimary, width: "100%", justifyContent: "center", padding: "16px 28px", fontSize: 16, marginTop: 18, opacity: paying ? 0.7 : 1 }}
              onClick={placeOrder}
              disabled={paying}
            >
              {paying ? "Processing…" : `Pay ${naira(total)}`}
            </button>
            <button style={{ ...btnGhost, width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => goTo("hub")}>← Back</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tracking ---------------- */
function Tracking({ order, goTo }) {
  if (!order) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 28px" }}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <h3>No active order</h3>
          <p style={{ color: COLORS.muted, fontSize: 14, margin: "10px 0 16px" }}>Order something from the services hub to see live tracking here.</p>
          <button style={btnPrimary} onClick={() => goTo("hub")}>Go to services</button>
        </div>
      </div>
    );
  }
  const steps = stepsForService(order.service);
  const svc = serviceByKey(order.service);
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 28px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontFamily: "JetBrains Mono, monospace", color: COLORS.muted, fontSize: 13, marginBottom: 6 }}>{svc?.icon} {svc?.label} · ORDER #{order.id}</div>
        <EtaRing progress={order.progress} minutesLeft={order.minutesLeft} size={170} />
        <div style={{ fontSize: 24, marginTop: 18, marginBottom: 6, fontFamily: "'Bricolage Grotesque', sans-serif" }}>{order.status}</div>
        <div style={{ color: COLORS.muted, fontSize: 14 }}>Delivering to {order.hostel}</div>
      </div>
      <div style={cardStyle}>
        <div style={{ position: "relative", paddingLeft: 32 }}>
          <div style={{ position: "absolute", left: 9, top: 6, bottom: 6, width: 2, background: COLORS.line }} />
          {steps.map((step, i) => {
            const done = i < order.stepIndex;
            const cur = i === order.stepIndex;
            return (
              <div key={step} style={{ position: "relative", paddingBottom: i === steps.length - 1 ? 0 : 28 }}>
                <div style={{ position: "absolute", left: -32, top: 0, width: 20, height: 20, borderRadius: "50%", background: done || cur ? (done ? COLORS.palm : COLORS.spice) : COLORS.surface2, border: `2px solid ${done ? COLORS.palm : cur ? COLORS.spice : COLORS.line}`, boxShadow: cur ? "0 0 0 4px rgba(232,98,45,0.2)" : "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {done && <span style={{ color: "#fff", fontSize: 11, fontWeight: 900 }}>✓</span>}
                </div>
                <div style={{ fontWeight: done || cur ? 700 : 600, fontSize: 15, color: done || cur ? COLORS.cream : COLORS.muted }}>{step}</div>
                {(done || cur) && <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>{cur ? "In progress" : "Completed"}</div>}
              </div>
            );
          })}
        </div>
      </div>
      {order.status !== "Delivered" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 16, marginTop: 28 }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", background: COLORS.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🛵</div>
          <div>
            <b style={{ display: "block", fontSize: 14 }}>Tunde A. — your rider</b>
            <span style={{ fontSize: 12, color: COLORS.muted }}>Motorbike · ★4.9 · usually 2 mins away</span>
          </div>
          <div style={{ marginLeft: "auto", width: 38, height: 38, borderRadius: "50%", background: COLORS.palm, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "pointer" }}>📞</div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 16, marginTop: 28 }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", background: COLORS.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>✅</div>
          <div>
            <b style={{ display: "block", fontSize: 14 }}>Delivered!</b>
            <span style={{ fontSize: 12, color: COLORS.muted }}>Thanks for using {APP_NAME}</span>
          </div>
          <button style={{ ...btnPrimary, marginLeft: "auto" }} onClick={() => goTo("hub")}>Order again</button>
        </div>
      )}
    </div>
  );
}

/* ================= MAIN APP ================= */
function App() {
  const [view, setView] = useState("landing");
  const [authMode, setAuthMode] = useState("login");
  const [user, setUser] = useState(null);
  const [hostel, setHostel] = useState("");
  const [pendingService, setPendingService] = useState(null);
  const [currentService, setCurrentService] = useState(null);

  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const [carts, setCarts] = useState({ food: {}, gas: {}, laundry: {}, stationery: {} });
  const [orders, setOrders] = useState([]);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [payMethod, setPayMethod] = useState("card");
  const [paying, setPaying] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState(null);
  const [toast, setToast] = useState("");
  const timerRef = useRef(null);

  const [menu, setMenu] = useState([]); // food, from the server
  const [gasItems, setGasItems] = useState([]);
  const [laundryItems, setLaundryItems] = useState([]);
  const [stationeryItems, setStationeryItems] = useState([]);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [hostels, setHostels] = useState([]);

  // useCallback with an empty dep array keeps this function reference
  // stable across renders, so it's safe to list in useEffect deps
  // below without causing those effects to re-run every render.
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setCatalogsLoading(true);
      try {
        const [menuRes, gasRes, laundryRes, stationeryRes, hostelsRes] = await Promise.all([
          fetch(`${API_BASE}/menu_items`),
          fetch(`${API_BASE}/gas_items`),
          fetch(`${API_BASE}/laundry_items`),
          fetch(`${API_BASE}/stationery_items`),
          fetch(`${API_BASE}/hostels`),
        ]);
        const [menuData, gasData, laundryData, stationeryData, hostelsData] = await Promise.all([
          menuRes.json(), gasRes.json(), laundryRes.json(), stationeryRes.json(), hostelsRes.json(),
        ]);
        if (cancelled) return;
        setMenu(Array.isArray(menuData) ? menuData : []);
        setGasItems(Array.isArray(gasData) ? gasData : []);
        setLaundryItems(Array.isArray(laundryData) ? laundryData : []);
        setStationeryItems(Array.isArray(stationeryData) ? stationeryData : []);
        setHostels(Array.isArray(hostelsData) ? hostelsData : []);
        if (Array.isArray(hostelsData) && hostelsData.length > 0) setHostel((prev) => prev || hostelsData[0].name);
      } catch (err) {
        if (!cancelled) showToast(`Couldn't reach the ${APP_NAME} server — make sure it's running on http://localhost:5000.`);
      } finally {
        if (!cancelled) setCatalogsLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [showToast]);

  function goTo(v) { setView(v); window.scrollTo(0, 0); }
  function openAuth(mode) { setAuthMode(mode); goTo("auth"); }
  function pickService(key) { setPendingService(key); }

  function onAuth(u, defaultHostel, msg) {
    setUser(u);
    if (defaultHostel) setHostel(defaultHostel);
    showToast(msg);
    if (pendingService) {
      goToCatalog(pendingService);
      setPendingService(null);
    } else {
      goTo("hub");
    }
  }

  function logout() {
    setUser(null);
    setCarts({ food: {}, gas: {}, laundry: {}, stationery: {} });
    goTo("landing");
  }

  function goToCatalog(key) {
    setCurrentService(key);
    setActiveCategory("All");
    setSearchQuery("");
    goTo("catalog");
  }

  function itemsForService(key) {
    if (key === "food") return menu;
    if (key === "gas") return gasItems;
    if (key === "laundry") return laundryItems;
    if (key === "stationery") return stationeryItems;
    return [];
  }
  function categoriesForService(key) {
    return categoriesFromItems(itemsForService(key));
  }

  function changeQty(id, delta) {
    setCarts((prev) => {
      const svcCart = prev[currentService] || {};
      const cur = svcCart[id] || 0;
      const next = cur + delta;
      const copy = { ...svcCart };
      if (next <= 0) delete copy[id]; else copy[id] = next;
      return { ...prev, [currentService]: copy };
    });
  }

  function buildLines(serviceKey) {
    const items = itemsForService(serviceKey);
    const cart = carts[serviceKey] || {};
    return Object.entries(cart).map(([id, qty]) => {
      const item = items.find((m) => String(m.id) === String(id));
      return item ? { id: item.id, name: item.name, emoji: item.emoji, price: Number(item.price), qty } : null;
    }).filter(Boolean);
  }

  function goCheckout() { goTo("payment"); }

  // Creates the real order in the database (this is what makes it
  // visible to vendors/admin) and returns what the backend saved,
  // including its real id/order_code/total. Throws on failure —
  // callers decide how strict to be about that.
  async function checkoutOrder(order) {
    const matchedHostel = hostels.find((h) => h.name === order.hostel);
    const res = await fetch(`${API_BASE}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user?.id,
        service: order.service,
        hostel_id: matchedHostel?.id || null,
        items: buildLines(order.service).map((l) => ({ id: l.id, name: l.name, emoji: l.emoji, price: l.price, qty: l.qty })),
        subtotal: order.total,
        delivery_fee: 300,
        total: order.total,
        payment_method: payMethod,
        minutes_left: order.minutesLeft,
      }),
    });
    if (!res.ok) throw new Error("Checkout failed");
    return res.json();
  }

  // Puts the order into local state and takes the customer to the
  // tracking screen — this is what used to be the tail end of
  // placeOrder(), now shared by both the card and cash/transfer paths
  // so tracking behaves identically regardless of how payment happened.
  function finalizeLocalOrder(order, displayId) {
    setOrders((prev) => [...prev, { ...order, id: displayId }]);
    setActiveOrderId(displayId);
    setCarts((prev) => ({ ...prev, [currentService]: {} }));
    setDeliveryLocation(null);
    goTo("tracking");
  }

  function buildOrderDraft() {
    const lines = buildLines(currentService);
    const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    const items = lines.map((l) => ({ name: l.name, qty: l.qty, em: l.emoji }));
    const distanceKm = distanceForOrder(deliveryLocation, hostel);
    const minutesLeft = estimateMinutes(distanceKm, currentService);
    return { service: currentService, items, total, hostel, deliveryLocation, distanceKm, status: "Order placed", progress: 0.08, minutesLeft, stepIndex: 0 };
  }

  // NOTE: the on-screen tracking below (status/progress/stepIndex)
  // still runs locally via the simulated ticker further down — it
  // doesn't reflect real vendor/rider actions yet.
  async function placeOrder() {
    const order = buildOrderDraft();

    if (payMethod === "card") {
      setPaying(true);
      try {
        const saved = await checkoutOrder(order); // real DB order, payment_status still "pending"
        await loadFlutterwaveScript();
        window.FlutterwaveCheckout({
          public_key: FLUTTERWAVE_PUBLIC_KEY,
          tx_ref: saved.order_code,
          amount: saved.total,
          currency: "NGN",
          payment_options: "card,banktransfer,ussd",
          customer: { email: user?.email, name: user?.full_name },
          customizations: { title: APP_NAME, description: `Order ${saved.order_code}` },
          callback: async (response) => {
            try {
              const verifyRes = await fetch(`${API_BASE}/payments/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order_id: saved.id, transaction_id: response.transaction_id }),
              });
              const verifyData = await verifyRes.json();
              if (!verifyRes.ok || !verifyData.verified) {
                showToast("Payment couldn't be verified — please contact support with your reference.");
                return;
              }
              showToast("Payment successful — order placed! 🎉");
              finalizeLocalOrder(order, saved.order_code);
            } finally {
              setPaying(false);
            }
          },
          onclose: () => {
            setPaying(false);
            showToast("Payment cancelled");
          },
        });
      } catch (err) {
        setPaying(false);
        showToast("Couldn't start checkout — try again.");
      }
      return;
    }

    // Cash / bank transfer — trusted at order time, same as before.
    const displayId = "CG-" + Math.floor(1000 + Math.random() * 9000);
    checkoutOrder(order).catch((err) => {
      console.warn("Couldn't save order to the server — it'll still work locally, but no vendor will see it.", err);
    });
    showToast("Payment successful — order placed! 🎉");
    finalizeLocalOrder(order, displayId);
  }

  // Simulated order progress ticker
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!activeOrderId) return;
    timerRef.current = setInterval(() => {
      setOrders((prev) => prev.map((o) => {
        if (o.id !== activeOrderId || o.status === "Delivered") return o;
        const steps = stepsForService(o.service);
        const nextStep = Math.min(steps.length - 1, o.stepIndex + 1);
        const delivered = nextStep === steps.length - 1;
        if (delivered) showToast("Your order has been delivered! 🎉");
        return { ...o, stepIndex: nextStep, status: steps[nextStep], minutesLeft: delivered ? 0 : Math.max(0, o.minutesLeft - 2), progress: delivered ? 1 : Math.min(1, o.progress + 0.23) };
      }));
    }, 2600);
    return () => clearInterval(timerRef.current);
  }, [activeOrderId, showToast]);

  const totalCartCount = Object.values(carts).reduce((sum, c) => sum + Object.values(c).reduce((a, b) => a + b, 0), 0);
  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const svcObj = currentService ? serviceByKey(currentService) : null;

  let page;
  if (view === "landing" || !user) {
    page = view === "auth"
      ? <Auth authMode={authMode} setAuthMode={setAuthMode} hostels={hostels} onAuth={onAuth} goTo={goTo} />
      : <Landing goTo={goTo} openAuth={openAuth} pickService={pickService} />;
  } else if (view === "hub") {
    page = (
      <>
        <Nav active="hub" user={user} cartCount={totalCartCount} activeOrderId={activeOrderId} goTo={goTo} logout={logout} showToast={showToast} />
        <Hub user={user} hostel={hostel} setHostel={setHostel} hostels={hostels} carts={carts} itemsByService={itemsForService} orders={orders} activeOrderId={activeOrderId} goToCatalog={goToCatalog} goTo={goTo} />
      </>
    );
  } else if (view === "catalog" && svcObj) {
    page = (
      <>
        <Nav active="catalog" user={user} cartCount={totalCartCount} activeOrderId={activeOrderId} goTo={goTo} logout={logout} showToast={showToast} />
        <Catalog
          service={svcObj}
          items={itemsForService(currentService)}
          loading={catalogsLoading}
          categories={categoriesForService(currentService)}
          activeCategory={activeCategory} setActiveCategory={setActiveCategory}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          cart={carts[currentService] || {}} changeQty={changeQty}
          goCheckout={goCheckout} goTo={goTo}
        />
      </>
    );
  } else if (view === "payment") {
    page = (
      <>
        <Nav active="catalog" user={user} cartCount={totalCartCount} activeOrderId={activeOrderId} goTo={goTo} logout={logout} showToast={showToast} />
        <Payment service={svcObj} lines={buildLines(currentService)} hostel={hostel} payMethod={payMethod} setPayMethod={setPayMethod} deliveryLocation={deliveryLocation} setDeliveryLocation={setDeliveryLocation} placeOrder={placeOrder} paying={paying} goTo={goTo} />
      </>
    );
  } else if (view === "tracking") {
    page = (
      <>
        <Nav active="tracking" user={user} cartCount={totalCartCount} activeOrderId={activeOrderId} goTo={goTo} logout={logout} showToast={showToast} />
        <Tracking order={activeOrder} goTo={goTo} />
      </>
    );
  } else {
    page = <Hub user={user} hostel={hostel} setHostel={setHostel} hostels={hostels} carts={carts} itemsByService={itemsForService} orders={orders} activeOrderId={activeOrderId} goToCatalog={goToCatalog} goTo={goTo} />;
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: COLORS.bg, color: COLORS.cream, minHeight: "100vh", WebkitFontSmoothing: "antialiased" }}>
      <GlobalStyle />
      {page}
      <Toast message={toast} />
    </div>
  );
}

export default App;
