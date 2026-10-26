import type {Profile} from './api';

export const draftBaselines=new Map<string,Profile>();
export function resetProfileEditorState(){draftBaselines.clear();}
