---
track: aibank
title: "Start here: the AI engineering interview bank and what the course already covers"
short: Start here
sub: 482 questions and 60 incident scenarios, checked against this course. 461 questions are added; 21 were skipped because a lesson already answers them.
---

:::goals
- know how to practise a question so it sticks (try, open the answer, check the follow-ups, note the wrong answers)
- see which questions this course already answers, and which are new
- choose a route for the round you have: concepts, debugging, system design, coding, incidents or behavioural
:::

## What this track is

These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.

It covers the AI engineering interview in its usual rounds: **concepts** (transformers, tokenisation, post-training, inference, RAG, prompting, evaluation, agents and protocols), **debugging and estimation** (read a log or a number and find the cause), **system design**, **coding**, **behavioural** and **incident scenarios**. Questions that one of the earlier AI lessons already answers well (basic concept questions such as "what is the KV cache" or "why cosine similarity") are **not repeated**: they are listed below with a link.

## How each question is built

1. **The question**, with the evidence (a log, a table, a code snippet) when it is a debugging or code-reading question.
2. **Show the answer** (folded): a **short answer** (this is what the flashcards use), the **full answer**, **follow-ups** at increasing levels with the expected answers, and the **wrong answers** interviewers hear and why they fail.
3. A **related lesson** in this course for the background.

Levels: 1 screening, 2 working engineer, 3 senior, 4 staff. Start with levels 1 and 2 of your target topics, then 3.

## What is in the track

| Topic | Questions in this track | Already in this course |
| --- | --: | --: |
| Math and classical ML | 22 | 0 |
| Deep learning | 22 | 0 |
| Transformers | 19 | 5 |
| Tokenization, sampling and decoding | 20 | 2 |
| Post-training | 21 | 3 |
| Inference and serving systems | 29 | 3 |
| GPU memory, quantization and hardware | 9 | 1 |
| RAG | 23 | 3 |
| Prompting and structured output | 21 | 1 |
| Evaluation | 26 | 0 |
| Multimodal | 21 | 1 |
| Agents | 26 | 0 |
| Protocols: MCP, A2A and skills | 21 | 1 |
| Multi-agent systems | 20 | 0 |
| Sandboxes | 18 | 0 |
| Evidence and reverse engineering | 14 | 0 |
| Production and MLOps | 26 | 0 |
| Cost and capacity | 22 | 0 |
| Safety | 21 | 1 |
| System design | 22 | 0 |
| Coding | 22 | 0 |
| Behavioral | 16 | 0 |
| Incident scenarios | 60 | 0 |

:::warn About the measurements
Hardware, software versions and numbers in the scenarios come from the original authors' own captures (specific GPUs, serving engines and agent runtimes). They are examples of how to read evidence. Check current versions and documentation before relying on any number in a real decision.
:::

## Questions the course already answers

| Question | Covered in the course |
| --- | --- |
| Explain query, key and value in one minute | [Deep dive 2: inside the Transformer](#aideep-2) |
| Why the attention scores are divided before the softmax | [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1) |
| Absolute angles, relative distances | [Lecture 2: Transformer variants and model families (positions, normalisation, attention variants, BERT and T5)](#lectures-2) |
| What eight heads cost that one head does not | [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1) |
| Where the triangle of minus infinity comes from | [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1) |
| One step of byte-pair training and what it leaves behind | [Lecture 1: From words to the Transformer (tokens, embeddings, RNN limits, attention)](#lectures-1) |
| How a grammar edits the logits and why it can be faster | [Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference](#lectures-3) |
| What the KL penalty in RLHF protects | [Lecture 5: Preference tuning: reward models, RLHF with PPO, best-of-N and DPO](#lectures-5) |
| Where the reward model went in DPO | [Lecture 5: Preference tuning: reward models, RLHF with PPO, best-of-N and DPO](#lectures-5) |
| Why reward models learn from pairs, not scores | [Deep dive 4: post-training and evaluating models](#aideep-4) |
| The two phases of one request | [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2) |
| How speculative decoding keeps the output the same | [Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference](#lectures-3) |
| One token budget instead of two phases | [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2) |
| The model is 35 GB now, so it fits | [GPUs, memory and the systems foundation](#aiinfra-1) |
| The retriever model and the reranker model | [Lecture 7: RAG, tool calling and agents (retrieval, ranking metrics, function calling, ReAct, MCP, safety)](#lectures-7) |
| Why vector search ranks by cosine | [Deep dive 16: embeddings, distance metrics and vector search](#aideep-16) |
| Why hybrid search fuses ranks and not scores | [Deep dive 6: RAG and tool use in depth](#aideep-6) |
| Where step-by-step prompting helps and where it costs | [Reasoning: chain of thought, self-consistency and tree of thoughts](#aifield-1) |
| The three parts of a vision-language model | [Lecture 9: Trending topics: vision transformers, multimodal models, diffusion LLMs, model collapse and what is next](#lectures-9) |
| Pick the MCP primitive by who chooses it | [Deep dive 10: the Model Context Protocol in depth](#aideep-10) |
| The reward keeps climbing, so why worry | [Lecture 5: Preference tuning: reward models, RLHF with PPO, best-of-N and DPO](#lectures-5) |

## Licence

The questions are reproduced under the MIT licence of the source project:

```text
MIT License

Copyright (c) 2026 Rohit Ghumare

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
