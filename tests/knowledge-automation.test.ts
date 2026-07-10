import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRetrospectiveCandidates, rankKnowledgeRecommendations } from "../src/features/operating-model/knowledge-automation.ts";

test("P24 retrospective turns user inputs into reviewable knowledge improvement template and rule candidates", () => {
  const result = buildRetrospectiveCandidates({
    projectId:"p-1",projectName:"重点项目",objectives:"按期上线",outcomes:"延期5天后上线",deviations:"接口联调晚于计划",rootCauses:"跨团队依赖未提前确认",keyDecisions:"增加联调资源",actionEffects:"追回3天",lessons:"阶段门前必须确认接口Owner",applicabilityConditions:"跨团队集成项目",templateGaps:"WBS模板缺少接口联调清单",governanceSuggestions:"阶段门增加接口Owner签字",evidenceIds:["ev-1"],improvementOwnerUserId:"pmo-1",improvementDueAt:"2026-08-01T00:00:00Z",
  });
  assert.deepEqual(result.map(item=>item.candidateType),["lesson_learned","improvement_action","template_revision","governance_rule"]);
  assert.equal(result.every(item=>item.evidenceIds.includes("ev-1")&&item.status==="pending_review"),true);
});

test("P24 recommendations explain matching cases templates and decisions without inventing scores",()=>{
  const ranked=rankKnowledgeRecommendations({projectLevel:"S",projectType:"integration",scenario:"milestone_delay",tags:["接口","跨团队"]},[
    {id:"k1",title:"接口联调复盘",status:"published",domains:["integration"],tags:["接口"],applicableScenarios:["milestone_delay"],metadata:{project_level:"S"}},
    {id:"k2",title:"无关案例",status:"published",domains:["marketing"],tags:[],applicableScenarios:[],metadata:{}},
  ]);
  assert.equal(ranked[0].knowledgeItemId,"k1");assert.equal(ranked[0].score>ranked[1].score,true);assert.equal(ranked[0].reasons.length>=3,true);
});

test("P24 automation persists retrospectives recommendations materialization and subscriber notifications",()=>{
  const sql=readFileSync("supabase/migrations/20260710132000_p24_knowledge_automation.sql","utf8");
  for(const table of ["project_retrospectives","retrospective_knowledge_candidates","knowledge_recommendation_requests"])assert.match(sql,new RegExp(`create table if not exists public\\.${table}`,"i"));
  assert.match(sql,/materialize_retrospective_candidate_tx/i);assert.match(sql,/knowledge_subscription_notifications/i);
  const route=readFileSync("src/app/api/closure-knowledge/automation/route.ts","utf8");const page=readFileSync("src/app/closure-knowledge/retrospective/page.tsx","utf8");
  assert.match(route,/submit_retrospective/);assert.match(route,/recommend_knowledge/);assert.match(route,/loadContextProjectIdentityMappings/);assert.match(route,/fallback_used\s*:\s*false/);
  assert.match(page,/项目复盘与知识自动化/);assert.match(page,/人工评审后才能发布/);assert.match(page,/相似案例、模板与历史决策/);
});

