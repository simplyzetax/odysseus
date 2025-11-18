import { app } from '@core/app';
import { getDB } from '@core/db/client';
import { ACCOUNTS } from '@core/db/schemas/accounts';
import { REPORTS } from '@core/db/schemas/reports';
import { accountMiddleware } from '@middleware/auth/accountMiddleware';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

const reportBodySchema = z.object({
    reason: z.string(),
    details: z.string(),
    playlistName: z.string(),
});

app.post('/game/v2/toxicity/account/:accountId/report/:offenderId', zValidator('json', reportBodySchema), accountMiddleware, async (c) => {
    const db = getDB(c.var.databaseIdentifier);
    const [offenderAccount] = await db
        .select()
        .from(ACCOUNTS)
        .where(eq(ACCOUNTS.id, c.req.param('offenderId')));
    if (!offenderAccount) return c.sendStatus(404);

    const body = c.req.valid('json');

    await db.insert(REPORTS).values({
        reason: body.reason,
        details: body.details,
        playlistName: body.playlistName,
        accountId: c.var.account.id,
    });

    //TODO: Send embed to discord webhook or create a dashboard SOON-TM

    return c.sendStatus(204);
});
