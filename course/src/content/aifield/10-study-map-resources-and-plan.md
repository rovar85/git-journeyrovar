---
track: aifield
title: Study map: every resource on your list, what it is for, and a plan
short: Study map
sub: The videos, repositories, guides, books, papers and courses you collected, grouped by purpose, with what I actually read, where each fits in this course, and an eight-week plan.
---

:::goals
- know what each resource on your list is and what it is good for
- see which resources are already built into this course and where
- choose a reading order that matches your goal
- follow an eight-week plan that mixes reading, building and testing
:::

:::note How honest this map is
I could open some of these sources and not others. The network policy of this lab **blocks** arxiv.org, huggingface.co, deeplearning.ai, kaggle.com, cdn.openai.com, oreilly.com, manning.com and udlbook.github.io, and also github.com pages (raw README files on raw.githubusercontent.com **were** reachable). So each entry says how I know it:

- **Read**: I read the text (Anthropic articles, the Claude Code guide, the repository READMEs).
- **Transcript**: I read the transcript of the video (the eight videos are in `transcripts/`; your earlier upload provided them).
- **From knowledge**: I describe it from what I know, **without reading the page**. Treat these descriptions as signposts and check the source.
:::

## 1. The eight videos (already built into this course)

| # | Video | Where it fed this course |
|---|---|---|
| 1 | LLM Introduction | Chapter 1 and deep dive 1 |
| 2 | LLMs from Scratch (Stanford CS229) | Chapters 2 to 6 and deep dives 2 to 6 |
| 3 | Agentic AI Overview (Stanford) | Chapter 7 and deep dive 7 |
| 4 | Building and Evaluating Agents | Chapter 9 and deep dive 9 |
| 5 | Building Effective Agents | Chapter 8, deep dive 8 and lesson 7 of this track |
| 6 | Building Agents with MCP | Chapter 10 and deep dive 10 |
| 7 | Building an Agent from Scratch | Chapter 11 and deep dive 11 |
| 8 | PhiloAgents (playlist, five episodes) | Chapter 13, deep dive 13 and lesson 4 of this track |

(The mapping is approximate: the chapters also draw on your Enterprise Vault notes.) The YouTube site itself is blocked in this lab, which is why those videos came in as transcript files.

## 2. Repositories

| Repository | What it is | How I know |
|---|---|---|
| [Prompt Engineering Guide](https://github.com/dair-ai/Prompt-Engineering-Guide) (DAIR.AI) | a large guide with sections: Introduction, Techniques, Applications, Prompt Hub, Models, Risks and Misuses, Papers, Tools, Notebooks, Datasets, Additional Readings; also a video lecture, notebook and slides | **Read** (README) |
| [Hands-On Large Language Models](https://github.com/HandsOnLLM/Hands-On-Large-Language-Models) | code for the O'Reilly book by Jay Alammar and Maarten Grootendorst: 12 chapters (language models, tokens and embeddings, inside the transformer, text classification, clustering and topic modelling, prompt engineering, advanced text generation, semantic search and RAG, multimodal models, creating embedding models, fine-tuning for classification, fine-tuning generation models), runnable in Colab | **Read** (README) |
| [GenAI Agents](https://github.com/NirDiamant/GenAI_Agents) (Nir Diamant) | a large collection of agent tutorials and implementations from beginner to advanced, in categories such as beginner-friendly, framework tutorials, educational and research, business, creative, analysis, task management, quality assurance, and a "special advanced technique" group, plus governance and safety resources. **It appears twice on your list** (items 1 and 6) | **Read** (README) |
| [AI Agents for Beginners](https://github.com/microsoft/ai-agents-for-beginners) (Microsoft) | an 18-lesson course: intro and use cases, agentic frameworks, design patterns, tool use, agentic RAG, trustworthy agents, planning, multi-agent, metacognition, production, protocols (MCP, A2A, NLWeb), context engineering, agent memory, Microsoft Agent Framework, computer-use agents, scalable deployment, local agents, securing agents. **Also listed twice** (items 2 and 5) | **Read** (README lesson table) |
| [Made With ML](https://github.com/GokuMohandas/Made-With-ML) (Goku Mohandas) | lessons on combining machine learning with software engineering to build production-grade ML applications; covers training, tuning, experiment tracking, evaluation, serving, testing, CI and production | **Read** (README) |
| [Hands-On AI Engineering](https://github.com/Sumanth077/Hands-On-AI-Engineering) | a collection of runnable projects, starting with an AI agents section (research assistants with memory, agentic RAG that grades its own retrieval, SQL agents, coding assistants, browser automation, MCP-based agents and more) | **Read** (README) |
| [Awesome Generative AI Guide](https://github.com/aishwaryanr/awesome-generative-ai-guide) | a hub of generative-AI research, courses, interview material and notebooks, organised by what you want to do: **use** AI, **build** AI, **understand** AI, plus interview prep and a list of free courses | **Read** (README) |
| [Designing Machine Learning Systems](https://github.com/chiphuyen/dmls-book) (Chip Huyen) | companion repository for the book: table of contents, chapter summaries, MLOps tools list, resources and a short review of basic ML | **Read** (README) |
| [Machine Learning for Beginners](https://github.com/microsoft/ML-For-Beginners) (Microsoft) | a 12-week, 26-lesson curriculum on classic machine learning, with quizzes and projects | **Read** (README) |
| [LLM Course](https://github.com/mlabonne/llm-course) (Maxime Labonne) | three tracks plus notebooks: **LLM Fundamentals** (maths, Python, neural networks, NLP), **The LLM Scientist** (architecture, pre-training, post-training datasets, supervised fine-tuning, preference alignment, evaluation, quantization, new trends) and **The LLM Engineer** (running LLMs, vector storage, RAG, advanced RAG, agents, inference optimisation, deploying, securing) | **Read** (README) |

## 3. Guides

| Guide | Summary | How I know | In this course |
|---|---|---|---|
| [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (Anthropic) | workflows versus agents, five workflow patterns, agent design principles, tool prompt engineering | **Read** in full | deep dive 8, lessons 7 and 8 of this track |
| [Claude Code best practices](https://code.claude.com/docs/en/best-practices) | context management, verification, plan first, CLAUDE.md, subagents, hooks, scaling | **Read** in full | lesson 6 of this track |
| OpenAI, A Practical Guide to Building Agents | when to build an agent, foundations (model, tools, instructions), orchestration patterns, guardrails | **From knowledge** (PDF blocked) | lesson 8 |
| Google, Agents whitepaper | model, tools, orchestration, cognitive architectures | **From knowledge** (blocked) | lesson 8 |
| Google, Agents Companion | AgentOps, evaluation, multi-agent, agentic RAG | **From knowledge** (blocked) | lesson 8 |

## 4. Books

I did **not** read any of these, and this course does not reproduce them. One line each, from my own knowledge, so you can choose:

| Book | What it is |
|---|---|
| *Understanding Deep Learning* (Simon Prince) | a modern deep-learning textbook with the maths, free online. Read it when you want the foundations behind the transformer and training |
| *Build a Large Language Model (From Scratch)* (Sebastian Raschka) | builds a GPT-style model step by step in code. Pairs with chapters 2 to 4 and deep dives 2 and 3 |
| *LLM Engineer's Handbook* (Paul Iusztin and Maxime Labonne) | an end-to-end guide to building and deploying LLM applications (data, fine-tuning, RAG, deployment, MLOps) |
| *AI Agents: The Definitive Guide* (Nicole Koenigstein) | a guide to designing and building agent systems |
| *Building Applications with AI Agents* (Michael Albada) | design patterns and practices for agent applications |
| *AI Agents with MCP* (Kyle Stratis) | building agents that use the Model Context Protocol |
| *AI Engineering* (Chip Huyen) | building applications on foundation models: evaluation, prompting, RAG, fine-tuning, inference, production. Pairs with deep dives 4, 6, 9 and 13 |

## 5. Papers

| Paper | Lesson in this track |
|---|---|
| ReAct | lesson 2 |
| Generative Agents | lesson 4 |
| Toolformer | lesson 2 |
| Chain-of-Thought Prompting | lesson 1 |
| Tree of Thoughts | lesson 1 |
| Reflexion | lesson 3 |
| Retrieval-Augmented Generation for LLMs: A Survey | lesson 5 |

All seven summaries are **from my knowledge**, not the paper text (arxiv.org is blocked). Reading the originals is worth it; each is short enough to read in an evening, and the demos in the lessons give you the picture first.

## 6. Courses

| Course | Topic | Built as |
|---|---|---|
| Hugging Face Agents Course | agents with several frameworks, from basics to a final project | **From knowledge** (blocked); the loop and patterns are in deep dives 7 and 8 |
| MCP with Anthropic (DeepLearning.AI) | building and using MCP servers and clients | deep dive 10 |
| Building Vector Databases with Pinecone; Vector Databases: from Embeddings to Applications | embeddings, similarity search, vector stores, applications | deep dive 6 and lesson 5 |
| Agent Memory (LLMs as Operating Systems) | tiered memory | lesson 9 |
| Building and Evaluating Advanced RAG | RAG pipeline techniques and the RAG triad | lesson 5 |
| Building AI Browser Agents; Building Towards Computer Use with Anthropic | agents that act on web pages and screens | lesson 9 |
| LLMOps | operating LLM applications | deep dive 13 |
| Evaluating AI Agents | evaluating trajectories and outcomes | deep dive 9 |
| Multi AI Agent Systems with crewAI; Practical Multi AI Agents and Advanced Use Cases with crewAI | role-based agent crews | lesson 9 |
| Improving Accuracy of LLM Applications | evaluation-driven improvement, including fine-tuning | deep dive 4 |
| AI Agentic Design Patterns with AutoGen | reflection, tool use, planning, multi-agent patterns | lessons 3, 8 and 9 |

I could not open any of the course pages, so the right-hand descriptions are **from the course titles and my own knowledge**. Check each course's page for its current syllabus.

## 7. Choosing a path

| Your goal | Start with | Then |
|---|---|---|
| Understand how LLMs work | chapters 1 to 6, then Hands-On LLM and the LLM Fundamentals/Scientist tracks | *Build a Large Language Model from Scratch*, *Understanding Deep Learning* |
| Build agents | chapters 7 to 11, deep dives 7 to 11, Anthropic's article | Microsoft's AI Agents for Beginners, GenAI Agents, the Hands-On AI Engineering projects |
| Build reliable and safe agents | deep dives 9, 12 and 13, lessons 6 to 8 | OpenAI and Google guides, Chip Huyen's books |
| Use agents for coding | lesson 6, deep dive 11 | the Claude Code documentation |
| Operate AI in production | deep dive 13, Made With ML, Designing ML Systems | *AI Engineering*, LLMOps course |

## 8. An eight-week plan

Each week: **read, run something, write something down**. Spend about 6 to 8 hours.

| Week | Read | Build | Check yourself |
|---|---|---|---|
| 1 | Chapters 1 to 4, deep dives 1 to 3 | run the deep-dive programs and change one number each | explain tokens, embeddings and attention to a friend |
| 2 | Chapters 5 and 6, deep dives 5 and 6, lesson 1 | a prompt set with a small test table; the RAG pipeline of lesson 5 on your own notes | does your RAG answer pass the **groundedness** check? |
| 3 | Chapter 7, deep dive 7, lesson 2 | a ReAct loop with two real tools of your own | trace one run and mark each Thought, Action, Observation |
| 4 | Chapter 8, deep dive 8, lessons 7 and 8 | redesign one tool using the poka-yoke checklist; add guardrails | measure first-try and after-retry success |
| 5 | Chapter 9, deep dive 9, lesson 3 | an evaluation set of 20 tasks with an executable checker | does a Reflexion-style retry improve the pass rate? |
| 6 | Chapter 10, deep dive 10, lesson 9 | an MCP server for one internal tool; add tiered memory to your agent | can you list the tools the agent can reach and why? |
| 7 | Chapter 12, deep dive 12, lesson 6 | threat-model your agent; add sandbox and approval for risky tools | try three prompt-injection attempts and record what happened |
| 8 | Chapters 13 and 14, deep dives 13 and 14 | the Enterprise Vault diagnostic agent design from the capstone | present design, evaluation results and known risks in one page |

:::warn Common mistakes
- **Collecting resources instead of building.** A list like yours can fill a year. Pick one path in section 7 and do the plan.
- **Reading without running anything.** Change a number in each demo and predict the result first.
- **Trusting summaries, including mine, over sources.** Where I marked "from knowledge", read the original.
- **Skipping evaluation.** If you cannot measure whether a change helped, you are guessing.
- **Chasing every new framework.** The loop, tools, memory and evaluation stay the same under every framework.
:::

:::recap
- Your list = 8 videos (already in the course), 10 repositories, 5 guides, 7 books, 7 papers, 14 courses. Two repositories are listed twice.
- I **read** the Anthropic and Claude Code guides and all the repository READMEs, and the transcripts; other items are **from knowledge** and marked so.
- Pick a path by goal, then follow the eight-week plan: read, run, write, measure.
:::

:::try Your turn
Write down your goal in one sentence and choose a row of the path table. List the three resources you will use in the next four weeks and what you will **build** with each. Put a date on the first one.
:::

:::quiz
? Which sources did I read in full for this track?
+ The Anthropic article, the Claude Code best-practices guide, the repository READMEs and the video transcripts
- Every paper, book and course
- Only the videos
- Nothing
! Everything else is marked as written from knowledge.
? Why is "from knowledge" marked on some entries?
+ Their hosts were blocked in this lab, so I could not read the original
- They are not important
- They are fictional
- They are too long
! Check those sources yourself.
? What should you do each week of the plan?
+ Read, run something, and write something down, then check yourself
- Only read
- Only watch videos
- Skip testing
! Building and measuring is how knowledge becomes skill.
:::
