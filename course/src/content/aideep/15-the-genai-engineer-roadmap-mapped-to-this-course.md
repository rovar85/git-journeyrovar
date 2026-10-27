---
track: aideep
title: "Deep dive 15: the GenAI engineer roadmap, mapped to this course"
short: GenAI roadmap
sub: A ten-step roadmap (transformers to projects) checked against every lesson here. What is already covered, what was missing and is now added, and the free video resources you shared.
---

:::goals
- see the ten-topic GenAI engineer roadmap as one path
- know exactly which lessons in this course cover each topic, and which lessons were added for the gaps
- find a free video for each topic, to use alongside the lessons
:::

:::note How this page was made
A ten-topic roadmap with video links was added to the course. Each topic was compared with the existing lessons. Where a lesson already covered the topic it is **linked, not repeated**. Where something was missing (embeddings and vector search, LangChain, LangGraph, managed platforms, RAG evaluation and guardrails, projects) new lessons were written, with code that was actually run.
:::

## The roadmap and where each topic lives

| # | Topic | Already covered by | Added |
| --- | --- | --- | --- |
| 1 | **Transformers**: self-attention, Q/K/V, multi-head attention, masking, context | [Deep dive 2](#aideep-2), [Lectures 1](#lectures-1) and [2](#lectures-2) | nothing needed |
| 2 | **Embeddings and vector search**: cosine, dot product, Euclidean, vector databases | a first vector search in [Deep dive 6](#aideep-6); cosine in [Lectures 2](#lectures-2) | [Deep dive 16](#aideep-16): metrics that disagree, ANN indexes (IVF, HNSW), filters, where vectors live |
| 3 | **Prompt engineering**: few-shot, structured outputs, optimisation, application patterns | [Deep dive 5](#aideep-5), [Lectures 3](#lectures-3), [Field guide 1](#aifield-1) and [7](#aifield-7) | structured output with validation in [Deep dive 17](#aideep-17) |
| 4 | **RAG**: chunking, embeddings, retrieval, hybrid search, reranking, grounding | [Deep dive 6](#aideep-6), [Lectures 7](#lectures-7), [Field guide 5](#aifield-5) | measuring RAG in [Deep dive 20](#aideep-20) |
| 5 | **LangChain**: models, prompts, tools, structured output, agents | nothing | [Deep dive 17](#aideep-17) |
| 6 | **LangGraph**: state, nodes, edges, memory, human-in-the-loop, multi-agent | patterns in [Deep dive 8](#aideep-8) and [13](#aideep-13) | [Deep dive 18](#aideep-18) |
| 7 | **Azure AI Foundry and AWS Bedrock**: models, RAG, agents, evaluation, tracing | the vendor guides in [Field guide 8](#aifield-8); cloud basics in [Cloud 2](#cloud-2) | [Deep dive 19](#aideep-19) |
| 8 | **Evaluation and security**: RAGAS, LLM-as-judge, faithfulness, relevance, prompt injection, PII, guardrails | judges in [Lectures 8](#lectures-8) and [Deep dive 9](#aideep-9); injection in [Deep dive 12](#aideep-12) | RAG metrics, PII redaction and a guard pipeline in [Deep dive 20](#aideep-20) |
| 9 | **MCP**: host, client, server, tools, resources, prompts, transports, auth | [Deep dive 10](#aideep-10), [Lectures 7](#lectures-7), [Field guide 8](#aifield-8) | nothing needed |
| 10 | **Projects** | [Deep dive 11](#aideep-11) and [14](#aideep-14) | [Deep dive 21](#aideep-21): three projects with tests |

Suggested order if you start from zero: 1, 2, 3, 4 (understand), then 8 (measure), then 5 and 6 (frameworks), then 9 and 7, then build the projects in 10. Do the **flashcards** for each lesson in the Study view as you go.

## Free videos for each topic

These are the links from the roadmap, resolved to their real titles. **I read the titles and authors, I did not watch the videos**, so judge the quality yourself. Several are in Hindi, as marked. Use them as a second explanation next to the lessons here, not instead of them.

**1. Transformers**
- codebasics: [Transformers Explained, simple explanation](https://www.youtube.com/watch?v=ZhAz268Hdpw&t=784s)

**2. Embeddings and vector search**
- Rohit Negi: [What are vectors, vector embedding and vector database (GenAI full course #6)](https://www.youtube.com/watch?v=JsGwjwnl4hY)
- Rohit Negi: [What is a vector database, internal implementation (GenAI full course #7)](https://www.youtube.com/watch?v=lvH_zPj2o04&t=156s)
- Satyajit Pattnaik: [The complete guide to vector databases, from basics to implementation](https://www.youtube.com/watch?v=5kCE0l11ZHk)

**3. Prompt engineering:** no link in the roadmap; use [Deep dive 5](#aideep-5).

**4. RAG**
- Rohit Negi: [What is RAG, what is LangChain (GenAI full course #8)](https://www.youtube.com/watch?v=4Ax77tnW0e8)
- CampusX: [Retrieval Augmented Generation, how does RAG work](https://www.youtube.com/watch?v=X0btK9X0Xnk)

**5. LangChain**
- CampusX: [GenAI roadmap for beginners, end-to-end GenAI course (playlist)](https://www.youtube.com/watch?v=pSVk-5WemQ0&list=PLKnIA16_RmvaTbihpo4MtzVm4XOQa0ER0)

**6. LangGraph**
- CampusX: [Agentic AI using LangGraph (playlist)](https://www.youtube.com/watch?v=yC36gN-rqjo&list=PLKnIA16_RmvYsvB8qkUQuJmJNuiCUJFPL)

**7. Azure AI Foundry and AWS Bedrock**
- Krish Naik: [Building AI agents with Microsoft Foundry, build and govern AI apps and agents at scale](https://www.youtube.com/watch?v=ZP_U8eKBy2g)
- Solved Systems: [Intro to Azure AI Foundry, setup guide and first steps (playlist)](https://www.youtube.com/watch?v=gKLEsHv8X6I&list=PLKN5-zCKJG7w-3gXIVptJV7sSi7fbQoBE)
- codebasics: [Amazon Bedrock AgentCore tutorial, build, deploy and operate AI agents](https://www.youtube.com/watch?v=cTBGIKAckKE&t=880s)

**8. Evaluation and security**
- Satyajit Pattnaik: [RAGAs evaluation framework](https://www.youtube.com/watch?v=J3M95E0LQl8)
- Siddhardhan: [LLM as a judge explained, hands-on GenAI evaluation](https://www.youtube.com/watch?v=3FcYdRQPMCo)
- CampusX: [Master LLM evaluations, step-by-step playlist](https://www.youtube.com/watch?v=6W92_t9FveA&list=PLEneLIDJFpcA)
- Defronix Academy (Hindi): [LLM attacks and prompt injection, part 1](https://www.youtube.com/watch?v=DANRXYsT4Bs)
- Sunny Savita: [Guardrails for LLM applications with Guardrails AI](https://www.youtube.com/watch?v=7V1w5gnZ-kw)

**9. MCP**
- Anthropic (course): [Introduction to Model Context Protocol](https://anthropic-partners.skilljar.com/introduction-to-model-context-protocol)
- Gate Smashers (Hindi): [What is MCP, complete details with example](https://www.youtube.com/watch?v=GxHOSWxp7c0)
- Chai aur Code (Hindi): [What are MCP servers, explained](https://www.youtube.com/watch?v=dZyQNy3-HjU)
- Krish Naik: [All you need to know about Model Context Protocol](https://www.youtube.com/watch?v=-UQ6OZywZ2I)

**10. Projects**
- codebasics: [Gen AI project using Llama 3.2, LinkedIn post generator tool (playlist)](https://www.youtube.com/watch?v=qZ_J-Xg0QM4&list=PLeo1K3hjS3uvLuF4Tq1i1KqNM2QvIyzFK) (compare with project 1 in [Deep dive 21](#aideep-21))
- CampusX: [How to build a chatbot using LangGraph](https://www.youtube.com/watch?v=51Ve2tE3Zns&list=PLKnIA16_RmvYsvB8qkUQuJmJNuiCUJFPL&index=10) (compare with project 2)
- Code With Aarohi: [AI travel planner with multiple agents, APIs and memory, part 1](https://www.youtube.com/watch?v=_5XF5CCnbDk) (compare with project 3)

## How to study this roadmap

1. For each topic, read the lesson, **run its code**, then watch the matching video for a second angle.
2. After each lesson, do its flashcards in the Study view and answer the practice questions before reading the answers.
3. Keep a one-page "what I can explain" sheet per topic (the study loop at the top of every lesson).
4. Finish with the three projects, and write the portfolio note for each.

:::recap
- The roadmap's ten topics are covered by **existing lessons for 1, 3, 4, 8 (partly) and 9**, and by **new lessons for 2, 5, 6, 7, 8 and 10**.
- Free videos are linked as **extra explanations**; the lessons here have code you can run and questions to check yourself.
- Do the topics in order, measure with evaluation early, and end with projects.
:::

```quiz
? Which roadmap topic had no lesson in this course before this addition?
+ LangChain (and likewise LangGraph as a full lesson, managed platforms, and a project set)
- Transformers
- MCP
- Prompt engineering
! Transformers, prompting, RAG and MCP were already covered; the frameworks, platforms and projects were added.

? Why does the order suggest evaluation (topic 8) before the frameworks?
+ So you can measure whether each framework or change actually improves your system
- Because evaluation is easier
- Because frameworks are obsolete
- Because it is shorter
! Measurement first keeps you from building on guesses.
```
