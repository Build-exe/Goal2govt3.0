/* ============================================================
   BACKEND API URL
   ------------------------------------------------------------
   Since the frontend (GitHub Pages) and backend now live on
   different URLs, every API call needs the backend's full
   address — a relative "/api/..." path only works when both
   are served from the same place.

   Once you deploy the backend (Render, Railway, Fly.io, etc.),
   paste its public URL here. No trailing slash.

   Example:
     const API_BASE_URL = "https://goal2govt-backend.onrender.com";

   Leave it empty ("") only while testing locally with the
   backend serving the frontend itself (npm start, then open
   http://localhost:3000) — in that case requests are already
   same-origin and don't need a base URL.
   ============================================================ */
const API_BASE_URL = "";
