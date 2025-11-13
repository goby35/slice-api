import { zValidator } from "@hono/zod-validator";
import { eq, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

// Zod Schemas
const createUserSchema = z.object({
  profileId: z.string().min(1, "Profile ID is required"),
  username: z.string().optional(),
  professionalRoles: z.array(z.string()).optional()
});

const updateUserSchema = createUserSchema.partial().extend({
  reputationScore: z.number().int().optional(),
  rewardPoints: z.number().int().optional(),
  level: z.number().int().optional()
});

const adjustPointsSchema = z.object({
  rewardPoints: z.number().int().optional(),
  reputationScore: z.number().int().optional()
});

const usersRouter = new Hono();

// GET /users - Lấy danh sách tất cả user
usersRouter.get("/", async (c) => {
  try {
    const allUsers = await db.select().from(users);
    return c.json(allUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    return c.json({ error: 'Internal Server Error', details: error }, 500);
  }
});

// POST /users - Tạo user mới
usersRouter.post("/", zValidator("json", createUserSchema), async (c) => {
  const data = (c.req as any).valid("json");
  let userData = {
    ...data,
    profileId: data.profileId.toLowerCase()
  }
  const [newUser] = await db.insert(users).values(userData).returning();
  return c.json(newUser, 201);
});

// GET /users/:profileId - Lấy user theo profileId
usersRouter.get("/:profileId", async (c) => {
  const profileId = c.req.param("profileId").toLowerCase();
  const user = await db
    .select()
    .from(users)
    .where(eq(users.profileId, profileId));
  if (user.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json(user[0]);
});

// PUT /users/:profileId - Cập nhật user
usersRouter.put(
  "/:profileId",
  zValidator("json", updateUserSchema),
  async (c) => {
    const profileId = c.req.param("profileId").toLowerCase();
    const data = (c.req as any).valid("json");

    const [updatedUser] = await db
      .update(users)
      .set(data)
      .where(eq(users.profileId, profileId))
      .returning();

    if (!updatedUser) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(updatedUser);
  }
);

// DELETE /users/:profileId - Xóa user
usersRouter.delete("/:profileId", async (c) => {
  const profileId = c.req.param("profileId").toLowerCase();

  const [deletedUser] = await db
    .delete(users)
    .where(eq(users.profileId, profileId))
    .returning();

  if (!deletedUser) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ message: "User deleted successfully" });
});

// POST /users/:profileId/adjust-points - Cập nhật điểm an toàn
usersRouter.post(
  "/:profileId/adjust-points",
  zValidator("json", adjustPointsSchema),
  async (c) => {
    const profileId = c.req.param("profileId").toLowerCase();
    const { rewardPoints, reputationScore } = (c.req as any).valid("json");

    if (rewardPoints === undefined && reputationScore === undefined) {
      return c.json({ error: "At least one point type is required" }, 400);
    }

    const updateValues: {
      rewardPoints?: SQL;
      reputationScore?: SQL;
    } = {};

    if (rewardPoints !== undefined) {
      updateValues.rewardPoints = sql`${users.rewardPoints} + ${rewardPoints}`;
    }

    if (reputationScore !== undefined) {
      updateValues.reputationScore = sql`${users.reputationScore} + ${reputationScore}`;
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateValues)
      .where(eq(users.profileId, profileId))
      .returning();

    if (!updatedUser) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(updatedUser);
  }
);

// GET /users/:profileId/reputation/ - Lấy điểm uy tín của user
usersRouter.get("/:profileId/reputation/", async (c) => {
  const profileId = c.req.param("profileId").toLowerCase();
  const user = await db
    .select()
    .from(users)
    .where(eq(users.profileId, profileId));
  if (user.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json({ reputationScore: user[0].reputationScore });
});

// // PATCH /users/:profileId/reputation/ - Cập nhật điểm uy tín của user
// usersRouter.patch(
//   "/:profileId/reputation/",
//   zValidator(
//     "json",
//     z.object({
//       reputationScore: z.number().int()
//     })
//   ),
//   async (c) => {
//     const profileId = c.req.param("profileId").toLowerCase();
//     const { reputationScore } = (c.req as any).valid("json");

//     const [updatedUser] = await db
//       .update(users)
//       .set({ reputationScore })
//       .where(eq(users.profileId, profileId))
//       .returning();
//     if (!updatedUser) {
//       return c.json({ error: "User not found" }, 404);
//     }

//     return c.json(updatedUser);
//   }
// );

// GET /users/:profileId/level - Lấy level của user
usersRouter.get("/:profileId/level", async (c) => {
  const profileId = c.req.param("profileId").toLowerCase();
  const user = await db
    .select()
    .from(users)
    .where(eq(users.profileId, profileId));
  if (user.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json({ level: user[0].level });
});

// POST /users/:profileId/level - Cập nhật level của user
usersRouter.post(
  "/:profileId/level",
  zValidator(
    "json",
    z.object({
      level: z.number().int()
    })
  ),
  async (c) => {
    const profileId = c.req.param("profileId").toLowerCase();
    const { level } = (c.req as any).valid("json");

    const [updatedUser] = await db
      .update(users)
      .set({ level })
      .where(eq(users.profileId, profileId))
      .returning();
    if (!updatedUser) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(updatedUser);
  }
);

// GET /users/:profileId/reward-points/ - Lấy điểm thưởng của user
usersRouter.get("/:profileId/reward-points/", async (c) => {
  const profileId = c.req.param("profileId").toLowerCase();
  const user = await db
    .select()
    .from(users)
    .where(eq(users.profileId, profileId));
  if (user.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json({ rewardPoints: user[0].rewardPoints });
});

// // POST /users/:profileId/reward-points - Cập nhật điểm thưởng của user
// usersRouter.post(
//   "/:profileId/reward-points",
//   zValidator(
//     "json",
//     z.object({
//       rewardPoints: z.number().int()
//     })
//   ),
//   async (c) => {
//     const profileId = c.req.param("profileId").toLowerCase();
//     const { rewardPoints } = (c.req as any).valid("json");

//     const [updatedUser] = await db
//       .update(users)
//       .set({ rewardPoints })
//       .where(eq(users.profileId, profileId))
//       .returning();
//     if (!updatedUser) {
//       return c.json({ error: "User not found" }, 404);
//     }

//     return c.json(updatedUser);
//   }
// );

export default usersRouter;
