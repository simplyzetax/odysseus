import { app } from '@core/app';

app.get('/waitingroom/api/waitingroom', (c) => c.sendStatus(204));
