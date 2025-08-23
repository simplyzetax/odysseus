import { XMPPServer } from '@services/xmpp/server';

export interface Bindings extends Omit<Env, 'XmppServer' | 'MANIFESTIFY'> {
	XmppServer: DurableObjectNamespace<XMPPServer>;
	MANIFESTIFY: Service<import('../../../manifestify/src/index').default>;
}
