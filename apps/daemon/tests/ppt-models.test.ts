import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { PptModels } from '../src/ppt-models.js';
import { PptModelGateway, registerPptModelRoutes } from '../src/ppt-model-routes.js';
import { runAsNikiUser } from '../src/niki-auth-context.js';

const roots: string[] = []; const servers: Server[] = [];
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); } for (const root of roots.splice(0)) await rm(root, {recursive:true,force:true}); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(),'ppt-models-')); roots.push(root);
  const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({choices:[{message:{content:'OK'}}]}));
  return { root, request, models: new PptModels(root, request) };
}
async function listen(app: express.Express) { const server = app.listen(0,'127.0.0.1'); servers.push(server); await new Promise<void>(r => server.once('listening',r)); return `http://127.0.0.1:${(server.address() as {port:number}).port}`; }

describe('PPT model settings', () => {
  it('requires a successful test, persists masked settings, freezes bindings and preserves concurrent saves', async () => {
    const {models,root} = await fixture();
    await Promise.all([models.save('qwen','secret-qwen-12345'),models.save('kimi','secret-kimi-54321')]);
    await expect(models.setDefault('qwen')).rejects.toThrow('测试');
    await models.test('qwen'); await models.setDefault('qwen');
    const bound = await models.bind(undefined,false);
    expect(bound).toEqual({provider:'qwen',model:'qwen3.8-max'});
    await models.setDefault('existing');
    expect(bound.provider).toBe('qwen');
    expect(JSON.stringify(await new PptModels(root).settings())).not.toContain('secret-');
    expect((await models.settings()).providers.filter(p=>p.configured)).toHaveLength(2);
    expect((await stat(path.join(root,'ppt-model-credentials.json'))).mode & 0o777).toBe(0o600);
    await expect(models.bind('qwen',false)).rejects.toMatchObject({status:403});
    await models.save('qwen','replacement-12345');
    await expect(models.credential('qwen')).rejects.toThrow('未通过');
  });
  it('does not leak provider errors or trust tests for an outdated key', async () => {
    const {models,request} = await fixture(); await models.save('kimi','private-key-12345');
    request.mockResolvedValueOnce(Response.json({error:'private-key-12345'},{status:401}));
    await expect(models.test('kimi')).rejects.toThrow('密钥无效');
    expect((await models.settings()).providers.find(p=>p.provider==='kimi')?.testedAt).toBeUndefined();
    request.mockImplementationOnce(async () => { await models.save('kimi','replaced-key-23456'); return Response.json({choices:[{}]}); });
    await expect(models.test('kimi')).rejects.toThrow('已变更');
  });
  it('enforces admin permission for every method and returns masked keys', async () => {
    const {models} = await fixture(); const app=express(); app.use(express.json());
    app.use((req,_res,next) => runAsNikiUser({id:'u',tenantKey:'t',openId:'o',name:'Test',role:req.headers['x-test-role']==='admin'?'admin':'member',createdAt:0,updatedAt:0},next));
    registerPptModelRoutes(app,models,()=>true); const url=await listen(app);
    for(const [method,route] of [['GET',''],['PUT','/qwen'],['POST','/qwen/test'],['DELETE','/qwen'],['PUT','/default']] as const) expect((await fetch(url+'/api/ppt-models'+route,{method})).status).toBe(403);
    const result=await fetch(url+'/api/ppt-models/qwen',{method:'PUT',headers:{'Content-Type':'application/json','x-test-role':'admin'},body:JSON.stringify({apiKey:'private-key-12345'})});
    expect(result.status).toBe(200); expect(await result.text()).not.toContain('private-key');
  });
  it('routes simultaneous grants without cross-talk, preserving images, tool results and reasoning', async () => {
    const {models} = await fixture();
    for(const p of ['qwen','kimi'] as const) {await models.save(p,`${p}-private-key-1234`);await models.test(p);}
    const upstream=vi.fn<typeof fetch>().mockResolvedValue(new Response('data: {"choices":[]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}}));
    const gateway=new PptModelGateway(models,upstream); const app=express();app.use(express.json());gateway.register(app);const url=await listen(app);
    let alive=true;
    const qwen=await gateway.launch({provider:'qwen',model:'qwen3.8-max'},url,()=>alive);
    const kimi=await gateway.launch({provider:'kimi',model:'kimi-k3'},url,()=>true);
    const config=JSON.parse(qwen.env.OPENCODE_CONFIG_CONTENT);expect(JSON.stringify(config)).not.toContain('private-key');
    const token=config.provider['niki-ppt'].options.apiKey;
    const messages=[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]},{role:'assistant',reasoning_content:'reason',tool_calls:[{id:'1',type:'function',function:{name:'read',arguments:'{}'}}]},{role:'tool',tool_call_id:'1',content:'file data'}];
    const response=await fetch(url+'/api/ppt-model-gateway/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({model:'tampered',messages,stream:true})});
    expect(await response.text()).toContain('[DONE]');
    expect(upstream.mock.calls[0]?.[0]).toContain('dashscope');
    expect(JSON.parse(String(upstream.mock.calls[0]?.[1]?.body))).toMatchObject({model:'qwen3.8-max',messages});
    expect(upstream.mock.calls[0]?.[1]?.headers).toMatchObject({Authorization:'Bearer qwen-private-key-1234'});
    const ktoken=JSON.parse(kimi.env.OPENCODE_CONFIG_CONTENT).provider['niki-ppt'].options.apiKey;
    upstream.mockResolvedValueOnce(Response.json({choices:[]}));
    await fetch(url+'/api/ppt-model-gateway/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${ktoken}`},body:JSON.stringify({messages})});
    expect(upstream.mock.calls[1]?.[0]).toContain('moonshot');
    alive=false;
    expect((await fetch(url+'/api/ppt-model-gateway/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messages})})).status).toBe(401);
    kimi.release();
  });
});
