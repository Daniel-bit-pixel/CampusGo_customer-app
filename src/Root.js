import React from "react";
import App from "./App";
import AdminDashboard from "./AdminDashboard";

// No router library involved — just a plain path check. Visiting
// /admin (or any path starting with it, e.g. /admin/orders) shows
// AdminDashboard; everything else shows the regular customer app.
function Root() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  return isAdmin ? <AdminDashboard /> : <App />;
}

export default Root;
