import { CacheDurableObject } from 'src';
import { XMPPServer } from '@services/xmpp/server';

export interface Bindings extends Omit<Env, 'CACHE_DO' | 'XmppServer' | 'MANIFESTIFY'> {
	CACHE_DO: DurableObjectNamespace<CacheDurableObject>;
	XmppServer: DurableObjectNamespace<XMPPServer>;
	MANIFESTIFY: Service<import('../../../manifestify/src/index').default>;
}
