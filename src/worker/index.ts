import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createDb } from "../db";
import { createAuth, requireAuth, type AppEnv } from "./auth";
import boards from "./routes/boards";
import columns from "./routes/columns";
import cards from "./routes/cards";
import labels from "./routes/labels";
import push from "./routes/push";
import workspaces from "./routes/workspaces";
import invitations, { invitePreview } from "./routes/invitations";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  const db = createDb(c.env.DB);
  c.set("db", db);
  c.set("auth", createAuth(c.env, db));
  await next();
});

// Better Auth menangani /api/auth/** sendiri: login, callback OAuth, sesi.
app.all("/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

/**
 * Provider sosial mana yang aktif — klien perlu tahu tombol login apa
 * yang layak ditampilkan. Tidak membocorkan kredensial apa pun.
 */
app.get("/api/config", (c) =>
  c.json({
    providers: [
      ...(c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET ? ["github"] : []),
      ...(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET ? ["google"] : []),
    ],
  }),
);

// Endpoint aplikasi yang boleh diakses tanpa login.
app.route("/api/invitations", invitePreview);

const api = new Hono<AppEnv>()
  .use("*", requireAuth)
  .route("/workspaces", workspaces)
  .route("/invitations", invitations)
  .route("/boards", boards)
  .route("/columns", columns)
  .route("/cards", cards)
  .route("/labels", labels)
  .route("/push", push);

app.route("/api", api);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  console.error(err);
  return c.json({ error: "Terjadi kesalahan pada server" }, 500);
});

export default app;

export { BoardRoom } from "./board-room";

/** Tipe rute untuk klien terketik. */
export type ApiType = typeof api;
