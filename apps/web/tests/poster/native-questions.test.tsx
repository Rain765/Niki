// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { pendingPresentationQuestion } from '../../src/poster/native-presentation-questions';
import { useNativePresentationQuestions } from '../../src/poster/use-native-presentation-questions';
import { submitChatRunToolResult } from '../../src/providers/daemon';
import type { ChatMessage } from '../../src/types';
vi.mock('../../src/providers/daemon',()=>({submitChatRunToolResult:vi.fn()}));
const turn: ChatMessage={id:'m',role:'assistant',content:'',createdAt:1,runId:'r',runStatus:'running',events:[{kind:'tool_use',id:'q',name:'AskUserQuestion',input:{questions:[{question:'重点是什么？',options:[{label:'方案',description:'展示架构'},'进度'],multiSelect:false}]}}]};
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllMocks();});
it('recognizes real questions, ignores answered and superseded questions, and retains failed tool questions',()=>{
 expect(pendingPresentationQuestion([turn],new Set())?.questions?.[0]?.options).toHaveLength(2);
 expect(pendingPresentationQuestion([turn],new Set(['m:q']))).toBeNull();
 expect(pendingPresentationQuestion([turn,{id:'u',role:'user',content:'方案',createdAt:2}],new Set())).toBeNull();
 expect(pendingPresentationQuestion([{...turn,runStatus:'succeeded',events:[...turn.events!,{kind:'tool_result',toolUseId:'q',content:'unavailable',isError:true}]}],new Set())).toBeTruthy();
 expect(pendingPresentationQuestion([{...turn,events:[...turn.events!,{kind:'tool_result',toolUseId:'q',content:'方案',isError:false}]}],new Set())).toBeNull();
});
it('supports Codex questions without options and completed native question forms',()=>{
 const codex={...turn,events:[{kind:'tool_use' as const,id:'q',name:'functions.request_user_input',input:{questions:[{question:'还有什么要求？',options:[]}]}}]};
 expect(pendingPresentationQuestion([codex],new Set())?.questions?.[0]?.options).toEqual([]);
 const form={...turn,events:[],content:'<question-form id="brief" title="确认范围">{"questions":[{"id":"scope","label":"选择范围","type":"radio","options":["完整","概览"],"required":true}]}</question-form>'};
 expect(pendingPresentationQuestion([form],new Set())).toBeNull();
 expect(pendingPresentationQuestion([{...form,runStatus:'succeeded'}],new Set())?.form?.id).toBe('brief');
});
function setup(canSend=false) {
 const parent=document.createElement('iframe');document.body.append(parent);
 vi.spyOn(window,'parent','get').mockReturnValue(parent.contentWindow!);
 const post=vi.spyOn(parent.contentWindow!,'postMessage');
 const onSend=vi.fn(async()=>{});
 const hook=renderHook(()=>useNativePresentationQuestions({projectId:'p',enabled:true,messages:[turn],canSend,onSend}));
 const answer=(source:Window=parent.contentWindow!)=>fireEvent(window,new MessageEvent('message',{origin:location.origin,source,data:{type:'niki:ppt:answer',projectId:'p',id:'m:q',content:'重点是什么？\n方案'}}));
 return {post,onSend,answer,...hook};
}
it('answers the live original run once and rejects foreign senders',async()=>{
 vi.mocked(submitChatRunToolResult).mockResolvedValue({ok:true});
 const {post,onSend,answer}=setup();
 answer(window);expect(submitChatRunToolResult).not.toHaveBeenCalled();
 answer();answer();
 await waitFor(()=>expect(post).toHaveBeenCalledWith({type:'niki:ppt:answer-result',projectId:'p',id:'m:q',ok:true},location.origin));
 expect(submitChatRunToolResult).toHaveBeenCalledTimes(1);expect(onSend).not.toHaveBeenCalled();
});
it('continues through the original composer after a definitively closed run',async()=>{
 vi.mocked(submitChatRunToolResult).mockResolvedValue({ok:false,status:410});
 const {onSend,answer}=setup(true);answer();
 await waitFor(()=>expect(onSend).toHaveBeenCalledWith('重点是什么？\n方案'));
});
it('does not start duplicate generation when delivery is uncertain',async()=>{
 vi.mocked(submitChatRunToolResult).mockResolvedValue({ok:false});
 const {onSend,answer,post}=setup(true);answer();
 await waitFor(()=>expect(post).toHaveBeenCalledWith({type:'niki:ppt:answer-result',projectId:'p',id:'m:q',ok:false},location.origin));
 expect(onSend).not.toHaveBeenCalled();
});
