/**
 * Where the viewer stands with one other person. Discovery annotates every card
 * with this so Connect can render as Connect, Requested, Respond or Connected
 * without the client having to fetch and join the connection list itself.
 */
export type ConnectionState =
	'none' | 'outgoing_pending' | 'incoming_pending' | 'connected' | 'declined';
