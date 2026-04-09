---
name: Enterprise Feature Development Template
description: "Use when you need end-to-end enterprise feature delivery with orchestration, quality gates, and production readiness checks."
argument-hint: "Feature objective, constraints, timeline, success criteria"
agent: "Enterprise Feature Development"
---
Use this feature brief to execute enterprise-grade delivery:

Feature Name:
<short feature name>

Business Objective:
<what business outcome this feature must deliver>

User Problem:
<what user pain this solves>

Scope In:
- <item 1>
- <item 2>

Scope Out:
- <item 1>
- <item 2>

Constraints:
- Technical: <stack, integrations, performance, security>
- Compliance: <privacy/regulatory>
- Delivery: <deadline, staffing>

Dependencies:
- <service/team/system>

Success Criteria:
- Product KPI: <metric + target>
- Engineering KPI: <latency/error budget/reliability target>
- UX KPI: <task success, accessibility target>

Experiment Requirement:
- A/B Test Needed: <yes/no>
- Hypothesis: <expected impact>
- Primary Metric: <metric>
- Guardrails: <risk metrics>

Quality Gates Required:
- Scope Gate
- Build Gate
- UX Gate
- Experiment Gate
- Evidence Gate
- Readiness Gate

Required Deliverables:
- Implementation plan with owners and sequencing
- Design notes and component impact
- Verification evidence (tests/logs/screenshots/traces)
- Release and rollback notes
- Final verdict: READY or NEEDS WORK

Output Format (must follow exactly):
Delivery Status: READY | NEEDS WORK
Feature: <short name>
Owner Plan: <summary from Senior Project Manager>
Implementation: <summary from Senior Developer>
Design Notes: <summary from UI Designer>
Experiment Plan: <summary from Experiment Tracker>
Verification Evidence: <summary from Evidence Collector>
Readiness Verdict: <summary from Reality Checker>
Open Risks:
- <risk 1>
- <risk 2>
Next Actions:
1. <action with owner>
2. <action with owner>
