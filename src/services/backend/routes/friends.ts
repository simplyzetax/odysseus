import { app } from "@core/app";
import { getDB } from "@core/db/client";
import { ACCOUNTS } from "@core/db/schemas/account";
import { FRIENDS } from "@core/db/schemas/friends";
import { odysseus } from "@core/error";
import { acidMiddleware } from "@middleware/auth/acid";
import { ratelimitMiddleware } from "@middleware/core/ratelimit";
import { eq, and, or } from "drizzle-orm";

// Simple endpoints that return empty arrays/objects
app.get("/friends/api/v1/:accountId/settings", ratelimitMiddleware(), (c) => {
    return c.json({
        acceptInvites: "private",
        mutualPrivacy: "ALL"
    });
});

app.get("/friends/api/v1/:accountId/blocklist", ratelimitMiddleware(), (c) => {
    return c.json([]);
});

app.get("/friends/api/public/list/fortnite/*/recentPlayers", ratelimitMiddleware(), (c) => {
    return c.json([]);
});

// Friend alias management (PUT/DELETE)
app.all("/friends/api/v1/:accountId/friends/:friendId/alias", ratelimitMiddleware(), acidMiddleware, async (c) => {
    const friendId = c.req.param("friendId");
    const method = c.req.method;

    if (!friendId) {
        return c.sendError(odysseus.friends.friendshipNotFound.withMessage("Friend ID is required"));
    }

    const db = getDB(c as any);

    // Check if friendship exists (only check accepted friends where user is accountId)
    const [friendship] = await db.select().from(FRIENDS).where(
        and(
            eq(FRIENDS.accountId, c.var.accountId),
            eq(FRIENDS.targetId, friendId),
            eq(FRIENDS.status, "ACCEPTED")
        )
    );

    if (!friendship) {
        return c.sendError(odysseus.friends.friendshipNotFound.withMessage(`Friendship between ${c.var.accountId} and ${friendId} does not exist`));
    }

    if (method === "PUT") {
        // Get raw body for alias
        const body = await c.req.text();

        // Validate allowed characters (exact same as original)
        const allowedCharacters = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
        for (const char of body) {
            if (!allowedCharacters.includes(char)) {
                return c.sendError(odysseus.internal.validationFailed.withMessage("Validation Failed. Invalid fields were [alias]"));
            }
        }

        // Validate alias length (no trimming, exact length check)
        if (body.length < 3 || body.length > 16) {
            return c.sendError(odysseus.internal.validationFailed.withMessage("Validation Failed. Invalid fields were [alias]"));
        }

        // Update alias
        await db.update(FRIENDS)
            .set({ alias: body })
            .where(
                and(
                    eq(FRIENDS.accountId, c.var.accountId),
                    eq(FRIENDS.targetId, friendId)
                )
            );
    } else if (method === "DELETE") {
        // Remove alias (set to empty string like original)
        await db.update(FRIENDS)
            .set({ alias: "" })
            .where(
                and(
                    eq(FRIENDS.accountId, c.var.accountId),
                    eq(FRIENDS.targetId, friendId)
                )
            );
    }

    return c.sendStatus(204);
});

// Get friends list for an account
app.get("/friends/api/public/friends/:accountId", ratelimitMiddleware(), acidMiddleware, async (c) => {
    //@ts-expect-error
    const db = getDB(c);

    let response: any[] = [];

    // Get accepted friends (outbound)
    const acceptedFriends = await db.select().from(FRIENDS).where(
        and(
            eq(FRIENDS.accountId, c.var.accountId),
            eq(FRIENDS.status, "ACCEPTED")
        )
    );

    acceptedFriends.forEach(friend => {
        response.push({
            accountId: friend.targetId,
            status: "ACCEPTED",
            direction: "OUTBOUND",
            created: friend.createdAt?.toISOString() || new Date().toISOString(),
            favorite: false
        });
    });

    // Get incoming requests
    const incomingRequests = await db.select().from(FRIENDS).where(
        and(
            eq(FRIENDS.targetId, c.var.accountId),
            eq(FRIENDS.status, "PENDING")
        )
    );

    incomingRequests.forEach(friend => {
        response.push({
            accountId: friend.accountId,
            status: "PENDING",
            direction: "INBOUND",
            created: friend.createdAt?.toISOString() || new Date().toISOString(),
            favorite: false
        });
    });

    // Get outgoing requests
    const outgoingRequests = await db.select().from(FRIENDS).where(
        and(
            eq(FRIENDS.accountId, c.var.accountId),
            eq(FRIENDS.status, "PENDING")
        )
    );

    outgoingRequests.forEach(friend => {
        response.push({
            accountId: friend.targetId,
            status: "PENDING",
            direction: "OUTBOUND",
            created: friend.createdAt?.toISOString() || new Date().toISOString(),
            favorite: false
        });
    });

    return c.json(response);
});

// Send friend request or accept incoming request
app.post("/friends/api/*/friends*/:receiverId", ratelimitMiddleware(), acidMiddleware, async (c) => {
    const receiverId = c.req.param("receiverId");
    const senderId = c.var.accountId;

    //@ts-expect-error
    const db = getDB(c);

    // Check if both users exist
    const [senderAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, senderId));
    const [receiverAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, receiverId));

    if (!senderAccount || !receiverAccount) {
        return c.sendStatus(403);
    }

    // Check if sender has incoming request from receiver (to accept)
    const [incomingRequest] = await db.select().from(FRIENDS).where(
        and(
            eq(FRIENDS.accountId, receiverId),
            eq(FRIENDS.targetId, senderId),
            eq(FRIENDS.status, "PENDING")
        )
    );

    if (incomingRequest) {
        // Accept the friend request
        await db.update(FRIENDS)
            .set({ status: "ACCEPTED" })
            .where(
                and(
                    eq(FRIENDS.accountId, receiverId),
                    eq(FRIENDS.targetId, senderId)
                )
            );

        // Create reciprocal friendship
        await db.insert(FRIENDS).values({
            accountId: senderId,
            targetId: receiverId,
            status: "ACCEPTED",
            createdAt: new Date(),
        });
    } else {
        // Check if sender already has outgoing request to receiver
        const [outgoingRequest] = await db.select().from(FRIENDS).where(
            and(
                eq(FRIENDS.accountId, senderId),
                eq(FRIENDS.targetId, receiverId)
            )
        );

        if (!outgoingRequest) {
            // Send new friend request
            await db.insert(FRIENDS).values({
                accountId: senderId,
                targetId: receiverId,
                status: "PENDING",
                createdAt: new Date()
            });
        }
    }

    return c.sendStatus(204);
});

// Remove friend or cancel friend request
app.delete("/friends/api/*/friends*/:receiverId", ratelimitMiddleware(), acidMiddleware, async (c) => {
    const receiverId = c.req.param("receiverId");
    const senderId = c.var.accountId;

    //@ts-expect-error
    const db = getDB(c);

    // Check if both users exist
    const [senderAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, senderId));
    const [receiverAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, receiverId));

    if (!senderAccount || !receiverAccount) {
        return c.sendStatus(403);
    }

    // Delete all friendships between the two users (both directions)
    await db.delete(FRIENDS).where(
        or(
            and(eq(FRIENDS.accountId, senderId), eq(FRIENDS.targetId, receiverId)),
            and(eq(FRIENDS.accountId, receiverId), eq(FRIENDS.targetId, senderId))
        )
    );

    return c.sendStatus(204);
});

// Block a user
app.post("/friends/api/*/blocklist*/:receiverId", ratelimitMiddleware(), acidMiddleware, async (c) => {
    const receiverId = c.req.param("receiverId");
    const senderId = c.var.accountId;

    //@ts-expect-error
    const db = getDB(c);

    // Check if both users exist
    const [senderAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, senderId));
    const [receiverAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, receiverId));

    if (!senderAccount || !receiverAccount) {
        return c.sendStatus(403);
    }

    // Remove any existing friendships between the users
    await db.delete(FRIENDS).where(
        or(
            and(eq(FRIENDS.accountId, senderId), eq(FRIENDS.targetId, receiverId)),
            and(eq(FRIENDS.accountId, receiverId), eq(FRIENDS.targetId, senderId))
        )
    );

    // Add to blocklist
    await db.insert(FRIENDS).values({
        accountId: senderId,
        targetId: receiverId,
        status: "BLOCKED",
        createdAt: new Date()
    });

    return c.sendStatus(204);
});

// Unblock a user
app.delete("/friends/api/*/blocklist*/:receiverId", ratelimitMiddleware(), acidMiddleware, async (c) => {
    const receiverId = c.req.param("receiverId");
    const senderId = c.var.accountId;

    //@ts-expect-error
    const db = getDB(c);

    // Check if both users exist
    const [senderAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, senderId));
    const [receiverAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, receiverId));

    if (!senderAccount || !receiverAccount) {
        return c.sendStatus(403);
    }

    // Remove from blocklist (this acts like deleteFriend in the original)
    await db.delete(FRIENDS).where(
        or(
            and(eq(FRIENDS.accountId, senderId), eq(FRIENDS.targetId, receiverId)),
            and(eq(FRIENDS.accountId, receiverId), eq(FRIENDS.targetId, senderId))
        )
    );

    return c.sendStatus(204);
});

// Get friends summary
app.get("/friends/api/v1/:accountId/summary", ratelimitMiddleware(), acidMiddleware, async (c) => {
    //@ts-expect-error
    const db = getDB(c);

    const response = {
        friends: [] as any[],
        incoming: [] as any[],
        outgoing: [] as any[],
        suggested: [] as any[],
        blocklist: [] as any[],
        settings: {
            acceptInvites: "public"
        }
    };

    // Get accepted friends
    const acceptedFriends = await db.select().from(FRIENDS).where(
        and(
            eq(FRIENDS.accountId, c.var.accountId),
            eq(FRIENDS.status, "ACCEPTED")
        )
    );

    acceptedFriends.forEach(friend => {
        response.friends.push({
            accountId: friend.targetId,
            groups: [],
            mutual: 0,
            alias: friend.alias || "",
            note: "",
            favorite: false,
            created: friend.createdAt?.toISOString() || new Date().toISOString()
        });
    });

    // Get incoming requests
    const incomingRequests = await db.select().from(FRIENDS).where(
        and(
            eq(FRIENDS.targetId, c.var.accountId),
            eq(FRIENDS.status, "PENDING")
        )
    );

    incomingRequests.forEach(friend => {
        response.incoming.push({
            accountId: friend.accountId,
            mutual: 0,
            favorite: false,
            created: friend.createdAt?.toISOString() || new Date().toISOString()
        });
    });

    // Get outgoing requests
    const outgoingRequests = await db.select().from(FRIENDS).where(
        and(
            eq(FRIENDS.accountId, c.var.accountId),
            eq(FRIENDS.status, "PENDING")
        )
    );

    outgoingRequests.forEach(friend => {
        response.outgoing.push({
            accountId: friend.targetId,
            favorite: false
        });
    });

    // Get blocked users
    const blockedUsers = await db.select().from(FRIENDS).where(
        and(
            eq(FRIENDS.accountId, c.var.accountId),
            eq(FRIENDS.status, "BLOCKED")
        )
    );

    blockedUsers.forEach(friend => {
        response.blocklist.push({
            accountId: friend.targetId
        });
    });

    return c.json(response);
});

// Get blocklist
app.get("/friends/api/public/blocklist/:accountId", ratelimitMiddleware(), acidMiddleware, async (c) => {
    //@ts-expect-error
    const db = getDB(c);

    const blockedUsers = await db.select({
        accountId: FRIENDS.targetId
    }).from(FRIENDS).where(
        and(
            eq(FRIENDS.accountId, c.var.accountId),
            eq(FRIENDS.status, "BLOCKED")
        )
    );

    return c.json({
        blockedUsers: blockedUsers.map(user => user.accountId)
    });
});
