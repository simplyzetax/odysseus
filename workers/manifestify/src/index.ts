import { createEpicManifest, EpicManifest, parseEpicManifest } from './manifestParser';

import { WorkerEntrypoint } from 'cloudflare:workers';

export default class extends WorkerEntrypoint {
	async fetch(request: Request) {
		const manifest = await request.arrayBuffer();
		const parsedManifest = await this.parseEpicManifest(new Uint8Array(manifest));
		return new Response(JSON.stringify(parsedManifest));
	}

	public async parseEpicManifest(manifest: Uint8Array) {
		return await parseEpicManifest(manifest);
	}

	public async createEpicManifest(manifest: EpicManifest) {
		return await createEpicManifest(manifest);
	}
}
