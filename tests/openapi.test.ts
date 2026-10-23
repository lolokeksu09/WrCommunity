import test from 'node:test';
import assert from 'node:assert/strict';
import {app,closeTests} from './helpers.js';
test.after(closeTests);
test('OpenAPI documents authentication, explicit club choices, limits and cookie/CSRF security',async()=>{
 const response=await app.inject({method:'GET',url:'/api/v1/openapi.json'});assert.equal(response.statusCode,200,response.body);
 const spec=response.json();const paths=spec.paths;
 const register=paths['/api/v1/auth/register'].post;
 assert.ok(register.requestBody.content['application/json'].schema.required.includes('email'));
 const club=paths['/api/v1/clubs'].post.requestBody.content['application/json'].schema;
 assert.ok(club.required.includes('join_mode'));assert.ok(club.required.includes('feed_visibility'));assert.equal(club.properties.join_mode.default,undefined);
 const post=paths['/api/v1/posts'].post.requestBody.content['application/json'].schema;
 assert.equal(post.properties.body.maxLength,5000);assert.equal(post.properties.images.maxItems,4);
 assert.deepEqual(paths['/api/v1/posts'].post.security,[{session:[],csrf:[]}]);
 assert.equal(paths['/api/v1/profiles/{id}'].get.parameters[0].schema.format,'uuid');
 assert.ok(paths['/api/v1/events/{id}/registration'].post);
});
