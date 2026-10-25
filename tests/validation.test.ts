import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {HttpError,parse} from '../server/lib.js';

test('validation keeps the actionable domain message for forms without field rendering',()=>{
 const message='Укажите игровой идентификатор, без email и телефона';
 const schema=z.object({game_contact:z.string().refine(value=>!value.includes('@'),message)});
 assert.throws(()=>parse(schema,{game_contact:'private-address@example.com'}),(error:unknown)=>{
  assert.ok(error instanceof HttpError);
  assert.equal(error.statusCode,422);assert.equal(error.code,'validation');
  assert.equal(error.message,message);assert.deepEqual({...error.fields},{game_contact:message});
  assert.ok(!JSON.stringify(error).includes('private-address@example.com'));
  return true;
 });
});
