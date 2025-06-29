import { app } from '@core/app';

app.get('/api/waitingroom', (c) => c.sendStatus(204));
