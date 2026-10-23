export interface Viewer {
 id: string; email: string; verified: boolean; handle: string; display_name: string;
 visibility: 'public'|'hidden'; platform_role:'member'|'moderator'|'admin'; status:'active'|'suspended'|'deleted';
}
declare module 'fastify' { interface FastifyRequest { viewer: Viewer|null; sessionId:string|null; csrfToken:string; } }
