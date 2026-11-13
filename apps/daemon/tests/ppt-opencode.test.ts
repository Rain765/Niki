import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { expect, it } from 'vitest';
import { PptModels } from '../src/ppt-models.js';
import { PptModelGateway } from '../src/ppt-model-routes.js';

// Opt-in installed-runtime check. No vendor API or real credential is used.
it.skipIf(!process.env.OD_TEST_OPENCODE_BIN)('installed OpenCode preserves tool execution, image input and interleaved reasoning through the gateway', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ppt-opencode-'));
  const output = path.join(root, 'index.html');
  const png = path.join(root, 'reference.png');
  await writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=', 'base64'));
  const models = new PptModels(root, async () => Response.json({choices:[{}]}));
  await models.save('kimi','fake-provider-secret');await models.test('kimi');
  let calls=0; let imageSeen=false; let reasoningSeen=false;
  const bodies: Record<string,unknown>[]=[];
  const gateway=new PptModelGateway(models,async (_url,options) => {
    const body=JSON.parse(String(options?.body)); bodies.push(body);
    const main=Array.isArray(body.tools) && body.tools.length>0;
    let delta: Record<string,unknown>={content:'Test presentation'}; let finish='stop';
    if(main) {
      calls++;
      if(calls>1) reasoningSeen ||= body.messages.some((m:Record<string,unknown>)=>m.reasoning_content==='Inspect original reference.');
      imageSeen ||= JSON.stringify(body.messages).includes('data:image/png;base64,');
      if(calls===1) {delta={reasoning_content:'Inspect original reference.',tool_calls:[{index:0,id:'read1',type:'function',function:{name:'read',arguments:JSON.stringify({filePath:png})}}]};finish='tool_calls';}
      else if(calls===2) {delta={reasoning_content:'Write the inspected result.',tool_calls:[{index:0,id:'write1',type:'function',function:{name:'write',arguments:JSON.stringify({filePath:output,content:'<!doctype html><title>Native PPT fixture</title><main>Verified tool output</main>'})}}]};finish='tool_calls';}
      else delta={content:'Created index.html. Done.'};
    }
    if(!body.stream) return Response.json({id:'fake',object:'chat.completion',model:'kimi-k3',choices:[{index:0,message:{role:'assistant',content:'Test presentation'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}});
    const chunk=(d:unknown,reason:unknown)=>'data: '+JSON.stringify({id:'fake',object:'chat.completion.chunk',model:'kimi-k3',choices:[{index:0,delta:d,finish_reason:reason}]})+'\n\n';
    return new Response(chunk({role:'assistant'},null)+chunk(delta,null)+chunk({},finish)+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
  });
  const app=express();app.use(express.json({limit:'64mb'}));gateway.register(app);
  const server=app.listen(0,'127.0.0.1'); await new Promise<void>(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const launch=await gateway.launch({provider:'kimi',model:'kimi-k3'},url,()=>true);
  let logs='';
  try {
    const child=spawn(process.env.OD_TEST_OPENCODE_BIN!,['run','--format','json','-m','niki-ppt/kimi-k3'],{cwd:root,env:{...process.env,...launch.env,XDG_CONFIG_HOME:path.join(root,'config'),XDG_DATA_HOME:path.join(root,'data'),OPENCODE_DISABLE_AUTOUPDATE:'true',OPENCODE_DISABLE_PROJECT_CONFIG:'true',OPENCODE_PERMISSION:JSON.stringify({'*':'allow'})},stdio:['pipe','pipe','pipe']});
    child.stdout.on('data',d=>{logs+=String(d);});child.stderr.on('data',d=>{logs+=String(d);});
    child.stdin.end(`Read ${png}, then write ${output}. Do not ask questions.`);
    const timeout=setTimeout(()=>child.kill('SIGTERM'),50000);
    const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});clearTimeout(timeout);
    expect(code,logs.slice(-6000)).toBe(0);
    expect(calls,logs.slice(-6000)).toBeGreaterThanOrEqual(3);
    expect(await readFile(output,'utf8')).toContain('Verified tool output');
    expect(imageSeen,'Image must reach the model after a real read tool call').toBe(true);
    expect(reasoningSeen,'Thinking must survive tool-result round trips').toBe(true);
    expect(logs).not.toContain('fake-provider-secret');
  } finally { launch.release();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true}); }
},60000);
