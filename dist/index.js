var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/index.ts
import { Hono as Hono4 } from "hono";

// src/middlewares/cors.ts
import { cors as corsMiddleware } from "hono/cors";
var allowedOrigins = [
  "https://hey.xyz",
  "https://testnet.hey.xyz",
  "https://staging.hey.xyz",
  "http://localhost:4783",
  "https://developer.lens.xyz",
  "https://yoginth.com",
  "http://localhost:3000",
  "http://localhost:4783"
];
var cors = corsMiddleware({
  allowHeaders: ["Content-Type", "X-Access-Token"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  credentials: true,
  origin: allowedOrigins
});
var cors_default = cors;

// src/middlewares/authMiddleware.ts
import "dotenv/config";

// src/logger.ts
var info = (...args) => {
  console.info(...args);
};
var warn = (...args) => {
  console.warn(...args);
};
var error = (...args) => {
  console.error(...args);
};
var debug = (...args) => {
  if (process.env.NODE_ENV !== "production") {
    console.debug(...args);
  }
};
var withPrefix = (prefix) => {
  return {
    debug: (...args) => debug(prefix, ...args),
    error: (...args) => error(prefix, ...args),
    info: (...args) => info(prefix, ...args),
    warn: (...args) => warn(prefix, ...args)
  };
};

// src/middlewares/authMiddleware.ts
import { createRemoteJWKSet, createLocalJWKSet, jwtVerify } from "jose";
var JWKS = null;
var getJWKS = () => {
  if (JWKS) return JWKS;
  const LENS_API_URL = process.env.LENS_API_URL;
  if (!LENS_API_URL) {
    throw new Error("LENS_API_URL environment variable is required");
  }
  const jwksUri = `${LENS_API_URL.replace("/graphql", "")}/.well-known/jwks.json`;
  JWKS = createRemoteJWKSet(new URL(jwksUri), {
    cacheMaxAge: 60 * 60 * 12
  });
  return JWKS;
};
var unauthorized = (c) => c.body("Unauthorized", 401);
var extractToken = (c) => {
  const auth = c.req.header("Authorization") || c.req.header("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const x = c.req.header("X-Access-Token") || c.req.header("x-access-token") || c.get("token");
  if (x) return x;
  const cookieHeader = c.req.header("Cookie") || c.req.header("cookie");
  if (cookieHeader) {
    const parts = cookieHeader.split(";").map((p) => p.trim());
    for (const p of parts) {
      const [k, v] = p.split("=");
      if (!k) continue;
      if (k === "access_token" || k === "token" || k === "accessToken") return decodeURIComponent(v || "");
    }
  }
  return void 0;
};
var authMiddleware = async (c, next) => {
  const log = withPrefix("[API]");
  const token = extractToken(c);
  if (!token) {
    log.warn("missing token");
    return unauthorized(c);
  }
  try {
    try {
      const { payload } = await jwtVerify(token, getJWKS());
      c.set("user", payload);
      return next();
    } catch (verifyErr) {
      if (verifyErr && (verifyErr.code === "ERR_JOSE_NOT_SUPPORTED" || verifyErr.name === "JOSENotSupported" || verifyErr.code === "ERR_JWKS_TIMEOUT")) {
        try {
          const LENS_API_URL_FALLBACK = process.env.LENS_API_URL;
          if (!LENS_API_URL_FALLBACK) throw new Error("LENS_API_URL environment variable is required");
          const jwksUri = `${LENS_API_URL_FALLBACK.replace("/graphql", "")}/.well-known/jwks.json`;
          const timeoutMs = Number(process.env.JWKS_FETCH_TIMEOUT_MS || "80000");
          const controller = new AbortController();
          const to = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(jwksUri, { signal: controller.signal });
          clearTimeout(to);
          const jwks = await res.json();
          if (jwks && Array.isArray(jwks.keys)) {
            for (const k of jwks.keys) {
              if (k && typeof k === "object" && "alg" in k) {
                try {
                  delete k.alg;
                } catch {
                }
              }
            }
          }
          const localSet = createLocalJWKSet(jwks);
          const { payload } = await jwtVerify(token, localSet);
          c.set("user", payload);
          return next();
        } catch (fallbackErr) {
          log.warn("invalid token", fallbackErr);
          return unauthorized(c);
        }
      }
      throw verifyErr;
    }
  } catch (err) {
    log.warn("invalid token", err);
    return unauthorized(c);
  }
  return next();
};
var authMiddleware_default = authMiddleware;

// src/utils/sha256.ts
import { createHash } from "crypto";
var sha256 = (input) => {
  return createHash("sha256").update(input).digest("hex");
};
var sha256_default = sha256;

// src/middlewares/rateLimiter.ts
var getIp = (req) => {
  const ips = (req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",");
  return ips[0].trim();
};
var rateLimiter = ({ requests, windowMs = 60 * 1e3 }) => {
  const store = /* @__PURE__ */ new Map();
  return async (c, next) => {
    const pathHash = sha256_default(c.req.path).slice(0, 25);
    const ipHash = sha256_default(getIp(c.req.raw)).slice(0, 25);
    const key = `rate-limit:${pathHash}:${ipHash}`;
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || entry.expiresAt <= now) {
      store.set(key, { count: 1, expiresAt: now + windowMs });
    } else {
      entry.count += 1;
      store.set(key, entry);
      if (entry.count > requests) {
        const retryAfter = Math.ceil((entry.expiresAt - now) / 1e3);
        c.header("Retry-After", String(retryAfter));
        return c.text("Too Many Requests", 429);
      }
    }
    return next();
  };
};
var rateLimiter_default = rateLimiter;

// src/middlewares/authContext.ts
var authContext = async (c, next) => {
  const auth = c.req.header("Authorization") || c.req.header("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    c.set("token", auth.slice(7).trim());
    return next();
  }
  const xt = c.req.header("X-Access-Token") || c.req.header("x-access-token") || c.req.header("token");
  if (xt) {
    c.set("token", xt);
    return next();
  }
  const cookie = c.req.header("Cookie") || c.req.header("cookie");
  if (cookie) {
    for (const part of cookie.split(";").map((p) => p.trim())) {
      const [k, v] = part.split("=");
      if (k === "access_token" || k === "token" || k === "accessToken") {
        c.set("token", decodeURIComponent(v || ""));
        break;
      }
    }
  }
  return next();
};
var authContext_default = authContext;

// src/routes/tasks.ts
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  taskApplications: () => taskApplications,
  tasks: () => tasks,
  users: () => users
});
import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar
} from "drizzle-orm/pg-core";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  profileId: varchar("profile_id", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 100 }),
  reputationScore: integer("reputation_score").notNull().default(100),
  rewardPoints: integer("reward_points").notNull().default(0),
  level: integer("level").notNull().default(0),
  professionalRoles: jsonb("professional_roles").$type().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
});
var tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  employerProfileId: varchar("employer_profile_id", { length: 255 }).notNull().references(() => users.profileId, { onDelete: "cascade" }),
  freelancerProfileId: varchar("freelancer_profile_id", {
    length: 255
  }).references(() => users.profileId, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  objective: text("objective").notNull(),
  deliverables: text("deliverables").notNull(),
  acceptanceCriteria: text("acceptance_criteria").notNull(),
  rewardPoints: integer("reward_points").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open").$type(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deadline: timestamp("deadline")
});
var taskApplications = pgTable("task_applications", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  applicantProfileId: varchar("applicant_profile_id", { length: 255 }).notNull().references(() => users.profileId, { onDelete: "cascade" }),
  coverLetter: text("cover_letter"),
  status: varchar("status", { length: 20 }).notNull().default("waiting to accept").$type(),
  appliedAt: timestamp("applied_at").notNull().defaultNow()
});

// src/db/index.ts
var pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
var db = drizzle(pool, { schema: schema_exports });

// src/routes/tasks.ts
var taskStatusSchema = z.enum([
  "open",
  "assigned",
  "in_progress",
  "completed",
  "cancelled"
]);
var createTaskSchema = z.object({
  employerProfileId: z.string(),
  title: z.string().min(3, "Title must be at least 3 characters long"),
  objective: z.string().min(10, "Objective must be at least 10 characters long"),
  deliverables: z.string().min(10, "Deliverables must be at least 10 characters long"),
  acceptanceCriteria: z.string().min(10, "Acceptance criteria must be at least 10 characters long"),
  rewardPoints: z.number().int().positive("Reward points must be a positive integer"),
  deadline: z.string().datetime().optional()
});
var updateTaskSchema = createTaskSchema.partial().extend({
  freelancerProfileId: z.string().optional(),
  status: taskStatusSchema.optional()
});
var tasksRouter = new Hono();
tasksRouter.get("/", async (c) => {
  const allTasks = await db.select().from(tasks);
  return c.json(allTasks);
});
tasksRouter.post("/", zValidator("json", createTaskSchema), async (c) => {
  const data = c.req.valid("json");
  const values = {
    ...data,
    deadline: data.deadline ? new Date(data.deadline) : void 0
  };
  const [newTask] = await db.insert(tasks).values(values).returning();
  return c.json(newTask, 201);
});
tasksRouter.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }
  const task = await db.select().from(tasks).where(eq(tasks.id, id));
  if (task.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }
  return c.json(task[0]);
});
tasksRouter.put("/:id", zValidator("json", updateTaskSchema), async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }
  const data = c.req.valid("json");
  const values = {
    ...data,
    deadline: data.deadline ? new Date(data.deadline) : void 0
  };
  const [updatedTask] = await db.update(tasks).set(values).where(eq(tasks.id, id)).returning();
  if (!updatedTask) {
    return c.json({ error: "Task not found" }, 404);
  }
  return c.json(updatedTask);
});
tasksRouter.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }
  const [deletedTask] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
  if (!deletedTask) {
    return c.json({ error: "Task not found" }, 404);
  }
  return c.json({ message: "Task deleted successfully" });
});
var tasks_default = tasksRouter;

// src/routes/users.ts
import { zValidator as zValidator2 } from "@hono/zod-validator";
import { eq as eq2, sql } from "drizzle-orm";
import { Hono as Hono2 } from "hono";
import { z as z2 } from "zod";
var createUserSchema = z2.object({
  profileId: z2.string().min(1, "Profile ID is required"),
  username: z2.string().optional(),
  professionalRoles: z2.array(z2.string()).optional()
});
var updateUserSchema = createUserSchema.partial().extend({
  reputationScore: z2.number().int().optional(),
  rewardPoints: z2.number().int().optional(),
  level: z2.number().int().optional()
});
var adjustPointsSchema = z2.object({
  rewardPoints: z2.number().int().optional(),
  reputationScore: z2.number().int().optional()
});
var usersRouter = new Hono2();
usersRouter.get("/", async (c) => {
  const allUsers = await db.select().from(users);
  return c.json(allUsers);
});
usersRouter.post("/", zValidator2("json", createUserSchema), async (c) => {
  const data = c.req.valid("json");
  const [newUser] = await db.insert(users).values(data).returning();
  return c.json(newUser, 201);
});
usersRouter.get("/:profileId", async (c) => {
  const profileId = c.req.param("profileId");
  const user = await db.select().from(users).where(eq2(users.profileId, profileId));
  if (user.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json(user[0]);
});
usersRouter.put(
  "/:profileId",
  zValidator2("json", updateUserSchema),
  async (c) => {
    const profileId = c.req.param("profileId");
    const data = c.req.valid("json");
    const [updatedUser] = await db.update(users).set(data).where(eq2(users.profileId, profileId)).returning();
    if (!updatedUser) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json(updatedUser);
  }
);
usersRouter.delete("/:profileId", async (c) => {
  const profileId = c.req.param("profileId");
  const [deletedUser] = await db.delete(users).where(eq2(users.profileId, profileId)).returning();
  if (!deletedUser) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json({ message: "User deleted successfully" });
});
usersRouter.post(
  "/:profileId/adjust-points",
  zValidator2("json", adjustPointsSchema),
  async (c) => {
    const profileId = c.req.param("profileId");
    const { rewardPoints, reputationScore } = c.req.valid("json");
    if (rewardPoints === void 0 && reputationScore === void 0) {
      return c.json({ error: "At least one point type is required" }, 400);
    }
    const updateValues = {};
    if (rewardPoints !== void 0) {
      updateValues.rewardPoints = sql`${users.rewardPoints} + ${rewardPoints}`;
    }
    if (reputationScore !== void 0) {
      updateValues.reputationScore = sql`${users.reputationScore} + ${reputationScore}`;
    }
    const [updatedUser] = await db.update(users).set(updateValues).where(eq2(users.profileId, profileId)).returning();
    if (!updatedUser) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json(updatedUser);
  }
);
var users_default = usersRouter;

// src/routes/taskApplications.ts
import { zValidator as zValidator3 } from "@hono/zod-validator";
import { eq as eq3 } from "drizzle-orm";
import { Hono as Hono3 } from "hono";
import { z as z3 } from "zod";
var applicationStatusSchema = z3.enum(["pending", "accepted", "rejected"]);
var createTaskApplicationSchema = z3.object({
  taskId: z3.number().int().positive(),
  applicantProfileId: z3.string().min(1),
  coverLetter: z3.string().optional()
});
var updateTaskApplicationSchema = z3.object({
  status: applicationStatusSchema
});
var taskApplicationsRouter = new Hono3();
taskApplicationsRouter.get("/", async (c) => {
  const applications = await db.select().from(taskApplications);
  return c.json(applications);
});
taskApplicationsRouter.get("/task/:taskId", async (c) => {
  const taskId = parseInt(c.req.param("taskId"), 10);
  if (Number.isNaN(taskId)) {
    return c.json({ error: "Invalid Task ID" }, 400);
  }
  const applications = await db.select().from(taskApplications).where(eq3(taskApplications.taskId, taskId));
  return c.json(applications);
});
taskApplicationsRouter.post(
  "/",
  zValidator3("json", createTaskApplicationSchema),
  async (c) => {
    const data = c.req.valid("json");
    const [newApplication] = await db.insert(taskApplications).values(data).returning();
    return c.json(newApplication, 201);
  }
);
taskApplicationsRouter.put(
  "/:id",
  zValidator3("json", updateTaskApplicationSchema),
  async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid Application ID" }, 400);
    }
    const { status } = c.req.valid("json");
    const [updatedApplication] = await db.update(taskApplications).set({ status }).where(eq3(taskApplications.id, id)).returning();
    if (!updatedApplication) {
      return c.json({ error: "Application not found" }, 404);
    }
    return c.json(updatedApplication);
  }
);
taskApplicationsRouter.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid Application ID" }, 400);
  }
  const [deletedApplication] = await db.delete(taskApplications).where(eq3(taskApplications.id, id)).returning();
  if (!deletedApplication) {
    return c.json({ error: "Application not found" }, 404);
  }
  return c.json({ message: "Application deleted successfully" });
});
var taskApplications_default = taskApplicationsRouter;

// src/index.ts
var app = new Hono4();
app.use("*", cors_default);
app.use("*", authContext_default);
var REAL_HEY_API_URL = (process.env.REAL_HEY_API_URL || process.env.HEY_API_URL || "https://api.hey.xyz").replace(/\/$/, "");
var REAL_LENS_API_URL = (process.env.REAL_LENS_API_URL || process.env.LENS_API_URL || "").replace(/\/$/, "");
var forward = async (c, target) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5e4);
  try {
    const headers = {};
    const rawHeaders = c.req.raw && c.req.raw.headers || {};
    try {
      if (typeof rawHeaders.forEach === "function") {
        rawHeaders.for1Each((v, k) => {
          if (k.toLowerCase() !== "host") headers[k] = String(v);
        });
      } else {
        for (const [k, v] of Object.entries(rawHeaders)) {
          if (k.toLowerCase() === "host") continue;
          if (Array.isArray(v)) headers[k] = v.join(",");
          else if (v != null) headers[k] = String(v);
        }
      }
    } catch {
      const maybeAuth = c.req.header("authorization") || c.req.header("Authorization");
      if (maybeAuth) headers["authorization"] = maybeAuth;
      const maybeX = c.req.header("x-access-token") || c.req.header("X-Access-Token");
      if (maybeX) headers["x-access-token"] = maybeX;
      const ct = c.req.header("content-type");
      if (ct) headers["content-type"] = ct;
    }
    const method = c.req.method.toUpperCase();
    let body;
    if (!["GET", "HEAD"].includes(method)) {
      const arr = await c.req.arrayBuffer();
      body = new Uint8Array(arr);
      if (!headers["content-type"] && !headers["Content-Type"]) headers["content-type"] = "application/json";
    }
    const res = await fetch(target, { method, headers, body, signal: controller.signal });
    const status = res.status;
    const contentType = res.headers.get("content-type") || "";
    const arrBuf = await res.arrayBuffer();
    const uint8 = new Uint8Array(arrBuf);
    if (contentType.includes("application/json")) {
      try {
        const jsonText = new TextDecoder().decode(uint8);
        return new Response(jsonText, { status, headers: { "Content-Type": "application/json" } });
      } catch (e) {
        const txt = new TextDecoder().decode(uint8);
        return new Response(txt, { status, headers: { "Content-Type": contentType } });
      }
    }
    return new Response(uint8, { status, headers: { "Content-Type": contentType } });
  } catch (err) {
    if (err && err.name === "AbortError") return c.text("Upstream timeout", 504);
    return c.text("Upstream error", 502);
  } finally {
    clearTimeout(timeout);
  }
};
app.get("/metadata/sts", async (c) => forward(c, `${REAL_HEY_API_URL}/metadata/sts`));
app.get("/oembed/get", async (c) => {
  const qs = c.req.raw.url?.split("?")[1] || "";
  const url = qs ? `${REAL_HEY_API_URL}/oembed/get?${qs}` : `${REAL_HEY_API_URL}/oembed/get`;
  return forward(c, url);
});
app.get("/og/*", async (c) => forward(c, `${REAL_HEY_API_URL}${c.req.path}`));
app.route("/tasks", tasks_default);
app.route("/users", users_default);
app.route("/applications", taskApplications_default);
app.get("/", (c) => c.text("slice-api running"));
app.post("/tasks", authMiddleware_default, async (c) => {
  const userPayload = c.get("user");
  const profileIdFromToken = userPayload?.act?.sub || userPayload?.sub;
  if (!profileIdFromToken) return c.text("Unauthorized", 401);
  let body;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const { title, objective, deliverables, acceptanceCriteria, rewardPoints, deadline } = body || {};
  if (!title || !objective || !deliverables || !acceptanceCriteria || typeof rewardPoints !== "number") {
    return c.json({ error: "Missing or invalid required fields" }, 400);
  }
  const values = {
    employerProfileId: profileIdFromToken,
    title,
    objective,
    deliverables,
    acceptanceCriteria,
    rewardPoints
  };
  if (deadline) {
    try {
      values.deadline = new Date(deadline);
    } catch {
    }
  }
  try {
    const [newTask] = await db.insert(tasks).values(values).returning();
    return c.json(newTask, 201);
  } catch (err) {
    console.error("Failed to create task", err);
    return c.json({ error: "Failed to create task" }, 500);
  }
});
app.use("/pageview", rateLimiter_default({ requests: 60 }));
app.use("/pageview", authMiddleware_default);
app.post("/pageview", async (c) => forward(c, `${REAL_HEY_API_URL}/pageview`));
app.use("/posts", rateLimiter_default({ requests: 60 }));
app.use("/posts", authMiddleware_default);
app.post("/posts", async (c) => forward(c, `${REAL_HEY_API_URL}/posts`));
var index_default = app;
export {
  index_default as default
};
